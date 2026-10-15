/**
 * Publiczna konfiguracja Supabase ze zmiennych środowiskowych Vite (`.env.local`, CI).
 * Klucz publiczny jest publiczny z założenia; dane chroni RLS (zob. CLAUDE.md).
 */
export const supabaseConfig = {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
};

if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
    console.error('Brak VITE_SUPABASE_URL lub VITE_SUPABASE_PUBLISHABLE_KEY (zob. .env.example).');
}

/** Ścieżka modelu 3D w katalogu public/ z uwzględnieniem `base` Vite. */
export const humanModelPath = `${import.meta.env.BASE_URL}models/human.glb`;
