from __future__ import annotations

import sqlite3

from openjlpt import (
    Example,
    Grammar,
    Kanji,
    Vocab,
    find_grammar,
    find_kanji,
    find_word,
    get_grammar,
    get_kanji,
    get_vocab,
    levels,
    query,
    search_grammar,
    search_vocab,
)


def test_levels_order():
    assert levels == ["N5", "N4", "N3", "N2", "N1"]


def test_get_vocab_n5_count():
    n5 = get_vocab("N5")
    assert len(n5) == 662


def test_get_kanji_n5_count():
    n5 = get_kanji("N5")
    assert len(n5) == 79


def test_get_vocab_returns_typed_objects():
    item = get_vocab("N5")[0]
    assert isinstance(item, Vocab)
    assert item.level == "N5"
    assert isinstance(item.meanings, list)


def test_get_kanji_returns_typed_objects():
    item = get_kanji("N5")[0]
    assert isinstance(item, Kanji)
    assert item.level == "N5"
    assert isinstance(item.onyomi, list)
    assert isinstance(item.kunyomi, list)


def test_find_word_exact():
    item = find_word("食べる")
    assert item is not None
    assert item.word == "食べる"
    assert item.reading == "たべる"
    assert "to eat" in item.meanings
    assert item.level == "N5"
    assert item.examples
    assert isinstance(item.examples[0], Example)


def test_find_word_missing():
    assert find_word("notarealword") is None


def test_find_kanji_exact():
    item = find_kanji("日")
    assert item is not None
    assert item.character == "日"
    assert item.level == "N5"
    assert item.strokes == 4
    assert "ニチ" in item.onyomi


def test_find_kanji_missing():
    assert find_kanji("notakanji") is None


def test_search_vocab_english():
    results = search_vocab("eat", "N5")
    assert any(r.word == "食べる" for r in results)


def test_search_vocab_reading():
    results = search_vocab("たべる", "N5")
    assert any(r.word == "食べる" for r in results)


def test_search_vocab_word():
    results = search_vocab("食べる", "N5")
    assert any(r.word == "食べる" for r in results)


def test_get_all_vocab():
    all_vocab = get_vocab()
    assert len(all_vocab) == 8334


def test_get_all_kanji():
    all_kanji = get_kanji()
    assert len(all_kanji) == 2211


def test_sqlite_query():
    rows = query("SELECT level, COUNT(*) FROM vocab GROUP BY level")
    counts = {row["level"]: row[1] for row in rows}
    assert counts["N5"] == 662


def test_sqlite_schema_has_kanji():
    rows = query("SELECT name FROM sqlite_master WHERE type = 'table'")
    table_names = {r[0] for r in rows}
    assert "vocab" in table_names
    assert "kanji" in table_names


def test_connect_returns_sqlite_connection():
    from openjlpt import connect

    with connect() as conn:
        assert isinstance(conn, sqlite3.Connection)
        cur = conn.execute("SELECT 1")
        assert cur.fetchone()[0] == 1


def test_get_grammar_n5_count():
    n5 = get_grammar("N5")
    assert len(n5) >= 1


def test_get_grammar_returns_typed_objects():
    item = get_grammar("N5")[0]
    assert isinstance(item, Grammar)
    assert item.level == "N5"
    assert isinstance(item.meaning, str)


def test_get_all_grammar():
    all_grammar = get_grammar()
    assert len(all_grammar) >= 20


def test_find_grammar():
    results = find_grammar("てもいい")
    assert any("てもいい" in g.pattern for g in results)


def test_search_grammar_meaning():
    results = search_grammar("permission")
    assert any("permission" in (g.tags or []) for g in results)


def test_sqlite_schema_has_grammar():
    rows = query("SELECT name FROM sqlite_master WHERE type = 'table'")
    table_names = {r[0] for r in rows}
    assert "grammar" in table_names


def test_sqlite_grammar_query():
    rows = query("SELECT level, COUNT(*) FROM grammar GROUP BY level")
    counts = {row["level"]: row[1] for row in rows}
    assert counts["N5"] >= 1
