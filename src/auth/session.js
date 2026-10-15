/**
 * Punkt integracji sesji (U6 → U7): `ApiService`, `SearchController` i nawigacja używają tylko tych funkcji.
 */
import { supabase } from './supabaseClient.js';
import { redirect, currentPathname } from './navigation.js';
import { currentPage, loginUrl } from './redirects.js';

const BASE_URL = import.meta.env.BASE_URL;

function redirectToLogin() {
    redirect(loginUrl(BASE_URL, currentPage(currentPathname(), BASE_URL)));
}

/**
 * Token dostępu bieżącej sesji (JWT) do nagłówka `Authorization: Bearer`.
 * `getSession()` odświeża wygasły token, jeśli to możliwe.
 * @returns {Promise<string|null>} Token lub `null`, gdy brak sesji.
 */
export async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
}

/**
 * Reakcja na błąd sesji (401 z funkcji `search` lub brak tokenu): usuwa lokalną sesję
 * (inaczej strona logowania od razu wróciłaby do aplikacji) i przekierowuje do logowania z celem.
 * @returns {Promise<void>}
 */
export async function onSessionExpired() {
    await supabase.auth.signOut({ scope: 'local' });
    redirectToLogin();
}

/**
 * Wylogowanie (przycisk „Wyloguj”): tylko ta przeglądarka (`scope: 'local'`), inne urządzenia zostają zalogowane.
 * supabase-js usuwa lokalną sesję także przy błędzie serwera, więc przekierowanie następuje zawsze.
 * @returns {Promise<void>}
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
        console.error('Błąd wylogowania:', error);
    }
    redirectToLogin();
}
