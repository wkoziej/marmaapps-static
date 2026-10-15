#!/usr/bin/env bash
# Hook pre-commit (instalowany przez simple-git-hooks przy `npm install`).
# Warstwa 1 ochrony danych; CI powtarza te same kontrole (warstwa 2).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
scripts/check-no-data.sh --staged
if ! command -v gitleaks >/dev/null; then
  echo "Brak gitleaks w PATH. Zainstaluj (README.md, sekcja „Narzędzia”), aby commitować." >&2
  exit 1
fi
gitleaks git --pre-commit --staged --no-banner --redact --config .gitleaks.toml
