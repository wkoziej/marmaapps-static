"""Weryfikacja migracji: liczby rekordów w źródle (eksport) i w Supabase.

Użycie (connection string z env SUPABASE_DB_URL):
    uv run --project scripts/migration python scripts/migration/verify_counts.py --export-dir data-export

Raport zawiera tylko liczby, nazwy punktów i identyfikatory (bez opisów).
Kod wyjścia 1, gdy liczba w dowolnej tabeli się różni; 2 przy błędzie konfiguracji.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from transform import TARGET_TABLES, Report, transform_all

DOC_COUNT_KEY = "marma_points.doc"


def expected_counts(report: Report) -> dict[str, int]:
    """Liczby oczekiwane w Supabase = liczby rekordów źródłowych.

    Rekordy pominięte w transformacji (np. wektor do nieistniejącego tematu) dają różnicę.
    """
    counts = {t: report.source_counts[t] for t in TARGET_TABLES}
    counts[DOC_COUNT_KEY] = report.source_counts["marma_points"] - len(report.points_without_doc)
    return counts


def compare_counts(
    expected: dict[str, int], actual: dict[str, int]
) -> list[tuple[str, int, int | None]]:
    return [
        (table, n, actual.get(table))
        for table, n in expected.items()
        if actual.get(table) != n
    ]


def verify(expected: dict[str, int], actual: dict[str, int], report: Report) -> tuple[int, str]:
    lines = ["Tabela                      źródło   Supabase"]
    for table, n in expected.items():
        got = actual.get(table)
        mark = "" if got == n else "  <-- RÓŻNICA"
        lines.append(f"{table:<27} {n:>6}   {got if got is not None else '-':>8}{mark}")
    lines.append(f"{'dokumenty RethinkDB':<27} {report.source_counts['rethinkdb_docs']:>6}")

    def section(title: str, items: list[str]) -> None:
        lines.append(f"{title}: {len(items)}")
        lines.extend(f"  - {item}" for item in items)

    section("Punkty bez opisu (doc = {})", report.points_without_doc)
    section("Opisy bez punktu (pominięte)", report.docs_without_point)
    section(
        "Wektory do nieistniejącego tematu (pominięte)",
        [f"qdrant_id={o['qdrant_id']} subject_id={o['subject_id']}" for o in report.orphan_vectors],
    )
    section(
        "Duplikaty (temat, język) w Qdrant (zaimportowane)",
        [
            f"subject_id={d['subject_id']} is_polish={d['is_polish']} qdrant_ids={d['qdrant_ids']}"
            for d in report.duplicate_vectors
        ],
    )

    mismatches = compare_counts(expected, actual)
    if mismatches:
        lines.append("BŁĄD: różne liczby w tabelach: " + ", ".join(t for t, _, _ in mismatches))
        return 1, "\n".join(lines)
    lines.append("OK: liczby w źródle i w Supabase są równe.")
    return 0, "\n".join(lines)


def fetch_target_counts(conn) -> dict[str, int]:
    counts = {}
    with conn.cursor() as cur:
        for table in TARGET_TABLES:
            cur.execute(f"select count(*) from public.{table}")
            counts[table] = cur.fetchone()[0]
        cur.execute("select count(*) from public.marma_points where doc <> '{}'::jsonb")
        counts[DOC_COUNT_KEY] = cur.fetchone()[0]
    return counts


def main(argv: list[str] | None = None) -> int:
    import psycopg

    from export_files import load_export

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--export-dir", type=Path, default=Path("data-export"))
    args = parser.parse_args(argv)

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("Brak zmiennej SUPABASE_DB_URL (zob. .envrc).", file=sys.stderr)
        return 2

    _, report = transform_all(load_export(args.export_dir))
    with psycopg.connect(db_url) as conn:
        actual = fetch_target_counts(conn)
    code, text = verify(expected_counts(report), actual, report)
    print(text)
    return code


if __name__ == "__main__":
    sys.exit(main())
