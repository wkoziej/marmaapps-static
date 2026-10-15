"""Format katalogu eksportu (`data-export/`, wykluczony z git).

    <katalog>/manifest.json            źródła i liczby rekordów
    <katalog>/sqlite/<tabela>.jsonl    wiersze tabel pointsdb_*
    <katalog>/rethinkdb_docs.jsonl     dokumenty opisów punktów
    <katalog>/qdrant_points.jsonl      {"id", "payload", "vector"}
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from transform import SQLITE_TABLES, SourceData

MANIFEST = "manifest.json"
RETHINK_FILE = "rethinkdb_docs.jsonl"
QDRANT_FILE = "qdrant_points.jsonl"


class ExportFormatError(Exception):
    """Katalog eksportu jest niepełny lub uszkodzony."""


class ExportError(Exception):
    """Eksport ze źródła przerwany (np. wartość bez reprezentacji JSON)."""


DIR_MODE = 0o700
FILE_MODE = 0o600


def ensure_private_dir(path: Path) -> None:
    """Tworzy katalog i brakujących rodziców z prawami 0700 (tylko właściciel)."""
    missing = []
    while not path.exists():
        missing.append(path)
        path = path.parent
    for p in reversed(missing):
        p.mkdir(mode=DIR_MODE)
        p.chmod(DIR_MODE)  # mode w mkdir podlega umask


def _open_private(path: Path):
    ensure_private_dir(path.parent)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, FILE_MODE)
    os.fchmod(fd, FILE_MODE)  # plik mógł już istnieć z innymi prawami
    return os.fdopen(fd, "w", encoding="utf-8")


def write_jsonl(path: Path, records: Iterable[dict], source: str | None = None) -> int:
    source = source or path.name

    def strict_default(value):
        raise ExportError(
            f"{source}: wartość typu {type(value).__name__} nie ma reprezentacji JSON; "
            "eksport przerwany, aby nie zmieniać danych po cichu"
        )

    count = 0
    with _open_private(path) as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False, default=strict_default))
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
    with _open_private(path) as f:
        f.write(json.dumps(current, ensure_ascii=False, indent=2))


def load_export(export_dir: Path) -> SourceData:
    try:
        return _load_export(export_dir)
    except (OSError, ValueError, KeyError, TypeError) as e:
        # ValueError obejmuje json.JSONDecodeError i UnicodeDecodeError.
        raise ExportFormatError(f"Nie można wczytać eksportu z {export_dir}: {type(e).__name__}: {e}") from e


def _load_export(export_dir: Path) -> SourceData:
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
