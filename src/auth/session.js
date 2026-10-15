/**
 * Punkt integracji sesji dla U7 (logowanie bez haseł, Supabase Auth).
 *
 * U6 nie implementuje logowania. Funkcje poniżej to haki o docelowym kształcie:
 * U7 zastępuje ich treść wywołaniami klienta Supabase (np. `supabase.auth.getSession()`,
 * `supabase.auth.signOut()`) i przekierowaniem do strony logowania.
 * Strony i `ApiService` używają tylko tych funkcji, więc U7 nie zmienia ich kodu.
 */

/**
 * Token dostępu bieżącej sesji (JWT) do nagłówka `Authorization: Bearer`.
 * @returns {Promise<string|null>} Token lub `null`, gdy brak sesji.
 */
export async function getAccessToken() {
    // U7: return (await supabase.auth.getSession()).data.session?.access_token ?? null;
    return null;
}

/**
 * Reakcja na błąd sesji (401 z funkcji `search` lub brak tokenu).
 * U7: przekierowanie do logowania z zapamiętaniem celu.
 */
export function onSessionExpired() {
    console.warn('Sesja wygasła lub brak sesji (logowanie: U7).');
}

/**
 * Wylogowanie (przycisk „Wyloguj” w nawigacji).
 * U7: `supabase.auth.signOut()` i przekierowanie do strony logowania.
 * @returns {Promise<void>}
 */
export async function signOut() {
    console.warn('Wylogowanie nie jest jeszcze dostępne (U7).');
}
