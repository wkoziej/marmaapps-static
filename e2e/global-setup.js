// Przygotowanie sesji dla testu regresji (e2e/README.md).
//  - E2E_STORAGE_STATE: zapisana sesja (wygenerowana ręcznie) — nic do zrobienia.
//  - E2E_MAILPIT_URL + E2E_EMAIL + E2E_SUPABASE_URL + E2E_SUPABASE_PUBLISHABLE_KEY: prośba o link
//    logowania przez API Auth, odczyt linku z Mailpit, otwarcie go w przeglądarce, zapis sesji.
// Do logu nie trafia adres e-mail, link ani token.
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';
import { e2eSettings } from './settings.js';

const MAIL_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 30_000;
const VERIFY_LINK_RE = /https?:\/\/[^\s"'<>)\]]+\/auth\/v1\/verify\?[^\s"'<>)\]]+/;

async function requestMagicLink({ supabaseUrl, publishableKey, email }, redirectTo) {
  const url = `${supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(`API Auth odrzuciło prośbę o link logowania (HTTP ${response.status}). ` +
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

  const sentAfter = Date.now() - 1_000;
  await requestMagicLink(settings.mailpit, settings.baseUrl);
  const link = await waitForVerifyLink(settings.mailpit, sentAfter);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: 'pl-PL' });
    const page = await context.newPage();
    await page.goto(link);
    // supabase-js zapisuje sesję w localStorage pod kluczem sb-<ref>-auth-token.
    await page.waitForFunction(
      () => Object.keys(localStorage).some((key) => /^sb-.+-auth-token$/.test(key)),
      undefined,
      { timeout: SESSION_TIMEOUT_MS },
    ).catch(() => {
      throw new Error('Po otwarciu linku strona nie zapisała sesji Supabase. ' +
        'Sprawdź Redirect URLs (E2E_BASE_URL) i obsługę powrotu z linku w stronie logowania (U7).');
    });
    await mkdir(dirname(settings.storageState), { recursive: true });
    await context.storageState({ path: settings.storageState });
  } finally {
    await browser.close();
  }
}
