// Wspólny układ stron: style bazowe, ikony, aktywna pozycja menu, rok w stopce, wylogowanie.
import './styles/base/variables.css';
import './styles/base/legacy.css';
import { createIcons, House, LogOut, MapPin } from 'lucide';
import { signOut } from './auth/session.js';

/**
 * @param {'home'|'points'} activePage - Strona do wyróżnienia w nawigacji
 */
export function initLayout(activePage) {
    createIcons({ icons: { House, LogOut, MapPin } });

    document.querySelectorAll('[data-nav]').forEach(link => {
        if (link.dataset.nav === activePage) {
            link.classList.add('bg-blue-700');
            link.setAttribute('aria-current', 'page');
        }
    });

    const year = document.getElementById('footer-year');
    if (year) {
        year.textContent = String(new Date().getFullYear());
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut();
        });
    }
}
