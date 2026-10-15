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
npx supabase start   # lokalny stack (Docker)
npx supabase test db # pgTAP: schemat, lista adresów, RLS
```

## Dodanie użytkownika do listy dozwolonych adresów

Dostęp ma tylko adres z tabeli `private.allowed_emails` (schemat niewystawiony przez API).

1. Panel Supabase → Table Editor → schemat `private` → tabela `allowed_emails`.
2. Insert row: kolumna `email`, np. `nowa.osoba@example.com` (wielkość liter nie ma znaczenia).
3. Osoba loguje się linkiem e-mail lub przez Google. Hook „Before User Created” odrzuca adresy spoza listy (403).

Usunięcie wiersza odcina dostęp do danych od kolejnego zapytania (RLS), także dla istniejącego konta.
Adresów nie zapisuj w repozytorium ani w skryptach (zob. `CLAUDE.md`).

Na projekcie Supabase hook trzeba włączyć raz: Authentication → Hooks → Before User Created →
Postgres, funkcja `private.before_user_created_hook`. Lokalnie włącza go `supabase/config.toml`.

## Wymagane ustawienia Auth w projekcie Supabase

Lokalnie ustawia je `supabase/config.toml`. W projekcie w chmurze trzeba je ustawić w panelu (pełna lista: `docs/supabase-setup.md`, U8):

- Authentication → Hooks → „Before User Created” → funkcja `private.before_user_created_hook`. **Bez hooka każdy może założyć konto** (dane nadal chroni RLS).
- Authentication → Providers → Email → „Confirm email” włączone.

Ochrona danych nie zależy od samego hooka. `public.is_allowed()` wymaga: potwierdzonego adresu z listy, adresu z JWT zgodnego z kontem i sesji bez hasła (claim `amr`: `otp`, `magiclink` lub `oauth`). Sesja z logowania hasłem nie widzi danych, nawet jeśli ktoś założył konto z hasłem na adres z listy.

Test dymny po każdej zmianie ustawień Auth: prośba o link dla adresu spoza listy (np. `nikt@example.com`) zwraca 403.
