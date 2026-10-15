// Ustawienia testu regresji ze zmiennych środowiskowych (e2e/README.md).
// Bez wartości domyślnych dla adresów: test nie może przypadkowo trafić w inny projekt.

export const DEFAULT_SESSION_PATH = 'e2e/.auth/session.json';

/** Adres strony z ukośnikiem na końcu, aby `page.goto('points.html')` działało pod `base` Vite. */
export function normalizeBaseUrl(raw) {
  if (!raw) return undefined;
  return raw.endsWith('/') ? raw : `${raw}/`;
}

/**
 * @param {Record<string, string|undefined>} env
 * @returns {{baseUrl?: string, storageState?: string, mailpit?: {url: string, email: string, supabaseUrl: string, publishableKey: string}}}
 */
export function e2eSettings(env) {
  const baseUrl = normalizeBaseUrl(env.E2E_BASE_URL);
  if (env.E2E_STORAGE_STATE) {
    return { baseUrl, storageState: env.E2E_STORAGE_STATE };
  }
  const { E2E_MAILPIT_URL, E2E_EMAIL, E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY } = env;
  if (E2E_MAILPIT_URL && E2E_EMAIL && E2E_SUPABASE_URL && E2E_SUPABASE_PUBLISHABLE_KEY) {
    return {
      baseUrl,
      storageState: DEFAULT_SESSION_PATH,
      mailpit: {
        url: E2E_MAILPIT_URL.replace(/\/$/, ''),
        email: E2E_EMAIL,
        supabaseUrl: E2E_SUPABASE_URL.replace(/\/$/, ''),
        publishableKey: E2E_SUPABASE_PUBLISHABLE_KEY,
      },
    };
  }
  return { baseUrl };
}
