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

1. Przygotuj terminal. Sesja nie może być logowana:
   - nie uruchamiaj `script` ani `tmux pipe-pane`; wyłącz logowanie sesji w emulatorze terminala;
   - nie używaj `tmux` ani `screen` (zachowują bufor przewijania) i nie przeglądaj wyniku w `less`;
   - otwórz nowe okno terminala tylko na ten krok.
2. Połącz się z dropletem przez SSH (sesja interaktywna). Wyłącz zapis historii powłoki w tej sesji:

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
   Nie kopiuj wielu adresów naraz do schowka. W schowku najwyżej jeden adres naraz.
6. Zamknij sesję SSH. Wyczyść ekran i bufor przewijania: `printf '\033c'` oraz „Clear scrollback”
   w menu emulatora. Możesz też zamknąć okno terminala.
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

### 8. Dodaj adres domeny w Supabase, Google i funkcji `search` (przed zmianą DNS)

Zmiany są addytywne. Nie usuwaj jeszcze adresu tymczasowego ani `localhost`. Site URL zostaje bez zmian.
Dzięki temu logowanie działa na obu adresach w czasie przełączenia.

1. Supabase → Authentication → URL Configuration → Redirect URLs: dodaj `https://<domena>/**`.
2. Sekret `ALLOWED_ORIGINS`: dopisz domenę do obecnej wartości. Lista po przecinku, każdy origin
   bez ścieżki i bez końcowego `/`. Funkcja `search` obsługuje listę.

   ```bash
   npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
     ALLOWED_ORIGINS="https://wkoziej.github.io,https://<domena>"
   ```

3. Google Cloud → Credentials → klient OAuth → Authorized JavaScript origins: dodaj `https://<domena>`.
   Zostaw `https://wkoziej.github.io`.

Gotowe: Redirect URLs zawierają adres tymczasowy i `https://<domena>/**`. Preflight z
`https://wkoziej.github.io` nadal dostaje nagłówek `Access-Control-Allow-Origin`. Test dymny
z `SITE_ORIGIN=https://wkoziej.github.io` przechodzi.

### 9. Przełącz domenę na GitHub Pages

Wybierz okno małego ruchu. Uprzedź użytkowników o krótkiej przerwie (bez listy adresów w jawnym polu „Do”).

Skutek dla adresu tymczasowego: po zapisaniu Custom domain GitHub przekierowuje
`https://wkoziej.github.io/marmaapps-static/` na `https://<domena>/`. Przed zmianą DNS przekierowanie
trafia na starą aplikację na droplecie. Po zmianie `BASE_PATH` na `/` strona pod
`/marmaapps-static/` nie wczyta zasobów. Adres tymczasowy przestaje więc działać. Dlatego wykonaj
podkroki 3–6 jeden po drugim, bez przerwy.

1. GitHub → Settings (konta) → Pages → Verified domains: dodaj `<domena>` i rekord TXT u dostawcy DNS.
   Weryfikacja chroni domenę przed przejęciem.
2. Dodaj plik `public/CNAME` z jedną linią `<domena>` (bez `https://` i bez ścieżki). Vite kopiuje go do `dist/`.
   Uwaga: przy wdrożeniu przez GitHub Actions GitHub ignoruje plik `CNAME`. Decyduje ustawienie z podkroku 4.
3. Repozytorium → Settings → Secrets and variables → Actions → Variables: ustaw `BASE_PATH` na `/`.
4. Repozytorium → Settings → Pages → Custom domain: wpisz `<domena>` i zapisz.
5. Uruchom workflow „Wdrożenie strony (GitHub Pages)” (push do `main` lub Run workflow).
   Poczekaj na zielony wynik. Strona musi być zbudowana z `BASE_PATH=/` przed zmianą DNS.
6. U dostawcy DNS zmień rekordy `<domena>`:
   - domena główna (apex): rekordy A i AAAA na adresy GitHub Pages;
   - subdomena (np. `marma.<domena>`): rekord CNAME na `wkoziej.github.io`.

   Aktualne adresy i instrukcja: dokumentacja GitHub „Managing a custom domain for your GitHub Pages site”
   (https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
   Usuń stare rekordy wskazujące `<IP dropletu>`.

Gotowe: `dig +short <domena>` zwraca adresy GitHub Pages (lub CNAME `wkoziej.github.io`).
Settings → Pages pokazuje „DNS check successful”.

### 10. Zweryfikuj HTTPS

Po zmianie DNS ruch trafia na GitHub Pages, nie na droplet. Wydanie certyfikatu może trwać do kilku godzin.
Do tego czasu przeglądarki mogą pokazywać ostrzeżenie o certyfikacie. Droplet jest wtedy tylko ścieżką
wycofania. Nie wyłączaj go.

1. Settings → Pages: poczekaj na certyfikat.
2. Przed włączeniem „Enforce HTTPS” sprawdź, czy droplet ma ważny certyfikat (potrzebny w planie wycofania).
   Datę ważności zapisz w rejestrze:

   ```bash
   echo | openssl s_client -connect <IP dropletu>:443 -servername <domena> 2>/dev/null \
     | openssl x509 -noout -enddate
   ```

3. Włącz „Enforce HTTPS”.
4. Sprawdź:

   ```bash
   curl -sSI https://<domena>/ | head -1
   curl -sSI http://<domena>/ | grep -i '^location'
   curl -sSI https://<domena>/ | grep -i '^strict-transport-security'
   ```

   Nagłówek `Strict-Transport-Security` (HSTS) oznacza, że przeglądarki przez czas `max-age` łączą się
   z `<domena>` tylko przez HTTPS. Zapisz w rejestrze, czy nagłówek jest i jaki ma `max-age`.
   Po wycofaniu droplet musi wtedy mieć ważny certyfikat. Bez niego przeglądarka nie pozwoli
   ominąć ostrzeżenia.

Gotowe: HTTPS zwraca 200 z poprawnym certyfikatem. HTTP przekierowuje na HTTPS.
Strona i model 3D wczytują się z `https://<domena>/`.

### 11. Uporządkuj adresy w Supabase, Google i funkcji `search`

Wykonaj dopiero po kroku 10 (HTTPS działa).

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

### 12. Poinformuj użytkowników

Wyślij wiadomość każdej osobie z listy (BCC albo osobno, nigdy w jawnym polu „Do” dla wielu osób).

Wyjątek od zasady „adresy tylko na ekranie”: wysłana wiadomość zachowuje adresy. Po wysyłce usuń ją
z folderu „Wysłane” (i z kosza) oraz usuń wpisy autouzupełniania adresów w programie pocztowym.
Alternatywa: wyślij ogłoszenie bez listy adresów (np. kanałem, którego używają wszyscy użytkownicy).

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

Gotowe: wiadomość wysłana. Folder „Wysłane” i autouzupełnianie nie zawierają adresów z listy.
W rejestrze zapisz tylko liczbę adresatów.

---

## Faza 3. Okres próbny (2 tygodnie)

### 13. Anuluj subskrypcje Stripe (przed wyłączeniem dropletu)

Anulowanie jest nieodwracalne. Plan wycofania nie przywraca rozliczeń. Po wycofaniu klient musi
kupić subskrypcję od nowa.

1. Panel Stripe → Billing → Subscriptions → filtr „Active” (oraz „Trialing”, „Past due”).
2. Zapisz liczbę aktywnych subskrypcji. Liczba 0: pomiń podkroki 3–4.
3. Właściciel decyduje o zwrotach (pełny, proporcjonalny, brak). Decyzję zapisz w rejestrze bez danych klientów.
4. Anuluj każdą subskrypcję natychmiast, z decyzją o zwrocie.

Gotowe: filtr „Active” jest pusty. Żadna nowa płatność nie jest zaplanowana.

### 14. Wyłącz droplet i zrób snapshot

1. Panel DigitalOcean → Droplet → Power → Turn off.
2. Snapshots → Take snapshot (droplet wyłączony daje spójny snapshot).
3. Nie usuwaj dropletu.

Gotowe: droplet ma stan „Off”. Snapshot ma stan „Available”. Strona `https://<domena>/` działa dalej.

### 15. Obserwuj przez 2 tygodnie

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
2. Sprawdź datę ważności certyfikatu TLS dropletu (polecenie `openssl` z kroku 10).
   Let's Encrypt odnawia certyfikat tylko na działającym serwerze. Wyłączony droplet go nie odnowił.
3. U dostawcy DNS przywróć rekordy zapisane w kroku 1 (wskazanie na `<IP dropletu>`).
4. Repozytorium → Settings → Pages → Custom domain: usuń `<domena>` (inaczej GitHub dalej zgłasza się
   jako właściciel domeny).
5. Certyfikat wygasł lub wygasa w ciągu kilku dni: po propagacji DNS odnów go ręcznie na droplecie
   (np. `certbot renew`; sposób odnawiania do sprawdzenia w `docker-compose` na droplecie).
   Walidacja Let's Encrypt wymaga, żeby `<domena>` wskazywała droplet.
6. Sprawdź `curl -sSI https://<domena>/` (odpowiedź starej aplikacji, bez błędu certyfikatu).
   Poczekaj na propagację (TTL 300 s). HSTS (krok 10) wymusza HTTPS w przeglądarkach użytkowników.
   Bez ważnego certyfikatu na droplecie użytkownicy nie otworzą strony.
7. Przywróć ustawienia zmienione w krokach 8 i 11, jeżeli chcesz dalej testować nową stronę
   na adresie tymczasowym:
   - Supabase → URL Configuration: Site URL i Redirect URLs na adres tymczasowy (oraz `localhost`);
   - `ALLOWED_ORIGINS="https://wkoziej.github.io"`;
   - Google → Authorized JavaScript origins: `https://wkoziej.github.io`;
   - zmienna `BASE_PATH` na `/marmaapps-static/` i ponowne wdrożenie strony.
8. Poinformuj użytkowników: logowanie jak przed migracją.
9. Po poprawce powtórz kroki od 8.

Uwaga: subskrypcje Stripe są już anulowane. Wycofanie ich nie przywraca.

---

## Faza 4. Sprzątanie (po okresie próbnym)

### 16. Usuń konto testowe z listy dostępu

Panel Supabase → Table Editor → `private.allowed_emails`: usuń konto testu regresji (E2E).
Przed kolejnym testem regresji dodaj je ponownie, a po teście usuń.

Gotowe: `select count(*) from private.allowed_emails;` = liczba kont użytkowników (bez kont testowych).

### 17. Zamknij Stripe

1. Panel Stripe → Product catalog: zarchiwizuj produkt i ceny.
2. Developers → Webhooks: usuń endpointy starej aplikacji.
3. Customers: usuń klientów lub zanonimizuj ich dane.
   Przed usunięciem skonsultuj z księgowością obowiązek przechowywania dokumentów płatności
   (Stripe zachowuje część danych transakcji niezależnie od usunięcia klienta).
4. Developers → API keys: unieważnij (Roll / Delete) klucze secret i restricted używane przez starą aplikację.

Gotowe: brak aktywnych produktów, webhooków i kluczy starej aplikacji. Liczba klientów w panelu zgodna
z decyzją (0 lub tylko zanonimizowani).

### 18. Unieważnij stary klucz OpenAI

Panel OpenAI → API keys: usuń klucz używany na droplecie (zawsze, bo był zapisany na serwerze).
Klucz projektu dla funkcji `search` zostaje.

Gotowe: stary klucz ma stan „Revoked” lub nie istnieje. Wyszukiwanie semantyczne na `https://<domena>/` działa.

### 19. Spisz i unieważnij pozostałe sekrety dropletu

Snapshot i kopie zapasowe zawierają sekrety. Każdy sekret z dropletu traktuj jako ujawniony.

1. Włącz droplet na czas spisu (DNS wskazuje GitHub Pages, ruch nie trafia na droplet).
2. Spisz tylko nazwy zmiennych, bez wartości, z plików `.env` i `docker-compose` na droplecie:

   ```bash
   grep -ho '^[A-Za-z_][A-Za-z0-9_]*=' .env* | cut -d= -f1 | sort -u
   grep -n 'environment\|env_file\|secrets' docker-compose*.yml
   ```

   Sprawdź co najmniej: Django `SECRET_KEY`, hasła RethinkDB i Qdrant, tokeny ghcr i tokeny wdrożenia,
   klucze SMTP i OAuth starej aplikacji, klucze SSH (`~/.ssh/` na droplecie, `authorized_keys`).
3. Wyłącz droplet.
4. Unieważnij każdy sekret u jego wystawcy (np. token ghcr w GitHub → Settings → Developer settings,
   klient OAuth starej aplikacji w Google Cloud, klucz SMTP u dostawcy poczty). Sekrety używane tylko
   na droplecie (`SECRET_KEY`, hasła baz) przestają obowiązywać po usunięciu dropletu i jego kopii (krok 20).
5. Na laptopie usuń klucz SSH dropletu z agenta i wpis hosta ze znanych hostów:

   ```bash
   ssh-add -d <ścieżka klucza dropletu>
   ssh-keygen -R <IP dropletu>
   ssh-keygen -R <domena>
   ```

   Klucz używany tylko do dropletu usuń też z `~/.ssh/` i z panelu DigitalOcean (Settings → Security).

Gotowe: każda pozycja ze spisu ma stan „unieważniony” albo „wygasa z dropletem”. W rejestrze zapisz
tylko liczbę pozycji.

### 20. Usuń droplet i zasoby DigitalOcean oraz rejestr kontenerów

1. DigitalOcean: usuń droplet, wszystkie jego snapshoty, wolumeny (Volumes), kopie zapasowe (Backups),
   rezerwowe IP i wpisy DNS w panelu DigitalOcean (jeżeli istnieją).
2. GitHub → Packages starego repozytorium: usuń pakiet `ghcr.io/wkoziej/marmaapps/djangoapp`
   (wszystkie wersje).
3. Usuń sekrety starego repozytorium związane z wdrożeniem (klucz SSH, adres dropletu).
4. Sprawdź po usunięciu (panel lub API):

   ```bash
   doctl compute snapshot list
   doctl compute volume list
   gh api /user/packages?package_type=container --jq '.[].name'
   ```

Gotowe: panel DigitalOcean nie pokazuje zasobów projektu. Listy snapshotów i wolumenów są puste.
Prognoza rachunku DigitalOcean wynosi 0 zł. Lista pakietów GitHub nie zawiera obrazu `djangoapp`.

### 21. Zaszyfruj i usuń `data-export/`

Tłumaczenia PL tematów (tekst z Qdrant) są tylko w eksporcie (`data-export/qdrant_points.jsonl`).
Po usunięciu dropletu nie ma innej kopii. Przed usunięciem zachowaj zaszyfrowaną kopię:

```bash
tar -cf - data-export | gpg --symmetric --cipher-algo AES256 -o ~/marma-data-export.tar.gpg
gpg --decrypt ~/marma-data-export.tar.gpg | tar -tf - | head   # test odczytu kopii
rm -rf data-export
```

1. Hasło do kopii zapisz w `pass`.
2. Drugą kopię pliku `.tar.gpg` przechowuj poza laptopem (np. zaszyfrowany dysk zewnętrzny).
   Ustal termin retencji (do decyzji właściciela) i zapisz go w rejestrze. Po terminie usuń obie kopie.
3. Usuń też `pointsdb-only.sqlite3` (wariant B) i kopię na droplecie (wariant A), jeżeli jeszcze istnieją.

Uwaga: `rm -rf` na dysku SSD, w kopii zapasowej laptopa lub w koszu nie usuwa danych bezpiecznie.
Ślady jawnych danych mogą zostać na dysku. Dlatego trwałą kopię trzymaj tylko zaszyfrowaną.
Najlepiej trzymaj `data-export/` od początku na zaszyfrowanym dysku.

Gotowe: obie zaszyfrowane kopie otwierają się. `data-export/` nie istnieje w żadnym katalogu roboczym.

### 22. Zarchiwizuj lub usuń stare repozytorium

Historia starego repozytorium zawiera dane kont.

1. GitHub → `wkoziej/marmaapps` → Settings: sprawdź, że widoczność to „Private”.
   Repozytorium publiczne: najpierw zmień na „Private”.
2. Właściciel decyduje: archiwizacja (Danger Zone → Archive this repository) albo usunięcie
   (Danger Zone → Delete this repository). Usunięcie nie zostawia historii z danymi kont.

Gotowe: repozytorium ma oznaczenie „Archived” i jest prywatne albo nie istnieje.

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
| | 8. Domena dodana (Redirect URLs, `ALLOWED_ORIGINS`, Google) | | |
| | 9. DNS na GitHub Pages | | |
| | 10. HTTPS | | czas do wydania certyfikatu: · certyfikat dropletu ważny do: · HSTS `max-age`: |
| | 11. Site URL, usunięcie adresu tymczasowego i `localhost` | | |
| | 12. Informacja do użytkowników | | adresatów: |
| | 13. Stripe: subskrypcje | | aktywnych: · decyzja o zwrotach: |
| | 14. Wyłączenie dropletu, snapshot | | |
| | 15. Okres próbny | | zgłoszeń: |
| | 16. Konto testowe usunięte | | wierszy w `allowed_emails`: |
| | 17. Stripe: produkt, klienci, klucze | | klientów usuniętych / zanonimizowanych: |
| | 18. Klucz OpenAI | | |
| | 19. Sekrety dropletu | | pozycji w spisie / unieważnionych: |
| | 20. DigitalOcean i ghcr | | |
| | 21. `data-export/` | | termin retencji kopii: |
| | 22. Stare repozytorium | | decyzja (archiwizacja / usunięcie): |

---

## Kryteria sukcesu

- [ ] Droplet DigitalOcean jest usunięty. Rachunek DigitalOcean wynosi 0 zł (płatna zostaje tylko domena).
- [ ] Domena działa przez HTTPS na GitHub Pages.
- [ ] Obecni użytkownicy logują się swoim dotychczasowym adresem e-mail bez pomocy właściciela.
- [ ] Wyniki wyszukiwania dla zestawu testowego (PL i EN) są takie same lub porównywalne ze starą aplikacją
      (test regresji zielony).
- [ ] Interfejs jest tylko po polsku.
- [ ] Stare repozytorium jest prywatne i zarchiwizowane albo usunięte.
- [ ] Sekrety z dropletu są unieważnione.

---

## Otwarte kwestie

- **Subdomena czy ścieżka na domenie właściciela** (do decyzji właściciela).
  - Subdomena (np. `marma.<domena>`): rekord CNAME na `wkoziej.github.io`, `BASE_PATH=/`. Najprostsza opcja.
  - Domena główna: rekordy A/AAAA GitHub Pages, `BASE_PATH=/`. Inne usługi na domenie głównej przestają działać.
  - Ścieżka (np. `<domena>/marma/`): GitHub Pages nie obsłuży jej sama. Wymaga proxy na serwerze domeny
    i `BASE_PATH=/marma/`. Wtedy kroki 8–11 trzeba przepisać.
- **Nazwa domeny**: w tym dokumencie placeholder `<domena>`. Wpisz prawdziwą nazwę tylko w panelach,
  nie w repozytorium (do decyzji, czy nazwa domeny może być publiczna w repozytorium).
- Ścieżka bazy SQLite na droplecie (`<ścieżka>`) i dostępność `sqlite3`: do sprawdzenia w kroku 6.
- Sposób odnawiania certyfikatu TLS na droplecie (certbot na hoście czy w kontenerze): do sprawdzenia
  przed krokiem 14.
- Obowiązek przechowywania danych płatności Stripe: do weryfikacji z księgowością przed krokiem 17.
- Termin retencji zaszyfrowanych kopii `data-export`: do decyzji właściciela w kroku 21.
