#!/usr/bin/env bash
# Testy strażnika danych (scripts/check-no-data.sh) na syntetycznych plikach.
# Każdy przypadek tworzy osobne, tymczasowe repozytorium git.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUARD="$ROOT/scripts/check-no-data.sh"
PASS=0
FAIL=0

new_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q -b main
  git -C "$dir" config user.email test@example.invalid
  git -C "$dir" config user.name test
  echo "$dir"
}

# expect <nazwa> <oczekiwany kod: 0|1> <tryb> <katalog> [fragment komunikatu]
expect() {
  local name="$1" want="$2" mode="$3" dir="$4" needle="${5:-}"
  local out code
  out="$(cd "$dir" && "$GUARD" "$mode" 2>&1)"
  code=$?
  if [ "$want" = 0 ] && [ "$code" -ne 0 ]; then
    echo "FAIL: $name (kod $code, oczekiwano 0)"; echo "$out"; FAIL=$((FAIL + 1)); return
  fi
  if [ "$want" = 1 ] && [ "$code" -eq 0 ]; then
    echo "FAIL: $name (kod 0, oczekiwano błędu)"; FAIL=$((FAIL + 1)); return
  fi
  if [ -n "$needle" ] && ! grep -qF -- "$needle" <<<"$out"; then
    echo "FAIL: $name (brak '$needle' w komunikacie)"; echo "$out"; FAIL=$((FAIL + 1)); return
  fi
  echo "ok: $name"; PASS=$((PASS + 1))
}

long_vector() {
  local i out="["
  for i in $(seq 1 64); do out+="0.0$i, "; done
  echo "${out}0.5]"
}

# Happy path: repozytorium bez plików danych.
r="$(new_repo)"
mkdir -p "$r/src"
echo 'export const a = 1;' >"$r/src/a.js"
echo '{"name": "marmaapps-static"}' >"$r/package.json"
git -C "$r" add -A
expect "czyste repo (--staged)" 0 --staged "$r"
git -C "$r" commit -q -m init
expect "czyste repo (--all)" 0 --all "$r"

# Error path: plik SQLite.
r="$(new_repo)"
echo x >"$r/x.sqlite3"
git -C "$r" add -A
expect "plik .sqlite3" 1 --staged "$r" "x.sqlite3"

# Error path: inne binarne zrzuty danych.
for f in qdrant.snapshot backup.tar.gz db.dump; do
  r="$(new_repo)"
  echo x >"$r/$f"
  git -C "$r" add -A
  expect "plik $f" 1 --staged "$r" "$f"
done

# Error path: cokolwiek w data-export/ (np. dodane przez git add -f).
r="$(new_repo)"
mkdir -p "$r/data-export"
echo 'a,b' >"$r/data-export/points.csv"
git -C "$r" add -f -A
expect "plik w data-export/" 1 --staged "$r" "data-export/points.csv"

# Error path: JSON z polem opisu poza katalogiem syntetycznych fixture.
r="$(new_repo)"
mkdir -p "$r/e2e/fixtures"
echo '{"Tala": {"treatment_in_polish": "x"}}' >"$r/e2e/fixtures/points.json"
git -C "$r" add -A
expect "JSON z treatment_in_polish" 1 --staged "$r" "e2e/fixtures/points.json"

r="$(new_repo)"
echo '{"commentary_in_polish": "x"}' >"$r/doc.json"
git -C "$r" add -A
expect "JSON z commentary_in_polish" 1 --staged "$r" "doc.json"

# Edge case: to samo pole w syntetycznym fixture jest dozwolone.
r="$(new_repo)"
mkdir -p "$r/src/features/search/__fixtures__/synthetic"
echo '{"treatment_in_polish": "syntetyczny opis"}' >"$r/src/features/search/__fixtures__/synthetic/doc.json"
git -C "$r" add -A
expect "pole opisu w __fixtures__/synthetic" 0 --staged "$r"

# Edge case: nazwa pola w kodzie źródłowym (nie dane) jest dozwolona.
r="$(new_repo)"
echo 'const t = doc.treatment_in_polish;' >"$r/SearchView.js"
git -C "$r" add -A
expect "nazwa pola w kodzie .js" 0 --staged "$r"

# Error path: długi wektor liczb (embedding) w dowolnym pliku.
r="$(new_repo)"
echo "{\"vector\": $(long_vector)}" >"$r/vectors.json"
git -C "$r" add -A
expect "długi wektor w JSON" 1 --staged "$r" "vectors.json"

r="$(new_repo)"
echo "select '$(long_vector)'::vector;" >"$r/seed.sql"
git -C "$r" add -A
expect "długi wektor w SQL" 1 --staged "$r" "seed.sql"

# Edge case: krótki wektor testowy w katalogu testów jest dozwolony.
r="$(new_repo)"
mkdir -p "$r/supabase/tests"
echo "select '[0.1, 0.2, 0.3]'::vector;" >"$r/supabase/tests/search.test.sql"
git -C "$r" add -A
expect "krótki wektor testowy" 0 --staged "$r"

# Error path: duży plik JSON (powyżej progu).
r="$(new_repo)"
head -c 300000 /dev/zero | tr '\0' 'a' | sed 's/^/{"x": "/; s/$/"}/' >"$r/big.json"
git -C "$r" add -A
expect "duży JSON" 1 --staged "$r" "big.json"

# Edge case: package-lock.json może być duży.
r="$(new_repo)"
head -c 300000 /dev/zero | tr '\0' 'a' | sed 's/^/{"x": "/; s/$/"}/' >"$r/package-lock.json"
git -C "$r" add -A
expect "duży package-lock.json" 0 --staged "$r"

# Edge case: --staged sprawdza zawartość z indeksu, nie z dysku.
r="$(new_repo)"
echo '{"treatment_in_polish": "x"}' >"$r/doc.json"
git -C "$r" add -A
echo '{}' >"$r/doc.json"
expect "zawartość z indeksu" 1 --staged "$r" "doc.json"

# Edge case: usunięcie zakazanego pliku nie jest blokowane.
r="$(new_repo)"
echo x >"$r/old.sqlite3"
git -C "$r" add -A
git -C "$r" commit -q -m old --no-verify
git -C "$r" rm -q old.sqlite3
expect "usunięcie pliku .sqlite3" 0 --staged "$r"

# Error path: --all znajduje zakazany plik już w historii indeksu.
r="$(new_repo)"
echo x >"$r/db.sqlite3"
git -C "$r" add -A
git -C "$r" commit -q -m bad --no-verify
expect "--all znajduje .sqlite3" 1 --all "$r" "db.sqlite3"

# --- Przypadki z przeglądu PR #1 ---

pretty_vector() {
  local i
  echo '['
  for i in $(seq 1 99); do echo "  0.0$i,"; done
  echo '  0.5'
  echo ']'
}

# Error path: wektor zapisany w wielu liniach (json.dump indent=2).
r="$(new_repo)"
{ echo '{"vector":'; pretty_vector; echo '}'; } >"$r/vec.json"
git -C "$r" add -A
expect "wektor w wielu liniach" 1 --staged "$r" "vec.json"

# Granica: dokładnie 50 liczb → blokada, 49 → dozwolone.
r="$(new_repo)"
echo "[$(seq -s ', ' 1 50 | sed 's/\([0-9]\+\)/0.\1/g')]" >"$r/v50.txt"
git -C "$r" add -A
expect "50 liczb" 1 --staged "$r" "v50.txt"
r="$(new_repo)"
echo "[$(seq -s ', ' 1 49 | sed 's/\([0-9]\+\)/0.\1/g')]" >"$r/v49.txt"
git -C "$r" add -A
expect "49 liczb" 0 --staged "$r"

# Error path: opis punktu w seed SQL (jsonb z długą wartością).
long_text="To jest długi opis punktu, który wygląda jak prawdziwa treść z bazy danych."
r="$(new_repo)"
mkdir -p "$r/supabase"
echo "insert into points (doc) values ('{\"treatment_in_polish\": \"$long_text\"}');" >"$r/supabase/seed.sql"
git -C "$r" add -A
expect "opis w seed.sql" 1 --staged "$r" "supabase/seed.sql"

# Error path: opis punktu w fixture JS poza __fixtures__/synthetic/.
r="$(new_repo)"
echo "export const doc = { indications_in_polish: '$long_text' };" >"$r/fix.test.js"
git -C "$r" add -A
expect "opis w fixture .js" 1 --staged "$r" "fix.test.js"

# Edge case: krótka syntetyczna wartość w teście SQL jest dozwolona.
r="$(new_repo)"
mkdir -p "$r/supabase/tests"
echo "select '{\"location_in_polish\": \"Głowa\"}'::jsonb;" >"$r/supabase/tests/rls.test.sql"
git -C "$r" add -A
expect "krótka wartość w teście SQL" 0 --staged "$r"

# Edge case: długi opis w fixture JS wewnątrz __fixtures__/synthetic/ jest dozwolony.
r="$(new_repo)"
mkdir -p "$r/__fixtures__/synthetic"
echo "export const doc = { treatment_in_polish: '$long_text' };" >"$r/__fixtures__/synthetic/doc.js"
git -C "$r" add -A
expect "synthetic w katalogu głównym" 0 --staged "$r"

# Error path: pola opisu w .csv i .jsonl.
for f in points.csv points.jsonl; do
  r="$(new_repo)"
  echo 'name,commentary_in_polish' >"$r/$f"
  git -C "$r" add -A
  expect "pole opisu w $f" 1 --staged "$r" "$f"
done

# Error path: wielkie litery w rozszerzeniach.
r="$(new_repo)"
echo x >"$r/DB.SQLITE3"
git -C "$r" add -A
expect "rozszerzenie .SQLITE3" 1 --staged "$r" "DB.SQLITE3"
r="$(new_repo)"
echo '{"treatment_in_polish": "x"}' >"$r/D.JSON"
git -C "$r" add -A
expect "rozszerzenie .JSON" 1 --staged "$r" "D.JSON"

# Error path: inne formaty archiwów i danych.
for f in dump.sql.gz export.zip points.parquet vec.npy data.pkl db.bak; do
  r="$(new_repo)"
  echo x >"$r/$f"
  git -C "$r" add -A
  expect "plik $f" 1 --staged "$r" "$f"
done

# Error path: --range znajduje plik dodany i usunięty w zakresie commitów.
r="$(new_repo)"
echo a >"$r/a.txt"
git -C "$r" add -A
git -C "$r" commit -q -m base
base="$(git -C "$r" rev-parse HEAD)"
echo x >"$r/leak.sqlite3"
git -C "$r" add -A
git -C "$r" commit -q -m leak --no-verify
git -C "$r" rm -q leak.sqlite3
git -C "$r" commit -q -m remove --no-verify
out="$(cd "$r" && "$GUARD" --range "$base..HEAD" 2>&1)"; code=$?
if [ "$code" -ne 0 ] && grep -qF "leak.sqlite3" <<<"$out"; then
  echo "ok: --range znajduje plik usunięty później"; PASS=$((PASS + 1))
else
  echo "FAIL: --range nie znalazł leak.sqlite3 (kod $code)"; echo "$out"; FAIL=$((FAIL + 1))
fi
out="$(cd "$r" && "$GUARD" --range "HEAD~1..HEAD" 2>&1)"; code=$?
if [ "$code" -eq 0 ]; then
  echo "ok: --range bez wycieku w zakresie"; PASS=$((PASS + 1))
else
  echo "FAIL: --range HEAD~1..HEAD (kod $code)"; echo "$out"; FAIL=$((FAIL + 1))
fi

# Error path: nieznany tryb.
r="$(new_repo)"
(cd "$r" && "$GUARD" --bad >/dev/null 2>&1); code=$?
if [ "$code" -eq 2 ]; then
  echo "ok: nieznany tryb → kod 2"; PASS=$((PASS + 1))
else
  echo "FAIL: nieznany tryb (kod $code)"; FAIL=$((FAIL + 1))
fi

# Error path: gitleaks blokuje ciąg wyglądający jak klucz API.
if command -v gitleaks >/dev/null; then
  r="$(new_repo)"
  key="sk-proj-$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)T3BlbkFJ$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)"
  echo "OPENAI_API_KEY=$key" >"$r/config.env"
  git -C "$r" add -A
  if (cd "$r" && gitleaks git --pre-commit --staged --no-banner --config "$ROOT/.gitleaks.toml" >/dev/null 2>&1); then
    echo "FAIL: gitleaks przepuścił klucz API"; FAIL=$((FAIL + 1))
  else
    echo "ok: gitleaks blokuje klucz API"; PASS=$((PASS + 1))
  fi

  # Edge case: klucz publishable Supabase jest publiczny z założenia.
  r="$(new_repo)"
  echo "VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)" >"$r/.env.production"
  git -C "$r" add -A
  if (cd "$r" && gitleaks git --pre-commit --staged --no-banner --config "$ROOT/.gitleaks.toml" >/dev/null 2>&1); then
    echo "ok: gitleaks przepuszcza klucz publishable"; PASS=$((PASS + 1))
  else
    echo "FAIL: gitleaks zablokował klucz publishable"; FAIL=$((FAIL + 1))
  fi

  # Error path: klucz secret Supabase jest blokowany.
  r="$(new_repo)"
  echo "SUPABASE_SECRET_KEY=sb_secret_$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)" >"$r/config.env"
  git -C "$r" add -A
  if (cd "$r" && gitleaks git --pre-commit --staged --no-banner --config "$ROOT/.gitleaks.toml" >/dev/null 2>&1); then
    echo "FAIL: gitleaks przepuścił klucz secret Supabase"; FAIL=$((FAIL + 1))
  else
    echo "ok: gitleaks blokuje klucz secret Supabase"; PASS=$((PASS + 1))
  fi
else
  echo "FAIL: brak gitleaks w PATH"; FAIL=$((FAIL + 1))
fi

echo "---"
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
