# marmaapps-static

Interaktywny model 3D punktów marma z wyszukiwaniem. Statyczna strona na GitHub Pages, dane i logowanie w Supabase.

Dostęp mają tylko zalogowani użytkownicy z listy dozwolonych adresów. Repozytorium nie zawiera danych punktów (zob. `CLAUDE.md`).

## Narzędzia

- Node.js 22+ (`npm install` instaluje też Supabase CLI, Deno i hook pre-commit).
- Docker (lokalny stack Supabase).
- [gitleaks](https://github.com/gitleaks/gitleaks) 8.30+ w `PATH` (wymagany przez hook pre-commit), np. binarka z GitHub Releases w `~/.local/bin`.
- direnv + pass (sekrety; zob. `.envrc`).

## Uruchomienie lokalne

```bash
npm install
cp .env.example .env.local   # uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

### Model 3D (`public/models/human.glb`)

Model nie jest w repozytorium: licencja nie jest jeszcze potwierdzona przez właściciela, a ścieżka jest w `.gitignore`.
Skopiuj plik ręcznie z prywatnego repozytorium `marmaapps` (`djangoapp/static/mpoints/assets/human.glb`) do `public/models/human.glb`.
Bez pliku strona punktów działa, ale model się nie wczytuje (błąd w konsoli). `npm run build` kopiuje plik do `dist/models/`.

## Frontend

- Strony (wejścia Vite, multi-page w `vite.config.js`): `index.html` (start: logowanie bez sesji, treść z sesją),
  `points.html` (model 3D i wyszukiwanie, wymaga sesji), `login.html` (logowanie i powrót z linku lub z Google).
- Kod w `src/`: `points.js` (start strony punktów), `home.js`, `layout.js` (nawigacja, wylogowanie), `config.js` (zmienne `VITE_*`),
  `services/ApiService.js` (funkcja Edge `search`), `features/search/`, `managers/`, `utils/`, `constants/` (teksty PL).
- `src/auth/`: `supabaseClient.js` (jeden klient), `sessionGuard.js` (strażnik stron), `loginPage.js` (formularz),
  `redirects.js` (cel powrotu), `session.js` (`getAccessToken`, `onSessionExpired`, `signOut` dla `ApiService` i nawigacji).
- three.js 0.128.0 z npm (`GLTFLoader`, `OrbitControls` z `three/examples/jsm`).
- `BASE_PATH=/marmaapps-static/ npm run build` — build dla tymczasowego adresu GitHub Pages.

## Logowanie

Logowanie tylko bez haseł: link e-mail (magic link) albo Google. Klient Supabase (`src/auth/supabaseClient.js`)
używa flow PKCE, trzyma sesję w `localStorage` i sam ją odświeża.

1. `points.html` bez sesji przekierowuje do `login.html?next=points.html`. `index.html` bez sesji pokazuje formularz logowania.
2. Link e-mail: `signInWithOtp` bez `shouldCreateUser: false` (przy pierwszym logowaniu konto jeszcze nie istnieje).
   Adres spoza listy odrzuca hook „Before User Created” (403) — strona pokazuje komunikat o kontakcie z właścicielem.
3. Link z e-maila i powrót z Google trafiają na `login.html?next=<cel>`. Klient wymienia kod z adresu na sesję,
   a strona przechodzi do celu. Cel jest tylko nazwą strony z listy (`index.html`, `points.html`, strona startowa);
   każda inna wartość (np. `https://…`, `//…`, `javascript:`) daje stronę startową.
4. Błędy w adresie powrotu (query lub hash: `error`, `error_code`, `error_description`) dają komunikat:
   link wygasł lub nieprawidłowy, brak dostępu (odmowa hooka), zbyt częste żądania, błąd Google.
5. „Wyloguj” usuwa sesję tylko w tej przeglądarce (`scope: 'local'`). Odpowiedź 401 z funkcji `search`
   lub nieudane odświeżenie sesji przekierowuje do logowania z celem.

Ograniczenie PKCE: link z e-maila trzeba otworzyć w tej samej przeglądarce, w której poproszono o link
(weryfikator jest w `localStorage`). W innej przeglądarce strona pokaże komunikat o nieprawidłowym linku.

### Redirect URLs (panel Supabase → Authentication → URL Configuration)

Lokalnie ustawia je `supabase/config.toml` (`site_url = http://localhost:5173`, wzorce `http://localhost:5173/**` i port 4173 dla `npm run preview`).
W projekcie w chmurze:

- Site URL: adres produkcyjny strony, np. `https://<domena>/` (do czasu przełączenia domeny: `https://wkoziej.github.io/marmaapps-static/`).
- Redirect URLs (wzorce z `**`, bo adres powrotu zawiera `?next=`):
  - `https://wkoziej.github.io/marmaapps-static/**` — tymczasowy adres GitHub Pages (`BASE_PATH=/marmaapps-static/`);
  - `https://<domena>/**` — domena właściciela (`BASE_PATH=/`);
  - opcjonalnie `http://localhost:5173/**` — praca lokalna z projektem w chmurze. Wpis tylko na czas tej pracy:
    po jej zakończeniu usuń go z projektu produkcyjnego.

Po przełączeniu domeny usuń wpis GitHub Pages. Google: w Google Cloud Console jako „Authorized redirect URI”
podaj `https://<projekt>.supabase.co/auth/v1/callback` (nie adres strony).

## Testy

```bash
npm test             # Vitest
npm run test:guard   # strażnik danych
npm run check:data   # strażnik danych na wszystkich plikach
npx supabase start   # lokalny stack (Docker)
npx supabase test db # pgTAP: schemat, lista adresów, RLS, limit zapytań
npm run test:functions  # Deno: funkcja Edge search (fałszywe klienty, bez OpenAI)
npm run check:functions # Deno: kontrola typów index.ts
```

## Dodanie użytkownika do listy dozwolonych adresów

Dostęp ma tylko adres z tabeli `private.allowed_emails` (schemat niewystawiony przez API).

1. Panel Supabase → Table Editor → schemat `private` → tabela `allowed_emails`.
2. Insert row: kolumna `email`, np. `nowa.osoba@example.com` (wielkość liter nie ma znaczenia).
3. Osoba loguje się linkiem e-mail lub przez Google. Hook „Before User Created” odrzuca adresy spoza listy (403).

Usunięcie wiersza odcina dostęp do danych od kolejnego zapytania (RLS), także dla istniejącego konta.
Adresów nie zapisuj w repozytorium ani w skryptach (zob. `CLAUDE.md`).

Na projekcie Supabase hook trzeba włączyć raz: Authentication → Hooks → Before User Created →
Postgres, funkcja `private.before_user_created_hook`. Lokalnie włącza go `supabase/config.toml`.

## Wymagane ustawienia Auth w projekcie Supabase

Lokalnie ustawia je `supabase/config.toml`. W projekcie w chmurze trzeba je ustawić w panelu (pełna lista: `docs/supabase-setup.md`, U8):

- Authentication → Hooks → „Before User Created” → funkcja `private.before_user_created_hook`. **Bez hooka każdy może założyć konto** (dane nadal chroni RLS).
- Authentication → Providers → Email → „Confirm email” włączone.

Ochrona danych nie zależy od samego hooka. `public.is_allowed()` wymaga: potwierdzonego adresu z listy, adresu z JWT zgodnego z kontem i sesji bez hasła (claim `amr`: `otp`, `magiclink`, `oauth` lub `email/signup` — pierwsze logowanie linkiem). Sesja z logowania hasłem nie widzi danych, nawet jeśli ktoś założył konto z hasłem na adres z listy.

Test dymny po każdej zmianie ustawień Auth: prośba o link dla adresu spoza listy (np. `nikt@example.com`) zwraca 403.

## Funkcja Edge `search`

Kontrakt (zgodny z dawnym `/pointsdb/answer`): `GET /functions/v1/search?problem=<fraza>`,
nagłówki `Authorization: Bearer <access_token sesji>` i `apikey: <klucz publiczny>`.
Odpowiedź 200: `{"answer": {"points": [...]}}`. Błędy: `{"error": "<komunikat>"}` z kodem
400 (brak lub za długa fraza, maks. 200 znaków), 401 (brak sesji lub klucz publiczny zamiast sesji),
403 (adres spoza listy), 405, 429 (limit zapytań), 500 (błąd bazy), 502 (błąd OpenAI).

Limit zapytań na użytkownika: 30 na minutę i 500 na dobę (UTC); wartości w funkcji
`public.consume_search_quota()` (migracja `*_search_quota.sql`).

Sekrety funkcji (panel Supabase → Edge Functions → Secrets lub `npx supabase secrets set`; nigdy w repozytorium):

- `OPENAI_API_KEY` — klucz projektu OpenAI do embeddingów (`text-embedding-3-small`). Używany tylko wtedy,
  gdy wyszukiwanie po nazwie i doszy nic nie zwróci.
- `ALLOWED_ORIGINS` — dozwolone originy strony po przecinku (domena produkcyjna, tymczasowy adres
  GitHub Pages do czasu przełączenia, adres lokalny Vite).

`SUPABASE_URL` i `SUPABASE_ANON_KEY` dostarcza runtime. Funkcja nie używa klucza secret/`service_role`:
zapytania idą z JWT użytkownika, więc działa RLS.

W panelu OpenAI ustaw miesięczny limit wydatków (Usage limits) dla projektu klucza.

Lokalnie: `supabase/functions/.env` (wykluczony z git) z `ALLOWED_ORIGINS=http://localhost:5173`, potem
`npx supabase functions serve --env-file supabase/functions/.env`. Bez `OPENAI_API_KEY` ścieżka
semantyczna zwraca 502. Uwaga: lokalna brama (Kong) sama obsługuje `OPTIONS` i nadpisuje
`Access-Control-Allow-Origin` na `*`, więc ograniczenie originów da się sprawdzić tylko na projekcie w chmurze.
