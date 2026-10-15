#!/usr/bin/env bash
# Strażnik danych: blokuje dodanie do repozytorium danych punktów, eksportów
# i zrzutów baz. Zasady: CLAUDE.md, sekcja „Bezpieczeństwo danych”.
#
# Użycie:
#   scripts/check-no-data.sh --staged       # hook pre-commit: pliki dodane/zmienione w indeksie
#   scripts/check-no-data.sh --all          # wszystkie pliki śledzone (stan indeksu)
#   scripts/check-no-data.sh --range A..B   # CI: każdy plik zmieniony w każdym commicie zakresu
#
# Zawartość jest czytana z git (indeks lub commit), nie z dysku.
set -euo pipefail

MAX_DATA_BYTES=200000
VECTOR_MIN_NUMBERS=50
# Dowolne pole opisu punktu z dokumentu RethinkDB (np. treatment_in_polish).
DESCRIPTION_KEY='[a-z_]+_in_polish'
# Wartość tekstowa tej długości przy polu opisu wygląda jak prawdziwa treść.
DESCRIPTION_VALUE_MIN_CHARS=40

number='-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?'
vector_re="(${number}[[:space:]]*,[[:space:]]*){$((VECTOR_MIN_NUMBERS - 1)),}${number}"
description_value_re="${DESCRIPTION_KEY}[\"']?[[:space:]]*:[[:space:]]*[\"'][^\"']{${DESCRIPTION_VALUE_MIN_CHARS},}"

violations=()
add() { violations+=("$1: $2"); }

# check_file <ścieżka> <obiekt git z zawartością, np. ":ścieżka" lub "sha:ścieżka"> [etykieta]
check_file() {
  local f="$1" obj="$2" label="${3:-$1}" lf content size
  lf="$(tr '[:upper:]' '[:lower:]' <<<"$f")"

  case "$lf" in
    data-export/* | */data-export/*)
      add "$label" "katalog data-export/ nie może trafić do repozytorium"; return ;;
    *.sqlite3 | *.sqlite | *.db | *.snapshot | *.dump | *.bak \
      | *.gz | *.tgz | *.zip | *.7z | *.bz2 | *.xz | *.tar \
      | *.parquet | *.feather | *.npy | *.npz | *.pkl | *.pickle | *.xlsx | *.xls)
      add "$label" "zrzut bazy, archiwum lub binarny plik danych"; return ;;
  esac

  # Binarne pliki mediów (model 3D, obrazy, fonty): bez kontroli treści — dane modelu
  # 3D to też długie tablice liczb. Tekstowy glTF (.gltf) jest sprawdzany normalnie.
  case "$lf" in
    *.glb | *.png | *.jpg | *.jpeg | *.gif | *.webp | *.avif | *.ico | *.woff | *.woff2 | *.ttf | *.otf)
      return ;;
  esac

  content="$(git show "$obj" 2>/dev/null || true)"

  case "$lf" in
    package-lock.json | */package-lock.json | deno.lock | */deno.lock) ;;
    *.json | *.jsonl | *.ndjson | *.csv | *.tsv | *.sql)
      size="$(git cat-file -s "$obj")"
      if [ "$size" -gt "$MAX_DATA_BYTES" ]; then
        add "$label" "plik danych większy niż $MAX_DATA_BYTES B ($size B)"
      fi ;;
  esac

  case "$lf" in
    __fixtures__/synthetic/* | */__fixtures__/synthetic/*) ;;
    *.json | *.jsonl | *.ndjson | *.csv | *.tsv | *.yaml | *.yml)
      if grep -qE "$DESCRIPTION_KEY" <<<"$content"; then
        add "$label" "plik danych zawiera pole opisu punktu (*_in_polish)"
      fi ;;
    *)
      if grep -qE "$description_value_re" <<<"$content"; then
        add "$label" "pole opisu punktu (*_in_polish) z długą wartością tekstową"
      fi ;;
  esac

  # Wektor może być zapisany w wielu liniach (np. json.dump z wcięciami).
  if tr -s '[:space:]' ' ' <<<"$content" | grep -qE "$vector_re"; then
    add "$label" "długa tablica liczb (wygląda jak wektor embeddingu)"
  fi
}

case "${1:-}" in
  --staged)
    while IFS= read -r -d '' f; do check_file "$f" ":$f"; done \
      < <(git diff --cached --name-only --diff-filter=ACMRT -z) ;;
  --all)
    while IFS= read -r -d '' f; do check_file "$f" ":$f"; done < <(git ls-files -z) ;;
  --range)
    range="${2:?Użycie: $0 --range A..B}"
    while read -r sha; do
      while IFS= read -r -d '' f; do
        check_file "$f" "$sha:$f" "$f (commit ${sha:0:7})"
      done < <(git diff-tree -r --root --no-commit-id --name-only -z --diff-filter=ACMRT "$sha")
    done < <(git rev-list "$range") ;;
  *)
    echo "Użycie: $0 --staged | --all | --range A..B" >&2; exit 2 ;;
esac

if [ "${#violations[@]}" -gt 0 ]; then
  echo "Strażnik danych: zablokowano ${#violations[@]} plik(ów):" >&2
  printf '  - %s\n' "${violations[@]}" >&2
  echo "Zobacz CLAUDE.md, sekcja „Procedura po alarmie”." >&2
  exit 1
fi
echo "Strażnik danych: OK"
