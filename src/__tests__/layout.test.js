import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../auth/session.js', () => ({ signOut: vi.fn() }));
vi.mock('lucide', () => ({ createIcons: vi.fn(), House: {}, LogOut: {}, MapPin: {} }));

import { initLayout } from '../layout.js';
import { signOut } from '../auth/session.js';

describe('initLayout', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <nav>
                <a data-nav="home" href="#">Start</a>
                <a data-nav="points" href="#">Punkty</a>
            </nav>
            <button id="logout-button">Wyloguj</button>
            <footer><span id="footer-year"></span></footer>`;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    test('aktywna pozycja menu ma aria-current', () => {
        initLayout('points');

        expect(document.querySelector('[data-nav="points"]').getAttribute('aria-current')).toBe('page');
        expect(document.querySelector('[data-nav="home"]').hasAttribute('aria-current')).toBe(false);
    });

    test('stopka pokazuje bieżący rok', () => {
        initLayout('home');

        expect(document.getElementById('footer-year').textContent).toBe(String(new Date().getFullYear()));
    });

    test('przycisk wylogowania woła signOut', () => {
        initLayout('home');

        document.getElementById('logout-button').click();

        expect(signOut).toHaveBeenCalledTimes(1);
    });
});
