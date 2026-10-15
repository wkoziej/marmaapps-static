// Testy ustawień E2E (Vitest, bez przeglądarki). Tylko adresy @example.com.
import { describe, it, expect } from 'vitest';
import { e2eSettings, normalizeBaseUrl, DEFAULT_SESSION_PATH } from './settings.js';

describe('normalizeBaseUrl', () => {
  it('dodaje ukośnik na końcu', () => {
    expect(normalizeBaseUrl('http://localhost:5173')).toBe('http://localhost:5173/');
    expect(normalizeBaseUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
    expect(normalizeBaseUrl(undefined)).toBeUndefined();
  });
});

describe('e2eSettings', () => {
  it('wariant A: zapisana sesja', () => {
    expect(e2eSettings({ E2E_BASE_URL: 'http://x', E2E_STORAGE_STATE: 's.json' }))
      .toEqual({ baseUrl: 'http://x/', storageState: 's.json' });
  });

  it('wariant B: Mailpit wymaga tylko adresu Mailpit i e-maila (prośba o link z formularza strony)', () => {
    expect(e2eSettings({
      E2E_BASE_URL: 'http://localhost:5173',
      E2E_MAILPIT_URL: 'http://127.0.0.1:54324/',
      E2E_EMAIL: 'e2e@example.com',
    })).toEqual({
      baseUrl: 'http://localhost:5173/',
      storageState: DEFAULT_SESSION_PATH,
      mailpit: { url: 'http://127.0.0.1:54324', email: 'e2e@example.com' },
    });
  });

  it('bez sesji i bez Mailpit: brak storageState', () => {
    expect(e2eSettings({ E2E_BASE_URL: 'http://x', E2E_EMAIL: 'e2e@example.com' }))
      .toEqual({ baseUrl: 'http://x/' });
  });
});
