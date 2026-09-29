from __future__ import annotations

import random
import re
import sqlite3

import pytest

from openjlpt import (
    Example,
    Grammar,
    Kanji,
    Vocab,
    connect,
    find_grammar,
    find_kanji,
    find_word,
    find_words,
    get_grammar,
    get_grammar_by_id,
    get_kanji,
    get_vocab,
    get_vocab_by_id,
    kanji_in,
    levels,
    meta,
    normalize,
    pos_labels,
    query,
    sample,
    search_grammar,
    search_vocab,
)
from openjlpt.__main__ import main as cli

KANA = re.compile(r"^[ぁ-ゖゝゞァ-ヺーヽヾ]+$")


def test_levels_order():
    assert levels == ["N5", "N4", "N3", "N2", "N1"]


def test_counts_match_meta():
    m = meta()
    for level in levels:
        assert len(get_vocab(level)) == m["counts"]["vocab"][level]
        assert len(get_kanji(level)) == m["counts"]["kanji"][level]
        assert len(get_grammar(level)) == m["counts"]["grammar"][level]
    assert len(get_vocab()) == m["counts"]["vocab"]["total"]
    assert len(get_kanji()) == m["counts"]["kanji"]["total"] == 2211


def test_invalid_level_raises():
    with pytest.raises(ValueError):
        get_vocab("N6")  # type: ignore[arg-type]


def test_typed_objects():
    v = get_vocab("N5")[0]
    assert isinstance(v, Vocab) and v.level == "N5" and isinstance(v.meanings, list)
    k = get_kanji("N5")[0]
    assert isinstance(k, Kanji) and isinstance(k.onyomi, list)
    g = get_grammar("N5")[0]
    assert isinstance(g, Grammar) and g.examples and isinstance(g.examples[0], Example)


def test_every_word_has_id_reading_romaji():
    ids = set()
    for v in get_vocab():
        assert re.fullmatch(r"[0-9a-f]{10}", v.id)
        assert KANA.match(v.reading), (v.word, v.reading)
        assert v.romaji
        ids.add(v.id)
    assert len(ids) == len(get_vocab())


def test_find_word():
    v = find_word("食べる")
    assert v is not None
    assert (v.reading, v.romaji, v.level) == ("たべる", "taberu", "N5")
    assert "to eat" in v.meanings
    assert "v1" in v.pos
    assert get_vocab_by_id(v.id) is v
    assert find_word("notarealword") is None
    assert find_words("notarealword") == []


def test_find_word_alternative_spellings():
    assert find_word("よい").word == "いい"
    assert find_word("明後日").word == "あさって"
    assert find_word("勉強").reading == "べんきょう"


def test_find_kanji():
    k = find_kanji("日")
    assert k is not None
    assert (k.level, k.strokes, k.radical, k.radical_number) == ("N5", 4, "日", 72)
    assert "ニチ" in k.onyomi
    assert k.words and all("日" in w for w in k.words)
    assert find_kanji("x") is None


def test_kanji_in():
    assert [k.character for k in kanji_in("日本語を勉強する日")] == ["日", "本", "語", "勉", "強"]


@pytest.mark.parametrize("q", ["たべる", "タベル", "taberu", "食べる"])
def test_search_vocab_scripts(q):
    assert search_vocab(q)[0].word == "食べる"


def test_search_vocab_english_and_limit():
    assert any(v.word == "食べる" for v in search_vocab("eat", "N5"))
    assert len(search_vocab("eat", limit=3)) <= 3
    assert search_vocab("  ") == []


def test_grammar():
    grammar = get_grammar()
    assert len({g.id for g in grammar}) == len(grammar)
    g = find_grammar("〜てもいい")[0]
    assert get_grammar_by_id(g.id) is g
    assert len(g.examples) >= 2
    assert any("permission" in x.tags for x in search_grammar("permission"))
    assert search_grammar("ni taishite")


def test_pos_labels_cover_all_codes():
    labels = pos_labels()
    assert all(p in labels for v in get_vocab() for p in v.pos)


def test_normalize_and_sample():
    assert normalize(" カタカナ ") == "かたかな"
    items = [1, 2, 3, 4, 5]
    s = sample(items, 3, rng=random.Random(0))
    assert len(s) == 3 and len(set(s)) == 3
    assert sample(items, 10) and len(sample(items, 10)) == 5


def test_sqlite():
    counts = {row["level"]: row[1] for row in query("SELECT level, COUNT(*) FROM vocab GROUP BY level")}
    assert counts["N5"] == meta()["counts"]["vocab"]["N5"]
    tables = {r[0] for r in query("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"vocab", "kanji", "grammar", "pos", "vocab_fts"} <= tables
    row = query("SELECT reading FROM vocab WHERE word = ?", ("食べる",))[0]
    assert row["reading"] == "たべる"


def test_sqlite_fts():
    rows = query(
        "SELECT v.word FROM vocab_fts f JOIN vocab v ON v.rowid = f.rowid WHERE vocab_fts MATCH ?", ("eat",)
    )
    assert "食べる" in {r["word"] for r in rows}


def test_connection_is_read_only():
    conn = connect()
    try:
        assert isinstance(conn, sqlite3.Connection)
        with pytest.raises(sqlite3.OperationalError):
            conn.execute("DELETE FROM vocab")
    finally:
        conn.close()


def test_cli(capsys):
    assert cli(["食べる"]) == 0
    assert "たべる" in capsys.readouterr().out
    assert cli(["kanji", "日"]) == 0
    assert "strokes" in capsys.readouterr().out
    assert cli(["grammar", "てもいい"]) == 0
    assert cli(["stats"]) == 0
    assert cli(["zzzznotaword"]) == 1
