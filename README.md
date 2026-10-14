# marmaapps-static

Interaktywny model 3D punktów marma z wyszukiwaniem. Statyczna strona na GitHub Pages, dane i logowanie w Supabase.

Dostęp mają tylko zalogowani użytkownicy z listy dozwolonych adresów. Repozytorium nie zawiera danych punktów (zob. `CLAUDE.md`).

## Narzędzia

- Node.js 22+ (`npm install` instaluje też Supabase CLI, Deno i hook pre-commit).
- Docker (lokalny stack Supabase).
- [gitleaks](https://github.com/gitleaks/gitleaks) 8.30+ w `PATH` (wymagany przez hook pre-commit), np. binarka z GitHub Releases w `~/.local/bin`.
- direnv + pass (sekrety; zob. `.envrc`).

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

## Testy

```bash
npm test             # Vitest
npm run test:guard   # strażnik danych
npm run check:data   # strażnik danych na wszystkich plikach
```
