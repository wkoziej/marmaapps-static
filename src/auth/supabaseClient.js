/**
 * Jedyny klient Supabase w aplikacji (wszystkie strony).
 *
 * - `persistSession`, `autoRefreshToken`: sesja w localStorage, odświeżana automatycznie (R4).
 * - `detectSessionInUrl`: klient sam wymienia kod z adresu powrotu (login.html) na sesję.
 * - `flowType: 'pkce'`: kod w query zamiast tokenów w hash; działa na statycznym hostingu, bo wymiana
 *   kodu odbywa się w przeglądarce (weryfikator w localStorage). Ograniczenie: link z e-maila trzeba
 *   otworzyć w tej samej przeglądarce, w której poproszono o link (inaczej komunikat LINK_INVALID).
 */
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../config.js';

export const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
