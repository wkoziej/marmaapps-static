# marmaapps-static

Statyczna strona (Vite, GitHub Pages) + Supabase (Auth, Postgres z pgvector, funkcja Edge `search`).
Następca prywatnego repozytorium `marmaapps` (Django na DigitalOcean).

**To repozytorium jest publiczne.** Wszystko, co trafi do commita, jest widoczne dla każdego, także po usunięciu pliku.

## Bezpieczeństwo danych

Zakazane w repozytorium:
- dane punktów: opisy (dokumenty z RethinkDB), wektory embeddingów, eksporty tabel, zrzuty baz (`*.sqlite3`, `*.snapshot`, `*.dump`, `*.tar.gz`);
- dane osobowe: adresy e-mail użytkowników, dane kont i płatności;
- sekrety: klucz secret / `service_role` Supabase, hasło bazy (connection string), `OPENAI_API_KEY`, tokeny dostępu.

Dozwolone:
- klucz publiczny Supabase (publishable / `anon`) w kodzie strony — jest publiczny z założenia; bezpieczeństwo zapewnia RLS;
- nazwy punktów i zapytania w teście regresji (`e2e/`), bez opisów;
- dane syntetyczne w testach. Fixture z polami opisów tylko w katalogach `**/__fixtures__/synthetic/`.

Zasady:
- Eksporty tylko w `data-export/` (wykluczone z git). Po migracji katalog jest usuwany lub zaszyfrowany.
- Sekrety tylko w `pass` (odwołania w `.envrc`, ładowane przez direnv) i w sekretach Supabase. Nigdy w CI ani w plikach repozytorium.
- Adresy e-mail z listy dozwolonych wpisuje właściciel ręcznie w panelu Supabase. Żaden skrypt ich nie czyta ani nie zapisuje.
- Każda nowa tabela: RLS włączone, jawny `GRANT` (Supabase nie wystawia nowych tabel automatycznie od 30.10.2026) i test negatywny pgTAP (`anon` i `authenticated` spoza listy nie widzą wierszy).
- Brak polityk dla `anon` na danych punktów.
- Testy E2E z prawdziwymi danymi tylko ręcznie, na projekcie Supabase. CI używa tylko danych syntetycznych.
- Dane w zgłoszeniach, logach i opisach PR zamaskowane (bez adresów e-mail, bez treści opisów).

## Ochrona przed wyciekiem (dwie warstwy)

1. Hook pre-commit (`scripts/pre-commit.sh`, instalowany przez `npm install`): strażnik danych `scripts/check-no-data.sh --staged` i `gitleaks`.
2. CI (`.github/workflows/ci.yml`): `scripts/check-no-data.sh --all` i `gitleaks` na całej historii.

Dodatkowo w ustawieniach repozytorium: GitHub secret scanning i push protection.

Nie używaj `git commit --no-verify` ani `SKIP_SIMPLE_GIT_HOOKS=1`, aby obejść alarm.

## Procedura po alarmie

1. Nie wypychaj (`git push`).
2. Usuń plik z commita: `git reset HEAD~1` (lub `git restore --staged <plik>`), przenieś dane do `data-export/`.
3. Jeżeli dane lub sekret trafiły na GitHub:
   - usuń repozytorium lub przepisz historię (`git filter-repo`) i wypchnij z `--force`;
   - poproś GitHub Support o wyczyszczenie cache (widoki commitów, forki, PR);
   - zmień każdy klucz, który mógł wyciec (Supabase secret, hasło bazy, OpenAI).
4. Zapisz w zgłoszeniu tylko rodzaj danych i datę, bez samych danych.

## Testy

- `npm test` — Vitest (frontend).
- `npm run test:guard` — testy strażnika danych.
- `npx supabase test db` — pgTAP (wymaga lokalnego stacku: `npx supabase start`, Docker).
- `npx deno test` w `supabase/functions/` — testy funkcji Edge.

Implementacja metodą TDD: test przed kodem.

## Język

Interfejs tylko po polsku.
