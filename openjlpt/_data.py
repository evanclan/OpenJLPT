from __future__ import annotations

import json
import os
from typing import Dict, List, Optional

from ._models import Example, Kanji, Level, Vocab

levels: List[Level] = ["N5", "N4", "N3", "N2", "N1"]
"""All JLPT levels, ordered from beginner to advanced."""


def _data_root() -> str:
    """Locate the data directory.

    In development, data lives at the repository root. In a wheel, the build
    backend copies it into the package so it is self-contained.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "data"),  # development / editable install
        os.path.join(here, "data"),         # wheel / bundled
    ]
    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    raise FileNotFoundError("OpenJLPT data directory not found")


_cache: Dict[str, List[dict]] = {}


def _load(kind: str, level: Level) -> List[dict]:
    """Load a JSON dataset, with simple in-memory caching."""
    key = f"{kind}/{level}"
    if key not in _cache:
        data_dir = os.path.join(_data_root(), "json")
        path = os.path.join(data_dir, kind, f"{level.lower()}.json")
        with open(path, encoding="utf-8") as f:
            _cache[key] = json.load(f)
    return _cache[key]


def _to_vocab(raw: dict) -> Vocab:
    examples = None
    if raw.get("examples"):
        examples = [Example(**ex) for ex in raw["examples"]]
    return Vocab(
        word=raw["word"],
        reading=raw.get("reading", ""),
        meanings=raw["meanings"],
        level=raw["level"],
        examples=examples,
    )


def _to_kanji(raw: dict) -> Kanji:
    return Kanji(
        character=raw["character"],
        level=raw["level"],
        strokes=raw.get("strokes"),
        grade=raw.get("grade"),
        freq=raw.get("freq"),
        onyomi=raw.get("onyomi", []),
        kunyomi=raw.get("kunyomi", []),
        meanings=raw.get("meanings", []),
    )


def get_vocab(level: Optional[Level] = None) -> List[Vocab]:
    """Return all vocabulary entries, optionally filtered to one level."""
    if level is not None:
        return [_to_vocab(v) for v in _load("vocab", level)]
    return [v for l in levels for v in get_vocab(l)]


def get_kanji(level: Optional[Level] = None) -> List[Kanji]:
    """Return all kanji entries, optionally filtered to one level."""
    if level is not None:
        return [_to_kanji(k) for k in _load("kanji", level)]
    return [k for l in levels for k in get_kanji(l)]


def find_word(word: str) -> Optional[Vocab]:
    """Look up a single vocabulary entry by its written form."""
    return next((v for v in get_vocab() if v.word == word), None)


def find_kanji(character: str) -> Optional[Kanji]:
    """Look up a single kanji entry by character."""
    return next((k for k in get_kanji() if k.character == character), None)


def search_vocab(query: str, level: Optional[Level] = None) -> List[Vocab]:
    """Case-insensitive substring search across word, reading, and meanings."""
    q = query.lower()
    return [
        v
        for v in get_vocab(level)
        if query in v.word
        or query in v.reading
        or any(q in m.lower() for m in v.meanings)
    ]
