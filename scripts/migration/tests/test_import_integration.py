"""Import na lokalnym stacku Supabase (`npx supabase start`).

Uruchamiany tylko, gdy SUPABASE_DB_URL wskazuje na 127.0.0.1/localhost: test czyści
tabele punktów, więc nigdy nie może trafić na projekt w chmurze.
"""

import os
from urllib.parse import urlparse

import psycopg
import pytest

from helpers import sample_source, vector
from import_to_supabase import import_rows
from transform import TARGET_TABLES, transform_all
from verify_counts import fetch_target_counts

pytestmark = pytest.mark.integration

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
TEST_EMAIL = "import-test@example.com"


@pytest.fixture
def conn():
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        pytest.skip("brak SUPABASE_DB_URL (lokalny stack Supabase)")
    if urlparse(url).hostname not in LOCAL_HOSTS:
        pytest.skip("SUPABASE_DB_URL nie wskazuje lokalnego stacku; test integracyjny pominięty")
    try:
        connection = psycopg.connect(url, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError as e:
        pytest.skip(f"lokalny stack Supabase niedostępny: {e}")
    yield connection
    with connection.cursor() as cur:
        cur.execute(f"truncate table {', '.join('public.' + t for t in TARGET_TABLES)} restart identity cascade")
        cur.execute("delete from private.allowed_emails where email = %s", (TEST_EMAIL,))
    connection.close()


def test_import_twice_gives_same_counts(conn):
    rows, _ = transform_all(sample_source())

    import_rows(conn, rows)
    first = fetch_target_counts(conn)
    import_rows(conn, rows)
    second = fetch_target_counts(conn)

    assert first == second
    assert {t: first[t] for t in TARGET_TABLES} == rows.counts()
    assert first["marma_points.doc"] == 1


def test_import_keeps_ids_and_data(conn):
    rows, _ = transform_all(sample_source())

    import_rows(conn, rows)

    with conn.cursor() as cur:
        cur.execute("select id, name, doc->'names' from public.marma_points order by id")
        assert cur.fetchall() == [(1, "Punkt A", ["A"]), (2, "Punkt B", None)]
        cur.execute("select id, marma_point_id, label from public.marma_point_coordinates order by id")
        assert cur.fetchall() == [(10, 1, "L"), (11, 1, "P")]
        cur.execute("select id, marma_point_id, subject_id, function_id from public.marma_point_subjects")
        assert cur.fetchall() == [(20, 1, 7, 5)]
        cur.execute(
            "select subject_id, is_polish, vector_dims(embedding) from public.subject_embeddings order by is_polish"
        )
        assert cur.fetchall() == [(7, False, 1536), (7, True, 1536)]


def test_failure_in_the_middle_rolls_back(conn):
    rows, _ = transform_all(sample_source())
    import_rows(conn, rows)
    before = fetch_target_counts(conn)

    broken, _ = transform_all(sample_source())
    broken.marma_points = [dict(p, name=p["name"] + " nowy") for p in broken.marma_points]
    # Wektor o złej długości odrzuca baza dopiero przy ostatniej tabeli (po TRUNCATE i rodzicach).
    broken.subject_embeddings.append({"subject_id": 7, "is_polish": False, "embedding": vector(dim=3)})

    with pytest.raises(psycopg.Error, match=r"expected 1536 dimensions, not 3"):
        import_rows(conn, broken)

    assert fetch_target_counts(conn) == before
    with conn.cursor() as cur:
        cur.execute("select count(*) from public.marma_points where name like '%nowy'")
        assert cur.fetchone()[0] == 0


def test_insert_without_id_after_import_does_not_collide(conn):
    rows, _ = transform_all(sample_source())
    import_rows(conn, rows)

    inserts = {
        "marma_points": "insert into public.marma_points (name, location) values ('nowy', 'x') returning id",
        "marma_point_functions": (
            "insert into public.marma_point_functions (function_name, subject_type, marmani_description)"
            " values ('nowa', 't', 'd') returning id"
        ),
        "subjects": "insert into public.subjects (name) values ('nowy') returning id",
        "marma_point_coordinates": (
            "insert into public.marma_point_coordinates (marma_point_id, label, x, y, z)"
            " values (2, 'nowa', 0, 0, 0) returning id"
        ),
        "marma_point_subjects": (
            "insert into public.marma_point_subjects (marma_point_id, subject_id, function_id)"
            " values (2, 7, 5) returning id"
        ),
        "subject_embeddings": (
            "insert into public.subject_embeddings (subject_id, is_polish, embedding)"
            " select 7, true, array_fill(0::real, array[1536])::extensions.vector returning id"
        ),
    }
    max_ids = {t: max(r["id"] for r in getattr(rows, t)) for t in TARGET_TABLES if t != "subject_embeddings"}
    max_ids["subject_embeddings"] = len(rows.subject_embeddings)  # id nadaje baza od 1

    with conn.transaction(force_rollback=True), conn.cursor() as cur:
        for table, sql in inserts.items():
            cur.execute(sql)
            assert cur.fetchone()[0] == max_ids[table] + 1, table


def test_import_does_not_touch_allowed_emails(conn):
    with conn.cursor() as cur:
        cur.execute("insert into private.allowed_emails (email) values (%s)", (TEST_EMAIL,))
    rows, _ = transform_all(sample_source())

    import_rows(conn, rows)

    with conn.cursor() as cur:
        cur.execute("select count(*) from private.allowed_emails where email = %s", (TEST_EMAIL,))
        assert cur.fetchone()[0] == 1
