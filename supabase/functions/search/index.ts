// Funkcja Edge `search` (U4): punkt wejścia runtime Supabase Edge (Deno).
// Logika i testy: handler.ts, handler.test.ts.
//
// Sekrety funkcji (panel Supabase → Edge Functions → Secrets; lokalnie supabase/functions/.env):
//   OPENAI_API_KEY   — klucz projektu OpenAI (embedding text-embedding-3-small),
//   ALLOWED_ORIGINS  — dozwolone originy strony, po przecinku.
// SUPABASE_URL i SUPABASE_ANON_KEY dostarcza runtime. Klucz secret/service_role nie jest używany:
// klient bazy działa z JWT użytkownika, więc RLS obowiązuje także tutaj.
import { createClient } from "@supabase/supabase-js";
import { createHandler, type Db, EMBEDDING_DIMENSIONS, parseAllowedOrigins } from "./handler.ts";

const MAX_PHRASE_LENGTH = 200;
const OPENAI_TIMEOUT_MS = 10_000;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Brak zmiennej środowiskowej ${name}`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");

function createDb(authorization: string): Db {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async rpc(fn, args) {
      const { data, error, status } = await client.rpc(fn, args);
      return { data, error, status };
    },
  };
}

async function embed(text: string): Promise<number[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Brak OPENAI_API_KEY");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`OpenAI HTTP ${response.status}`);
  }
  const body = await response.json();
  return body?.data?.[0]?.embedding;
}

Deno.serve(
  createHandler({
    createDb,
    embed,
    config: {
      allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),
      maxPhraseLength: MAX_PHRASE_LENGTH,
    },
  }),
);
