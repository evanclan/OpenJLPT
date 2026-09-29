"""OpenJLPT — Python loader for the open JLPT N5–N1 dataset.

Example:
    >>> from openjlpt import find_word, find_kanji, search_vocab, get_grammar
    >>> find_word("食べる").reading
    'たべる'
    >>> find_kanji("日").strokes
    4
    >>> search_vocab("taberu")[0].word      # kanji, kana, romaji or English
    '食べる'
    >>> len(get_grammar("N5")) > 50
    True
"""

from __future__ import annotations

from ._data import (
    data_root,
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
    sample,
    search_grammar,
    search_vocab,
)
from ._models import Example, Grammar, Kanji, Level, Vocab
from ._sqlite import connect, db_path, query

__version__ = "0.3.0"

__all__ = [
    "connect",
    "data_root",
    "db_path",
    "Example",
    "find_grammar",
    "find_kanji",
    "find_word",
    "find_words",
    "get_grammar",
    "get_grammar_by_id",
    "get_kanji",
    "get_vocab",
    "get_vocab_by_id",
    "Grammar",
    "Kanji",
    "kanji_in",
    "Level",
    "levels",
    "meta",
    "normalize",
    "pos_labels",
    "query",
    "sample",
    "search_grammar",
    "search_vocab",
    "Vocab",
]
