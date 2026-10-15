"""Generatory danych syntetycznych dla testów migracji.

Wektory są tworzone w kodzie (nie jako literały), aby strażnik danych
nie traktował plików testów jak eksportu embeddingów.
"""

from transform import EMBEDDING_DIM, SourceData


def vector(seed: float = 0.0, dim: int = EMBEDDING_DIM) -> list[float]:
    return [seed + i / 10_000 for i in range(dim)]


def qdrant_point(point_id, subject_id, is_polish=None, dim=EMBEDDING_DIM, seed=0.0):
    payload = {"page_content": f"temat {subject_id}", "metadata": {"id": subject_id}}
    if is_polish is not None:
        payload["is_polish"] = is_polish
    return {"id": point_id, "payload": payload, "vector": vector(seed, dim)}


def sample_source() -> SourceData:
    """Dwa punkty, jeden dokument, jeden temat, jedna funkcja, dwa wektory."""
    return SourceData(
        sqlite={
            "pointsdb_marmapoint": [
                {"id": 1, "name": "Punkt A", "alt_name": None, "location": "noga", "doshic_subtypes": "vata"},
                {"id": 2, "name": "Punkt B", "alt_name": "B", "location": "ręka", "doshic_subtypes": None},
            ],
            "pointsdb_marmapointcoordinates": [
                {"id": 10, "marma_point_id": 1, "label": "L", "x": 0.1, "y": 0.2, "z": 0.3},
                {"id": 11, "marma_point_id": 1, "label": "P", "x": -0.1, "y": 0.2, "z": 0.3},
            ],
            "pointsdb_marmapointfunction": [
                {"id": 5, "function_name": "f1", "subject_type": "t", "marmani_description": "opis f1"},
            ],
            "pointsdb_subject": [{"id": 7, "name": "temat 7"}],
            "pointsdb_marmapointsubject": [
                {"id": 20, "marma_point_id": 1, "subject_id": 7, "function_id": 5, "notes": None},
            ],
        },
        docs=[{"id": "Punkt A", "names": ["A"], "actions_in_polish": "krótki opis"}],
        doc_key="id",
        qdrant_points=[
            qdrant_point("u-en", 7),
            qdrant_point("u-pl", 7, is_polish=True, seed=1.0),
        ],
    )
