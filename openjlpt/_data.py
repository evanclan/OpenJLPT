from __future__ import annotations

import json
import os
import random as _random
import re
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, TypeVar, Union

from ._models import Example, Grammar, Kanji, Level, Vocab

levels: List[Level] = ["N5", "N4", "N3", "N2", "N1"]
"""All JLPT levels, ordered from beginner to advanced."""

T = TypeVar("T")


def data_root() -> str:
    """Locate the data directory.

    In development, data lives at the repository root. In a wheel, the build
    backend copies it into the package so it is self-contained.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    # Installed wheels bundle data inside the package; a source checkout has it one level up.
    for candidate in (os.path.join(here, "data"), os.path.join(here, "..", "data")):
        if os.path.isfile(os.path.join(candidate, "json", "meta.json")):
            return os.path.abspath(candidate)
    raise FileNotFoundError("OpenJLPT data directory not found")


def _read_json(path: str) -> Any:
    with open(os.path.join(data_root(), "json", path), encoding="utf-8") as f:
        return json.load(f)


def _check_level(level: Optional[str]) -> Optional[str]:
    """Accept "N5" or "n5"; raise ValueError for anything else."""
    if level is None:
        return None
    normalized = str(level).upper()
    if normalized not in levels:
        raise ValueError(f"level must be one of {levels}, got {level!r}")
    return normalized


def _examples(raw: dict) -> List[Example]:
    return [Example(**ex) for ex in raw.get("examples") or []]


def _to_vocab(raw: dict) -> Vocab:
    return Vocab(
        id=raw["id"],
        word=raw["word"],
        reading=raw["reading"],
        romaji=raw["romaji"],
        meanings=raw["meanings"],
        level=raw["level"],
        pos=raw.get("pos", []),
        jmdict_id=raw.get("jmdict_id"),
        other_forms=raw.get("other_forms", []),
        other_readings=raw.get("other_readings", []),
        examples=_examples(raw),
    )


def _to_kanji(raw: dict) -> Kanji:
    return Kanji(
        character=raw["character"],
        level=raw["level"],
        strokes=raw.get("strokes"),
        grade=raw.get("grade"),
        freq=raw.get("freq"),
        radical=raw.get("radical"),
        radical_number=raw.get("radical_number"),
        onyomi=raw.get("onyomi", []),
        kunyomi=raw.get("kunyomi", []),
        meanings=raw.get("meanings", []),
        nanori=raw.get("nanori", []),
        words=raw.get("words", []),
        supplementary=raw.get("supplementary", False),
    )


def _to_grammar(raw: dict) -> Grammar:
    return Grammar(
        id=raw["id"],
        pattern=raw["pattern"],
        romaji=raw["romaji"],
        level=raw["level"],
        meaning=raw["meaning"],
        formation=raw["formation"],
        examples=_examples(raw),
        tags=raw.get("tags", []),
        reading=raw.get("reading"),
        notes=raw.get("notes"),
    )


@lru_cache(maxsize=None)
def _level(kind: str, level: str) -> Tuple[Any, ...]:
    convert: Callable[[dict], Any] = {"vocab": _to_vocab, "kanji": _to_kanji, "grammar": _to_grammar}[kind]
    return tuple(convert(r) for r in _read_json(f"{kind}/{level.lower()}.json"))


def _all(kind: str, level: Optional[str]) -> list:
    level = _check_level(level)
    if level is not None:
        return list(_level(kind, level))
    return [item for lvl in levels for item in _level(kind, lvl)]


# --- Vocabulary -------------------------------------------------------------


def get_vocab(level: Optional[Level] = None) -> List[Vocab]:
    """Return all vocabulary entries, optionally filtered to one level."""
    return _all("vocab", level)


@lru_cache(maxsize=None)
def _vocab_by_id() -> Dict[str, Vocab]:
    return {v.id: v for v in get_vocab()}


@lru_cache(maxsize=None)
def _vocab_by_form() -> Dict[str, List[Vocab]]:
    index: Dict[str, List[Vocab]] = {}
    vocab = get_vocab()
    # Headwords first, so find_word("河") prefers the entry written 河 over one listing it as a variant.
    for v in vocab:
        index.setdefault(v.word, []).append(v)
    for v in vocab:
        for form in v.other_forms:
            bucket = index.setdefault(form, [])
            if all(x is not v for x in bucket):
                bucket.append(v)
    return index


def get_vocab_by_id(id: str) -> Optional[Vocab]:
    """Look up a word by its stable ID."""
    return _vocab_by_id().get(id)


def find_word(word: str) -> Optional[Vocab]:
    """Look up a word by its written form or an alternative spelling (easiest level first)."""
    matches = _vocab_by_form().get(word)
    return matches[0] if matches else None


def find_words(word: str) -> List[Vocab]:
    """All entries written as ``word`` (homographs are separate entries)."""
    return list(_vocab_by_form().get(word, []))


# --- Kanji ------------------------------------------------------------------


def get_kanji(level: Optional[Level] = None) -> List[Kanji]:
    """Return all kanji entries, optionally filtered to one level."""
    return _all("kanji", level)


@lru_cache(maxsize=None)
def _kanji_by_char() -> Dict[str, Kanji]:
    return {k.character: k for k in get_kanji()}


def find_kanji(character: str) -> Optional[Kanji]:
    """Look up a single kanji entry by character."""
    return _kanji_by_char().get(character)


def kanji_in(text: str) -> List[Kanji]:
    """The JLPT kanji in ``text``, in order of first appearance."""
    seen = set()
    out = []
    for ch in text:
        if ch in seen:
            continue
        seen.add(ch)
        k = find_kanji(ch)
        if k:
            out.append(k)
    return out


# --- Grammar ----------------------------------------------------------------


def get_grammar(level: Optional[Level] = None) -> List[Grammar]:
    """Return all grammar entries (in teaching order), optionally filtered to one level."""
    return _all("grammar", level)


@lru_cache(maxsize=None)
def _grammar_by_id() -> Dict[str, Grammar]:
    return {g.id: g for g in get_grammar()}


def get_grammar_by_id(id: str) -> Optional[Grammar]:
    """Look up a grammar point by its stable ID (e.g. ``te-mo-ii``)."""
    return _grammar_by_id().get(id)


_WAVE = "〜～~"  # U+301C, U+FF5E (Windows IMEs) and ASCII


def find_grammar(pattern: str) -> List[Grammar]:
    """Grammar points whose pattern (or kana reading) contains ``pattern``; the leading 〜 is optional."""
    p = pattern.strip().lstrip(_WAVE)
    if not p:
        return []
    return [g for g in get_grammar() if p in g.pattern or (g.reading is not None and p in g.reading)]


# --- Search -----------------------------------------------------------------


def normalize(s: str) -> str:
    """Normalise for matching: katakana → hiragana, lowercase, trimmed."""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s.strip().lower())


def search_vocab(query: str, level: Optional[Level] = None, limit: Optional[int] = None) -> List[Vocab]:
    """Search vocabulary by kanji, kana (hiragana/katakana-insensitive), romaji or English.

    Results are ranked: exact matches first, then prefix matches, then substrings.
    """
    q = normalize(query)
    if not q:
        return []
    whole_word = re.compile(r"\b" + re.escape(q) + r"\b")
    word_start = re.compile(r"\b" + re.escape(q))
    scored = []
    for v in get_vocab(level):
        # Romaji matches whole or as a prefix only: "eat" must not hit te-a-te (手当て).
        forms = [normalize(f) for f in (v.word, *v.other_forms, v.reading, *v.other_readings)]
        every = forms + [v.romaji]
        glosses = [m.lower() for m in v.meanings]
        if q in every:
            score = 100
        elif any(m == q or m == f"to {q}" for m in glosses):
            score = 90
        elif any(f.startswith(q) for f in every):
            score = 60
        elif any(whole_word.search(m) for m in glosses):
            score = 50
        elif any(q in f for f in forms):
            score = 30
        elif any(word_start.search(m) for m in glosses):
            score = 20
        else:
            continue
        scored.append((-score, levels.index(v.level), len(scored), v))
    scored.sort()
    results = [v for *_, v in scored]
    return results[:limit] if limit else results


def search_grammar(query: str, level: Optional[Level] = None, limit: Optional[int] = None) -> List[Grammar]:
    """Case-insensitive search across pattern, reading, romaji, meaning, formation and tags."""
    q = normalize(query.strip().lstrip(_WAVE))
    if not q:
        return []
    results = [
        g
        for g in get_grammar(level)
        if any(q in normalize(f) for f in (g.pattern, g.reading or "", g.romaji, g.meaning, g.formation, *g.tags))
    ]
    return results[:limit] if limit else results


# --- Misc -------------------------------------------------------------------


@lru_cache(maxsize=None)
def meta() -> Dict[str, Any]:
    """Dataset version, counts and upstream source versions."""
    return _read_json("meta.json")


@lru_cache(maxsize=None)
def pos_labels() -> Dict[str, str]:
    """Descriptions of the JMdict part-of-speech codes used in ``Vocab.pos`` (``v1`` → "Ichidan verb")."""
    return _read_json("pos.json")


def sample(items: Sequence[T], n: int = 1, rng: Union[_random.Random, None] = None) -> List[T]:
    """``n`` random items without replacement — for flashcards and quizzes.

    Pass ``rng=random.Random(seed)`` for reproducible draws.
    """
    return (rng or _random).sample(list(items), max(0, min(n, len(items))))
