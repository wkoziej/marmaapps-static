/**
 * Formularz logowania bez haseł (link e-mail, Google) i obsługa powrotu z linku lub z Google.
 * Używany przez login.html i przez index.html (strona startowa bez sesji).
 */
import { AuthMessages } from '../constants/textConstants.js';
import { safeNext, loginUrl, pageUrl } from './redirects.js';

/**
 * Fragment komunikatu hooka „Before User Created” (migracja *_allowlist_and_hook.sql).
 * Auth zwraca odmowę z `error_code: "unknown"`, więc w przekierowaniu rozpoznajemy ją po treści.
 */
const HOOK_DENIAL_MARKER = 'nie ma dostępu';

/** Kody Auth oznaczające nieważny link logowania lub nieudaną wymianę kodu PKCE. */
const INVALID_LINK_CODES = new Set(['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'bad_code_verifier']);

/** Parametry powrotu z Auth usuwane z adresu po odczytaniu. */
const CALLBACK_PARAMS = ['error', 'error_code', 'error_description', 'code', 'sb'];

function isRateLimit(status, code) {
    return status === 429 || (typeof code === 'string' && code.startsWith('over_'));
}

/**
 * Komunikat dla błędu z `signInWithOtp` / `signInWithOAuth`.
 * @param {{ name?: string, status?: number, code?: string }|Error} error
 * @returns {string}
 */
export function authErrorMessage(error) {
    const { name, status, code } = /** @type {any} */ (error ?? {});
    if (name === 'AuthRetryableFetchError' || error instanceof TypeError) {
        return AuthMessages.NETWORK;
    }
    if (isRateLimit(status, code)) {
        return AuthMessages.RATE_LIMIT;
    }
    if (status === 403) {
        return AuthMessages.NOT_ALLOWED;
    }
    return AuthMessages.GENERIC;
}

/**
 * Komunikat dla parametrów błędu w adresie powrotu (query lub hash).
 * @param {{ error?: string, error_code?: string, error_description?: string }} params
 * @returns {string|null} `null`, gdy w adresie nie ma błędu
 */
export function urlErrorMessage({ error, error_code: code, error_description: description }) {
    if (!error && !code && !description) {
        return null;
    }
    if (code && INVALID_LINK_CODES.has(code)) {
        return AuthMessages.LINK_INVALID;
    }
    if (typeof description === 'string' && description.includes(HOOK_DENIAL_MARKER)) {
        return AuthMessages.NOT_ALLOWED;
    }
    if (isRateLimit(undefined, code)) {
        return AuthMessages.RATE_LIMIT;
    }
    // Pozostałe błędy w przekierowaniu pochodzą z logowania OAuth (np. anulowanie w Google).
    return AuthMessages.GOOGLE_ERROR;
}

/** Parametry z query i z hash (query ma pierwszeństwo, jak w supabase-js). */
function readUrlParams(location) {
    const params = {};
    const hash = location.hash?.startsWith('#') ? location.hash.slice(1) : '';
    new URLSearchParams(hash).forEach((value, key) => {
        params[key] = value;
    });
    new URLSearchParams(location.search).forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

function removeCallbackParams(location, history) {
    const query = new URLSearchParams(location.search);
    CALLBACK_PARAMS.forEach(name => query.delete(name));
    const search = query.toString();
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}`);
}

function render(root) {
    root.innerHTML = `
        <div class="login" data-testid="login">
            <h2 class="text-xl font-bold mb-2"></h2>
            <p class="mb-4" data-role="intro"></p>
            <form data-testid="login-form" novalidate>
                <label for="login-email" class="block mb-1"></label>
                <input type="email" id="login-email" name="email" autocomplete="email" required
                    class="border rounded p-2 w-full mb-2" data-testid="login-email">
                <button type="submit" class="bg-blue-600 text-white rounded px-4 py-2 w-full"
                    data-testid="login-email-button"></button>
            </form>
            <p class="text-center my-2" data-role="or"></p>
            <button type="button" class="border rounded px-4 py-2 w-full" data-testid="login-google-button"></button>
            <p class="mt-4" role="status" aria-live="polite" data-testid="login-message"></p>
        </div>`;
    root.querySelector('h2').textContent = AuthMessages.TITLE;
    root.querySelector('[data-role="intro"]').textContent = AuthMessages.INTRO;
    root.querySelector('label').textContent = AuthMessages.EMAIL_LABEL;
    root.querySelector('[data-testid="login-email-button"]').textContent = AuthMessages.EMAIL_BUTTON;
    root.querySelector('[data-role="or"]').textContent = AuthMessages.OR;
    root.querySelector('[data-testid="login-google-button"]').textContent = AuthMessages.GOOGLE_BUTTON;
}

/**
 * @param {Object} deps
 * @param {import('@supabase/supabase-js').SupabaseClient['auth']} deps.auth
 * @param {HTMLElement} deps.root - Kontener formularza
 * @param {{ origin: string, pathname: string, search: string, hash: string, replace: (url: string) => void }} deps.location
 * @param {Pick<History, 'replaceState'>} deps.history
 * @param {string} deps.baseUrl - `import.meta.env.BASE_URL`
 */
export async function initLoginPage({ auth, root, location, history, baseUrl }) {
    render(root);
    const messageElement = root.querySelector('[data-testid="login-message"]');
    const showMessage = text => {
        messageElement.textContent = text;
    };

    const params = readUrlParams(location);
    const next = safeNext(params.next);
    // Adres powrotu z linku e-mail i z Google: zawsze login.html (obsługa błędów i wymiany kodu PKCE).
    const returnUrl = new URL(loginUrl(baseUrl, next), location.origin).href;
    const goToTarget = () => location.replace(pageUrl(baseUrl, next));

    const urlError = urlErrorMessage(params);
    const hasCode = typeof params.code === 'string' && params.code !== '';

    // getSession() czeka na inicjalizację klienta, w tym na wymianę kodu PKCE z adresu (detectSessionInUrl).
    // Dlatego parametry powrotu usuwamy z adresu dopiero po niej.
    const { data } = await auth.getSession();
    if (data?.session) {
        goToTarget();
        return;
    }
    if (urlError || hasCode || location.hash) {
        removeCallbackParams(location, history);
    }

    if (urlError) {
        showMessage(urlError);
    } else if (hasCode) {
        // Kod bez sesji: brak weryfikatora PKCE (link otwarty w innej przeglądarce) albo kod już zużyty.
        showMessage(AuthMessages.LINK_INVALID);
    }

    // Logowanie w innej karcie tej przeglądarki (link z e-maila otwarty w nowej karcie).
    auth.onAuthStateChange(event => {
        if (event === 'SIGNED_IN') {
            goToTarget();
        }
    });

    const form = root.querySelector('[data-testid="login-form"]');
    const emailInput = root.querySelector('#login-email');
    const emailButton = root.querySelector('[data-testid="login-email-button"]');
    const googleButton = root.querySelector('[data-testid="login-google-button"]');

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const email = emailInput.value.trim();
        if (!email) {
            showMessage(AuthMessages.EMAIL_REQUIRED);
            return;
        }
        emailButton.disabled = true;
        showMessage(AuthMessages.SENDING);
        try {
            // Bez `shouldCreateUser: false`: przy pierwszym logowaniu konto jeszcze nie istnieje.
            // Adresy spoza listy odrzuca hook „Before User Created” (403).
            const { error } = await auth.signInWithOtp({ email, options: { emailRedirectTo: returnUrl } });
            showMessage(error ? authErrorMessage(error) : AuthMessages.LINK_SENT);
        } catch (error) {
            showMessage(authErrorMessage(error));
        } finally {
            emailButton.disabled = false;
        }
    });

    googleButton.addEventListener('click', async () => {
        try {
            const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl } });
            if (error) {
                showMessage(authErrorMessage(error));
            }
        } catch (error) {
            showMessage(authErrorMessage(error));
        }
    });
}
