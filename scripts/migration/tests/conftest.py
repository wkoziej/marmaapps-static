"""Ścieżki importu i marker: testy działają także z katalogu głównego repozytorium
(`uv run --project scripts/migration pytest`), gdy pytest nie czyta pyproject.toml tego projektu."""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
for path in (HERE.parent, HERE):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: wymaga lokalnego stacku Supabase (SUPABASE_DB_URL na 127.0.0.1/localhost)"
    )
