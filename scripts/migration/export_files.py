"""Format katalogu eksportu (`data-export/`, wykluczony z git).

    <katalog>/manifest.json            źródła i liczby rekordów
    <katalog>/sqlite/<tabela>.jsonl    wiersze tabel pointsdb_*
    <katalog>/rethinkdb_docs.jsonl     dokumenty opisów punktów
    <katalog>/qdrant_points.jsonl      {"id", "payload", "vector"}
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from transform import SQLITE_TABLES, SourceData

MANIFEST = "manifest.json"
RETHINK_FILE = "rethinkdb_docs.jsonl"
QDRANT_FILE = "qdrant_points.jsonl"


class ExportFormatError(Exception):
    pass


def _strict_default(value):
    raise TypeError(
        f"Wartość typu {type(value).__name__} nie ma reprezentacji JSON; "
        "eksport przerwany, aby nie zmieniać danych po cichu"
    )


def write_jsonl(path: Path, records: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False, default=_strict_default))
            f.write("\n")
            count += 1
    return count


def read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def write_manifest(export_dir: Path, manifest: dict) -> None:
    path = export_dir / MANIFEST
    current = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    current.update(manifest)
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")


def load_export(export_dir: Path) -> SourceData:
    manifest_path = export_dir / MANIFEST
    if not manifest_path.exists():
        raise ExportFormatError(f"Brak {manifest_path}; uruchom najpierw eksport")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for section in ("sqlite", "rethinkdb", "qdrant"):
        if section not in manifest:
            raise ExportFormatError(f"Eksport niepełny: brak części {section!r} w manifeście")

    sqlite = {t: read_jsonl(export_dir / "sqlite" / f"{t}.jsonl") for t in SQLITE_TABLES}
    data = SourceData(
        sqlite=sqlite,
        docs=read_jsonl(export_dir / RETHINK_FILE),
        doc_key=manifest["rethinkdb"]["primary_key"],
        qdrant_points=read_jsonl(export_dir / QDRANT_FILE),
    )

    # Plik niezgodny z manifestem = przerwany lub ręcznie zmieniony eksport.
    actual = {f"sqlite.{t}": len(rows) for t, rows in sqlite.items()}
    actual["rethinkdb"] = len(data.docs)
    actual["qdrant"] = len(data.qdrant_points)
    declared = {f"sqlite.{t}": n for t, n in manifest["sqlite"]["counts"].items()}
    declared["rethinkdb"] = manifest["rethinkdb"]["count"]
    declared["qdrant"] = manifest["qdrant"]["count"]
    diff = sorted(k for k in actual if actual[k] != declared.get(k))
    if diff:
        raise ExportFormatError(f"Liczby rekordów niezgodne z manifestem: {diff}")
    return data
