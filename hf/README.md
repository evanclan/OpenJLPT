---
license: cc-by-sa-4.0
language:
- ja
- en
pretty_name: OpenJLPT
size_categories:
- 1K<n<10K
task_categories:
- translation
- text-classification
tags:
- jlpt
- japanese
- japanese-language
- vocabulary
- kanji
- grammar
- furigana
- language-learning
configs:
- config_name: vocab
  default: true
  data_files:
  - split: n5
    path: data/json/vocab/n5.json
  - split: n4
    path: data/json/vocab/n4.json
  - split: n3
    path: data/json/vocab/n3.json
  - split: n2
    path: data/json/vocab/n2.json
  - split: n1
    path: data/json/vocab/n1.json
- config_name: kanji
  data_files:
  - split: n5
    path: data/json/kanji/n5.json
  - split: n4
    path: data/json/kanji/n4.json
  - split: n3
    path: data/json/kanji/n3.json
  - split: n2
    path: data/json/kanji/n2.json
  - split: n1
    path: data/json/kanji/n1.json
- config_name: grammar
  data_files:
  - split: n5
    path: data/json/grammar/n5.json
  - split: n4
    path: data/json/grammar/n4.json
  - split: n3
    path: data/json/grammar/n3.json
  - split: n2
    path: data/json/grammar/n2.json
  - split: n1
    path: data/json/grammar/n1.json
---

# OpenJLPT

**The JLPT N5–N1 word, kanji and grammar lists: cleaned, cross-checked against JMdict, and free to use.**

About 7,800 words, 2,400 kanji and 526 grammar points, with readings, romaji, English meanings,
part of speech, JMdict IDs and example sentences (most with furigana). Every entry has a stable
ID that survives data updates.

- 🌐 Website: <https://evanclan.github.io/OpenJLPT/>
- 💻 Source, docs and issue tracker: <https://github.com/evanclan/OpenJLPT>
- 📦 Also on npm (`openjlpt`) and PyPI (`openjlpt`), and as Anki decks and a Yomitan dictionary

## Load it

```python
from datasets import load_dataset

vocab = load_dataset("OpenJLPT/openjlpt", "vocab")          # splits: n5, n4, n3, n2, n1
kanji = load_dataset("OpenJLPT/openjlpt", "kanji", split="n5")
grammar = load_dataset("OpenJLPT/openjlpt", "grammar", split="n4")

vocab["n5"][0]
# {'id': '…', 'word': '会う', 'reading': 'あう', 'romaji': 'au', 'meanings': ['to meet', …], 'level': 'N5', …}
```

Replace `OpenJLPT/openjlpt` with this dataset's repository name if it lives elsewhere.

## Fields

**vocab:** `id`, `word`, `reading`, `romaji`, `meanings`, `level`, `pos` (JMdict part-of-speech
codes), `jmdict_id`, `other_forms`, `other_readings`, and `examples` (Tatoeba sentences with
`ja`, `furigana` in `{漢字|かんじ}` notation, `en` and `tatoeba_id`).

**kanji:** `character`, `level`, `strokes`, `grade`, `freq`, `radical`, `radical_number`,
`onyomi`, `kunyomi`, `nanori`, `meanings`, `words`, and `supplementary` for jōyō kanji missing
from the source lists.

**grammar:** `id`, `pattern`, `reading`, `romaji`, `level`, `meaning`, `formation`, `examples`
(original sentences with reviewed furigana), `tags` and `notes`.

The full schema is in the [GitHub repository](https://github.com/evanclan/OpenJLPT/tree/main/schema).

## A note on levels

The JLPT hasn't published official vocabulary, kanji or grammar lists since 2010. Word and kanji
levels follow Jonathan Waller's community lists; grammar levels follow the consensus of common
JLPT study materials. Treat every level as a well-informed approximation.

## License and attribution

CC BY-SA 4.0. Built from [JMdict and KANJIDIC2](https://www.edrdg.org/) (EDRDG, CC BY-SA 4.0),
[Jonathan Waller's JLPT lists](https://www.tanos.co.uk/jlpt/) (CC BY) and
[Tatoeba](https://tatoeba.org) (CC BY 2.0 FR). See
[NOTICE.md](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md) for details, and cite
OpenJLPT with the repository's
[CITATION.cff](https://github.com/evanclan/OpenJLPT/blob/main/CITATION.cff).
