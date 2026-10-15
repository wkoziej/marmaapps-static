// Wspólny `test` dla testów E2E: usuwa z błędów zrzut ARIA strony.
//
// Playwright 1.63 przy nieudanym `expect(locator)` (np. brak elementu) dołącza do błędu zrzut ARIA
// całej strony (`errorContext`) i zapisuje go w test-results/*/error-context.md. Na stronie z danymi
// zrzut zawiera opisy punktów (CLAUDE.md). Nie ma opcji konfiguracji, która to wyłącza, więc ta
// automatyczna fixture usuwa `errorContext` z błędów po zakończeniu testu, przed zapisem pliku.
// Zrzut ARIA wykonywany przy zamykaniu kontekstu wyłącza PLAYWRIGHT_NO_COPY_PROMPT (playwright.config.js).
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  stripErrorContext: [
    async ({}, use, testInfo) => {
      await use();
      for (const error of testInfo.errors) delete error.errorContext;
    },
    { auto: true },
  ],
});

export { expect };
