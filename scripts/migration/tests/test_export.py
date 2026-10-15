import datetime
import json
import sqlite3

import pytest
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from export_files import load_export
from export_from_droplet import ExportError, export_qdrant, export_sqlite, write_rethink_docs
from helpers import vector
from transform import EMBEDDING_DIM, SQLITE_TABLES

FORBIDDEN_EMAIL = "konto@example.com"


def make_django_sqlite(path):
    conn = sqlite3.connect(path)
    conn.executescript(
        f"""
        create table auth_user (id integer primary key, email text, password text);
        insert into auth_user values (1, '{FORBIDDEN_EMAIL}', 'x');
        create table djstripe_customer (id integer primary key, email text, stripe_id text);
        insert into djstripe_customer values (1, '{FORBIDDEN_EMAIL}', 'cus_x');
        create table pointsdb_marmapoint (id integer primary key, name text, alt_name text,
            location text, doshic_subtypes text);
        insert into pointsdb_marmapoint values (1, 'Punkt A', null, 'noga', 'vata');
        create table pointsdb_marmapointcoordinates (id integer primary key, marma_point_id integer,
            label text, x real, y real, z real);
        insert into pointsdb_marmapointcoordinates values (10, 1, 'L', 0.1, 0.2, 0.3);
        create table pointsdb_marmapointfunction (id integer primary key, function_name text,
            subject_type text, marmani_description text);
        insert into pointsdb_marmapointfunction values (5, 'f1', 't', 'opis');
        create table pointsdb_subject (id integer primary key, name text);
        insert into pointsdb_subject values (7, 'temat');
        create table pointsdb_marmapointsubject (id integer primary key, marma_point_id integer,
            subject_id integer, function_id integer, notes text);
        insert into pointsdb_marmapointsubject values (20, 1, 7, 5, null);
        """
    )
    conn.commit()
    conn.close()


def all_output_text(export_dir):
    return "\n".join(p.read_text(encoding="utf-8") for p in export_dir.rglob("*") if p.is_file())


def test_sqlite_export_reads_only_pointsdb_tables(tmp_path, monkeypatch):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    out = tmp_path / "data-export"
    statements = []
    real_connect = sqlite3.connect

    def tracing_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)
        conn.set_trace_callback(statements.append)
        return conn

    monkeypatch.setattr(sqlite3, "connect", tracing_connect)

    counts = export_sqlite(db, out)

    assert counts == {t: 1 for t in SQLITE_TABLES}
    assert statements, "brak zarejestrowanych zapytań"
    for sql in statements:
        assert "auth_" not in sql
        assert "djstripe" not in sql
        assert "sqlite_master" not in sql
        assert any(t in sql for t in SQLITE_TABLES), sql
    assert sorted(p.name for p in (out / "sqlite").iterdir()) == sorted(f"{t}.jsonl" for t in SQLITE_TABLES)
    assert FORBIDDEN_EMAIL not in all_output_text(out)
    row = json.loads((out / "sqlite" / "pointsdb_marmapoint.jsonl").read_text())
    assert row == {"id": 1, "name": "Punkt A", "alt_name": None, "location": "noga", "doshic_subtypes": "vata"}


def test_sqlite_export_opens_database_read_only(tmp_path):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    before = db.read_bytes()

    export_sqlite(db, tmp_path / "out")

    assert db.read_bytes() == before


def test_sqlite_export_fails_when_pointsdb_table_missing(tmp_path):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    conn = sqlite3.connect(db)
    conn.execute("drop table pointsdb_subject")
    conn.commit()
    conn.close()

    with pytest.raises(ExportError, match="pointsdb_subject"):
        export_sqlite(db, tmp_path / "out")


def test_sqlite_export_fails_for_missing_file(tmp_path):
    with pytest.raises(ExportError):
        export_sqlite(tmp_path / "brak.sqlite3", tmp_path / "out")


def test_qdrant_export_paginates_and_keeps_vectors_and_payload(tmp_path):
    client = QdrantClient(location=":memory:")
    # DOT: Qdrant nie normalizuje wektorów (przy COSINE zwraca wersję znormalizowaną).
    client.create_collection("subjects_openai", VectorParams(size=EMBEDDING_DIM, distance=Distance.DOT))
    points = [
        PointStruct(id=i, vector=vector(i / 10), payload={"metadata": {"id": 100 + i}, "is_polish": i % 2 == 0})
        for i in range(1, 6)
    ]
    client.upsert("subjects_openai", points)

    count = export_qdrant(client, "subjects_openai", tmp_path, page_size=2)

    assert count == 5
    lines = [json.loads(line) for line in (tmp_path / "qdrant_points.jsonl").read_text().splitlines()]
    assert sorted(p["id"] for p in lines) == [1, 2, 3, 4, 5]
    first = next(p for p in lines if p["id"] == 1)
    assert first["payload"] == {"metadata": {"id": 101}, "is_polish": False}
    assert first["vector"] == pytest.approx(vector(0.1), rel=1e-5)


def test_rethink_docs_are_written_with_primary_key(tmp_path):
    docs = [{"id": "Punkt A", "names": ["A"]}]

    count = write_rethink_docs(docs, "id", "marmaapp", "marma_points", tmp_path)

    assert count == 1
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["rethinkdb"] == {"db": "marmaapp", "table": "marma_points", "primary_key": "id", "count": 1}


def test_value_without_json_form_stops_export_with_source_name(tmp_path):
    docs = [{"id": "Punkt A", "updated": datetime.datetime(2024, 1, 1)}]

    with pytest.raises(ExportError, match=r"marmaapp\.marma_points.*datetime"):
        write_rethink_docs(docs, "id", "marmaapp", "marma_points", tmp_path)


def test_sqlite_value_without_json_form_names_table(tmp_path):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    conn = sqlite3.connect(db)
    conn.execute("update pointsdb_subject set name = x'00ff'")
    conn.commit()
    conn.close()

    with pytest.raises(ExportError, match=r"pointsdb_subject.*bytes"):
        export_sqlite(db, tmp_path / "out")


def test_sqlite_export_never_reads_account_tables(tmp_path, monkeypatch):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    read_tables = set()
    real_connect = sqlite3.connect

    def authorizing_connect(*args, **kwargs):
        conn = real_connect(*args, **kwargs)

        def authorizer(action, arg1, arg2, dbname, source):
            if action == sqlite3.SQLITE_READ:
                read_tables.add(arg1)
            return sqlite3.SQLITE_OK

        conn.set_authorizer(authorizer)
        return conn

    monkeypatch.setattr(sqlite3, "connect", authorizing_connect)

    export_sqlite(db, tmp_path / "out")

    assert read_tables == set(SQLITE_TABLES)


def mode(path):
    return path.stat().st_mode & 0o777


def test_export_files_and_directories_are_private(tmp_path):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    out = tmp_path / "nowy" / "data-export"

    export_sqlite(db, out)
    write_rethink_docs([{"id": "Punkt A"}], "id", "marmaapp", "marma_points", out)

    assert mode(tmp_path / "nowy") == 0o700
    assert mode(out) == 0o700
    assert mode(out / "sqlite") == 0o700
    files = [p for p in out.rglob("*") if p.is_file()]
    assert files
    for p in files:
        assert mode(p) == 0o600, p


def test_existing_export_file_becomes_private(tmp_path):
    out = tmp_path / "data-export"
    out.mkdir()
    (out / "rethinkdb_docs.jsonl").write_text("")
    (out / "rethinkdb_docs.jsonl").chmod(0o644)

    write_rethink_docs([{"id": "Punkt A"}], "id", "marmaapp", "marma_points", out)

    assert mode(out / "rethinkdb_docs.jsonl") == 0o600


def test_main_sets_umask_before_writing(tmp_path, monkeypatch):
    import export_from_droplet

    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    calls = []
    real_mkdir = type(tmp_path).mkdir

    def fake_umask(value):
        calls.append(("umask", value))
        return 0o022

    def recording_mkdir(self, *args, **kwargs):
        calls.append(("mkdir", self))
        return real_mkdir(self, *args, **kwargs)

    monkeypatch.setattr(export_from_droplet.os, "umask", fake_umask)
    monkeypatch.setattr(type(tmp_path), "mkdir", recording_mkdir)

    code = export_from_droplet.main(
        ["--export-dir", str(tmp_path / "out"), "--sources", "sqlite", "--sqlite-path", str(db)]
    )

    assert code == 0
    assert calls[0] == ("umask", 0o077)


def test_full_export_round_trip(tmp_path):
    db = tmp_path / "django.sqlite3"
    make_django_sqlite(db)
    out = tmp_path / "data-export"
    export_sqlite(db, out)
    write_rethink_docs([{"id": "Punkt A"}], "id", "marmaapp", "marma_points", out)
    client = QdrantClient(location=":memory:")
    client.create_collection("c", VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE))
    client.upsert("c", [PointStruct(id=1, vector=vector(), payload={"metadata": {"id": 7}})])
    export_qdrant(client, "c", out)

    source = load_export(out)

    assert source.doc_key == "id"
    assert len(source.qdrant_points) == 1
    assert source.sqlite["pointsdb_subject"] == [{"id": 7, "name": "temat"}]
