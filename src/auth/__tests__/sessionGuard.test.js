import { describe, test, expect, beforeEach } from 'vitest';
import {
    safeNext,
    currentPage,
    loginUrl,
    pageUrl,
    requireSession,
    initHomePage
} from '../sessionGuard.js';
import { createFakeAuth, createFakeLocation, SESSION } from './fakeSupabase.js';

const BASE = '/marmaapps-static/';
const ORIGIN = 'https://wkoziej.github.io';

describe('safeNext (ochrona przed open redirect)', () => {
    test.each([
        ['points.html', 'points.html'],
        ['index.html', 'index.html'],
        ['', ''],
        ['./points.html', 'points.html']
    ])('strona aplikacji %j → %j', (raw, expected) => {
        expect(safeNext(raw)).toBe(expected);
    });

    test.each([
        'https://obca.domena',
        '//obca.domena',
        '/\\obca.domena',
        '\\\\obca.domena',
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'https%3A%2F%2Fobca.domena',
        '%2F%2Fobca.domena',
        '%252F%252Fobca.domena',
        '/points.html',
        '../points.html',
        'points.html/../../obca',
        'points.html?x=1',
        'login.html',
        'nieznana.html',
        ' points.html',
        null,
        undefined,
        42
    ])('cel %j → strona startowa', raw => {
        expect(safeNext(raw)).toBe('');
    });
});

describe('adresy stron', () => {
    test('currentPage zwraca stronę względem BASE_URL', () => {
        expect(currentPage('/marmaapps-static/points.html', BASE)).toBe('points.html');
        expect(currentPage('/marmaapps-static/', BASE)).toBe('');
        expect(currentPage('/points.html', '/')).toBe('points.html');
        expect(currentPage('/inna/points.html', BASE)).toBe('');
    });

    test('loginUrl dodaje cel tylko, gdy nie jest stroną startową', () => {
        expect(loginUrl(BASE, 'points.html')).toBe('/marmaapps-static/login.html?next=points.html');
        expect(loginUrl(BASE, '')).toBe('/marmaapps-static/login.html');
        expect(loginUrl('/', '//obca.domena')).toBe('/login.html');
    });

    test('pageUrl buduje adres strony aplikacji, a nieznany cel zamienia na startową', () => {
        expect(pageUrl(BASE, 'points.html')).toBe('/marmaapps-static/points.html');
        expect(pageUrl(BASE, '')).toBe('/marmaapps-static/');
        expect(pageUrl(BASE, 'https://obca.domena')).toBe('/marmaapps-static/');
    });
});

describe('requireSession (strona punktów)', () => {
    let location;

    beforeEach(() => {
        location = createFakeLocation(`${ORIGIN}/marmaapps-static/points.html`);
    });

    test('sesja istnieje → strona się ładuje bez przekierowania', async () => {
        const auth = createFakeAuth({ session: SESSION });

        const session = await requireSession({ auth, location, baseUrl: BASE });

        expect(session).toBe(SESSION);
        expect(location.replace).not.toHaveBeenCalled();
    });

    test('brak sesji → przekierowanie do logowania z parametrem celu', async () => {
        const auth = createFakeAuth({ session: null });

        const session = await requireSession({ auth, location, baseUrl: BASE });

        expect(session).toBeNull();
        expect(location.replace).toHaveBeenCalledWith('/marmaapps-static/login.html?next=points.html');
    });

    test('sesja wygasła w trakcie (SIGNED_OUT) → przekierowanie do logowania z celem', async () => {
        const auth = createFakeAuth({ session: SESSION });
        await requireSession({ auth, location, baseUrl: BASE });

        auth.emit('TOKEN_REFRESHED', SESSION);
        expect(location.replace).not.toHaveBeenCalled();

        auth.emit('SIGNED_OUT', null);
        expect(location.replace).toHaveBeenCalledWith('/marmaapps-static/login.html?next=points.html');
    });
});

describe('initHomePage (index.html)', () => {
    let location;

    function renderIndex() {
        document.body.innerHTML = `
            <button id="logout-button" data-auth="signed-in" hidden>Wyloguj</button>
            <nav data-auth="signed-in" hidden></nav>
            <section id="login-section" hidden><div id="login-root"></div></section>
            <div id="app-section" hidden>Aplikacja</div>`;
    }

    beforeEach(() => {
        renderIndex();
        location = createFakeLocation(`${ORIGIN}/marmaapps-static/`);
    });

    test('bez sesji → formularz logowania, aplikacja ukryta', async () => {
        const auth = createFakeAuth({ session: null });

        await initHomePage({ auth, doc: document, location, history: window.history, baseUrl: BASE });

        expect(document.getElementById('login-section').hidden).toBe(false);
        expect(document.querySelector('[data-testid="login-form"]')).not.toBeNull();
        expect(document.getElementById('app-section').hidden).toBe(true);
        expect(document.getElementById('logout-button').hidden).toBe(true);
        expect(location.replace).not.toHaveBeenCalled();
    });

    test('z sesją → aplikacja, nawigacja i przycisk wylogowania widoczne', async () => {
        const auth = createFakeAuth({ session: SESSION });

        await initHomePage({ auth, doc: document, location, history: window.history, baseUrl: BASE });

        expect(document.getElementById('app-section').hidden).toBe(false);
        expect(document.getElementById('login-section').hidden).toBe(true);
        expect(document.getElementById('logout-button').hidden).toBe(false);
        expect(document.querySelector('nav').hidden).toBe(false);
        expect(document.querySelector('[data-testid="login-form"]')).toBeNull();
    });

    test('z sesją, potem SIGNED_OUT → przekierowanie do logowania', async () => {
        const auth = createFakeAuth({ session: SESSION });
        await initHomePage({ auth, doc: document, location, history: window.history, baseUrl: BASE });

        auth.emit('SIGNED_OUT', null);

        expect(location.replace).toHaveBeenCalledWith('/marmaapps-static/login.html');
    });
});
