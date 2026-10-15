# Runbook przełączenia (U9): domena na GitHub Pages, okres próbny, wyłączenie dropletu

Lista kontrolna dla właściciela. Kroki wykonuj w podanej kolejności. Po każdym kroku dopisz wiersz
w sekcji „Rejestr wykonania”.

Zasady:

- W tym pliku i w rejestrze nie ma adresów e-mail, haseł, kluczy, tokenów ani adresów IP.
  Zapisuj tylko daty, wyniki i liczby.
- Oznaczenia: `<domena>` — adres strony u właściciela (zob. „Otwarte kwestie”), `<ref>` — identyfikator
  projektu Supabase, `<IP dropletu>` — adres dropletu (tylko w `pass` lub w panelu DigitalOcean),
  `<ścieżka>` — katalog bazy SQLite na droplecie.
- Wartości tajne tylko w `pass` (odwołania w `.envrc`), w sekretach Supabase lub w sekretach środowiska GitHub.
- Dokumenty powiązane: `scripts/migration/README.md` (eksport, import, weryfikacja),
  `docs/supabase-setup.md` (ustawienia paneli, test dymny), `e2e/README.md` (test regresji),
  `.github/workflows/deploy.yml`, `deploy-supabase.yml`, `keepalive.yml`.
- Warunek wstępny: U8 zakończone. Strona działa na adresie tymczasowym
  `https://wkoziej.github.io/marmaapps-static/`, test regresji przechodzi, keep-alive działa.

---

## Faza 0. Przygotowanie (co najmniej 24 h przed przełączeniem)

### 1. Obniż TTL rekordów DNS

1. U dostawcy DNS domeny zapisz obecne rekordy dla `<domena>` (typ, nazwa, wartość, TTL).
   Zapis trzymaj poza repozytorium (np. w `pass`). Potrzebujesz go w planie wycofania.
2. Ustaw TTL tych rekordów na 300 s.

Gotowe: `dig +noall +answer <domena>` pokazuje TTL ≤ 300. Od zmiany minęło co najmniej 24 h
(poprzedni TTL wygasł w pamięci resolverów).

### 2. Sprawdź obraz aplikacji na droplecie

Na droplecie:

```bash
docker inspect --format '{{.Config.Image}}' $(docker ps -q)
```

Oczekiwany obraz aplikacji: `ghcr.io/wkoziej/marmaapps/djangoapp:latest` (budowany z gałęzi `develop`
starego repozytorium) albo tag z SHA commita. Dla tagu SHA sprawdź commit w starym repozytorium.

Gotowe: obraz aplikacji pochodzi z kodu, z którego wzięto domyślne nazwy źródeł eksportu
(ścieżka SQLite, baza i tabela RethinkDB, kolekcja Qdrant; zob. `scripts/migration/README.md`).
Inny obraz: zatrzymaj się i sprawdź nazwy źródeł przed eksportem.

---

## Faza 1. Dane (dzień przełączenia)

### 3. Wykonaj końcowy eksport i weryfikację liczb

Od tego momentu nie zmieniaj danych punktów w panelu administracyjnym Django.

1. Wykonaj eksport według `scripts/migration/README.md`, sekcja 1 (wariant A lub B).
2. Sprawdź, że eksport jest poza git: `git status` nie pokazuje `data-export/`.

Gotowe: `manifest.json` zawiera wszystkie trzy źródła (SQLite, RethinkDB, Qdrant).

### 4. Zaimportuj dane do projektu produkcyjnego

```bash
uv run --project scripts/migration python scripts/migration/import_to_supabase.py \
  --export-dir data-export --confirm-host <host bazy produkcyjnej>
uv run --project scripts/migration python scripts/migration/verify_counts.py --export-dir data-export
```

1. Przed potwierdzeniem porównaj host wypisany przez skrypt z hostem projektu produkcyjnego.
2. Zapisz liczby z raportu `verify_counts` w rejestrze.

Gotowe: import kończy się kodem 0. `verify_counts` kończy się kodem 0. Liczby są zgodne z planem
(104 punkty, 209 współrzędnych, 14 funkcji, 888 tematów, 2063 powiązania, wektory = liczba punktów
w Qdrant, oczekiwane 1776) albo różnica jest wyjaśniona w rejestrze.

### 5. Zmień hasło bazy

1. Panel Supabase → Project Settings → Database → Reset database password.
2. Zapisz nowe hasło i connection string w `pass`. Zaktualizuj sekret `SUPABASE_DB_PASSWORD`
   w środowisku GitHub `production` (`docs/supabase-setup.md`, sekcja 9).

Gotowe: stare hasło nie działa (np. `psql` ze starym connection string zwraca błąd uwierzytelnienia).
Workflow „Wdrożenie Supabase” działa z nowym sekretem (jeżeli go używasz).

### 6. Wpisz adresy e-mail ręcznie w panelu Supabase

Adresy nie przechodzą przez skrypty, pliki ani repozytorium. Odczytujesz je tylko na ekranie.

1. Połącz się z dropletem przez SSH (sesja interaktywna).
2. Wyłącz zapis historii powłoki w tej sesji:

   ```bash
   unset HISTFILE
   ```

3. Policz konta (zapytanie zwraca tylko liczbę):

   ```bash
   sqlite3 -readonly <ścieżka>/prod-db.sqlite3 \
     "SELECT count(DISTINCT lower(trim(email))) FROM auth_user WHERE is_active = 1 AND trim(email) <> '';"
   ```

   Jeżeli na hoście nie ma `sqlite3`, uruchom to samo zapytanie w kontenerze `djangoapp`
   (`docker exec -it djangoapp ...`; do sprawdzenia, czy kontener ma `sqlite3`).
4. Wyświetl adresy na ekranie. Bez przekierowania (`>`), bez `tee`, bez `script`, bez kopii pliku:

   ```bash
   sqlite3 -readonly <ścieżka>/prod-db.sqlite3 \
     "SELECT DISTINCT lower(trim(email)) FROM auth_user WHERE is_active = 1 AND trim(email) <> '' ORDER BY 1;"
   ```

   Właściciel decyduje, które konta dostają dostęp (np. tylko aktywni użytkownicy).
5. Wpisz każdy adres ręcznie: panel Supabase → Table Editor → schemat `private` → tabela
   `allowed_emails` → Insert row (zob. `README.md`, „Dodanie użytkownika”).
6. Wyczyść ekran (`clear`) i zamknij sesję SSH.
7. Policz wiersze w panelu: SQL Editor →

   ```sql
   select count(*) from private.allowed_emails;
   ```

Gotowe: liczba wierszy = liczba wybranych kont + konta testowe (np. konto testu regresji).
W rejestrze zapisz tylko liczby.

### 7. Wykonaj test regresji i test dymny na projekcie produkcyjnym

1. Test regresji według `e2e/README.md`:

   ```bash
   E2E_BASE_URL=https://wkoziej.github.io/marmaapps-static/ npm run test:e2e
   ```

2. Test dymny: `docs/supabase-setup.md`, sekcja „Test dymny po wdrożeniu”.

Gotowe: wszystkie testy E2E zielone. Wszystkie punkty testu dymnego mają oczekiwane kody HTTP.
Jedna osoba z listy (nie konto testowe) loguje się sama linkiem e-mail lub przez Google.

---

## Faza 2. Przełączenie domeny

### 8. Przełącz domenę na GitHub Pages

1. GitHub → Settings (konta) → Pages → Verified domains: dodaj `<domena>` i rekord TXT u dostawcy DNS.
   Weryfikacja chroni domenę przed przejęciem.
2. Dodaj plik `public/CNAME` z jedną linią `<domena>` (bez `https://` i bez ścieżki). Vite kopiuje go do `dist/`.
   Uwaga: przy wdrożeniu przez GitHub Actions GitHub ignoruje plik `CNAME`. Decyduje ustawienie z kroku 3.
3. Repozytorium → Settings → Pages → Custom domain: wpisz `<domena>` i zapisz.
4. Repozytorium → Settings → Secrets and variables → Actions → Variables: ustaw `BASE_PATH` na `/`.
5. Uruchom workflow „Wdrożenie strony (GitHub Pages)” (push do `main` lub Run workflow).
6. U dostawcy DNS zmień rekordy `<domena>`:
   - domena główna (apex): rekordy A i AAAA na adresy GitHub Pages;
   - subdomena (np. `marma.<domena>`): rekord CNAME na `wkoziej.github.io`.

   Aktualne adresy i instrukcja: dokumentacja GitHub „Managing a custom domain for your GitHub Pages site”
   (https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
   Usuń stare rekordy wskazujące `<IP dropletu>`.

Gotowe: `dig +short <domena>` zwraca adresy GitHub Pages (lub CNAME `wkoziej.github.io`).
Settings → Pages pokazuje „DNS check successful”.

### 9. Zweryfikuj HTTPS

Wydanie certyfikatu może trwać do kilku godzin. W tym czasie droplet działa. Nie wyłączaj go.

1. Settings → Pages: poczekaj na certyfikat. Włącz „Enforce HTTPS”.
2. Sprawdź:

   ```bash
   curl -sSI https://<domena>/ | head -1
   curl -sSI http://<domena>/ | grep -i '^location'
   ```

Gotowe: HTTPS zwraca 200 z poprawnym certyfikatem. HTTP przekierowuje na HTTPS.
Strona i model 3D wczytują się z `https://<domena>/`.

### 10. Zaktualizuj adresy w Supabase, Google i funkcji `search`

1. Supabase → Authentication → URL Configuration:
   - Site URL: `https://<domena>/`;
   - Redirect URLs: zostaw tylko `https://<domena>/**`. Usuń `https://wkoziej.github.io/marmaapps-static/**`
     i `http://localhost:5173/**`.
2. Sekret `ALLOWED_ORIGINS` (tylko domena, bez ścieżki i bez końcowego `/`):

   ```bash
   npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" ALLOWED_ORIGINS="https://<domena>"
   ```

3. Google Cloud → Credentials → klient OAuth → Authorized JavaScript origins: usuń `https://wkoziej.github.io`.
4. Powtórz test dymny (`docs/supabase-setup.md`) z `SITE_ORIGIN=https://<domena>` i test regresji
   z `E2E_BASE_URL=https://<domena>/`.

Gotowe: logowanie linkiem e-mail i przez Google wraca na `https://<domena>/`. Preflight z
`https://wkoziej.github.io` nie dostaje nagłówka `Access-Control-Allow-Origin`. Testy zielone.

### 11. Poinformuj użytkowników

Wyślij wiadomość każdej osobie z listy (BCC albo osobno, nigdy w jawnym polu „Do” dla wielu osób).
Szablon:

> Temat: Marma: nowy sposób logowania
>
> Cześć,
>
> aplikacja Marma działa pod tym samym adresem: https://<domena>/.
> Zmienił się sposób logowania. Nie ma już hasła.
>
> 1. Otwórz stronę i wpisz swój adres e-mail (ten sam co dotąd) albo wybierz „Zaloguj przez Google”.
> 2. Przy logowaniu e-mailem dostaniesz wiadomość z linkiem. Otwórz link w tej samej przeglądarce,
>    w której prosisz o link. W innej przeglądarce link nie zadziała.
> 3. Jeżeli wiadomość nie przyszła, sprawdź folder spam.
>
> Dostęp jest bezpłatny. Jeżeli coś nie działa, odpowiedz na tę wiadomość.

Gotowe: wiadomość wysłana. W rejestrze zapisz tylko liczbę adresatów.

---

## Faza 3. Okres próbny (2 tygodnie)

### 12. Anuluj subskrypcje Stripe (przed wyłączeniem dropletu)

1. Panel Stripe → Billing → Subscriptions → filtr „Active” (oraz „Trialing”, „Past due”).
2. Zapisz liczbę aktywnych subskrypcji.
3. Właściciel decyduje o zwrotach (pełny, proporcjonalny, brak). Decyzję zapisz w rejestrze bez danych klientów.
4. Anuluj każdą subskrypcję natychmiast, z decyzją o zwrocie.

Gotowe: filtr „Active” jest pusty. Żadna nowa płatność nie jest zaplanowana.

### 13. Wyłącz droplet i zrób snapshot

1. Panel DigitalOcean → Droplet → Power → Turn off.
2. Snapshots → Take snapshot (droplet wyłączony daje spójny snapshot).
3. Nie usuwaj dropletu.

Gotowe: droplet ma stan „Off”. Snapshot ma stan „Available”. Strona `https://<domena>/` działa dalej.

### 14. Obserwuj przez 2 tygodnie

- Sprawdzaj zgłoszenia użytkowników, logi funkcji `search` (Supabase → Edge Functions → Logs)
  i limity (Supabase, Resend, OpenAI).
- Sprawdź, że keep-alive działa w harmonogramie (Actions → „Keep-alive Supabase”).

Gotowe: 14 dni bez zgłoszeń blokujących. Użytkownicy logują się bez pomocy właściciela.
Zgłoszenie blokujące, którego nie da się szybko poprawić: wykonaj plan wycofania.

---

## Plan wycofania (tylko w okresie próbnym)

Warunek: droplet i snapshot istnieją, stary klucz OpenAI jest jeszcze ważny.

1. DigitalOcean → Droplet → Power → Turn on. Na droplecie sprawdź `docker ps`: kontenery
   aplikacji (`djangoapp`), Qdrant, RethinkDB i nginx działają.
2. U dostawcy DNS przywróć rekordy zapisane w kroku 1 (wskazanie na `<IP dropletu>`).
3. Repozytorium → Settings → Pages → Custom domain: usuń `<domena>` (inaczej GitHub dalej zgłasza się
   jako właściciel domeny).
4. Sprawdź `curl -sSI https://<domena>/` (odpowiedź starej aplikacji). Poczekaj na propagację (TTL 300 s).
5. Poinformuj użytkowników: logowanie jak przed migracją.
6. Supabase zostaje bez zmian. Po poprawce powtórz kroki od 8.

Uwaga: subskrypcje Stripe są już anulowane. Wycofanie ich nie przywraca.

---

## Faza 4. Sprzątanie (po okresie próbnym)

### 15. Zamknij Stripe

1. Panel Stripe → Product catalog: zarchiwizuj produkt i ceny.
2. Developers → Webhooks: usuń endpointy starej aplikacji.
3. Customers: usuń klientów lub zanonimizuj ich dane.
   Przed usunięciem skonsultuj z księgowością obowiązek przechowywania dokumentów płatności
   (Stripe zachowuje część danych transakcji niezależnie od usunięcia klienta).
4. Developers → API keys: unieważnij (Roll / Delete) klucze secret i restricted używane przez starą aplikację.

Gotowe: brak aktywnych produktów, webhooków i kluczy starej aplikacji. Liczba klientów w panelu zgodna
z decyzją (0 lub tylko zanonimizowani).

### 16. Unieważnij stary klucz OpenAI

Panel OpenAI → API keys: usuń klucz używany na droplecie (zawsze, bo był zapisany na serwerze).
Klucz projektu dla funkcji `search` zostaje.

Gotowe: stary klucz ma stan „Revoked” lub nie istnieje. Wyszukiwanie semantyczne na `https://<domena>/` działa.

### 17. Usuń droplet i zasoby DigitalOcean oraz rejestr kontenerów

1. DigitalOcean: usuń droplet, wszystkie jego snapshoty, wolumeny (Volumes), kopie zapasowe (Backups),
   rezerwowe IP i wpisy DNS w panelu DigitalOcean (jeżeli istnieją).
2. GitHub → Packages starego repozytorium: usuń pakiet `ghcr.io/wkoziej/marmaapps/djangoapp`
   (wszystkie wersje).
3. Usuń sekrety starego repozytorium związane z wdrożeniem (klucz SSH, adres dropletu).

Gotowe: panel DigitalOcean nie pokazuje zasobów projektu. Prognoza rachunku DigitalOcean wynosi 0 zł.
Lista pakietów GitHub nie zawiera obrazu `djangoapp`.

### 18. Usuń lub zaszyfruj `data-export/`

Tłumaczenia PL tematów (tekst z Qdrant) są tylko w eksporcie (`data-export/qdrant_points.jsonl`).
Po usunięciu dropletu nie ma innej kopii. Przed usunięciem zachowaj zaszyfrowaną kopię:

```bash
tar -cf - data-export | gpg --symmetric --cipher-algo AES256 -o ~/marma-data-export.tar.gpg
gpg --decrypt ~/marma-data-export.tar.gpg | tar -tf - | head   # test odczytu kopii
rm -rf data-export
```

Hasło do kopii zapisz w `pass`. Usuń też `pointsdb-only.sqlite3` (wariant B) i kopię na droplecie (wariant A),
jeżeli jeszcze istnieją.

Gotowe: zaszyfrowana kopia otwiera się. `data-export/` nie istnieje w żadnym katalogu roboczym.

### 19. Zarchiwizuj stare repozytorium

GitHub → `wkoziej/marmaapps` → Settings: sprawdź, że widoczność to „Private”. Danger Zone → Archive this repository.

Gotowe: repozytorium ma oznaczenie „Archived” i jest prywatne.

---

## Rejestr wykonania

Bez danych osobowych, sekretów i adresów IP. Tylko daty, wyniki i liczby.

| Data | Krok | Wynik (OK / błąd / pominięty) | Liczby i uwagi |
| --- | --- | --- | --- |
| | 1. TTL DNS | | TTL: |
| | 2. Obraz na droplecie | | tag: |
| | 3. Eksport | | |
| | 4. Import i `verify_counts` | | punkty / współrzędne / funkcje / tematy / powiązania / wektory: |
| | 5. Hasło bazy | | |
| | 6. Adresy e-mail | | kont na droplecie: · wierszy w `allowed_emails`: |
| | 7. Test regresji i dymny | | testów zielonych / wszystkich: |
| | 8. DNS na GitHub Pages | | |
| | 9. HTTPS | | czas do wydania certyfikatu: |
| | 10. Site URL, Redirect URLs, `ALLOWED_ORIGINS` | | |
| | 11. Informacja do użytkowników | | adresatów: |
| | 12. Stripe: subskrypcje | | aktywnych: · decyzja o zwrotach: |
| | 13. Wyłączenie dropletu, snapshot | | |
| | 14. Okres próbny | | zgłoszeń: |
| | 15. Stripe: produkt, klienci, klucze | | klientów usuniętych / zanonimizowanych: |
| | 16. Klucz OpenAI | | |
| | 17. DigitalOcean i ghcr | | |
| | 18. `data-export/` | | |
| | 19. Archiwizacja starego repozytorium | | |

---

## Kryteria sukcesu

- [ ] Droplet DigitalOcean jest usunięty. Rachunek DigitalOcean wynosi 0 zł (płatna zostaje tylko domena).
- [ ] Domena działa przez HTTPS na GitHub Pages.
- [ ] Obecni użytkownicy logują się swoim dotychczasowym adresem e-mail bez pomocy właściciela.
- [ ] Wyniki wyszukiwania dla zestawu testowego (PL i EN) są takie same lub porównywalne ze starą aplikacją
      (test regresji zielony).
- [ ] Interfejs jest tylko po polsku.
- [ ] Stare repozytorium jest zarchiwizowane i prywatne.

---

## Otwarte kwestie

- **Subdomena czy ścieżka na domenie właściciela** (do decyzji właściciela).
  - Subdomena (np. `marma.<domena>`): rekord CNAME na `wkoziej.github.io`, `BASE_PATH=/`. Najprostsza opcja.
  - Domena główna: rekordy A/AAAA GitHub Pages, `BASE_PATH=/`. Inne usługi na domenie głównej przestają działać.
  - Ścieżka (np. `<domena>/marma/`): GitHub Pages nie obsłuży jej sama. Wymaga proxy na serwerze domeny
    i `BASE_PATH=/marma/`. Wtedy kroki 8–10 trzeba przepisać.
- **Nazwa domeny**: w tym dokumencie placeholder `<domena>`. Wpisz prawdziwą nazwę tylko w panelach,
  nie w repozytorium (do decyzji, czy nazwa domeny może być publiczna w repozytorium).
- Ścieżka bazy SQLite na droplecie (`<ścieżka>`) i dostępność `sqlite3`: do sprawdzenia w kroku 6.
- Obowiązek przechowywania danych płatności Stripe: do weryfikacji z księgowością przed krokiem 15.
