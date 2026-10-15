import './styles/pages/home.css';
import { initLayout } from './layout.js';
import { supabase } from './auth/supabaseClient.js';
import { initHomePage } from './auth/sessionGuard.js';

initLayout('home');

// Bez sesji: formularz logowania; z sesją: treść startowa (dane punktów chroni RLS niezależnie).
initHomePage({
    auth: supabase.auth,
    doc: document,
    location: window.location,
    history: window.history,
    baseUrl: import.meta.env.BASE_URL
});
