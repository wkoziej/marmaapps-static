import pytest

from helpers import qdrant_point, sample_source, vector
from transform import EMBEDDING_DIM, TransformError, transform_all


def test_point_with_doc_and_two_coordinates():
    rows, report = transform_all(sample_source())

    point_a = next(p for p in rows.marma_points if p["id"] == 1)
    assert point_a == {
        "id": 1,
        "name": "Punkt A",
        "alt_name": None,
        "location": "noga",
        "doshic_subtypes": "vata",
        "doc": {"id": "Punkt A", "names": ["A"], "actions_in_polish": "krótki opis"},
    }
    coords = [c for c in rows.marma_point_coordinates if c["marma_point_id"] == 1]
    assert coords == [
        {"id": 10, "marma_point_id": 1, "label": "L", "x": 0.1, "y": 0.2, "z": 0.3},
        {"id": 11, "marma_point_id": 1, "label": "P", "x": -0.1, "y": 0.2, "z": 0.3},
    ]


def test_other_tables_keep_ids_and_columns():
    rows, _ = transform_all(sample_source())

    assert rows.marma_point_functions == [
        {"id": 5, "function_name": "f1", "subject_type": "t", "marmani_description": "opis f1"}
    ]
    assert rows.subjects == [{"id": 7, "name": "temat 7"}]
    assert rows.marma_point_subjects == [
        {"id": 20, "marma_point_id": 1, "subject_id": 7, "function_id": 5, "notes": None}
    ]


def test_point_without_doc_gets_empty_doc_and_is_reported():
    rows, report = transform_all(sample_source())

    point_b = next(p for p in rows.marma_points if p["id"] == 2)
    assert point_b["doc"] == {}
    assert report.points_without_doc == ["Punkt B"]


def test_doc_without_point_is_skipped_and_reported():
    source = sample_source()
    source.docs.append({"id": "Punkt Z", "names": ["Z"]})

    rows, report = transform_all(source)

    assert all(p["doc"].get("id") != "Punkt Z" for p in rows.marma_points)
    assert report.docs_without_point == ["Punkt Z"]


def test_doc_key_is_configurable():
    source = sample_source()
    source.docs = [{"name": "Punkt A", "names": ["A"]}]
    source.doc_key = "name"

    rows, report = transform_all(source)

    assert rows.marma_points[0]["doc"] == {"name": "Punkt A", "names": ["A"]}
    assert report.points_without_doc == ["Punkt B"]


def test_polish_vector_row():
    rows, _ = transform_all(sample_source())

    polish = [e for e in rows.subject_embeddings if e["is_polish"]]
    assert len(polish) == 1
    assert polish[0]["subject_id"] == 7
    assert polish[0]["embedding"] == vector(1.0)


def test_vector_without_is_polish_flag_is_english():
    rows, _ = transform_all(sample_source())

    english = [e for e in rows.subject_embeddings if not e["is_polish"]]
    assert [e["subject_id"] for e in english] == [7]


def test_subject_id_given_as_numeric_string_is_converted():
    source = sample_source()
    source.qdrant_points = [qdrant_point("u-1", "7")]

    rows, _ = transform_all(source)

    assert rows.subject_embeddings[0]["subject_id"] == 7


def test_vector_with_wrong_length_raises_error_with_point_id():
    source = sample_source()
    source.qdrant_points.append(qdrant_point("zly-wektor", 7, dim=EMBEDDING_DIM - 1))

    with pytest.raises(TransformError, match="zly-wektor"):
        transform_all(source)


def test_vector_without_subject_id_raises_error_with_point_id():
    source = sample_source()
    point = qdrant_point("bez-tematu", 7)
    del point["payload"]["metadata"]["id"]
    source.qdrant_points.append(point)

    with pytest.raises(TransformError, match="bez-tematu"):
        transform_all(source)


def test_vector_pointing_to_missing_subject_is_skipped_and_reported():
    source = sample_source()
    source.qdrant_points.append(qdrant_point("sierota", 999))

    rows, report = transform_all(source)

    assert all(e["subject_id"] != 999 for e in rows.subject_embeddings)
    assert report.orphan_vectors == [{"qdrant_id": "sierota", "subject_id": 999}]


def test_duplicate_subject_language_pairs_are_reported_but_kept():
    source = sample_source()
    source.qdrant_points.append(qdrant_point("u-pl-2", 7, is_polish=True, seed=2.0))

    rows, report = transform_all(source)

    assert len([e for e in rows.subject_embeddings if e["is_polish"]]) == 2
    assert report.duplicate_vectors == [
        {"subject_id": 7, "is_polish": True, "qdrant_ids": ["u-pl", "u-pl-2"]}
    ]


def test_missing_sqlite_column_raises_error_with_table_name():
    source = sample_source()
    del source.sqlite["pointsdb_subject"][0]["name"]

    with pytest.raises(TransformError, match="pointsdb_subject"):
        transform_all(source)


def test_rows_are_sorted_for_repeatable_import():
    source = sample_source()
    source.sqlite["pointsdb_marmapoint"].reverse()
    source.qdrant_points.reverse()

    rows, _ = transform_all(source)

    assert [p["id"] for p in rows.marma_points] == [1, 2]
    assert [e["is_polish"] for e in rows.subject_embeddings] == [False, True]


def test_report_counts_source_records():
    _, report = transform_all(sample_source())

    assert report.source_counts == {
        "marma_points": 2,
        "marma_point_coordinates": 2,
        "marma_point_functions": 1,
        "subjects": 1,
        "marma_point_subjects": 1,
        "subject_embeddings": 2,
        "rethinkdb_docs": 1,
    }


def test_transform_does_not_modify_source():
    source = sample_source()
    before = repr(source)

    transform_all(source)

    assert repr(source) == before
