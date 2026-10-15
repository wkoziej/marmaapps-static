// Strona logowania (login.html): formularz i obsługa powrotu z linku e-mail lub z Google.
import './styles/base/variables.css';
import './styles/base/legacy.css';
import { supabase } from './auth/supabaseClient.js';
import { initLoginPage } from './auth/loginPage.js';

const year = document.getElementById('footer-year');
if (year) {
    year.textContent = String(new Date().getFullYear());
}

initLoginPage({
    auth: supabase.auth,
    root: document.getElementById('login-root'),
    location: window.location,
    history: window.history,
    baseUrl: import.meta.env.BASE_URL
});
