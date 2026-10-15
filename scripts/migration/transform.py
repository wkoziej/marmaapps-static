"""Czyste funkcje: rekordy źródłowe (SQLite, RethinkDB, Qdrant) → wiersze tabel Supabase.

Bez I/O. Wejście: `SourceData` (wczytane z `data-export/`), wyjście: `TargetRows` i `Report`.
Raport zawiera tylko liczby, nazwy punktów i identyfikatory, nigdy treść opisów.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

EMBEDDING_DIM = 1536

# Tabela Django (SQLite) → tabela Supabase i kolumny przenoszone 1:1.
# Eksport czyta tylko tabele z tej listy (export_from_droplet.py).
SQLITE_TABLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "pointsdb_marmapoint": (
        "marma_points",
        ("id", "name", "alt_name", "location", "doshic_subtypes"),
    ),
    "pointsdb_marmapointcoordinates": (
        "marma_point_coordinates",
        ("id", "marma_point_id", "label", "x", "y", "z"),
    ),
    "pointsdb_marmapointfunction": (
        "marma_point_functions",
        ("id", "function_name", "subject_type", "marmani_description"),
    ),
    "pointsdb_subject": ("subjects", ("id", "name")),
    "pointsdb_marmapointsubject": (
        "marma_point_subjects",
        ("id", "marma_point_id", "subject_id", "function_id", "notes"),
    ),
}

# Kolejność rodzic → dziecko (import); TRUNCATE obejmuje wszystkie.
TARGET_TABLES: tuple[str, ...] = (
    "marma_points",
    "marma_point_functions",
    "subjects",
    "marma_point_coordinates",
    "marma_point_subjects",
    "subject_embeddings",
)


class TransformError(Exception):
    """Dane źródłowe nie dają się przenieść (np. wektor o złej długości)."""


@dataclass
class SourceData:
    sqlite: dict[str, list[dict]]
    docs: list[dict]
    doc_key: str
    qdrant_points: list[dict]


@dataclass
class TargetRows:
    marma_points: list[dict] = field(default_factory=list)
    marma_point_functions: list[dict] = field(default_factory=list)
    subjects: list[dict] = field(default_factory=list)
    marma_point_coordinates: list[dict] = field(default_factory=list)
    marma_point_subjects: list[dict] = field(default_factory=list)
    subject_embeddings: list[dict] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {t: len(getattr(self, t)) for t in TARGET_TABLES}


@dataclass
class Report:
    source_counts: dict[str, int] = field(default_factory=dict)
    points_without_doc: list[str] = field(default_factory=list)
    docs_without_point: list[str] = field(default_factory=list)
    orphan_vectors: list[dict] = field(default_factory=list)
    duplicate_vectors: list[dict] = field(default_factory=list)


def _pick(row: dict, columns: tuple[str, ...], table: str) -> dict:
    missing = [c for c in columns if c not in row]
    if missing:
        raise TransformError(
            f"{table}: rekord id={row.get('id')!r} nie ma kolumn {missing}"
        )
    return {c: row[c] for c in columns}


def transform_sqlite_table(table: str, rows: list[dict]) -> list[dict]:
    _, columns = SQLITE_TABLES[table]
    return sorted((_pick(r, columns, table) for r in rows), key=lambda r: r["id"])


def attach_docs(
    points: list[dict], docs: list[dict], doc_key: str
) -> tuple[list[dict], list[str], list[str]]:
    """Dokument RethinkDB → kolumna `doc` punktu o tej samej nazwie.

    Zwraca (punkty z `doc`, nazwy punktów bez dokumentu, klucze dokumentów bez punktu).
    """
    docs_by_name: dict[str, dict] = {}
    for doc in docs:
        if doc_key not in doc:
            raise TransformError(f"Dokument RethinkDB bez klucza {doc_key!r}")
        docs_by_name[doc[doc_key]] = doc

    names = {p["name"] for p in points}
    result, without_doc = [], []
    for point in points:
        doc = docs_by_name.get(point["name"])
        if doc is None:
            without_doc.append(point["name"])
        result.append({**point, "doc": dict(doc) if doc is not None else {}})
    without_point = sorted(str(k) for k in docs_by_name if k not in names)
    return result, sorted(without_doc), without_point


def _subject_id(point: dict) -> int:
    try:
        raw = point["payload"]["metadata"]["id"]
    except (KeyError, TypeError):
        raise TransformError(
            f"Punkt Qdrant {point.get('id')!r}: brak payload.metadata.id"
        ) from None
    if isinstance(raw, bool):
        raise TransformError(f"Punkt Qdrant {point.get('id')!r}: metadata.id={raw!r}")
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise TransformError(
            f"Punkt Qdrant {point.get('id')!r}: metadata.id={raw!r} nie jest liczbą"
        ) from None


def _embedding(point: dict) -> list[float]:
    vec = point.get("vector")
    if not isinstance(vec, list):
        raise TransformError(
            f"Punkt Qdrant {point.get('id')!r}: wektor nie jest listą liczb "
            f"(typ {type(vec).__name__}; nazwane wektory nie są obsługiwane)"
        )
    if len(vec) != EMBEDDING_DIM:
        raise TransformError(
            f"Punkt Qdrant {point.get('id')!r}: wektor ma długość {len(vec)}, "
            f"oczekiwano {EMBEDDING_DIM}"
        )
    return [float(v) for v in vec]


def transform_vectors(
    qdrant_points: list[dict], subject_ids: set[int]
) -> tuple[list[dict], list[dict], list[dict]]:
    """Punkty Qdrant → wiersze `subject_embeddings` (bez id: nadaje je baza).

    Brak `payload.is_polish` oznacza wersję EN (oryginał; flagę ma tylko tłumaczenie).
    Zwraca (wiersze, wektory do nieistniejących tematów, duplikaty (temat, język)).
    """
    rows_with_ids, orphans = [], []
    for point in qdrant_points:
        subject_id = _subject_id(point)
        embedding = _embedding(point)
        if subject_id not in subject_ids:
            orphans.append({"qdrant_id": point.get("id"), "subject_id": subject_id})
            continue
        is_polish = bool(point.get("payload", {}).get("is_polish", False))
        rows_with_ids.append(
            (str(point.get("id")), {"subject_id": subject_id, "is_polish": is_polish, "embedding": embedding})
        )

    rows_with_ids.sort(key=lambda item: (item[1]["subject_id"], item[1]["is_polish"], item[0]))

    groups: dict[tuple[int, bool], list[str]] = defaultdict(list)
    for qid, row in rows_with_ids:
        groups[(row["subject_id"], row["is_polish"])].append(qid)
    duplicates = [
        {"subject_id": s, "is_polish": p, "qdrant_ids": ids}
        for (s, p), ids in sorted(groups.items())
        if len(ids) > 1
    ]
    orphans.sort(key=lambda o: (o["subject_id"], str(o["qdrant_id"])))
    return [row for _, row in rows_with_ids], orphans, duplicates


def transform_all(source: SourceData) -> tuple[TargetRows, Report]:
    tables = {}
    for sqlite_table, (target, _) in SQLITE_TABLES.items():
        if sqlite_table not in source.sqlite:
            raise TransformError(f"Brak tabeli {sqlite_table} w eksporcie")
        tables[target] = transform_sqlite_table(sqlite_table, source.sqlite[sqlite_table])

    points, without_doc, without_point = attach_docs(
        tables["marma_points"], source.docs, source.doc_key
    )
    subject_ids = {s["id"] for s in tables["subjects"]}
    vectors, orphans, duplicates = transform_vectors(source.qdrant_points, subject_ids)

    rows = TargetRows(
        marma_points=points,
        marma_point_functions=tables["marma_point_functions"],
        subjects=tables["subjects"],
        marma_point_coordinates=tables["marma_point_coordinates"],
        marma_point_subjects=tables["marma_point_subjects"],
        subject_embeddings=vectors,
    )
    source_counts = {t: len(source.sqlite[s]) for s, (t, _) in SQLITE_TABLES.items()}
    source_counts["subject_embeddings"] = len(source.qdrant_points)
    source_counts["rethinkdb_docs"] = len(source.docs)
    report = Report(
        source_counts=source_counts,
        points_without_doc=without_doc,
        docs_without_point=without_point,
        orphan_vectors=orphans,
        duplicate_vectors=duplicates,
    )
    return rows, report
