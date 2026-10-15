import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createFakeAuth, SESSION } from './fakeSupabase.js';

const fake = vi.hoisted(() => ({ auth: null, pathname: '/points.html' }));

vi.mock('../supabaseClient.js', () => ({
    supabase: {
        get auth() {
            return fake.auth;
        }
    }
}));

vi.mock('../navigation.js', () => ({
    redirect: vi.fn(),
    currentPathname: () => fake.pathname
}));

const { getAccessToken, onSessionExpired, signOut } = await import('../session.js');
const { redirect } = await import('../navigation.js');
const { initLayout } = await import('../../layout.js');

// W testach import.meta.env.BASE_URL = '/'.
describe('session.js (integracja z U6)', () => {
    beforeEach(() => {
        vi.mocked(redirect).mockClear();
        fake.pathname = '/points.html';
    });

    test('getAccessToken zwraca token sesji Supabase', async () => {
        fake.auth = createFakeAuth({ session: SESSION });

        await expect(getAccessToken()).resolves.toBe('jwt-testowy');
    });

    test('getAccessToken bez sesji zwraca null', async () => {
        fake.auth = createFakeAuth({ session: null });

        await expect(getAccessToken()).resolves.toBeNull();
    });

    test('onSessionExpired (401 z search) usuwa lokalną sesję i przekierowuje do logowania z celem', async () => {
        fake.auth = createFakeAuth({ session: SESSION });

        await onSessionExpired();

        expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(redirect).toHaveBeenCalledWith('/login.html?next=points.html');
    });

    test('signOut → supabase.auth.signOut (tylko to urządzenie) i przekierowanie do logowania', async () => {
        fake.auth = createFakeAuth({ session: SESSION });

        await signOut();

        expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(redirect).toHaveBeenCalledWith('/login.html?next=points.html');
    });

    test('signOut przekierowuje także, gdy serwer zwróci błąd (sesja lokalna i tak jest usuwana)', async () => {
        fake.auth = createFakeAuth({ session: SESSION });
        fake.auth.signOut.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', status: 0 } });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await signOut();

        expect(redirect).toHaveBeenCalledWith('/login.html?next=points.html');
    });

    test('przycisk „Wyloguj” w nawigacji wylogowuje', async () => {
        fake.auth = createFakeAuth({ session: SESSION });
        fake.pathname = '/';
        document.body.innerHTML = '<button id="logout-button" type="button">Wyloguj</button>';
        initLayout('home');

        document.getElementById('logout-button').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(redirect).toHaveBeenCalledWith('/login.html');
    });
});
