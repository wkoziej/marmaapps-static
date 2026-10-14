#!/usr/bin/env bash
# Strażnik danych: blokuje dodanie do repozytorium danych punktów, eksportów
# i zrzutów baz. Zasady: CLAUDE.md, sekcja „Bezpieczeństwo danych”.
#
# Użycie:
#   scripts/check-no-data.sh --staged   # hook pre-commit: pliki dodane/zmienione w indeksie
#   scripts/check-no-data.sh --all      # CI: wszystkie pliki śledzone
#
# Zawartość jest zawsze czytana z indeksu git (to, co trafi do commita).
set -euo pipefail

MAX_JSON_BYTES=200000
VECTOR_MIN_NUMBERS=50
DESCRIPTION_KEYS='treatment_in_polish|commentary_in_polish'

mode="${1:-}"
case "$mode" in
  --staged) list_files() { git diff --cached --name-only --diff-filter=ACMR -z; } ;;
  --all) list_files() { git ls-files -z; } ;;
  *) echo "Użycie: $0 --staged|--all" >&2; exit 2 ;;
esac

violations=()
add() { violations+=("$1: $2"); }

vector_re="(-?[0-9]+(\.[0-9]+)?([eE]-?[0-9]+)?[[:space:]]*,[[:space:]]*){${VECTOR_MIN_NUMBERS},}"

while IFS= read -r -d '' f; do
  case "$f" in
    data-export/* | */data-export/*) add "$f" "katalog data-export/ nie może trafić do repozytorium"; continue ;;
  esac
  case "$f" in
    *.sqlite3 | *.sqlite | *.db | *.snapshot | *.tar.gz | *.tgz | *.dump)
      add "$f" "zrzut bazy lub archiwum danych"; continue ;;
  esac

  content="$(git show ":$f" 2>/dev/null || true)"

  case "$f" in
    package-lock.json | */package-lock.json | deno.lock | */deno.lock) ;;
    *.json | *.jsonl | *.ndjson)
      size="$(git cat-file -s ":$f")"
      if [ "$size" -gt "$MAX_JSON_BYTES" ]; then
        add "$f" "plik JSON większy niż $MAX_JSON_BYTES B ($size B)"
      fi ;;
  esac

  case "$f" in
    */__fixtures__/synthetic/*) ;;
    *.json | *.jsonl | *.ndjson | *.csv | *.tsv)
      if grep -qE "\"?($DESCRIPTION_KEYS)\"?" <<<"$content"; then
        add "$f" "plik danych zawiera pole opisu punktu ($DESCRIPTION_KEYS)"
      fi ;;
  esac

  if grep -qE "$vector_re" <<<"$content"; then
    add "$f" "długa tablica liczb (wygląda jak wektor embeddingu)"
  fi
done < <(list_files)

if [ "${#violations[@]}" -gt 0 ]; then
  echo "Strażnik danych: zablokowano ${#violations[@]} plik(ów):" >&2
  printf '  - %s\n' "${violations[@]}" >&2
  echo "Zobacz CLAUDE.md, sekcja „Procedura po alarmie”." >&2
  exit 1
fi
echo "Strażnik danych: OK"
