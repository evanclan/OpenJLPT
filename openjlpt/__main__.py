"""Command-line interface: ``openjlpt`` or ``python -m openjlpt``.

    openjlpt 食べる               search words (kanji, kana, romaji or English)
    openjlpt kanji 日             kanji details
    openjlpt grammar てもいい      grammar points
    openjlpt random N5 [--kanji|--grammar]
    openjlpt quiz N4              reading quiz in the terminal
    openjlpt stats                dataset counts and sources
"""

from __future__ import annotations

import os
import sys
from typing import List, Optional

from . import (
    find_grammar,
    find_kanji,
    get_grammar,
    get_kanji,
    get_vocab,
    levels,
    meta,
    normalize,
    pos_labels,
    sample,
    search_grammar,
    search_vocab,
)
from ._models import Grammar, Kanji, Vocab

_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def _paint(code: int, s: str) -> str:
    return f"\x1b[{code}m{s}\x1b[0m" if _COLOR else s


def _bold(s: str) -> str:
    return _paint(1, s)


def _dim(s: str) -> str:
    return _paint(2, s)


def _tag(level: str) -> str:
    return _paint({"N5": 32, "N4": 36, "N3": 34, "N2": 35, "N1": 31}[level], f"[{level}]")


def show_vocab(v: Vocab, full: bool = True) -> None:
    head = _bold(v.word) if v.word == v.reading else f"{_bold(v.word)} {_paint(36, v.reading)}"
    print(f"{_tag(v.level)} {head} {_dim(v.romaji)}")
    print(f"   {'; '.join(v.meanings)}")
    if not full:
        return
    if v.pos:
        labels = pos_labels()
        print(_dim("   " + ", ".join(labels.get(p, p) for p in v.pos)))
    if v.other_forms:
        print(_dim("   also written: " + "、".join(v.other_forms)))
    for ex in v.examples:
        print(f"   {_paint(32, '›')} {ex.ja}\n     {_dim(ex.en)}")


def show_kanji(k: Kanji) -> None:
    print(f"{_tag(k.level)} {_bold(k.character)}  {', '.join(k.meanings)}")
    if k.onyomi:
        print(f"   on:  {_paint(36, '、'.join(k.onyomi))}")
    if k.kunyomi:
        print(f"   kun: {_paint(36, '、'.join(k.kunyomi))}")
    facts = [
        f"{k.strokes} strokes" if k.strokes else "",
        f"radical {k.radical} (#{k.radical_number})" if k.radical else "",
        f"grade {k.grade}" if k.grade else "",
        f"frequency #{k.freq}" if k.freq else "",
    ]
    print(_dim("   " + " · ".join(f for f in facts if f)))
    if k.words:
        print("   words: " + "、".join(k.words))


def show_grammar(g: Grammar) -> None:
    print(f"{_tag(g.level)} {_bold(g.pattern)} {_dim(g.romaji)}")
    print(f"   {g.meaning}")
    print(_dim(f"   {g.formation}"))
    for ex in g.examples[:2]:
        print(f"   {_paint(32, '›')} {ex.ja}\n     {_dim(ex.en)}")
    if g.notes:
        print(_dim(f"   note: {g.notes}"))


def _level(arg: Optional[str]) -> Optional[str]:
    return arg.upper() if arg and arg.upper() in levels else None


def quiz(level: Optional[str]) -> None:
    deck = sample(get_vocab(level), 10)  # type: ignore[arg-type]
    right = 0
    print(_bold(f"OpenJLPT quiz — {level or 'all levels'}, {len(deck)} words. "
                "Type the reading (kana or romaji), or press Enter to reveal.\n"))
    for i, v in enumerate(deck, 1):
        try:
            answer = input(f"{_dim(f'{i}/{len(deck)}')} {_bold(v.word)}  {_dim(v.meanings[0])}\n  › ").strip().lower()
        except EOFError:
            break
        # Kana-insensitive: てすと counts for テスト.
        ok = bool(answer) and normalize(answer) in {normalize(r) for r in (v.reading, v.romaji, *v.other_readings)}
        right += ok
        mark = _paint(32, "✓") if ok else _paint(31, "✗")
        print(f"  {mark} {_paint(36, v.reading)} {_dim(v.romaji)} — {'; '.join(v.meanings)}\n")
    print(_bold(f"Score: {right}/{len(deck)}"))


def main(argv: Optional[List[str]] = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, rest = args[0], args[1:]
    arg = " ".join(rest)
    if cmd == "kanji":
        found = [k for k in (find_kanji(c) for c in arg) if k]
        for k in found:
            show_kanji(k)
        return 0 if found else _not_found(arg)
    if cmd == "grammar":
        results = find_grammar(arg) or search_grammar(arg, limit=8)
        for g in results[:8]:
            show_grammar(g)
        return 0 if results else _not_found(arg)
    if cmd == "random":
        level = _level(next((r for r in rest if not r.startswith("--")), None))
        if "--kanji" in rest:
            show_kanji(sample(get_kanji(level))[0])  # type: ignore[arg-type]
        elif "--grammar" in rest:
            show_grammar(sample(get_grammar(level))[0])  # type: ignore[arg-type]
        else:
            show_vocab(sample(get_vocab(level))[0])  # type: ignore[arg-type]
        return 0
    if cmd == "quiz":
        quiz(_level(rest[0] if rest else None))
        return 0
    if cmd == "stats":
        m = meta()
        print(_bold(f"OpenJLPT {m['version']}"))
        for kind in ("vocab", "kanji", "grammar"):
            counts = "  ".join(f"{lvl} {m['counts'][kind][lvl]}" for lvl in levels)
            print(f"  {kind:<8} {counts}  {_dim('total ' + str(m['counts'][kind]['total']))}")
        return 0
    query = " ".join(args)
    results = search_vocab(query, limit=8)
    for i, v in enumerate(results):
        show_vocab(v, full=i == 0)
    return 0 if results else _not_found(query)


def _not_found(q: str) -> int:
    print(f'No results for "{q}".', file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
