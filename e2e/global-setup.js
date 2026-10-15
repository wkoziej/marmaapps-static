// Przygotowanie sesji dla testu regresji (e2e/README.md).
//  - E2E_STORAGE_STATE: zapisana sesja (wygenerowana ręcznie) — nic do zrobienia.
//  - E2E_MAILPIT_URL + E2E_EMAIL (wariant B, lokalny stack): prośba o link przez formularz
//    login.html w przeglądarce Playwright, odczyt linku z Mailpit, otwarcie go w TYM SAMYM
//    kontekście przeglądarki, zapis sesji. Logowanie używa PKCE (U7): weryfikator kodu jest
//    w localStorage kontekstu, który wysłał prośbę, więc link działa tylko w tym kontekście.
// Do logu nie trafia adres e-mail, link ani token.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { AuthMessages } from '../src/constants/textConstants.js';
import { e2eSettings } from './settings.js';

const MAIL_TIMEOUT_MS = 30_000;
const FORM_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 30_000;
const VERIFY_LINK_RE = /https?:\/\/[^\s"'<>)\]]+\/auth\/v1\/verify\?[^\s"'<>)\]]+/;

// Selektory formularza logowania (src/auth/loginPage.js).
const LOGIN_EMAIL = '[data-testid="login-email"]';
const LOGIN_BUTTON = '[data-testid="login-email-button"]';
const LOGIN_MESSAGE = '[data-testid="login-message"]';

/** Wysyła prośbę o link przez formularz login.html (supabase-js zapisuje weryfikator PKCE). */
async function requestMagicLink(page, baseUrl, email) {
  await page.goto(new URL('login.html', baseUrl).href);
  // Przycisk jest aktywny dopiero po getSession() (src/auth/loginPage.js).
  await page.locator(LOGIN_BUTTON).waitFor({ state: 'visible', timeout: FORM_TIMEOUT_MS });
  await page.waitForFunction((selector) => !document.querySelector(selector)?.disabled, LOGIN_BUTTON,
    { timeout: FORM_TIMEOUT_MS });
  await page.locator(LOGIN_EMAIL).fill(email);
  await page.locator(LOGIN_BUTTON).click();
  const message = page.locator(LOGIN_MESSAGE);
  await page.waitForFunction(
    ({ selector, sending }) => {
      const text = document.querySelector(selector)?.textContent ?? '';
      return text !== '' && text !== sending;
    },
    { selector: LOGIN_MESSAGE, sending: AuthMessages.SENDING },
    { timeout: FORM_TIMEOUT_MS },
  );
  const text = await message.textContent();
  if (text !== AuthMessages.LINK_SENT) {
    // Komunikat interfejsu (bez adresu e-mail), np. brak adresu na liście dozwolonych.
    throw new Error(`Strona logowania odrzuciła prośbę o link: „${text}”. ` +
      'Sprawdź, czy E2E_EMAIL jest na liście dozwolonych adresów.');
  }
}

async function waitForVerifyLink({ url, email }, sentAfter) {
  const deadline = Date.now() + MAIL_TIMEOUT_MS;
  const query = encodeURIComponent(`to:"${email}"`);
  while (Date.now() < deadline) {
    const list = await (await fetch(`${url}/api/v1/search?query=${query}&limit=5`)).json();
    const fresh = (list.messages ?? []).find((m) => Date.parse(m.Created) >= sentAfter);
    if (fresh) {
      const message = await (await fetch(`${url}/api/v1/message/${fresh.ID}`)).json();
      const match = (message.Text ?? '').match(VERIFY_LINK_RE);
      if (match) return match[0];
      throw new Error('Wiadomość w Mailpit nie zawiera linku /auth/v1/verify.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Brak wiadomości z linkiem logowania w Mailpit po ${MAIL_TIMEOUT_MS / 1000} s.`);
}

export default async function globalSetup() {
  const settings = e2eSettings(process.env);
  if (!settings.baseUrl) {
    throw new Error('Brak E2E_BASE_URL (adres strony, np. tymczasowy adres GitHub Pages). Zob. e2e/README.md.');
  }
  if (!settings.storageState) {
    throw new Error('Brak sesji: ustaw E2E_STORAGE_STATE albo zmienne trybu Mailpit. Zob. e2e/README.md.');
  }
  if (!settings.mailpit) return;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: 'pl-PL' });
    const page = await context.newPage();
    const sentAfter = Date.now() - 1_000;
    await requestMagicLink(page, settings.baseUrl, settings.mailpit.email);
    const link = await waitForVerifyLink(settings.mailpit, sentAfter);
    // Ten sam kontekst: login.html wymienia `?code=` na sesję z weryfikatorem z localStorage.
    await page.goto(link);
    // supabase-js zapisuje sesję w localStorage pod kluczem sb-<ref>-auth-token
    // (weryfikator PKCE ma przyrostek -code-verifier i nie pasuje do wzorca).
    await page.waitForFunction(
      () => Object.keys(localStorage).some((key) => /^sb-.+-auth-token$/.test(key)),
      undefined,
      { timeout: SESSION_TIMEOUT_MS },
    ).catch(() => {
      throw new Error('Po otwarciu linku strona nie zapisała sesji Supabase. ' +
        'Sprawdź Redirect URLs (adres login.html pod E2E_BASE_URL) i komunikat na stronie logowania.');
    });
    await mkdir(dirname(settings.storageState), { recursive: true });
    await context.storageState({ path: settings.storageState });
  } finally {
    await browser.close();
  }
}
