/**
 * Strażnik sesji: strony wymagające logowania i strona startowa (logowanie albo aplikacja).
 * Zależności (klient Auth, `location`) są przekazywane jawnie, aby testy mogły użyć fałszywego klienta.
 */
import { currentPage, loginUrl } from './redirects.js';
import { initLoginPage } from './loginPage.js';

export { APP_PAGES, safeNext, currentPage, loginUrl, pageUrl } from './redirects.js';

/**
 * @typedef {Object} GuardDeps
 * @property {import('@supabase/supabase-js').SupabaseClient['auth']} auth
 * @property {{ pathname: string, replace: (url: string) => void }} location
 * @property {string} baseUrl - `import.meta.env.BASE_URL`
 */

/**
 * Po wylogowaniu lub nieudanym odświeżeniu tokenu (zdarzenie SIGNED_OUT) przekierowuje do logowania z celem.
 * @param {GuardDeps} deps
 */
export function redirectOnSignOut({ auth, location, baseUrl }) {
    auth.onAuthStateChange(event => {
        if (event === 'SIGNED_OUT') {
            location.replace(loginUrl(baseUrl, currentPage(location.pathname, baseUrl)));
        }
    });
}

/**
 * Strona chroniona: bez sesji przekierowuje do logowania z celem powrotu.
 * @param {GuardDeps} deps
 * @returns {Promise<Object|null>} Sesja albo `null` (trwa przekierowanie)
 */
export async function requireSession(deps) {
    const { auth, location, baseUrl } = deps;
    const { data } = await auth.getSession();
    const session = data?.session ?? null;
    if (!session) {
        location.replace(loginUrl(baseUrl, currentPage(location.pathname, baseUrl)));
        return null;
    }
    redirectOnSignOut(deps);
    return session;
}

/** Odsłania elementy `[data-auth="signed-in"]` (nawigacja, „Wyloguj”, treść strony). */
function revealSignedIn(doc) {
    doc.querySelectorAll('[data-auth="signed-in"]').forEach(element => {
        element.hidden = false;
    });
}

/**
 * Strona chroniona (points.html): treść `[data-auth="signed-in"]` jest widoczna dopiero z sesją.
 * @param {GuardDeps & { doc: Document }} deps
 * @returns {Promise<Object|null>} Sesja albo `null` (trwa przekierowanie)
 */
export async function initProtectedPage({ doc, ...deps }) {
    const session = await requireSession(deps);
    if (session) {
        revealSignedIn(doc);
    }
    return session;
}

/**
 * Strona startowa (index.html): bez sesji formularz logowania, z sesją treść aplikacji.
 * Elementy `[data-auth="signed-in"]` (nawigacja, „Wyloguj”) są widoczne tylko z sesją.
 * @param {GuardDeps & { doc: Document, history: Pick<History, 'replaceState'> }} deps
 */
export async function initHomePage({ auth, doc, location, history, baseUrl }) {
    const { data } = await auth.getSession();
    const session = data?.session ?? null;

    if (session) {
        revealSignedIn(doc);
        doc.getElementById('app-section').hidden = false;
        redirectOnSignOut({ auth, location, baseUrl });
        return session;
    }

    doc.getElementById('login-section').hidden = false;
    await initLoginPage({ auth, root: doc.getElementById('login-root'), location, history, baseUrl });
    return null;
}
