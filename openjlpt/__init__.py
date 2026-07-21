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

from ._models import Example, Kanji, Level, Vocab
from ._data import (
    find_kanji,
    find_word,
    get_kanji,
    get_vocab,
    levels,
    search_vocab,
)
from ._sqlite import connect, db_path, query

__version__ = "0.1.0"

__all__ = [
    "connect",
    "db_path",
    "Example",
    "find_kanji",
    "find_word",
    "get_kanji",
    "get_vocab",
    "Kanji",
    "Level",
    "levels",
    "query",
    "search_vocab",
    "Vocab",
]
