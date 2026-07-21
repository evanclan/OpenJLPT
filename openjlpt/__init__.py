"""OpenJLPT — Python loader for the open JLPT N5–N1 dataset.

Example:
    >>> from openjlpt import get_vocab, find_kanji, search_vocab
    >>> n5 = get_vocab("N5")
    >>> find_kanji("日")
    Kanji(character='日', level='N5', strokes=4, ...)
    >>> search_vocab("eat", "N5")
    [Vocab(word='食べる', reading='たべる', ...)]
"""

from __future__ import annotations

from ._models import Example, Grammar, Kanji, Level, Vocab
from ._data import (
    find_grammar,
    find_kanji,
    find_word,
    get_grammar,
    get_kanji,
    get_vocab,
    levels,
    search_grammar,
    search_vocab,
)
from ._sqlite import connect, db_path, query

__version__ = "0.2.0"

__all__ = [
    "connect",
    "db_path",
    "Example",
    "find_grammar",
    "find_kanji",
    "find_word",
    "get_grammar",
    "get_kanji",
    "get_vocab",
    "Grammar",
    "Kanji",
    "Level",
    "levels",
    "query",
    "search_grammar",
    "search_vocab",
    "Vocab",
]
