# Ustawienia usług w chmurze (Supabase, Resend, Google, OpenAI, GitHub)

Lista kontrolna dla właściciela (U8). Część ustawień projektu w chmurze nie wynika z `supabase/config.toml`
(ten plik opisuje tylko lokalny stack), więc ustawiasz je ręcznie w panelach.

Zasady:

- W tym pliku nie ma prawdziwych adresów e-mail ani sekretów. Wartości tajne trzymaj tylko w `pass`
  (odwołania w `.envrc`), w sekretach Supabase albo w sekretach środowiska GitHub `production`.
- Oznaczenia: `<ref>` — identyfikator projektu Supabase, `<domena>` — domena właściciela,
  `SUPABASE_URL` = `https://<ref>.supabase.co`, `PK` — klucz publiczny (publishable).
- **[do sprawdzenia]** oznacza zachowanie usługi, którego nie da się sprawdzić lokalnie.
  Wynik zapisz w PR lub w `docs/solutions/` (bez danych).

Adres tymczasowy strony: `https://wkoziej.github.io/marmaapps-static/` (`BASE_PATH=/marmaapps-static/`).
Origin tymczasowy (do CORS): `https://wkoziej.github.io` — origin nie zawiera ścieżki.

---

## 1. Projekt Supabase

- [ ] Utwórz projekt (plan Free). Hasło bazy zapisz w `pass` (`projects/marmaapps-static/SUPABASE_DB_PASSWORD`).
- [ ] Zapisz `<ref>` w `pass` (`projects/marmaapps-static/SUPABASE_PROJECT_REF`) i odkomentuj wpis w `.envrc`.
- [ ] Settings → API Keys: użyj kluczy nowego typu.
  - Klucz **publishable** (`sb_publishable_...`) → repository variable `VITE_SUPABASE_PUBLISHABLE_KEY` (sekcja 9).
  - Klucz **secret** (`sb_secret_...`) nie jest potrzebny ani stronie, ani funkcji `search`, ani importowi.
    Nie twórz go bez potrzeby. Jeżeli powstanie: tylko `pass`, nigdy CI ani repozytorium.
  - Starsze klucze `anon` / `service_role`: tylko gdy nowy typ nie działa. **[do sprawdzenia]** czy
    funkcja Edge z `verify_jwt = true` przyjmuje żądania z kluczem publishable w nagłówku `apikey`.
- [ ] Migracje i funkcja `search`: workflow „Wdrożenie Supabase” (sekcja 9) albo lokalnie:
  `npx supabase link --project-ref "$SUPABASE_PROJECT_REF"`, `npx supabase db push`,
  `npx supabase functions deploy search`. Nie używaj `npx supabase config push`: nadpisałby ustawienia Auth
  wartościami lokalnymi (np. `site_url = http://127.0.0.1:3000`).
- [ ] Import danych punktów: `scripts/migration/README.md` (U5). Po imporcie zmień hasło bazy
  i zaktualizuj `pass` oraz sekret `SUPABASE_DB_PASSWORD` w GitHub.
- [ ] Lista dozwolonych adresów: `README.md`, sekcja „Dodanie użytkownika”. Dodaj także konto testowe
  dla testu regresji (`e2e/README.md`).

## 2. Authentication → URL Configuration

- [ ] Site URL: `https://wkoziej.github.io/marmaapps-static/` (po przełączeniu domeny: `https://<domena>/`, U9).
- [ ] Redirect URLs:
  - `https://wkoziej.github.io/marmaapps-static/**` (usuń w U9),
  - `https://<domena>/**`,
  - `http://localhost:5173/**` (tylko jeżeli testujesz lokalny frontend z projektem w chmurze).
  **[do sprawdzenia]** na które dokładnie strony wraca logowanie U7 (`index.html`, `login.html`).
  Jeżeli lista jest stała, zastąp wzorce `**` dokładnymi adresami.

## 3. Authentication → Sign In / Providers

- [ ] Email: włączony. „Confirm email” **włączone**.
- [ ] „Allow new users to sign up” zostaw włączone: pierwsze logowanie linkiem tworzy konto.
  O dostępie decyduje hook (sekcja 4), nie ten przełącznik.
- [ ] Rejestracja hasłem: jeżeli panel ma osobny przełącznik dla logowania hasłem, wyłącz go.
  **[do sprawdzenia]** czy panel ma taki przełącznik. Jeżeli nie: konto z hasłem można założyć tylko
  na adres z listy (hook), a sesja hasłem nie widzi danych (`public.is_allowed()` odrzuca `amr = password`).
- [ ] Anonymous sign-ins: **wyłączone**.
- [ ] Phone i pozostali dostawcy: wyłączeni. Aktywne zostają tylko e-mail (link/OTP) i Google.
- [ ] Google: włączony, Client ID i Client Secret z sekcji 6. Client Secret tylko w panelu Supabase i w `pass`.

## 4. Authentication → Hooks

- [ ] Before User Created → typ Postgres → schemat `private`, funkcja `before_user_created_hook`.
  **Bez hooka każdy może założyć konto** (dane nadal chroni RLS).

## 5. SMTP: Resend

- [ ] Resend → Domains → dodaj `<domena>` (lub subdomenę do wysyłki, np. `mail.<domena>`).
- [ ] U dostawcy DNS dodaj rekordy z panelu Resend: SPF (TXT/MX dla domeny zwrotnej) i DKIM.
  Zalecany także rekord DMARC (np. `p=none` na start). Poczekaj na status „Verified”.
- [ ] Resend → API Keys: klucz z uprawnieniem „Sending access” ograniczonym do tej domeny.
  Zapisz go w `pass`. To jest hasło SMTP.
- [ ] Supabase → Authentication → Emails → SMTP Settings: włącz Custom SMTP.
  - Host `smtp.resend.com`, port `465` (lub `587`), użytkownik `resend`, hasło = klucz z poprzedniego kroku.
  - Adres nadawcy w domenie, np. `logowanie@<domena>`; nazwa nadawcy np. „Marma”.
- [ ] Authentication → Rate Limits: limit e-maili na godzinę podnieś z wartości domyślnej do np. 30
  (po włączeniu własnego SMTP). Limit jednej wiadomości na minutę na adres zostaw.
  **[do sprawdzenia]** aktualne limity planu Free Resend (dziennie i miesięcznie).
- [ ] Szablon „Magic Link” (opcjonalnie): treść po polsku, link `{{ .ConfirmationURL }}`.

## 6. Google Cloud: klient OAuth

- [ ] Google Cloud Console → nowy projekt (np. `marmaapps`).
- [ ] OAuth consent screen (Google Auth Platform → Branding/Audience): typ External, zakresy `openid`,
  `email`, `profile`. Domeny autoryzowane: `<domena>`, `supabase.co`.
  **[do sprawdzenia]** status publikacji: w trybie „Testing” logować się mogą tylko dodani użytkownicy
  testowi; dla podstawowych zakresów publikacja zwykle nie wymaga weryfikacji Google.
- [ ] Credentials → Create OAuth client ID → Web application.
  - Authorized JavaScript origins: `https://wkoziej.github.io`, `https://<domena>`.
  - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback` (adres powrotu Supabase,
    widoczny w Supabase → Providers → Google).
- [ ] Client ID i Client Secret wpisz w Supabase (sekcja 3). Secret zapisz w `pass`.

## 7. Sekrety funkcji `search`

Ustawiasz je lokalnie, nie z CI (workflow ich nie zna):

```bash
# w katalogu repozytorium, po `direnv allow` (OPENAI_API_KEY i SUPABASE_PROJECT_REF z pass)
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" OPENAI_API_KEY="$OPENAI_API_KEY"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
  ALLOWED_ORIGINS="https://wkoziej.github.io,https://<domena>"
npx supabase secrets list --project-ref "$SUPABASE_PROJECT_REF"   # pokazuje tylko nazwy i skróty
```

- [ ] `ALLOWED_ORIGINS` zawiera originy bez ścieżki i bez końcowego `/`. Origin `https://wkoziej.github.io`
  obejmuje wszystkie strony GitHub Pages właściciela; usuń go w U9.
- [ ] `http://localhost:5173` dodaj tylko na czas testu lokalnego frontendu z projektem w chmurze.
- [ ] Po zmianie sekretów **[do sprawdzenia]** czy funkcja widzi nowe wartości bez ponownego wdrożenia.

## 8. OpenAI

- [ ] Osobny projekt w panelu OpenAI i klucz projektu tylko do embeddingów (jeżeli panel pozwala ograniczyć
  uprawnienia klucza, zostaw tylko dostęp do embeddingów).
- [ ] Settings → Limits: **miesięczny limit wydatków** projektu (np. kilka USD) i próg powiadomienia e-mail.
- [ ] Klucz tylko w `pass` i w sekretach Supabase (sekcja 7).

## 9. GitHub (repozytorium `wkoziej/marmaapps-static`)

- [ ] Settings → Pages → Build and deployment → Source: **GitHub Actions**. Po podpięciu domeny: „Enforce HTTPS”.
- [ ] Settings → Secrets and variables → Actions → **Variables** (repository variables, nie sekrety):

  | Zmienna | Wartość |
  | --- | --- |
  | `BASE_PATH` | `/marmaapps-static/` (po przełączeniu domeny: `/`) |
  | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
  | `VITE_SUPABASE_PUBLISHABLE_KEY` | klucz publishable (publiczny z założenia) |
  | `HUMAN_MODEL_URL` | adres HTTPS pliku `human.glb` (poza repozytorium) |
  | `HUMAN_MODEL_SHA256` | suma `sha256sum human.glb` (64 znaki hex) |

  Model 3D nie jest w repozytorium (licencja niepotwierdzona). Uwaga: strona na GitHub Pages udostępnia
  plik modelu publicznie, tak samo jak repozytorium. **Przed pierwszym wdrożeniem potwierdź licencję
  modelu** (prawo do publicznego udostępnienia). Bez `HUMAN_MODEL_URL` workflow „Wdrożenie strony” kończy się błędem.
- [ ] Settings → Environments → **`production`**:
  - Required reviewers: właściciel. Jeżeli jesteś jedynym recenzentem, nie włączaj „Prevent self-review”
    (inaczej nikt nie zatwierdzi wdrożenia).
  - Deployment branches and tags: „Selected branches” → `main`.
  - Environment secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
- [ ] `SUPABASE_ACCESS_TOKEN`: Supabase → Account → Access Tokens → osobny token tylko dla tego workflow
  (nazwa np. `github-deploy-marmaapps-static`), z datą wygaśnięcia, jeżeli panel ją oferuje.
  **[do sprawdzenia]** czy Supabase oferuje token ograniczony do jednego projektu; jeżeli tak, użyj go.
  Token osobisty ma dostęp do wszystkich projektów konta: unieważnij go po każdym podejrzeniu wycieku.
- [ ] **[do sprawdzenia]** czy `supabase db push` działa bez `SUPABASE_DB_PASSWORD` (nowsze CLI mogą użyć
  tymczasowej roli logowania przez API). Jeżeli tak, usuń ten sekret z GitHub i z workflow.
- [ ] Environment `github-pages` (tworzy go pierwsze wdrożenie): reguła gałęzi tylko `main`.
- [ ] Settings → Code security: Secret scanning i Push protection włączone (U1).
- [ ] Settings → Actions → General → Workflow permissions: „Read repository contents” (domyślnie).
  Workflowy deklarują własne, minimalne uprawnienia.

## 10. Keep-alive (`.github/workflows/keepalive.yml`)

Darmowy projekt jest wstrzymywany po 7 dniach bez aktywności. Workflow co około 3 dni wysyła anonimowe
zapytanie `GET /rest/v1/marma_points?select=name&limit=1` z kluczem publicznym. Rola `anon` nie ma
uprawnień do danych punktów, więc oczekiwana odpowiedź to 401 (lub pusta lista). Odpowiedź z danymi
kończy workflow błędem (wyciek: sprawdź RLS i GRANT). Na końcu workflow ponownie włącza swój harmonogram
przez API GitHub (`PUT /repos/{repo}/actions/workflows/keepalive.yml/enable`).

- [ ] Actions → „Keep-alive Supabase” → Run workflow. Oczekiwany log: `HTTP 401` (lub pusta lista), oba joby zielone.
- [ ] **[do sprawdzenia]** czy Supabase liczy odrzucone zapytanie anonimowe jako aktywność projektu.
  Sprawdź po ok. 8 dniach bez innego ruchu (brak e-maila o wstrzymaniu, projekt aktywny).
  Jeżeli nie liczy: dodaj funkcję Edge `health` dostępną dla `anon` (bez danych, np. `select 1`)
  i zmień adres w workflow.
- [ ] **[do sprawdzenia]** czy ponowne włączenie aktywnego workflow resetuje licznik 60 dni GitHub.
  Sygnał awaryjny: e-mail GitHub o wyłączeniu harmonogramu.
- [ ] Plan awaryjny: e-mail Supabase o wstrzymaniu → panel → Restore project.

---

## Test dymny po wdrożeniu

Wykonaj po pierwszym wdrożeniu i po każdej zmianie ustawień Auth, CORS lub sekretów. Polecenia używają
zmiennych `SUPABASE_URL`, `PK` (klucz publiczny) i `SITE_ORIGIN=https://wkoziej.github.io`.
W poleceniach używaj tylko adresów `@example.com`. Do zgłoszeń zapisuj tylko kody HTTP.

### Strona i logowanie

- [ ] Strona działa na `https://wkoziej.github.io/marmaapps-static/`; model 3D się wczytuje.
- [ ] Link logowania z Resend dociera do skrzynki testowej i **nie trafia do spamu**. W nagłówkach
  wiadomości („Pokaż oryginał”) SPF i DKIM mają wynik `pass`.
- [ ] Link prowadzi do aplikacji (Site URL i Redirect URLs są poprawne).
- [ ] Logowanie przez Google działa dla adresu z listy.
- [ ] Logowanie przez Google dla adresu spoza listy: komunikat odmowy, brak konta w Authentication → Users.
  **[do sprawdzenia]** format błędu hooka w przekierowaniu po Google (U7).

### API Auth

- [ ] Adres spoza listy (link logowania) → **403**:
  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/auth/v1/otp" \
    -H "apikey: $PK" -H 'Content-Type: application/json' -d '{"email":"nikt@example.com"}'
  ```
- [ ] Rejestracja hasłem dla adresu spoza listy → odmowa (**403** z hooka):
  ```bash
  TEST_PASSWORD="$(openssl rand -hex 16)"   # jednorazowe, losowe
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $PK" -H 'Content-Type: application/json' \
    -d "{\"email\":\"nikt@example.com\",\"password\":\"$TEST_PASSWORD\"}"
  ```
  Jeżeli panel wyłącza logowanie hasłem, oczekiwany jest inny kod błędu 4xx. Każdy kod 2xx to błąd konfiguracji.
- [ ] Logowanie anonimowe → odmowa (oczekiwany **422**, „anonymous sign-ins are disabled”):
  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/auth/v1/signup" \
    -H "apikey: $PK" -H 'Content-Type: application/json' -d '{}'
  ```

### Dane bez sesji

- [ ] Odczyt tabeli punktów kluczem publicznym → **401** (lub `[]`), nigdy dane:
  ```bash
  curl -sS -w '\n%{http_code}\n' "$SUPABASE_URL/rest/v1/marma_points?select=name&limit=1" -H "apikey: $PK"
  ```

### Funkcja `search`: CORS i brama

- [ ] Preflight `OPTIONS` z dozwolonego originu przechodzi przez bramę (bez nagłówka `Authorization`)
  i zwraca `Access-Control-Allow-Origin: https://wkoziej.github.io`:
  ```bash
  curl -sS -i -X OPTIONS "$SUPABASE_URL/functions/v1/search" -H "Origin: $SITE_ORIGIN" \
    -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization,apikey'
  ```
  **[do sprawdzenia]** (otwarta kwestia U4): czy brama z `verify_jwt = true` przepuszcza `OPTIONS` bez JWT.
  Jeżeli zwraca 401, przeglądarka zablokuje każde wyszukiwanie. Wtedy decyzja: `verify_jwt = false`
  dla `search` (funkcja sama sprawdza rolę, a podpis JWT sprawdza PostgREST w `is_allowed()`).
- [ ] Preflight z obcego originu → brak `Access-Control-Allow-Origin` dla tego originu (i nie `*`):
  ```bash
  curl -sS -i -X OPTIONS "$SUPABASE_URL/functions/v1/search" -H 'Origin: https://example.com' \
    -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization,apikey'
  ```
  Lokalna brama (Kong) nadpisuje ten nagłówek na `*`; w chmurze **[do sprawdzenia]**.
- [ ] Klucz publiczny jako `Bearer` → **401**, bez danych:
  ```bash
  curl -sS -i "$SUPABASE_URL/functions/v1/search?problem=test" -H "Origin: $SITE_ORIGIN" \
    -H "apikey: $PK" -H "Authorization: Bearer $PK"
  ```
- [ ] Wygasły token sesji → **401** i odpowiedź **ma nagłówki CORS** (`Access-Control-Allow-Origin`
  równy `SITE_ORIGIN`). Bez nich przeglądarka nie odczyta kodu 401 i strona nie przekieruje do logowania:
  ```bash
  curl -sS -i "$SUPABASE_URL/functions/v1/search?problem=test" -H "Origin: $SITE_ORIGIN" \
    -H "apikey: $PK" -H "Authorization: Bearer <wygasły access_token>"
  ```
  **[do sprawdzenia]** (otwarta kwestia U4): 401 z bramy (`verify_jwt`) może nie mieć nagłówków CORS.
  Token do testu: stary `access_token` z sesji testowej (ważny 1 h). Nie zapisuj go nigdzie.

### Wyszukiwanie i keep-alive

- [ ] Test regresji: `e2e/README.md` (`npm run test:e2e`) — wszystkie testy zielone.
- [ ] Workflow „Keep-alive Supabase” uruchomiony ręcznie: sukces, odpowiedź bez danych punktów,
  krok ponownego włączenia zielony.
- [ ] Panel OpenAI: limit wydatków ustawiony; zużycie po teście regresji zgodne z oczekiwaniem.
