// Testy funkcji Edge `search` (U4). Fałszywy klient bazy i fałszywy klient embeddingów;
// bez sieci, bez OpenAI. Dane syntetyczne.
import assert from "node:assert/strict";
import {
  createHandler,
  type Db,
  type HandlerDeps,
  parseAllowedOrigins,
  type RpcResult,
} from "./handler.ts";

const ORIGIN = "https://app.example.com";
const MAX = 50;

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.podpis`;
}

const USER_TOKEN = jwt({ sub: "00000000-0000-0000-0000-00000000000a", role: "authenticated" });
const ANON_TOKEN = jwt({ iss: "supabase", role: "anon" });

const POINT = {
  name: "Punkt Testowy",
  location: "okolica testowa",
  doc: { names: ["Punkt Testowy"] },
  coordinates: [{ x: 0.1, y: 0.2, z: 0.3, label: "L" }],
};

type Responses = Record<string, RpcResult<unknown> | (() => RpcResult<unknown>)>;

function ok<T>(data: T): RpcResult<T> {
  return { data, error: null, status: 200 };
}

interface Fakes {
  deps: HandlerDeps;
  rpcCalls: { fn: string; args?: Record<string, unknown> }[];
  authHeaders: string[];
  embedCalls: string[];
}

function setup(
  overrides: Responses = {},
  embed: (text: string) => Promise<number[]> = () => Promise.resolve(Array(1536).fill(0.01)),
): Fakes {
  const responses: Responses = {
    is_allowed: ok(true),
    consume_search_quota: ok(true),
    search_points_by_name: ok([{ name: "Punkt Testowy" }]),
    search_points_by_dosha: ok([]),
    match_points_by_embedding: ok([]),
    get_points_details: ok([POINT]),
    ...overrides,
  };
  const rpcCalls: Fakes["rpcCalls"] = [];
  const authHeaders: string[] = [];
  const embedCalls: string[] = [];
  const deps: HandlerDeps = {
    createDb(authorization: string): Db {
      authHeaders.push(authorization);
      return {
        rpc(fn, args) {
          rpcCalls.push({ fn, args });
          const r = responses[fn];
          if (!r) throw new Error(`nieoczekiwane rpc: ${fn}`);
          // deno-lint-ignore no-explicit-any
          return Promise.resolve((typeof r === "function" ? r() : r) as any);
        },
      };
    },
    embed(text: string) {
      embedCalls.push(text);
      return embed(text);
    },
    config: { allowedOrigins: [ORIGIN], maxPhraseLength: MAX },
  };
  return { deps, rpcCalls, authHeaders, embedCalls };
}

function request(
  query: string | null,
  opts: { token?: string | null; origin?: string; method?: string; authorization?: string } = {},
): Request {
  const url = new URL("http://localhost/functions/v1/search");
  if (query !== null) url.searchParams.set("problem", query);
  const headers = new Headers();
  const token = opts.token === undefined ? USER_TOKEN : opts.token;
  if (opts.authorization !== undefined) headers.set("Authorization", opts.authorization);
  else if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Origin", opts.origin ?? ORIGIN);
  return new Request(url, { method: opts.method ?? "GET", headers });
}

function fns(f: Fakes): string[] {
  return f.rpcCalls.map((c) => c.fn);
}

// ---------------------------------------------------------------------------
// Ścieżki szczęśliwe: kolejność nazwa → dosza → embedding.
// ---------------------------------------------------------------------------

Deno.test("fraza pasuje po nazwie → 200 z kontraktem answer.points, bez embeddingu", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("tala"));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await res.json(), { answer: { points: [POINT] } });
  assert.deepEqual(f.embedCalls, []);
  assert.deepEqual(fns(f), [
    "is_allowed",
    "consume_search_quota",
    "search_points_by_name",
    "get_points_details",
  ]);
  assert.deepEqual(f.rpcCalls[2].args, { phrase: "tala" });
  assert.deepEqual(f.rpcCalls[3].args, { point_names: ["Punkt Testowy"] });
});

Deno.test("brak trafień po nazwie, trafienie po doszy → bez embeddingu", async () => {
  const f = setup({
    search_points_by_name: ok([]),
    search_points_by_dosha: ok([{ name: "B" }, { name: "A" }]),
  });
  const res = await createHandler(f.deps)(request("pitta"));
  assert.equal(res.status, 200);
  assert.deepEqual(f.embedCalls, []);
  assert.deepEqual(fns(f).slice(2), [
    "search_points_by_name",
    "search_points_by_dosha",
    "get_points_details",
  ]);
  assert.deepEqual(f.rpcCalls[3].args, { phrase: "pitta" });
  assert.deepEqual(f.rpcCalls[4].args, { point_names: ["B", "A"] });
});

Deno.test("brak trafień tekstowych → embedding raz, wynik z dopasowania wektorów", async () => {
  const vector = Array(1536).fill(0.5);
  const f = setup(
    {
      search_points_by_name: ok([]),
      search_points_by_dosha: ok([]),
      match_points_by_embedding: ok([{ name: "Punkt Testowy" }]),
    },
    () => Promise.resolve(vector),
  );
  const res = await createHandler(f.deps)(request("ból karku"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: { points: [POINT] } });
  assert.deepEqual(f.embedCalls, ["ból karku"]);
  assert.deepEqual(fns(f).slice(2), [
    "search_points_by_name",
    "search_points_by_dosha",
    "match_points_by_embedding",
    "get_points_details",
  ]);
  assert.deepEqual(f.rpcCalls[4].args, { query_embedding: vector });
});

Deno.test("brak wyników semantycznych → 200 z pustą listą, bez szczegółów punktów", async () => {
  const f = setup({ search_points_by_name: ok([]), search_points_by_dosha: ok([]) });
  const res = await createHandler(f.deps)(request("nic"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: { points: [] } });
  assert.ok(!fns(f).includes("get_points_details"));
});

Deno.test("punkt bez opisu → doc jako pusty obiekt w odpowiedzi, bez błędu", async () => {
  const bare = { name: "Bez Opisu", location: "brak", doc: {}, coordinates: [] };
  const f = setup({
    search_points_by_name: ok([{ name: "Bez Opisu" }]),
    get_points_details: ok([bare]),
  });
  const res = await createHandler(f.deps)(request("bez"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: { points: [bare] } });
});

Deno.test("klient bazy dostaje nagłówek Authorization z żądania (RLS jako użytkownik)", async () => {
  const f = setup();
  await createHandler(f.deps)(request("tala"));
  assert.deepEqual([...new Set(f.authHeaders)], [`Bearer ${USER_TOKEN}`]);
});

Deno.test("fraza jest przekazana bez zmian (bez przycinania, jak obecna wersja)", async () => {
  const f = setup();
  await createHandler(f.deps)(request(" Tala "));
  assert.deepEqual(f.rpcCalls[2].args, { phrase: " Tala " });
});

// ---------------------------------------------------------------------------
// Walidacja frazy (400).
// ---------------------------------------------------------------------------

Deno.test("brak parametru frazy → 400, bez wywołań bazy i OpenAI", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request(null));
  assert.equal(res.status, 400);
  assert.equal(typeof (await res.json()).error, "string");
  assert.deepEqual(f.rpcCalls, []);
  assert.deepEqual(f.embedCalls, []);
});

Deno.test("pusta lub biała fraza → 400", async () => {
  for (const q of ["", "   ", "\t\n"]) {
    const f = setup();
    const res = await createHandler(f.deps)(request(q));
    assert.equal(res.status, 400, JSON.stringify(q));
    assert.deepEqual(f.rpcCalls, []);
  }
});

Deno.test("fraza dłuższa niż limit → 400; fraza o długości limitu → 200", async () => {
  let f = setup();
  let res = await createHandler(f.deps)(request("a".repeat(MAX + 1)));
  assert.equal(res.status, 400);
  assert.deepEqual(f.rpcCalls, []);
  f = setup();
  res = await createHandler(f.deps)(request("ą".repeat(MAX)));
  assert.equal(res.status, 200);
});

Deno.test("długość frazy w znakach (code points), nie w jednostkach UTF-16", async () => {
  let f = setup();
  let res = await createHandler(f.deps)(request("😀".repeat(MAX)));
  assert.equal(res.status, 200);
  f = setup();
  res = await createHandler(f.deps)(request("😀".repeat(MAX + 1)));
  assert.equal(res.status, 400);
  assert.deepEqual(f.rpcCalls, []);
});

Deno.test("fraza ze znakiem sterującym (NUL, tab, DEL) → 400 przed listą i limitem", async () => {
  for (const q of ["a\u0000b", "a\u0007", "ból\u007f"]) {
    const f = setup();
    const res = await createHandler(f.deps)(request(q));
    assert.equal(res.status, 400, JSON.stringify(q));
    assert.deepEqual(f.rpcCalls, []);
  }
});

// ---------------------------------------------------------------------------
// Autoryzacja (401, 403) i limit (429).
// ---------------------------------------------------------------------------

Deno.test("AE3: żądanie bez JWT → 401, bez danych i bez wywołań", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("tala", { token: null }));
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.answer, undefined);
  assert.deepEqual(f.rpcCalls, []);
  assert.deepEqual(f.embedCalls, []);
});

Deno.test("brak JWT ma pierwszeństwo przed brakiem frazy → 401", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request(null, { token: null }));
  assert.equal(res.status, 401);
});

Deno.test("AE3: klucz publiczny (rola anon) jako Bearer → 401, bez bazy i OpenAI", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("ból", { token: ANON_TOKEN }));
  assert.equal(res.status, 401);
  assert.deepEqual(f.rpcCalls, []);
  assert.deepEqual(f.embedCalls, []);
});

Deno.test("claim role service_role → 401 (funkcja nie przyjmuje kluczy serwisowych)", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("ból", { token: jwt({ role: "service_role" }) }));
  assert.equal(res.status, 401);
  assert.deepEqual(f.rpcCalls, []);
});

Deno.test("nieprawidłowy nagłówek Authorization lub token (nie JWT) → 401", async () => {
  for (
    const authorization of [
      "Basic abc",
      "Bearer",
      "Bearer sb_publishable_xyz",
      "Bearer a.b.c",
      `Bearer x.${btoa("[1]")}.y`,
    ]
  ) {
    const f = setup();
    const res = await createHandler(f.deps)(request("tala", { authorization }));
    assert.equal(res.status, 401, authorization);
    assert.deepEqual(f.rpcCalls, []);
  }
});

Deno.test("adres spoza listy → 403, bez limitu, bez wyszukiwania i OpenAI", async () => {
  const f = setup({
    is_allowed: ok(false),
    search_points_by_name: ok([]),
    search_points_by_dosha: ok([]),
  });
  const res = await createHandler(f.deps)(request("ból"));
  assert.equal(res.status, 403);
  assert.deepEqual(fns(f), ["is_allowed"]);
  assert.deepEqual(f.embedCalls, []);
});

Deno.test("token odrzucony przez bazę (zły podpis, wygasły) → 401", async () => {
  const f = setup({
    is_allowed: { data: null, error: { message: "JWT expired", code: "PGRST303" }, status: 401 },
  });
  const res = await createHandler(f.deps)(request("tala"));
  assert.equal(res.status, 401);
  assert.deepEqual(fns(f), ["is_allowed"]);
});

Deno.test("przekroczony limit zapytań → 429, bez wyszukiwania i OpenAI", async () => {
  const f = setup({
    consume_search_quota: ok(false),
    search_points_by_name: ok([]),
    search_points_by_dosha: ok([]),
  });
  const res = await createHandler(f.deps)(request("ból"));
  assert.equal(res.status, 429);
  assert.deepEqual(fns(f), ["is_allowed", "consume_search_quota"]);
  assert.deepEqual(f.embedCalls, []);
});

Deno.test("fraza za długa u zalogowanego → 400 przed sprawdzeniem listy i limitu", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("x".repeat(MAX + 1)));
  assert.equal(res.status, 400);
  assert.deepEqual(f.rpcCalls, []);
});

// ---------------------------------------------------------------------------
// Błędy usług zewnętrznych (502, 500).
// ---------------------------------------------------------------------------

Deno.test("klient embeddingów rzuca błąd → 502, treść bez szczegółów i sekretów", async () => {
  const secret = "sk-proj-SEKRETNY-KLUCZ";
  const f = setup(
    { search_points_by_name: ok([]), search_points_by_dosha: ok([]) },
    () => Promise.reject(new Error(`401 Incorrect API key provided: ${secret}`)),
  );
  const origError = console.error;
  const logged: unknown[] = [];
  console.error = (...a: unknown[]) => logged.push(...a);
  try {
    const res = await createHandler(f.deps)(request("ból"));
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes("Incorrect"));
    assert.equal(typeof JSON.parse(text).error, "string");
    assert.ok(!JSON.stringify(logged).includes(secret), "log bez sekretu");
  } finally {
    console.error = origError;
  }
  assert.ok(!fns(f).includes("match_points_by_embedding"));
});

Deno.test("embedding o złym kształcie → 502", async () => {
  for (const bad of [[], Array(10).fill(0), Array(1536).fill("x")]) {
    const f = setup(
      { search_points_by_name: ok([]), search_points_by_dosha: ok([]) },
      // deno-lint-ignore no-explicit-any
      () => Promise.resolve(bad as any),
    );
    const res = await withSilentConsole(() => createHandler(f.deps)(request("ból")));
    assert.equal(res.status, 502);
  }
});

async function withSilentConsole<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

Deno.test("błąd bazy na każdym kroku → 500 z ogólnym komunikatem", async () => {
  const dbError = { data: null, error: { message: "relation secret_table", code: "XX000" }, status: 500 };
  for (
    const fn of [
      "is_allowed",
      "consume_search_quota",
      "search_points_by_name",
      "search_points_by_dosha",
      "match_points_by_embedding",
      "get_points_details",
    ]
  ) {
    const f = setup({
      search_points_by_name: ok([]),
      search_points_by_dosha: ok([]),
      match_points_by_embedding: ok([{ name: "A" }]),
      [fn]: dbError,
    });
    const res = await withSilentConsole(() => createHandler(f.deps)(request("ból")));
    assert.equal(res.status, 500, fn);
    const text = await res.text();
    assert.ok(!text.includes("secret_table"), fn);
  }
});

Deno.test("wyjątek klienta bazy (np. sieć) → 500", async () => {
  const f = setup({
    search_points_by_name: () => {
      throw new Error("fetch failed");
    },
  });
  const res = await withSilentConsole(() => createHandler(f.deps)(request("tala")));
  assert.equal(res.status, 500);
});

// ---------------------------------------------------------------------------
// Metoda HTTP i CORS.
// ---------------------------------------------------------------------------

Deno.test("metoda inna niż GET/OPTIONS → 405 z nagłówkiem Allow", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("tala", { method: "POST" }));
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET, OPTIONS");
  assert.deepEqual(f.rpcCalls, []);
});

Deno.test("OPTIONS z dozwolonego originu → nagłówki CORS, bez bazy", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request(null, { method: "OPTIONS", token: null }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  const allowHeaders = res.headers.get("access-control-allow-headers")!.toLowerCase();
  for (const h of ["authorization", "apikey", "content-type", "x-client-info"]) {
    assert.ok(allowHeaders.includes(h), h);
  }
  assert.equal(res.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(res.headers.get("vary"), "Origin");
  assert.deepEqual(f.rpcCalls, []);
});

Deno.test("OPTIONS z obcej domeny → brak Access-Control-Allow-Origin", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(
    request(null, { method: "OPTIONS", token: null, origin: "https://obca.example.org" }),
  );
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal(res.headers.get("access-control-allow-headers"), null);
  await res.body?.cancel();
});

Deno.test("odpowiedzi z dozwolonego originu mają CORS (200 i błędy 400/401/403/429)", async () => {
  const cases: [Fakes, Request][] = [
    [setup(), request("tala")],
    [setup(), request(null)],
    [setup(), request("tala", { token: null })],
    [setup({ is_allowed: ok(false) }), request("tala")],
    [setup({ consume_search_quota: ok(false) }), request("tala")],
  ];
  for (const [f, req] of cases) {
    const res = await createHandler(f.deps)(req);
    assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN, String(res.status));
    assert.equal(res.headers.get("vary"), "Origin");
    await res.body?.cancel();
  }
});

Deno.test("GET z obcej domeny → odpowiedź bez Access-Control-Allow-Origin", async () => {
  const f = setup();
  const res = await createHandler(f.deps)(request("tala", { origin: "https://obca.example.org" }));
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  await res.body?.cancel();
});

Deno.test("parseAllowedOrigins: lista po przecinku, spacje i puste wpisy pomijane", () => {
  assert.deepEqual(
    parseAllowedOrigins(" https://a.example.com, http://localhost:5173 ,,"),
    ["https://a.example.com", "http://localhost:5173"],
  );
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
});

Deno.test("origin '*' w konfiguracji nie otwiera CORS dla wszystkich", async () => {
  const f = setup();
  f.deps.config.allowedOrigins = ["*"];
  const res = await createHandler(f.deps)(request("tala", { origin: "https://obca.example.org" }));
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  await res.body?.cancel();
});
