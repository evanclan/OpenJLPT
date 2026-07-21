from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

Level = Literal["N5", "N4", "N3", "N2", "N1"]
"""JLPT level in the current N5–N1 system."""


@dataclass(frozen=True)
class Example:
    """A Japanese↔English sentence pair from Tatoeba (CC BY 2.0 FR)."""

    ja: str
    en: str


@dataclass(frozen=True)
class Vocab:
    """A single JLPT vocabulary entry."""

    word: str
    reading: str
    meanings: List[str]
    level: Level
    examples: Optional[List[Example]] = None


@dataclass(frozen=True)
class Kanji:
    """A single JLPT kanji, enriched from KANJIDIC2."""

    character: str
    level: Level
    strokes: Optional[int]
    grade: Optional[int]
    freq: Optional[int]
    onyomi: List[str]
    kunyomi: List[str]
    meanings: List[str]


@dataclass(frozen=True)
class Grammar:
    """A single JLPT grammar point."""

    pattern: str
    level: Level
    meaning: str
    formation: Optional[str] = None
    examples: Optional[List[Example]] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
