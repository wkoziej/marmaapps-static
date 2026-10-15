// Test regresji wyszukiwania (AE4). Przeniesiony z djangoapp/cypress/e2e/search_marma_points.cy.js
// (stare repozytorium). Uruchamiany ręcznie na projekcie Supabase z prawdziwymi danymi: e2e/README.md.
//
// Zasada danych (CLAUDE.md): tutaj są tylko zapytania i oczekiwane NAZWY punktów.
// Żadnych fragmentów opisów (działań, wskazań, leczenia). Test nie wypisuje treści opisów.
// Porównanie: zbiór nazw z wyników zawiera oczekiwane nazwy; kolejność nie ma znaczenia.
import { test, expect } from './fixtures.js';

// Selektory strony points.html i SearchView (U6).
const SEARCH_INPUT = '[data-testid="search-input"]';
const RESULT_ITEM = '.search-results__item';
const SELECTED_ITEM = 'search-results__item--selected';
const DETAILS_CONTENT = '#point-details__content';
const DETAILS_SECTION = '.point-details__section';
const DETAILS_LINK = '.point-details__link';
// Nagłówki sekcji szczegółów (tekst interfejsu, src/constants/textConstants.js).
const SECTION_ACTIONS = 'Działania';
const SECTION_INDICATIONS = 'Wskazania';

const CASES = [
  { query: 'Tala', expected: ['Tala Hrida'] },
  { query: 'Pitta', expected: ['Tala Hrida'] },
  { query: 'Kurcha', expected: ['Kurcha Shira'] },
  { query: 'Trik', expected: ['Trik'] },
  // Cypress sprawdzał oba punkty w jednym scenariuszu.
  { query: 'ból karku', expected: ['Kaksha', 'Prushtha'] },
];

function isSearchResponse(response) {
  return response.url().includes('/functions/v1/search') && response.request().method() === 'GET';
}

/** Wpisuje frazę, czeka na odpowiedź funkcji `search` i zwraca nazwy wyświetlonych punktów. */
async function search(page, query) {
  const responsePromise = page.waitForResponse(isSearchResponse);
  await page.locator(SEARCH_INPUT).fill(query);
  await page.locator(SEARCH_INPUT).press('Enter');
  return readResults(page, await responsePromise);
}

async function readResults(page, response) {
  expect(response.status(), 'kod HTTP funkcji search').toBe(200);
  await expect(page.locator(RESULT_ITEM).first()).toBeVisible();
  return page.locator(RESULT_ITEM).allTextContents();
}

/** Nazwa z listy (np. „Kaksha” w „Kaksha, …”) jest dopasowywana jak `cy.contains`: jako fragment. */
function expectNames(names, expected) {
  for (const name of expected) {
    expect(names.some((n) => n.includes(name)), `wyniki zawierają „${name}”`).toBe(true);
  }
}

async function selectPoint(page, name) {
  const item = page.locator(RESULT_ITEM, { hasText: name }).first();
  await item.click();
  await expect(item).toHaveClass(new RegExp(SELECTED_ITEM));
  await expect(page.locator(DETAILS_CONTENT)).toBeVisible();
}

test.describe('Regresja wyszukiwania punktów marma', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('points.html');
    await expect(page.locator(SEARCH_INPUT), 'strona wyszukiwania (czy sesja jest ważna?)').toBeVisible();
  });

  for (const { query, expected } of CASES) {
    test(`„${query}” → ${expected.join(', ')}`, async ({ page }) => {
      const names = await search(page, query);
      expectNames(names, expected);
      // Jak w Cypress: kliknięcie punktu pokazuje szczegóły z sekcją „Działania”.
      await selectPoint(page, expected[0]);
      // Sprawdzenie nagłówka, nie całego tekstu: komunikat błędu nie wypisze opisu punktu.
      await expect(
        page.locator(DETAILS_CONTENT).getByRole('heading', { name: SECTION_ACTIONS, exact: true }),
      ).toBeVisible();
    });
  }

  test('kliknięcie linku wskazania w szczegółach daje nowe wyniki', async ({ page }) => {
    const names = await search(page, 'ból karku');
    expectNames(names, ['Prushtha']);
    await selectPoint(page, 'Prushtha');

    // Pierwszy link w sekcji „Wskazania”; treści linku nie wpisujemy i nie wypisujemy.
    const indications = page.locator(DETAILS_SECTION).filter({
      has: page.getByRole('heading', { name: SECTION_INDICATIONS, exact: true }),
    });
    const link = indications.locator(DETAILS_LINK).first();
    await expect(link, 'punkt ma co najmniej jedno wskazanie').toBeVisible();

    const responsePromise = page.waitForResponse(isSearchResponse);
    await link.click();
    const newNames = await readResults(page, await responsePromise);
    expect(newNames.length, 'liczba nowych wyników').toBeGreaterThan(0);
    // Wyszukiwanie wykonało się dla innej frazy (tekst wskazania) niż poprzednia.
    await expect(page.locator(SEARCH_INPUT)).not.toHaveValue('ból karku');
  });
});
