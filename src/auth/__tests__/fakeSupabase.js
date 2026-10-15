// Fałszywy klient Supabase Auth (tylko metody używane przez src/auth/) i fałszywy `location`.
import { vi } from 'vitest';

export const SESSION = Object.freeze({ access_token: 'jwt-testowy', user: { id: 'u1' } });

/**
 * @param {Object} [options]
 * @param {Object|null} [options.session] - Sesja zwracana przez getSession()
 * @param {Object|null} [options.otpError] - Błąd z signInWithOtp()
 * @param {Object|null} [options.oauthError] - Błąd z signInWithOAuth()
 */
export function createFakeAuth({ session = null, otpError = null, oauthError = null } = {}) {
    const listeners = [];
    return {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
        signInWithOtp: vi.fn(async () => ({ data: {}, error: otpError })),
        signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://accounts.example.com' }, error: oauthError })),
        signOut: vi.fn(async () => ({ error: null })),
        onAuthStateChange: vi.fn(callback => {
            listeners.push(callback);
            return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        /** Symuluje zdarzenie klienta Supabase (np. SIGNED_OUT po nieudanym odświeżeniu tokenu). */
        emit(event, newSession = null) {
            listeners.forEach(callback => callback(event, newSession));
        }
    };
}

/**
 * @param {string} href - Pełny adres strony
 */
export function createFakeLocation(href) {
    const url = new URL(href);
    return {
        origin: url.origin,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        href: url.href,
        replace: vi.fn()
    };
}

/** Błąd w kształcie AuthApiError z supabase-js. */
export function authApiError(status, code, message = 'błąd') {
    return { name: 'AuthApiError', status, code, message };
}

/** Błąd w kształcie AuthRetryableFetchError z supabase-js (brak połączenia: status 0). */
export function networkError() {
    return { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' };
}
