"""Import eksportu (`data-export/`) do Postgres projektu Supabase.

Użycie (connection string z env SUPABASE_DB_URL, ładowany przez direnv z pass):
    uv run --project scripts/migration python scripts/migration/import_to_supabase.py \\
        --export-dir data-export --confirm-host <host z SUPABASE_DB_URL>

Jedna transakcja: TRUNCATE 6 tabel punktów (RESTART IDENTITY CASCADE), INSERT
rodzic → dziecko z zachowanymi id, ustawienie sekwencji identity. Błąd → rollback.
Ponowne uruchomienie daje ten sam stan. Nie dotyka `private.*` ani `auth.*`.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from transform import TARGET_TABLES, TargetRows, TransformError, transform_all

COLUMNS: dict[str, tuple[str, ...]] = {
    "marma_points": ("id", "name", "alt_name", "location", "doshic_subtypes", "doc"),
    "marma_point_functions": ("id", "function_name", "subject_type", "marmani_description"),
    "subjects": ("id", "name"),
    "marma_point_coordinates": ("id", "marma_point_id", "label", "x", "y", "z"),
    "marma_point_subjects": ("id", "marma_point_id", "subject_id", "function_id", "notes"),
    # id nadaje baza (Qdrant nie ma identyfikatorów liczbowych); po RESTART IDENTITY od 1.
    "subject_embeddings": ("subject_id", "is_polish", "embedding"),
}


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def _params(table: str, row: dict) -> tuple:
    from psycopg.types.json import Jsonb

    values = []
    for col in COLUMNS[table]:
        value = row[col]
        if col == "doc":
            value = Jsonb(value)
        elif col == "embedding":
            value = _vector_literal(value)
        values.append(value)
    return tuple(values)


def _insert_sql(table: str) -> str:
    cols = COLUMNS[table]
    placeholders = ", ".join(
        "%s::extensions.vector" if c == "embedding" else "%s" for c in cols
    )
    return f"insert into public.{table} ({', '.join(cols)}) values ({placeholders})"


def import_rows(conn, rows: TargetRows) -> dict[str, int]:
    """Zastępuje zawartość tabel punktów wierszami `rows` w jednej transakcji."""
    with conn.transaction(), conn.cursor() as cur:
        tables = ", ".join(f"public.{t}" for t in TARGET_TABLES)
        cur.execute(f"truncate table {tables} restart identity cascade")
        for table in TARGET_TABLES:  # kolejność rodzic → dziecko
            data = getattr(rows, table)
            if data:
                cur.executemany(_insert_sql(table), [_params(table, r) for r in data])
        for table in TARGET_TABLES:
            # Następna wartość = max(id) + 1 (dla pustej tabeli: 1).
            cur.execute(
                f"select setval(pg_get_serial_sequence('public.{table}', 'id'),"
                f" coalesce((select max(id) from public.{table}), 0) + 1, false)"
            )
    return rows.counts()


def describe_target(db_url: str) -> tuple[str | None, str]:
    """Host i opis celu (host, port, baza) bez hasła i bez pełnego URL."""
    parsed = urlparse(db_url)
    host = parsed.hostname
    try:
        port = parsed.port or 5432
    except ValueError:
        port = "?"
    database = parsed.path.lstrip("/") or "?"
    return host, f"host={host or '?'} port={port} baza={database}"


def main(argv: list[str] | None = None) -> int:
    import psycopg

    from export_files import ExportFormatError, load_export

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--export-dir", type=Path, default=Path("data-export"))
    parser.add_argument(
        "--confirm-host",
        metavar="HOST",
        help="potwierdzenie celu: host z SUPABASE_DB_URL; import zastępuje dane punktów w tej bazie",
    )
    args = parser.parse_args(argv)

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("Brak zmiennej SUPABASE_DB_URL (zob. .envrc).", file=sys.stderr)
        return 2
    host, target = describe_target(db_url)
    print(f"Baza docelowa: {target}")
    if not args.confirm_host:
        print(
            "Import usuwa obecne dane punktów w bazie docelowej. "
            "Dodaj --confirm-host z hostem bazy docelowej.",
            file=sys.stderr,
        )
        return 2
    if not host or args.confirm_host != host:
        print(
            f"BŁĄD: --confirm-host {args.confirm_host!r} nie zgadza się z hostem bazy docelowej "
            f"({host!r}). Nic nie zaimportowano.",
            file=sys.stderr,
        )
        return 2

    try:
        rows, report = transform_all(load_export(args.export_dir))
    except (TransformError, ExportFormatError) as e:
        print(f"BŁĄD danych eksportu (nic nie zaimportowano): {e}", file=sys.stderr)
        return 1

    with psycopg.connect(db_url, autocommit=True) as conn:
        counts = import_rows(conn, rows)
    for table, n in counts.items():
        print(f"{table}: {n}")
    print(
        f"Punkty bez opisu: {len(report.points_without_doc)}, opisy bez punktu: "
        f"{len(report.docs_without_point)}, wektory pominięte: {len(report.orphan_vectors)}."
    )
    print("Dalej: verify_counts.py, potem zmiana hasła bazy (README.md).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
