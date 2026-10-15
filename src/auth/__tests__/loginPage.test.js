import { describe, test, expect, beforeEach, vi } from 'vitest';
import { initLoginPage, authErrorMessage, urlErrorMessage } from '../loginPage.js';
import { AuthMessages } from '../../constants/textConstants.js';
import {
    createFakeAuth,
    createFakeLocation,
    authApiError,
    networkError,
    deferred,
    SESSION
} from './fakeSupabase.js';

const BASE = '/marmaapps-static/';
const ORIGIN = 'https://wkoziej.github.io';
const LOGIN = `${ORIGIN}/marmaapps-static/login.html`;
const HOOK_MESSAGE = 'Ten adres e-mail nie ma dostępu do aplikacji. Skontaktuj się z właścicielem.';

function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function message() {
    return document.querySelector('[data-testid="login-message"]').textContent;
}

/** @returns {Event} Wysłane zdarzenie (sprawdzenie `defaultPrevented`). */
async function submitEmail(email) {
    document.querySelector('#login-email').value = email;
    const event = new Event('submit', { cancelable: true });
    document.querySelector('[data-testid="login-form"]').dispatchEvent(event);
    await flush();
    return event;
}

function emailButton() {
    return document.querySelector('[data-testid="login-email-button"]');
}

function googleButton() {
    return document.querySelector('[data-testid="login-google-button"]');
}

describe('initLoginPage', () => {
    let root;
    let history;

    beforeEach(() => {
        document.body.innerHTML = '<div id="login-root"></div>';
        root = document.getElementById('login-root');
        history = { replaceState: vi.fn() };
    });

    async function open(href, authOptions) {
        const auth = createFakeAuth(authOptions);
        const location = createFakeLocation(href);
        await initLoginPage({ auth, root, location, history, baseUrl: BASE });
        return { auth, location };
    }

    describe('logowanie linkiem e-mail', () => {
        test('wysłanie formularza → signInWithOtp z adresem powrotu i komunikat „sprawdź skrzynkę”', async () => {
            const { auth } = await open(`${LOGIN}?next=points.html`);

            await submitEmail('  osoba@example.com ');

            expect(auth.signInWithOtp).toHaveBeenCalledWith({
                email: 'osoba@example.com',
                options: { emailRedirectTo: `${LOGIN}?next=points.html` }
            });
            expect(message()).toBe(AuthMessages.LINK_SENT);
        });

        test('adres z listy bez konta: żądanie linku nie blokuje tworzenia konta (brak shouldCreateUser: false)', async () => {
            const { auth } = await open(LOGIN);

            await submitEmail('nowa.osoba@example.com');

            const { options } = auth.signInWithOtp.mock.calls[0][0];
            expect(options).not.toHaveProperty('shouldCreateUser');
            expect(options.emailRedirectTo).toBe(LOGIN);
            expect(message()).toBe(AuthMessages.LINK_SENT);
        });

        test('pusty adres → komunikat, bez żądania', async () => {
            const { auth } = await open(LOGIN);

            await submitEmail('   ');

            expect(auth.signInWithOtp).not.toHaveBeenCalled();
            expect(message()).toBe(AuthMessages.EMAIL_REQUIRED);
        });

        test('odmowa hooka (403) → komunikat o braku dostępu z kontaktem do właściciela', async () => {
            await open(LOGIN, { otpError: authApiError(403, 'unknown', HOOK_MESSAGE) });

            await submitEmail('nikt@example.com');

            expect(message()).toBe(AuthMessages.NOT_ALLOWED);
            expect(message()).toMatch(/właściciel/);
        });

        test('limit żądań (429) → komunikat „spróbuj za minutę”', async () => {
            await open(LOGIN, { otpError: authApiError(429, 'over_email_send_rate_limit') });

            await submitEmail('osoba@example.com');

            expect(message()).toBe(AuthMessages.RATE_LIMIT);
            expect(message()).toMatch(/minut/);
        });

        test('błąd sieci → komunikat o połączeniu', async () => {
            await open(LOGIN, { otpError: networkError() });

            await submitEmail('osoba@example.com');

            expect(message()).toBe(AuthMessages.NETWORK);
        });

        test('cel spoza listy stron nie trafia do adresu powrotu', async () => {
            const { auth } = await open(`${LOGIN}?next=${encodeURIComponent('https://obca.domena')}`);

            await submitEmail('osoba@example.com');

            expect(auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(LOGIN);
        });
    });

    describe('przed zakończeniem getSession()', () => {
        test('formularz jest widoczny, ale wysłanie nie robi natywnego GET ani żądania, przyciski wyłączone', async () => {
            const auth = createFakeAuth({ deferSession: true });
            const location = createFakeLocation(`${LOGIN}?code=abc&next=points.html`);

            const done = initLoginPage({ auth, root, location, history, baseUrl: BASE });

            expect(emailButton().disabled).toBe(true);
            expect(googleButton().disabled).toBe(true);
            const event = await submitEmail('osoba@example.com');
            googleButton().dispatchEvent(new Event('click'));
            await flush();
            expect(event.defaultPrevented).toBe(true);
            expect(auth.signInWithOtp).not.toHaveBeenCalled();
            expect(auth.signInWithOAuth).not.toHaveBeenCalled();

            auth.resolveSession();
            await done;

            expect(emailButton().disabled).toBe(false);
            expect(googleButton().disabled).toBe(false);
        });
    });

    describe('blokada podczas żądania', () => {
        test('link e-mail w toku → oba przyciski wyłączone, drugie wysłanie i Google bez żądania', async () => {
            const { auth } = await open(LOGIN);
            const request = deferred();
            auth.signInWithOtp.mockImplementation(() => request.promise);

            await submitEmail('osoba@example.com');
            expect(emailButton().disabled).toBe(true);
            expect(googleButton().disabled).toBe(true);
            await submitEmail('osoba@example.com');
            googleButton().dispatchEvent(new Event('click'));
            await flush();
            expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
            expect(auth.signInWithOAuth).not.toHaveBeenCalled();

            request.resolve({ data: {}, error: null });
            await flush();

            expect(emailButton().disabled).toBe(false);
            expect(googleButton().disabled).toBe(false);
        });

        test('Google w toku → oba przyciski wyłączone, drugie kliknięcie i formularz bez żądania', async () => {
            const { auth } = await open(LOGIN);
            const request = deferred();
            auth.signInWithOAuth.mockImplementation(() => request.promise);

            googleButton().click();
            await flush();
            expect(emailButton().disabled).toBe(true);
            expect(googleButton().disabled).toBe(true);
            googleButton().dispatchEvent(new Event('click'));
            await submitEmail('osoba@example.com');
            expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
            expect(auth.signInWithOtp).not.toHaveBeenCalled();
        });

        test('Google bez błędu (trwa przekierowanie) → przyciski zostają wyłączone', async () => {
            await open(LOGIN);

            googleButton().click();
            await flush();

            expect(emailButton().disabled).toBe(true);
            expect(googleButton().disabled).toBe(true);
        });

        test('Google z błędem → przyciski znowu włączone', async () => {
            await open(LOGIN, { oauthError: authApiError(400, 'validation_failed') });

            googleButton().click();
            await flush();

            expect(emailButton().disabled).toBe(false);
            expect(googleButton().disabled).toBe(false);
        });
    });

    describe('logowanie przez Google', () => {
        test('przycisk → signInWithOAuth z powrotem na stronę logowania i celem', async () => {
            const { auth } = await open(`${LOGIN}?next=points.html`);

            document.querySelector('[data-testid="login-google-button"]').click();
            await flush();

            expect(auth.signInWithOAuth).toHaveBeenCalledWith({
                provider: 'google',
                options: { redirectTo: `${LOGIN}?next=points.html` }
            });
        });

        test('błąd startu logowania Google → komunikat', async () => {
            await open(LOGIN, { oauthError: authApiError(400, 'validation_failed') });

            document.querySelector('[data-testid="login-google-button"]').click();
            await flush();

            expect(message()).toBe(AuthMessages.GENERIC);
        });

        test('powrót z Google z błędem odmowy hooka (query) → komunikat o braku dostępu', async () => {
            const query = new URLSearchParams({
                error: 'access_denied',
                error_code: 'unknown',
                error_description: HOOK_MESSAGE,
                next: 'points.html'
            });

            await open(`${LOGIN}?${query}`);

            expect(message()).toBe(AuthMessages.NOT_ALLOWED);
        });

        test('powrót z Google z błędem odmowy hooka (hash) → komunikat o braku dostępu', async () => {
            const hash = new URLSearchParams({ error: 'server_error', error_description: HOOK_MESSAGE });

            await open(`${LOGIN}#${hash}`);

            expect(message()).toBe(AuthMessages.NOT_ALLOWED);
        });

        test('powrót z Google z innym błędem → komunikat o błędzie Google', async () => {
            await open(`${LOGIN}?error=server_error&error_description=Unable+to+exchange+external+code`);

            expect(message()).toBe(AuthMessages.GOOGLE_ERROR);
        });

        test('parametry błędu są usuwane z adresu, cel zostaje', async () => {
            await open(`${LOGIN}?error=access_denied&error_code=otp_expired&next=points.html#error=access_denied`);

            expect(history.replaceState).toHaveBeenCalledWith(null, '', '/marmaapps-static/login.html?next=points.html');
        });
    });

    describe('powrót z linku', () => {
        test('poprawny token (sesja po wymianie kodu) → przekierowanie do zapamiętanego celu', async () => {
            const { location } = await open(`${LOGIN}?next=points.html`, { session: SESSION });

            expect(location.replace).toHaveBeenCalledWith('/marmaapps-static/points.html');
        });

        test('sesja i niebezpieczny cel → strona startowa', async () => {
            const { location } = await open(`${LOGIN}?next=${encodeURIComponent('//obca.domena')}`, { session: SESSION });

            expect(location.replace).toHaveBeenCalledWith('/marmaapps-static/');
        });

        test('zdarzenie SIGNED_IN (np. link otwarty w innej karcie) → przekierowanie do celu', async () => {
            const { auth, location } = await open(`${LOGIN}?next=points.html`);
            expect(location.replace).not.toHaveBeenCalled();

            auth.emit('SIGNED_IN', SESSION);

            expect(location.replace).toHaveBeenCalledWith('/marmaapps-static/points.html');
        });

        test('link wygasł (otp_expired w hash) → komunikat o nieprawidłowym linku', async () => {
            await open(`${LOGIN}?next=points.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);

            expect(message()).toBe(AuthMessages.LINK_INVALID);
        });

        test('kod PKCE bez sesji (inna przeglądarka lub kod zużyty) → komunikat o nieprawidłowym linku', async () => {
            const { location } = await open(`${LOGIN}?code=abc&next=points.html`);

            expect(message()).toBe(AuthMessages.LINK_INVALID);
            expect(location.replace).not.toHaveBeenCalled();
        });

        test('błąd getSession() (np. sieć przy wymianie kodu) → kod zostaje w adresie, komunikat o połączeniu', async () => {
            const { location } = await open(`${LOGIN}?code=abc&next=points.html`, { sessionError: networkError() });

            expect(history.replaceState).not.toHaveBeenCalled();
            expect(message()).toBe(AuthMessages.NETWORK);
            expect(location.replace).not.toHaveBeenCalled();
        });

        test('zwykłe wejście bez sesji → formularz bez komunikatu', async () => {
            const { location } = await open(LOGIN);

            expect(document.querySelector('[data-testid="login-form"]')).not.toBeNull();
            expect(message()).toBe('');
            expect(location.replace).not.toHaveBeenCalled();
        });
    });
});

describe('mapowanie błędów', () => {
    test('authErrorMessage', () => {
        expect(authErrorMessage(authApiError(403, 'unknown', HOOK_MESSAGE))).toBe(AuthMessages.NOT_ALLOWED);
        expect(authErrorMessage(authApiError(429, 'over_request_rate_limit'))).toBe(AuthMessages.RATE_LIMIT);
        expect(authErrorMessage(authApiError(400, 'over_email_send_rate_limit'))).toBe(AuthMessages.RATE_LIMIT);
        expect(authErrorMessage(networkError())).toBe(AuthMessages.NETWORK);
        expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(AuthMessages.NETWORK);
        expect(authErrorMessage(authApiError(500, 'unexpected_failure'))).toBe(AuthMessages.GENERIC);
    });

    test('urlErrorMessage', () => {
        expect(urlErrorMessage({})).toBeNull();
        expect(urlErrorMessage({ error_code: 'otp_expired' })).toBe(AuthMessages.LINK_INVALID);
        expect(urlErrorMessage({ error_code: 'flow_state_expired' })).toBe(AuthMessages.LINK_INVALID);
        expect(urlErrorMessage({ error: 'access_denied', error_description: HOOK_MESSAGE })).toBe(AuthMessages.NOT_ALLOWED);
        expect(urlErrorMessage({ error: 'access_denied', error_code: 'over_request_rate_limit' })).toBe(AuthMessages.RATE_LIMIT);
        expect(urlErrorMessage({ error: 'access_denied' })).toBe(AuthMessages.GOOGLE_ERROR);
    });
});
