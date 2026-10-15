# Migracja danych punktów: droplet → Supabase (U5)

Jednorazowe skrypty: eksport z dropletu, import do Postgres projektu Supabase, weryfikacja liczb.
Dane trafiają tylko do `data-export/` (wykluczony z git). Nic z eksportu nie może trafić do repozytorium (zob. `CLAUDE.md`).

**Adresy e-mail użytkowników nie przechodzą przez skrypty.** Eksport nie czyta tabel kont i płatności (tylko `pointsdb_*`). Właściciel wpisuje adresy ręcznie w panelu Supabase (`private.allowed_emails`, zob. `README.md` w katalogu głównym). Import nie zmienia `private.*` ani `auth.*`.

## Wymagania

- [uv](https://docs.astral.sh/uv/) (Python ≥ 3.10 instaluje uv).
- Dostęp SSH do dropletu.
- `SUPABASE_DB_URL` w env: odkomentuj wpis w `.envrc` po utworzeniu go w `pass` (`direnv allow`). Connection string tylko w `pass`, nigdy w pliku repozytorium.
  Użyj połączenia bezpośredniego albo „Session pooler” (port 5432). Nie używaj „Transaction pooler” (port 6543): skrypt wymaga jednej sesji na całą transakcję importu.

Wszystkie polecenia uruchamiaj z katalogu głównego repozytorium.

## Pliki

| Plik | Rola |
| --- | --- |
| `export_from_droplet.py` | SQLite (tylko `pointsdb_*`), RethinkDB, Qdrant → `data-export/` |
| `transform.py` | czyste funkcje: rekordy źródłowe → wiersze tabel Supabase, raport |
| `export_files.py` | format katalogu eksportu (`manifest.json`, pliki JSONL) |
| `import_to_supabase.py` | import w jednej transakcji |
| `verify_counts.py` | porównanie liczb źródło/cel |

Domyślne nazwy źródeł pochodzą z kodu starej aplikacji (`djangoapp/pointsdb/server_utils.py`). Zmień je argumentem, jeżeli na droplecie są inne:

| Źródło | Domyślnie | Argument |
| --- | --- | --- |
| SQLite | brak (wymagane), na produkcji `djangoapp/prod-db.sqlite3` (do sprawdzenia na droplecie) | `--sqlite-path` |
| RethinkDB | `127.0.0.1:28015`, baza `marmaapp`, tabela `marma_points`, użytkownik `admin` | `--rethinkdb-host/-port/-db/-table/-user` |
| Qdrant | `127.0.0.1:6333`, kolekcja `subjects_openai` | `--qdrant-host/-port/-collection` |

Hasła tylko przez env: `RETHINKDB_PASSWORD`, `QDRANT_API_KEY` (obecna instalacja prawdopodobnie ich nie wymaga; do sprawdzenia). Klucz dokumentu RethinkDB (nazwa punktu) skrypt odczytuje z definicji tabeli (`primary_key`) i zapisuje w `manifest.json`.

## 1. Eksport

### Wariant A: na droplecie

Wymaga uv i kopii katalogu `scripts/migration/` na droplecie. Porty RethinkDB i Qdrant są wystawione na hoście przez `docker-compose.yml` (28015, 6333).

```bash
# na droplecie
uv run --project scripts/migration python scripts/migration/export_from_droplet.py \
  --export-dir ~/data-export --sqlite-path <ścieżka>/prod-db.sqlite3
# na maszynie właściciela
scp -r droplet:data-export ./data-export
ssh droplet 'rm -rf ~/data-export'
```

### Wariant B: przez tunel SSH (z maszyny właściciela)

RethinkDB i Qdrant przez tunel:

```bash
ssh -N -L 28015:127.0.0.1:28015 -L 6333:127.0.0.1:6333 droplet &
uv run --project scripts/migration python scripts/migration/export_from_droplet.py \
  --sources rethinkdb,qdrant
kill %1
```

SQLite jest plikiem na droplecie. Nie kopiuj całej bazy (zawiera tabele kont). Przenieś tylko tabele `pointsdb_*` (wymaga `sqlite3` na droplecie lub w kontenerze; do sprawdzenia):

```bash
umask 077   # pliki eksportu tylko dla właściciela (0600/0700)
mkdir -p data-export
ssh droplet "sqlite3 -readonly <ścieżka>/prod-db.sqlite3 '.dump pointsdb_%'" \
  | sqlite3 data-export/pointsdb-only.sqlite3
uv run --project scripts/migration python scripts/migration/export_from_droplet.py \
  --sources sqlite --sqlite-path data-export/pointsdb-only.sqlite3
```

Polecenie nie tworzy plików na droplecie. Jeżeli mimo to zapisałeś tam zrzut lub kopię (np. przy sprawdzaniu ścieżki), usuń je z dropletu.

Kolejne uruchomienia z różnymi `--sources` uzupełniają ten sam `manifest.json`.

Skrypt eksportu ustawia `umask 077`: katalogi eksportu mają prawa 0700, pliki 0600. Wartość bez reprezentacji JSON (np. data `datetime`) przerywa eksport z nazwą źródła i tabeli; skrypt jej nie konwertuje.

Sprawdź, że eksport jest poza git: `git status` nie może pokazywać `data-export/`.

## 2. Import

```bash
uv run --project scripts/migration python scripts/migration/import_to_supabase.py \
  --export-dir data-export --confirm-host <host bazy docelowej>
```

- `--confirm-host` musi być równy hostowi z `SUPABASE_DB_URL` (np. `db.<ref>.supabase.co` albo host poolera). Skrypt najpierw wypisuje host, port i nazwę bazy (bez hasła). Brak flagi, inny host lub brak `SUPABASE_DB_URL` → kod 2, bez połączenia z bazą.
- Uszkodzony lub niepełny eksport albo błąd transformacji → kod 1 i komunikat `BŁĄD …` (dotyczy też `verify_counts.py`).
- Najpierw transformacja. Błąd danych (np. wektor o długości ≠ 1536, wektor bez `metadata.id`) przerywa skrypt przed połączeniem z bazą.
- Jedna transakcja: `TRUNCATE` 6 tabel punktów (`RESTART IDENTITY CASCADE`), `INSERT` rodzic → dziecko z zachowanymi id, ustawienie sekwencji identity na `max(id) + 1`. Błąd w połowie → rollback, dane bez zmian.
- Ponowne uruchomienie daje ten sam stan.
- Punkt bez dokumentu RethinkDB dostaje `doc = {}`. Dokument bez punktu i wektor do nieistniejącego tematu są pomijane i zgłaszane w raporcie.
- Wektory EN bez pola `is_polish` są importowane jako `is_polish = false`.

## 3. Weryfikacja

```bash
uv run --project scripts/migration python scripts/migration/verify_counts.py --export-dir data-export
```

Raport: liczby źródło/cel dla każdej tabeli i liczba punktów z opisem, nazwy punktów bez opisu, nazwy opisów bez punktu, identyfikatory pominiętych wektorów, duplikaty (temat, język). Bez treści opisów. Kod wyjścia ≠ 0, gdy liczba w dowolnej tabeli się różni (raport wskazuje tabelę).

Oczekiwane liczby (stan z planu): 104 punkty, 209 współrzędnych, 14 funkcji, 888 tematów, 2063 powiązania, wektory = liczba punktów w Qdrant (oczekiwane 1776).

Raport możesz przekazać dalej tylko bez danych osobowych (nie zawiera ich z założenia).

## 4. Po imporcie

1. Zmień hasło bazy: panel Supabase → Project Settings → Database → Reset database password. Zapisz nowy connection string w `pass` (`projects/marmaapps-static/SUPABASE_DB_URL`).
2. Wpisz adresy e-mail ręcznie w panelu (`private.allowed_emails`). Nie zapisuj ich w pliku.
3. Po zakończeniu migracji usuń `data-export/` albo go zaszyfruj:

   ```bash
   rm -rf data-export
   # albo
   tar -cf - data-export | gpg --symmetric --cipher-algo AES256 -o ~/marma-data-export.tar.gpg && rm -rf data-export
   ```

   Usuń też kopię na droplecie (wariant A) i plik `pointsdb-only.sqlite3` (wariant B).

## Testy

```bash
uv run --project scripts/migration pytest scripts/migration -m "not integration"   # jak w CI
```

Test integracyjny importu wymaga lokalnego stacku Supabase i działa tylko, gdy `SUPABASE_DB_URL` wskazuje `127.0.0.1`/`localhost` (test czyści tabele punktów):

```bash
npx supabase start
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  uv run --project scripts/migration pytest scripts/migration
npx supabase stop
```

Bez stacku lub z adresem innym niż lokalny test integracyjny jest pomijany.
