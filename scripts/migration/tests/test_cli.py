"""Wiersz poleceń importu i weryfikacji: potwierdzenie hosta, błędy bez tracebacku.

Żaden test nie łączy się z bazą: psycopg.connect jest zastąpiony funkcją, która przerywa test.
"""

import json

import psycopg
import pytest

import import_to_supabase
import verify_counts
from export_files import MANIFEST

# Część URL, która nie może pojawić się w wyjściu (syntetyczna, nie jest sekretem).
HIDDEN = "".join(["nie", "wypisuj", "mnie"])
HOST = "db.przyklad.supabase.co"
DB_URL = f"postgresql://postgres:{HIDDEN}@{HOST}:5432/postgres"


@pytest.fixture(autouse=True)
def no_db(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("test nie może łączyć się z bazą")

    monkeypatch.setattr(psycopg, "connect", forbidden)


def run(main, argv, capsys):
    code = main(argv)
    out = capsys.readouterr()
    return code, out.out + out.err


def test_import_without_confirm_host_exits_2(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)

    code, text = run(import_to_supabase.main, ["--export-dir", str(tmp_path)], capsys)

    assert code == 2
    assert "--confirm-host" in text
    assert HIDDEN not in text


def test_import_with_wrong_host_exits_2(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)

    code, text = run(
        import_to_supabase.main, ["--export-dir", str(tmp_path), "--confirm-host", "127.0.0.1"], capsys
    )

    assert code == 2
    assert "nie zgadza się" in text
    assert HIDDEN not in text


def test_import_without_db_url_exits_2(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

    code, text = run(import_to_supabase.main, ["--export-dir", str(tmp_path), "--confirm-host", HOST], capsys)

    assert code == 2
    assert "SUPABASE_DB_URL" in text


def test_yes_flag_is_no_longer_accepted(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)

    with pytest.raises(SystemExit) as e:
        import_to_supabase.main(["--export-dir", str(tmp_path), "--yes"])

    assert e.value.code == 2


def test_import_prints_target_without_password(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)

    # Pusty katalog eksportu: skrypt kończy się przed połączeniem.
    code, text = run(import_to_supabase.main, ["--export-dir", str(tmp_path), "--confirm-host", HOST], capsys)

    assert HOST in text and "5432" in text and "postgres" in text
    assert HIDDEN not in text
    assert DB_URL not in text
    assert code == 1


@pytest.mark.parametrize("main", [import_to_supabase.main, verify_counts.main])
def test_missing_export_gives_exit_1_without_traceback(tmp_path, monkeypatch, capsys, main):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)

    argv = ["--export-dir", str(tmp_path / "brak")] + (["--confirm-host", HOST] if main is import_to_supabase.main else [])
    code, text = run(main, argv, capsys)

    assert code == 1
    assert "BŁĄD" in text and "manifest.json" in text
    assert HIDDEN not in text


@pytest.mark.parametrize("main", [import_to_supabase.main, verify_counts.main])
def test_broken_export_file_gives_exit_1(tmp_path, monkeypatch, capsys, main):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)
    (tmp_path / MANIFEST).write_text(
        json.dumps({"sqlite": {"counts": {}}, "rethinkdb": {"primary_key": "id", "count": 0}, "qdrant": {"count": 0}})
    )
    # Brak plików JSONL tabel.

    argv = ["--export-dir", str(tmp_path)] + (["--confirm-host", HOST] if main is import_to_supabase.main else [])
    code, text = run(main, argv, capsys)

    assert code == 1
    assert "BŁĄD" in text


@pytest.mark.parametrize("main", [import_to_supabase.main, verify_counts.main])
def test_transform_error_gives_exit_1(tmp_path, monkeypatch, capsys, main):
    monkeypatch.setenv("SUPABASE_DB_URL", DB_URL)
    from export_files import write_jsonl, write_manifest, QDRANT_FILE, RETHINK_FILE
    from helpers import qdrant_point, sample_source
    from transform import EMBEDDING_DIM

    source = sample_source()
    for table, rows in source.sqlite.items():
        write_jsonl(tmp_path / "sqlite" / f"{table}.jsonl", rows)
    write_jsonl(tmp_path / RETHINK_FILE, source.docs)
    write_jsonl(tmp_path / QDRANT_FILE, [qdrant_point("zly-wektor", 7, dim=EMBEDDING_DIM - 1)])
    write_manifest(
        tmp_path,
        {
            "sqlite": {"counts": {t: len(r) for t, r in source.sqlite.items()}},
            "rethinkdb": {"primary_key": "id", "count": len(source.docs)},
            "qdrant": {"count": 1},
        },
    )

    argv = ["--export-dir", str(tmp_path)] + (["--confirm-host", HOST] if main is import_to_supabase.main else [])
    code, text = run(main, argv, capsys)

    assert code == 1
    assert "BŁĄD" in text and "zly-wektor" in text
