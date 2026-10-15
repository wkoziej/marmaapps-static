// Funkcja Edge `search` (U4): logika niezależna od runtime.
// index.ts wstrzykuje klienta bazy (supabase-js z JWT użytkownika i kluczem publicznym; RLS działa),
// klienta embeddingów (OpenAI) i konfigurację.
//
// Kontrakt: GET ?problem=<fraza> z nagłówkiem Authorization: Bearer <JWT sesji>.
// Odpowiedź 200: {answer: {points: [{name, location, doc, coordinates: [{x, y, z, label}]}]}}.
// Błędy: {error: "<komunikat PL>"} z kodem 400/401/403/405/429/500/502.
//
// Kolejność kontroli (każda tańsza i mniej ujawniająca przed droższą):
//   1. CORS (OPTIONS) — preflight przeglądarki nie ma nagłówka Authorization.
//   2. Metoda (405).
//   3. JWT z rolą authenticated (401) — bez sesji nic więcej nie jest sprawdzane ani ujawniane.
//   4. Fraza (400) — bez zapytań do bazy; błędne żądanie nie zużywa limitu.
//   5. is_allowed() (403) — pierwsze zapytanie do bazy; PostgREST weryfikuje podpis JWT (401).
//   6. consume_search_quota() (429) — limit liczony dla każdego poprawnego żądania z listy.
//   7. nazwa → dosza → (tylko gdy pusto) embedding OpenAI → dopasowanie wektorów → szczegóły.

export interface RpcError {
  message: string;
  code?: string;
}

export interface RpcResult<T> {
  data: T | null;
  error: RpcError | null;
  status?: number;
}

export interface Db {
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>>;
}

export interface HandlerConfig {
  allowedOrigins: string[];
  maxPhraseLength: number;
}

export interface HandlerDeps {
  /** Klient bazy działający w imieniu użytkownika (nagłówek Authorization z żądania). */
  createDb(authorization: string): Db;
  /** Embedding frazy (text-embedding-3-small, 1536 wymiarów). */
  embed(text: string): Promise<number[]>;
  config: HandlerConfig;
}

export const EMBEDDING_DIMENSIONS = 1536;

const MESSAGES = {
  noPhrase: "Podaj frazę wyszukiwania (parametr problem).",
  invalidPhrase: "Fraza zawiera niedozwolone znaki.",
  tooLong: (max: number) => `Fraza jest za długa (maksymalnie ${max} znaków).`,
  unauthorized: "Sesja wygasła lub jest nieprawidłowa. Zaloguj się ponownie.",
  forbidden: "Brak dostępu. Ten adres e-mail nie jest na liście dozwolonych.",
  methodNotAllowed: "Niedozwolona metoda HTTP.",
  tooManyRequests: "Za dużo zapytań. Spróbuj ponownie za chwilę.",
  serverError: "Błąd serwera. Spróbuj ponownie później.",
  embeddingError: "Wyszukiwanie po opisie jest chwilowo niedostępne. Spróbuj ponownie później.",
} as const;

const CORS_ALLOW_HEADERS = "authorization, apikey, content-type, x-client-info";
const ALLOWED_METHODS = "GET, OPTIONS";

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
}

class HttpError extends Error {
  constructor(readonly status: number, readonly publicMessage: string) {
    super(publicMessage);
  }
}

function corsHeaders(req: Request, config: HandlerConfig): Headers {
  const headers = new Headers({ Vary: "Origin" });
  const origin = req.headers.get("Origin");
  // Dokładne porównanie; '*' w konfiguracji nie jest symbolem wieloznacznym.
  if (origin && origin !== "*" && config.allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
    headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
    headers.set("Access-Control-Max-Age", "3600");
  }
  return headers;
}

function json(status: number, body: unknown, headers: Headers): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Wstępna kontrola tokenu: tylko odczyt claimu `role` (bez weryfikacji podpisu).
 * Podpis weryfikuje brama Supabase (verify_jwt) i PostgREST przy pierwszym zapytaniu do bazy;
 * is_allowed() ponownie sprawdza rolę na zweryfikowanym JWT.
 */
function requireAuthenticated(req: Request): string {
  const authorization = req.headers.get("Authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) throw new HttpError(401, MESSAGES.unauthorized);
  const parts = match[1].split(".");
  if (parts.length !== 3) throw new HttpError(401, MESSAGES.unauthorized);
  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    throw new HttpError(401, MESSAGES.unauthorized);
  }
  if (
    typeof payload !== "object" || payload === null || Array.isArray(payload) ||
    (payload as Record<string, unknown>).role !== "authenticated"
  ) {
    throw new HttpError(401, MESSAGES.unauthorized);
  }
  return `Bearer ${match[1]}`;
}

function requirePhrase(url: URL, maxLength: number): string {
  const phrase = url.searchParams.get("problem");
  if (phrase === null || phrase.trim() === "") throw new HttpError(400, MESSAGES.noPhrase);
  // Długość w znakach (code points), nie w jednostkach UTF-16.
  if ([...phrase].length > maxLength) throw new HttpError(400, MESSAGES.tooLong(maxLength));
  // Znaki sterujące (np. NUL) odrzuca baza; lepiej 400 przed listą i limitem niż 500.
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(phrase)) throw new HttpError(400, MESSAGES.invalidPhrase);
  return phrase;
}

async function call<T>(db: Db, fn: string, args?: Record<string, unknown>): Promise<T> {
  let result: RpcResult<T>;
  try {
    result = await db.rpc<T>(fn, args);
  } catch (e) {
    console.error(`search: wyjątek klienta bazy (${fn})`, e instanceof Error ? e.name : typeof e);
    throw new HttpError(500, MESSAGES.serverError);
  }
  if (result.error) {
    if (result.status === 401) throw new HttpError(401, MESSAGES.unauthorized);
    console.error(`search: błąd bazy (${fn})`, result.status ?? "", result.error.code ?? "");
    throw new HttpError(500, MESSAGES.serverError);
  }
  return result.data as T;
}

function names(rows: { name: string }[] | null): string[] {
  return (rows ?? []).map((r) => r.name);
}

async function embedPhrase(embed: HandlerDeps["embed"], phrase: string): Promise<number[]> {
  let vector: unknown;
  try {
    vector = await embed(phrase);
  } catch (e) {
    // Bez treści błędu: komunikat OpenAI może zawierać fragment klucza.
    console.error("search: błąd embeddingu", e instanceof Error ? e.name : typeof e);
    throw new HttpError(502, MESSAGES.embeddingError);
  }
  if (
    !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS ||
    !vector.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    console.error("search: embedding o nieoczekiwanym kształcie");
    throw new HttpError(502, MESSAGES.embeddingError);
  }
  return vector;
}

async function search(deps: HandlerDeps, db: Db, phrase: string): Promise<unknown[]> {
  let found = names(await call<{ name: string }[]>(db, "search_points_by_name", { phrase }));
  if (found.length === 0) {
    found = names(await call<{ name: string }[]>(db, "search_points_by_dosha", { phrase }));
  }
  if (found.length === 0) {
    const vector = await embedPhrase(deps.embed, phrase);
    found = names(
      await call<{ name: string }[]>(db, "match_points_by_embedding", { query_embedding: vector }),
    );
  }
  if (found.length === 0) return [];
  return (await call<unknown[]>(db, "get_points_details", { point_names: found })) ?? [];
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const headers = corsHeaders(req, deps.config);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      if (req.method !== "GET") {
        headers.set("Allow", ALLOWED_METHODS);
        throw new HttpError(405, MESSAGES.methodNotAllowed);
      }
      const authorization = requireAuthenticated(req);
      const phrase = requirePhrase(new URL(req.url), deps.config.maxPhraseLength);
      const db = deps.createDb(authorization);
      if ((await call<boolean>(db, "is_allowed")) !== true) {
        throw new HttpError(403, MESSAGES.forbidden);
      }
      if ((await call<boolean>(db, "consume_search_quota")) !== true) {
        throw new HttpError(429, MESSAGES.tooManyRequests);
      }
      const points = await search(deps, db, phrase);
      return json(200, { answer: { points } }, headers);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.publicMessage }, headers);
      console.error("search: nieoczekiwany błąd", e instanceof Error ? e.name : typeof e);
      return json(500, { error: MESSAGES.serverError }, headers);
    }
  };
}
