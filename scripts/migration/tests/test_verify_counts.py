from helpers import sample_source
from transform import transform_all
from verify_counts import compare_counts, expected_counts, verify

TABLES = (
    "marma_points",
    "marma_point_functions",
    "subjects",
    "marma_point_coordinates",
    "marma_point_subjects",
    "subject_embeddings",
)


def counts(**overrides):
    base = {t: 3 for t in TABLES}
    base["marma_points.doc"] = 2
    base.update(overrides)
    return base


def test_equal_counts_give_no_mismatch():
    assert compare_counts(counts(), counts()) == []


def test_difference_in_any_table_is_reported_with_table_name():
    for table in TABLES:
        mismatches = compare_counts(counts(), counts(**{table: 2}))
        assert mismatches == [(table, 3, 2)]


def test_missing_table_in_target_is_a_mismatch():
    target = counts()
    del target["subjects"]

    assert compare_counts(counts(), target) == [("subjects", 3, None)]


def test_verify_success_exit_code_zero():
    _, report = transform_all(sample_source())
    expected = expected_counts(report)

    code, text = verify(expected, dict(expected), report)

    assert code == 0
    assert "OK" in text


def test_verify_failure_exit_code_nonzero_and_names_table():
    _, report = transform_all(sample_source())
    expected = expected_counts(report)
    target = dict(expected, marma_point_subjects=0)

    code, text = verify(expected, target, report)

    assert code != 0
    assert "marma_point_subjects" in text


def test_expected_counts_come_from_source_not_from_transformed_rows():
    source = sample_source()
    source.qdrant_points.append(dict(source.qdrant_points[0], id="sierota"))
    source.qdrant_points[-1]["payload"] = {"metadata": {"id": 999}}
    _, report = transform_all(source)

    expected = expected_counts(report)

    # Wektor do nieistniejącego tematu nie trafia do bazy, więc weryfikacja ma to wykazać.
    assert expected["subject_embeddings"] == 3
    assert expected["marma_points"] == 2
    assert expected["marma_points.doc"] == 1


def test_report_lists_point_names_and_ids_without_descriptions():
    source = sample_source()
    source.docs.append({"id": "Punkt Z", "actions_in_polish": "tajny opis"})
    source.qdrant_points.append(dict(source.qdrant_points[0], id="sierota"))
    source.qdrant_points[-1]["payload"] = {"metadata": {"id": 999}}
    _, report = transform_all(source)
    expected = expected_counts(report)

    _, text = verify(expected, dict(expected), report)

    assert "Punkt B" in text  # punkt bez opisu
    assert "Punkt Z" in text  # opis bez punktu
    assert "sierota" in text and "999" in text
    assert "tajny opis" not in text
    assert "krótki opis" not in text
