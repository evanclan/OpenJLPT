from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Literal, Optional

Level = Literal["N5", "N4", "N3", "N2", "N1"]
"""JLPT level in the current N5–N1 system."""


@dataclass(frozen=True)
class Example:
    """A Japanese↔English example sentence.

    Vocabulary examples come from Tatoeba (CC BY 2.0 FR) and carry ``tatoeba_id``
    (https://tatoeba.org/sentences/show/<id>); grammar examples are original.
    """

    ja: str
    en: str
    tatoeba_id: Optional[int] = None


@dataclass(frozen=True)
class Vocab:
    """A single JLPT vocabulary entry."""

    id: str
    """Stable ID: first 10 hex digits of SHA-1(word + "\\0" + reading)."""
    word: str
    reading: str
    """Kana reading (equals ``word`` for kana-only words)."""
    romaji: str
    """Hepburn romanization of ``reading``, without macrons."""
    meanings: List[str]
    level: Level
    pos: List[str] = field(default_factory=list)
    """JMdict part-of-speech codes (see :func:`openjlpt.pos_labels`)."""
    jmdict_id: Optional[int] = None
    other_forms: List[str] = field(default_factory=list)
    other_readings: List[str] = field(default_factory=list)
    examples: List[Example] = field(default_factory=list)

    def __hash__(self) -> int:  # list fields aren't hashable; the ID identifies the entry
        return hash(("vocab", self.id))


@dataclass(frozen=True)
class Kanji:
    """A single JLPT kanji, enriched from KANJIDIC2."""

    character: str
    level: Level
    strokes: Optional[int]
    grade: Optional[int]
    freq: Optional[int]
    radical: Optional[str]
    """Classical (Kangxi) radical, e.g. 日."""
    radical_number: Optional[int]
    onyomi: List[str]
    kunyomi: List[str]
    meanings: List[str]
    nanori: List[str] = field(default_factory=list)
    words: List[str] = field(default_factory=list)
    """OpenJLPT words that use this kanji, easiest level first."""
    supplementary: bool = False
    """A jōyō kanji missing from Waller's (pre-2010) lists, levelled by the words that use it."""

    def __hash__(self) -> int:
        return hash(("kanji", self.character))


@dataclass(frozen=True)
class Grammar:
    """A single JLPT grammar point."""

    id: str
    """Stable ID, a slug of the romaji (e.g. ``te-mo-ii``)."""
    pattern: str
    romaji: str
    level: Level
    meaning: str
    formation: str
    examples: List[Example] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    reading: Optional[str] = None
    """Kana form of ``pattern`` when it contains kanji."""
    notes: Optional[str] = None

    def __hash__(self) -> int:
        return hash(("grammar", self.id))
