"""Eksport danych punktów z dropletu do `data-export/` (wykluczony z git).

Źródła (domyślne nazwy z kodu djangoapp/pointsdb/server_utils.py):
- SQLite Django: TYLKO tabele pointsdb_* z jawnej listy (transform.SQLITE_TABLES).
  Tabele kont i płatności (auth_*, Stripe) nie są czytane.
- RethinkDB: baza `marmaapp`, tabela `marma_points` (klucz główny = nazwa punktu).
- Qdrant: kolekcja `subjects_openai`, scroll z wektorami i payloadem, z paginacją.

Parametry połączeń przez argumenty lub env; hasła tylko przez env
(RETHINKDB_PASSWORD, QDRANT_API_KEY). Instrukcja: scripts/migration/README.md.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from export_files import QDRANT_FILE, RETHINK_FILE, write_jsonl, write_manifest
from transform import SQLITE_TABLES


class ExportError(Exception):
    pass


def export_sqlite(db_path: Path, export_dir: Path) -> dict[str, int]:
    db_path = Path(db_path)
    if not db_path.is_file():
        raise ExportError(f"Brak pliku SQLite: {db_path}")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    counts = {}
    try:
        for table in SQLITE_TABLES:  # lista jawna; nigdy zapytań o inne tabele
            try:
                cur = conn.execute(f'select * from "{table}" order by id')
            except sqlite3.OperationalError as e:
                raise ExportError(f"Nie można odczytać tabeli {table}: {e}") from e
            counts[table] = write_jsonl(
                export_dir / "sqlite" / f"{table}.jsonl", (dict(row) for row in cur)
            )
    finally:
        conn.close()
    write_manifest(export_dir, {"sqlite": {"counts": counts}})
    return counts


def fetch_rethink_docs(host, port, db, table, user, password) -> tuple[list[dict], str]:
    from rethinkdb import r

    conn = r.connect(host=host, port=port, db=db, user=user, password=password)
    try:
        primary_key = r.db(db).table(table).info().run(conn)["primary_key"]
        docs = list(r.db(db).table(table).run(conn))
    finally:
        conn.close()
    return docs, primary_key


def write_rethink_docs(docs, primary_key, db, table, export_dir: Path) -> int:
    ordered = sorted(docs, key=lambda d: str(d.get(primary_key)))
    count = write_jsonl(export_dir / RETHINK_FILE, ordered)
    write_manifest(
        export_dir,
        {"rethinkdb": {"db": db, "table": table, "primary_key": primary_key, "count": count}},
    )
    return count


def export_qdrant(client, collection: str, export_dir: Path, page_size: int = 256) -> int:
    def pages():
        offset = None
        while True:
            points, offset = client.scroll(
                collection_name=collection,
                limit=page_size,
                offset=offset,
                with_payload=True,
                with_vectors=True,
            )
            for p in points:
                yield {"id": p.id, "payload": p.payload, "vector": p.vector}
            if offset is None:
                return

    count = write_jsonl(export_dir / QDRANT_FILE, pages())
    write_manifest(export_dir, {"qdrant": {"collection": collection, "count": count}})
    return count


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--export-dir", type=Path, default=Path("data-export"))
    parser.add_argument(
        "--sources",
        default="sqlite,rethinkdb,qdrant",
        help="lista źródeł oddzielona przecinkami (domyślnie wszystkie)",
    )
    parser.add_argument("--sqlite-path", type=Path, help="plik bazy Django (np. prod-db.sqlite3)")
    parser.add_argument("--rethinkdb-host", default=os.getenv("RETHINKDB_HOST", "127.0.0.1"))
    parser.add_argument("--rethinkdb-port", type=int, default=int(os.getenv("RETHINKDB_PORT", "28015")))
    parser.add_argument("--rethinkdb-db", default="marmaapp")
    parser.add_argument("--rethinkdb-table", default="marma_points")
    parser.add_argument("--rethinkdb-user", default=os.getenv("RETHINKDB_USER", "admin"))
    parser.add_argument("--qdrant-host", default=os.getenv("QDRANT_HOST", "127.0.0.1"))
    parser.add_argument("--qdrant-port", type=int, default=int(os.getenv("QDRANT_PORT", "6333")))
    parser.add_argument("--qdrant-collection", default="subjects_openai")
    parser.add_argument("--qdrant-page-size", type=int, default=256)
    args = parser.parse_args(argv)

    sources = {s.strip() for s in args.sources.split(",") if s.strip()}
    unknown = sources - {"sqlite", "rethinkdb", "qdrant"}
    if unknown:
        parser.error(f"nieznane źródła: {sorted(unknown)}")

    args.export_dir.mkdir(parents=True, exist_ok=True)
    write_manifest(args.export_dir, {"exported_at": datetime.now(timezone.utc).isoformat()})

    if "sqlite" in sources:
        if not args.sqlite_path:
            parser.error("--sqlite-path jest wymagane dla źródła sqlite")
        for table, n in export_sqlite(args.sqlite_path, args.export_dir).items():
            print(f"SQLite {table}: {n}")
    if "rethinkdb" in sources:
        docs, pk = fetch_rethink_docs(
            args.rethinkdb_host,
            args.rethinkdb_port,
            args.rethinkdb_db,
            args.rethinkdb_table,
            args.rethinkdb_user,
            os.getenv("RETHINKDB_PASSWORD", ""),
        )
        n = write_rethink_docs(docs, pk, args.rethinkdb_db, args.rethinkdb_table, args.export_dir)
        print(f"RethinkDB {args.rethinkdb_db}.{args.rethinkdb_table} (klucz {pk!r}): {n}")
    if "qdrant" in sources:
        from qdrant_client import QdrantClient

        client = QdrantClient(
            host=args.qdrant_host, port=args.qdrant_port, api_key=os.getenv("QDRANT_API_KEY") or None,
            https=False,
        )
        n = export_qdrant(client, args.qdrant_collection, args.export_dir, args.qdrant_page_size)
        print(f"Qdrant {args.qdrant_collection}: {n}")
    print(f"Zapisano do {args.export_dir}/ (nie dodawaj do git).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ExportError as e:
        print(f"BŁĄD eksportu: {e}", file=sys.stderr)
        sys.exit(1)
