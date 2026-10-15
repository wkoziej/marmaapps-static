# marmaapps-static

Statyczna strona (Vite, GitHub Pages) + Supabase (Auth, Postgres z pgvector, funkcja Edge `search`).
Następca prywatnego repozytorium `marmaapps` (Django na DigitalOcean).

**To repozytorium jest publiczne.** Wszystko, co trafi do commita, jest widoczne dla każdego, także po usunięciu pliku.

## Bezpieczeństwo danych

Zakazane w repozytorium:
- dane punktów: opisy (dokumenty z RethinkDB), wektory embeddingów, eksporty tabel, zrzuty baz i archiwa (`*.sqlite3`, `*.snapshot`, `*.dump`, `*.gz`, `*.zip`, `*.parquet`, `*.npy`, `*.pkl` i inne — pełna lista w `scripts/check-no-data.sh`);
- dane osobowe: adresy e-mail użytkowników, dane kont i płatności;
- sekrety: klucz secret / `service_role` Supabase, hasło bazy (connection string), `OPENAI_API_KEY`, tokeny dostępu.

Dozwolone:
- klucz publiczny Supabase (publishable / `anon`) w kodzie strony — jest publiczny z założenia; bezpieczeństwo zapewnia RLS;
- nazwy punktów i zapytania w teście regresji (`e2e/`), bez opisów;
- dane syntetyczne w testach. Fixture z polami opisów tylko w katalogach `**/__fixtures__/synthetic/`.

Zasady:
- Eksporty tylko w `data-export/` (wykluczone z git). Po migracji katalog jest usuwany lub zaszyfrowany.
- Sekrety tylko w `pass` (odwołania w `.envrc`, ładowane przez direnv) i w sekretach Supabase. Nigdy w CI ani w plikach repozytorium.
  Jedyny wyjątek (decyzja właściciela 2026-10-15): workflow `deploy-supabase.yml` dostaje `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` i `SUPABASE_DB_PASSWORD` jako zaszyfrowane sekrety środowiska GitHub `production` (niewidoczne po zapisaniu, maskowane w logach; tylko `workflow_dispatch` z `main`, wymagana akceptacja właściciela przy każdym uruchomieniu). Klucz secret / `service_role` i `OPENAI_API_KEY` nigdy nie trafiają do CI.
- Adresy e-mail z listy dozwolonych wpisuje właściciel ręcznie w panelu Supabase (tabela `private.allowed_emails`, zob. README.md). Żaden skrypt ich nie czyta ani nie zapisuje. W testach tylko adresy `@example.com`.
- Dostęp do danych punktów sprawdza `public.is_allowed()`: claim `email` z JWT + potwierdzony adres w `auth.users` dla `auth.uid()`. Nigdy `user_metadata`.
- Każda nowa tabela: RLS włączone, jawny `GRANT` (Supabase nie wystawia nowych tabel automatycznie od 30.10.2026) i test negatywny pgTAP (`anon` i `authenticated` spoza listy nie widzą wierszy).
- Brak polityk dla `anon` na danych punktów.
- Nowe obiekty w `public` nie mają domyślnych uprawnień dla `anon`/`authenticated` (migracja RLS); każda migracja nadaje `GRANT` jawnie.
- Logowanie tylko bez haseł: `is_allowed()` odrzuca sesje z `amr` innym niż `otp`/`magiclink`/`oauth`/`email/signup`.
- Testy E2E z prawdziwymi danymi tylko ręcznie, na projekcie Supabase (`npm run test:e2e`, `e2e/README.md`). CI używa tylko danych syntetycznych. Zrzuty ekranu i ślady Playwright są wyłączone; sesja `e2e/.auth/` i raporty są wykluczone z git.
- Dane w zgłoszeniach, logach i opisach PR zamaskowane (bez adresów e-mail, bez treści opisów).

## Ochrona przed wyciekiem (dwie warstwy)

1. Hook pre-commit (`scripts/pre-commit.sh`, instalowany przez `npm install`): strażnik danych `scripts/check-no-data.sh --staged` i `gitleaks`.
2. CI (`.github/workflows/ci.yml`): strażnik na wszystkich plikach i na każdym commicie PR/pusha (`--range`), `gitleaks` na całej historii. CI wykrywa wyciek dopiero po pushu — dane są wtedy już publiczne na gałęzi, więc obowiązuje procedura po alarmie.

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
- `npm run test:functions` — testy funkcji Edge (Deno, fałszywe klienty bazy i OpenAI).

Implementacja metodą TDD: test przed kodem.

## Język

Interfejs tylko po polsku.
