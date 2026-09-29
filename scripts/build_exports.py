"""Build learner downloads from data/json:

* Anki decks (.apkg) per level — vocabulary, kanji and grammar — plus one
  "complete" deck with sub-decks for every level.
* A Yomitan dictionary (.zip) that tags words and kanji with their JLPT level
  in the pop-up.

Note GUIDs are derived from OpenJLPT's stable IDs, so importing a newer
release updates existing notes (keeping review history) instead of duplicating them.

Usage: python scripts/build_exports.py [out_dir]     (requires: pip install genanki)
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import zipfile

import genanki

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "json")
LEVELS = ["N5", "N4", "N3", "N2", "N1"]
REPO = "https://github.com/evanclan/OpenJLPT"

# Fixed IDs so every release produces the same note types and decks.
VOCAB_MODEL_ID = 1_730_100_001
KANJI_MODEL_ID = 1_730_100_002
GRAMMAR_MODEL_ID = 1_730_100_003
DECK_BASE_ID = 1_730_200_000

KANJI_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿々ヶ〆]+")


def load(kind: str, level: str) -> list:
    with open(os.path.join(DATA, kind, f"{level.lower()}.json"), encoding="utf-8") as f:
        return json.load(f)


def esc(s: str) -> str:
    return html.escape(s or "", quote=False)


def to_hira(s: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def furigana(word: str, reading: str) -> str:
    """Anki furigana syntax — 食[た]べる — by aligning the reading to the kanji runs."""
    parts = re.findall(r"[㐀-䶿一-鿿豈-﫿々ヶ〆]+|[^㐀-䶿一-鿿豈-﫿々ヶ〆]+", word)
    if not any(KANJI_RE.fullmatch(p) for p in parts):
        return word
    pattern = "".join("(.+?)" if KANJI_RE.fullmatch(p) else "(" + re.escape(to_hira(p)) + ")" for p in parts)
    m = re.fullmatch(pattern, to_hira(reading))
    if not m:
        return f"{word}[{reading}]"
    out = []
    for i, p in enumerate(parts):
        # Anki needs a space before a furigana block that follows other text.
        out.append((" " if out else "") + f"{p}[{m.group(i + 1)}]" if KANJI_RE.fullmatch(p) else p)
    return "".join(out)


CSS = """
.card { font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif; font-size: 22px; text-align: center; color: #1d1b19; background: #fbfaf8; }
.nightMode.card, .night_mode .card { color: #ece8e3; background: #1c1b19; }
.big { font-size: 64px; line-height: 1.2; }
.kanji { font-size: 110px; line-height: 1.1; }
.reading { font-size: 28px; color: #6b6560; }
.meaning { font-size: 24px; margin: 10px 0; }
.small { font-size: 16px; color: #6b6560; }
.ex { font-size: 20px; margin-top: 14px; }
.ex .en { font-size: 16px; color: #6b6560; }
.lvl { display: inline-block; padding: 1px 10px; border-radius: 999px; font-size: 13px; color: #fff; background: #d7263d; font-weight: bold; }
.formation { font-family: monospace; font-size: 16px; }
hr#answer { border: 0; border-top: 1px solid #ccc; margin: 16px 0; }
"""

VOCAB_MODEL = genanki.Model(
    VOCAB_MODEL_ID,
    "OpenJLPT Vocabulary",
    fields=[{"name": n} for n in ["Word", "Reading", "Furigana", "Romaji", "Meaning", "PartOfSpeech",
                                  "ExampleJa", "ExampleEn", "Level", "OpenJLPT ID"]],
    templates=[{
        "name": "Recognition",
        "qfmt": '<div class="big">{{Word}}</div>',
        "afmt": '<div class="big">{{furigana:Furigana}}</div>'
                '<hr id="answer"><div class="reading">{{Reading}} <span class="small">{{Romaji}}</span></div>'
                '<div class="meaning">{{Meaning}}</div><div class="small">{{PartOfSpeech}}</div>'
                '{{#ExampleJa}}<div class="ex">{{ExampleJa}}<div class="en">{{ExampleEn}}</div></div>{{/ExampleJa}}'
                '<p><span class="lvl">{{Level}}</span></p>{{tts ja_JP:Reading}}',
    }],
    css=CSS,
    sort_field_index=0,
)

KANJI_MODEL = genanki.Model(
    KANJI_MODEL_ID,
    "OpenJLPT Kanji",
    fields=[{"name": n} for n in ["Kanji", "Meaning", "Onyomi", "Kunyomi", "Strokes", "Radical", "Words", "Level"]],
    templates=[{
        "name": "Kanji → meaning",
        "qfmt": '<div class="kanji">{{Kanji}}</div>',
        "afmt": '<div class="kanji">{{Kanji}}</div><hr id="answer">'
                '<div class="meaning">{{Meaning}}</div>'
                '<div class="reading">{{Onyomi}}</div><div class="reading">{{Kunyomi}}</div>'
                '<div class="small">{{Strokes}} strokes · radical {{Radical}}</div>'
                '{{#Words}}<div class="ex">{{Words}}</div>{{/Words}}<p><span class="lvl">{{Level}}</span></p>',
    }],
    css=CSS,
)

GRAMMAR_MODEL = genanki.Model(
    GRAMMAR_MODEL_ID,
    "OpenJLPT Grammar",
    fields=[{"name": n} for n in ["Pattern", "Reading", "Romaji", "Meaning", "Formation", "Example1Ja", "Example1En",
                                  "Example2Ja", "Example2En", "Notes", "Level", "OpenJLPT ID"]],
    templates=[{
        "name": "Pattern → meaning",
        "qfmt": '<div class="big" style="font-size:44px">{{Pattern}}</div>',
        "afmt": '<div class="big" style="font-size:44px">{{Pattern}}</div><hr id="answer">'
                '<div class="meaning">{{Meaning}}</div><div class="formation">{{Formation}}</div>'
                '<div class="ex">{{Example1Ja}}<div class="en">{{Example1En}}</div></div>'
                '{{#Example2Ja}}<div class="ex">{{Example2Ja}}<div class="en">{{Example2En}}</div></div>{{/Example2Ja}}'
                '{{#Notes}}<p class="small">{{Notes}}</p>{{/Notes}}<p><span class="lvl">{{Level}}</span></p>',
    }],
    css=CSS,
)


def Note(key: str, **kwargs) -> genanki.Note:
    """A note keyed by OpenJLPT's stable ID, so re-imports update instead of duplicating."""
    return genanki.Note(guid=genanki.guid_for("openjlpt", key), **kwargs)


def vocab_note(v: dict, pos_labels: dict) -> genanki.Note:
    ex = (v.get("examples") or [{}])[0]
    return Note(
        "v:" + v["id"],
        model=VOCAB_MODEL,
        fields=[esc(v["word"]), esc(v["reading"]), esc(furigana(v["word"], v["reading"])), esc(v["romaji"]),
                esc("; ".join(v["meanings"])), esc(", ".join(pos_labels.get(p, p) for p in v.get("pos", []))),
                esc(ex.get("ja", "")), esc(ex.get("en", "")), v["level"], v["id"]],
        tags=["OpenJLPT", "JLPT_" + v["level"], "vocab"],
    )


def kanji_note(k: dict) -> genanki.Note:
    return Note(
        "k:" + k["character"],
        model=KANJI_MODEL,
        fields=[k["character"], esc(", ".join(k["meanings"])), esc("、".join(k["onyomi"])), esc("、".join(k["kunyomi"])),
                str(k.get("strokes") or ""), esc(k.get("radical") or ""), esc("、".join((k.get("words") or [])[:5])), k["level"]],
        tags=["OpenJLPT", "JLPT_" + k["level"], "kanji"],
    )


def grammar_note(g: dict) -> genanki.Note:
    ex = g.get("examples") or []
    e1 = ex[0] if ex else {}
    e2 = ex[1] if len(ex) > 1 else {}
    return Note(
        "g:" + g["id"],
        model=GRAMMAR_MODEL,
        fields=[esc(g["pattern"]), esc(g.get("reading", "")), esc(g["romaji"]), esc(g["meaning"]), esc(g["formation"]),
                esc(e1.get("ja", "")), esc(e1.get("en", "")), esc(e2.get("ja", "")), esc(e2.get("en", "")),
                esc(g.get("notes", "")), g["level"], g["id"]],
        tags=["OpenJLPT", "JLPT_" + g["level"], "grammar"],
    )


KINDS = {"vocab": "Vocabulary", "kanji": "Kanji", "grammar": "Grammar"}


def deck_id(kind: str, level: str) -> int:
    return DECK_BASE_ID + list(KINDS).index(kind) * 10 + LEVELS.index(level)


DESCRIPTION = (f'Free JLPT deck from <a href="{REPO}">OpenJLPT</a> (CC BY-SA 4.0). '
               "Levels by Jonathan Waller; dictionary data from JMdict/KANJIDIC2 (EDRDG); "
               "example sentences from Tatoeba (CC BY 2.0 FR).")


def build_anki(out: str) -> list:
    with open(os.path.join(DATA, "pos.json"), encoding="utf-8") as f:
        pos_labels = json.load(f)
    make = {"vocab": lambda x: vocab_note(x, pos_labels), "kanji": kanji_note, "grammar": grammar_note}
    written = []
    complete = []
    for kind, label in KINDS.items():
        for level in LEVELS:
            deck = genanki.Deck(deck_id(kind, level), f"OpenJLPT::{level}::{label}", description=DESCRIPTION)
            for item in load(kind, level):
                deck.add_note(make[kind](item))
            complete.append(deck)
            path = os.path.join(out, f"openjlpt-{level.lower()}-{kind}.apkg")
            genanki.Package(deck).write_to_file(path)
            written.append(path)
    path = os.path.join(out, "openjlpt-complete.apkg")
    genanki.Package(complete).write_to_file(path)
    written.append(path)
    return written


def build_yomitan(out: str, version: str) -> str:
    """A Yomitan 'frequency' dictionary that shows each word's and kanji's JLPT level."""
    rank = {"N5": 1, "N4": 2, "N3": 3, "N2": 4, "N1": 5}  # rank-based: lower = more basic
    terms, kanji = [], []
    for level in LEVELS:
        for v in load("vocab", level):
            meta = {"value": rank[level], "displayValue": level}
            for form in [v["word"], *v.get("other_forms", [])]:
                terms.append([form, "freq", {"reading": v["reading"], "frequency": meta}])
        for k in load("kanji", level):
            kanji.append([k["character"], "freq", {"value": rank[level], "displayValue": level}])
    index = {
        "title": "OpenJLPT",
        "revision": f"openjlpt-{version}",
        "format": 3,
        "sequenced": False,
        "author": "OpenJLPT contributors",
        "url": REPO,
        "description": "JLPT level (N5–N1) for every word and kanji in the OpenJLPT dataset.",
        "attribution": "OpenJLPT (CC BY-SA 4.0); levels by Jonathan Waller (CC BY); JMdict/KANJIDIC2 (EDRDG, CC BY-SA 4.0).",
        "frequencyMode": "rank-based",
    }
    path = os.path.join(out, "openjlpt-yomitan.zip")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("index.json", json.dumps(index, ensure_ascii=False))
        z.writestr("term_meta_bank_1.json", json.dumps(terms, ensure_ascii=False))
        z.writestr("kanji_meta_bank_1.json", json.dumps(kanji, ensure_ascii=False))
    return path


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "exports")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(DATA, "meta.json"), encoding="utf-8") as f:
        version = json.load(f)["version"]
    files = build_anki(out) + [build_yomitan(out, version)]
    for p in files:
        print(f"{os.path.getsize(p) / 1024:8.0f} KB  {os.path.relpath(p, ROOT)}")


if __name__ == "__main__":
    main()
