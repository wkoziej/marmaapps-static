# Test regresji wyszukiwania (Playwright)

`search-regression.spec.js` sprawdza, że nowe wyszukiwanie daje te same punkty co stara aplikacja
(przypadki z dawnego testu Cypress `search_marma_points.cy.js`). Wymaga prawdziwych danych, więc:

- uruchamiasz go **ręcznie**, na projekcie Supabase (nigdy w CI);
- repozytorium zawiera tylko zapytania i oczekiwane **nazwy** punktów, bez fragmentów opisów;
- zrzuty ekranu, nagrania i ślady są wyłączone (`playwright.config.js`), bo zawierałyby opisy;
- zrzut ARIA strony w `test-results/*/error-context.md` jest wyłączony (`PLAYWRIGHT_NO_COPY_PROMPT`
  w `playwright.config.js` i fixture `e2e/fixtures.js`); plik nadal zawiera komunikat błędu, więc
  po każdym uruchomieniu usuń raporty (niżej);
- katalogi `e2e/.auth/`, `test-results/`, `playwright-report/` są wykluczone z git.

Wyniki porównujemy jako zbiory nazw (wyniki **zawierają** oczekiwane nazwy), bez kolejności.

## Przygotowanie (raz)

```bash
npm ci
npx playwright install chromium
```

Potrzebne jest konto testowe: adres z listy dozwolonych (`private.allowed_emails`). Adres trzymaj
tylko w `pass` / env (`E2E_EMAIL`), nigdy w pliku repozytorium.

## Zmienne

| Zmienna | Znaczenie |
| --- | --- |
| `E2E_BASE_URL` | Adres strony, np. `https://wkoziej.github.io/marmaapps-static/` (wymagany). |
| `E2E_STORAGE_STATE` | Ścieżka do zapisanej sesji (wariant A). |
| `E2E_EMAIL` | Adres konta testowego (wariant B). |
| `E2E_MAILPIT_URL` | Adres Mailpit, np. `http://127.0.0.1:54324` (wariant B). |

## Wariant A: zapisana sesja (projekt w chmurze, e-mail przez Resend)

Link logowania przychodzi na prawdziwą skrzynkę, więc sesję zapisujesz ręcznie:

```bash
mkdir -p e2e/.auth
npx playwright open --save-storage=e2e/.auth/session.json "$E2E_BASE_URL"
```

1. W otwartej przeglądarce poproś o link logowania dla konta testowego.
2. Skopiuj link z e-maila i otwórz go **w tej samej przeglądarce** (pasek adresu okna Playwright).
3. Gdy widzisz aplikację, zamknij okno. Playwright zapisze sesję do pliku.

```bash
E2E_STORAGE_STATE=e2e/.auth/session.json npm run test:e2e
rm -rf test-results playwright-report
```

Plik sesji zawiera tokeny: nie kopiuj go nigdzie i usuń po teście (`rm -rf e2e/.auth`).
Supabase obraca refresh token, więc plik jest zwykle ważny dla jednego uruchomienia.
Przed kolejnym uruchomieniem zapisz sesję ponownie.

## Wariant B: Mailpit (lokalny stack Supabase)

Lokalny stack przechwytuje e-maile w Mailpit (`npx supabase status` pokazuje adres).
Logowanie używa PKCE (U7): weryfikator kodu jest w `localStorage` przeglądarki, która poprosiła
o link. Dlatego `e2e/global-setup.js` wysyła prośbę przez formularz `login.html` w przeglądarce
Playwright, odczytuje link z Mailpit, otwiera go **w tym samym kontekście** przeglądarki i zapisuje
sesję do `e2e/.auth/session.json`.

Strona musi używać lokalnego projektu: `.env.local` (wykluczony z git) z `VITE_SUPABASE_URL` i
`VITE_SUPABASE_PUBLISHABLE_KEY` z `npx supabase status -o env`, potem `npx vite`. Funkcja `search`:
`npx supabase functions serve` (zob. README.md). Konto testowe: adres `@example.com` dodany do
`private.allowed_emails` w lokalnej bazie.

```bash
E2E_BASE_URL=http://localhost:5173/ \
E2E_EMAIL=...@example.com E2E_MAILPIT_URL=http://127.0.0.1:54324 \
npm run test:e2e
rm -rf test-results playwright-report e2e/.auth
```

Test regresji ma sens tylko wtedy, gdy lokalna baza zawiera zaimportowane dane (U5). Adres
`E2E_BASE_URL` musi pasować do `additional_redirect_urls` lokalnego `supabase/config.toml`.

## Lista testów bez uruchamiania przeglądarki

```bash
npx playwright test --list
```
