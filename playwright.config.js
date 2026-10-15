import { defineConfig, devices } from '@playwright/test';
import { e2eSettings } from './e2e/settings.js';

// Test regresji wyszukiwania (e2e/README.md). Uruchamiany ręcznie, nigdy w CI:
// działa na prawdziwych danych projektu Supabase.
// Zrzuty ekranu, nagrania i ślady są wyłączone: zawierałyby opisy punktów (zob. CLAUDE.md).
// Z tego samego powodu wyłączony jest zrzut ARIA strony w test-results/*/error-context.md
// (Playwright 1.63: brak opcji w konfiguracji, tylko zmienna środowiskowa; procesy robocze ją dziedziczą).
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
const settings = e2eSettings(process.env);

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: settings.baseUrl,
    storageState: settings.storageState,
    locale: 'pl-PL',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
