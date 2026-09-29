<div align="center">

<img src="https://raw.githubusercontent.com/evanclan/OpenJLPT/main/assets/logo-160.png" width="88" height="88" alt="OpenJLPT logo">

# OpenJLPT

**The JLPT N5–N1 word, kanji and grammar lists: cleaned, cross-checked against JMdict, and free to use.**

7,811 words · 2,383 kanji · 526 grammar points · example sentences with furigana for 93% of words

[![CI](https://github.com/evanclan/OpenJLPT/actions/workflows/ci.yml/badge.svg)](https://github.com/evanclan/OpenJLPT/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/openjlpt?color=cb3837&label=npm)](https://www.npmjs.com/package/openjlpt)
[![PyPI](https://img.shields.io/pypi/v/openjlpt?color=3775a9)](https://pypi.org/project/openjlpt/)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/data-CC%20BY--SA%204.0-blue.svg)](https://github.com/evanclan/OpenJLPT/blob/main/LICENSE)

**[🌐 Browse online](https://evanclan.github.io/OpenJLPT/)** ·
**[🃏 Anki decks](https://evanclan.github.io/OpenJLPT/data.html#anki)** ·
`npm i openjlpt` · `pip install openjlpt` ·
**[日本語](https://github.com/evanclan/OpenJLPT/blob/main/README.ja.md)**

<img src="https://raw.githubusercontent.com/evanclan/OpenJLPT/main/assets/demo.png" width="860" alt="An OpenJLPT word page (勉強) with furigana over its example sentences, and the text analyzer coloring every kanji by JLPT level">

</div>

> [!NOTE]
> The JLPT hasn't published official vocabulary, kanji or grammar lists since 2010. Word and kanji
> levels here follow [Jonathan Waller's community lists](https://www.tanos.co.uk/jlpt/), the ones
> Jisho.org uses. Treat every level as a well-informed approximation. [More on levels ↓](#a-note-on-jlpt-levels)

## Why OpenJLPT?

Most JLPT datasets are copies of the same lists, and they come with the same garbled readings, no
example sentences, and unclear licensing. OpenJLPT fixes the data and makes it easy to use:

- **Verified against JMdict.** 99.7% of words are linked to their dictionary entry, which adds part
  of speech and a JMdict ID and catches wrong readings. [Hundreds of source errors are fixed](#how-the-data-is-built),
  each backed by a unit test.
- **Real example sentences, with furigana.** Tatoeba sentences for 93% of words are matched by
  *dictionary form*, so 読む finds 読んでいる. Short, checked sentences come first, and nine in ten
  carry readings over every kanji.
- **526 grammar points.** Original, reviewed explanations with formation rules, 2–3 examples each,
  and notes on easily confused patterns.
- **Ready for your stack.** JSON, CSV, SQLite with full-text search, Anki, Yomitan, npm, PyPI, a CLI,
  and a CDN. Every entry has a **stable ID**, so saved progress survives data updates.
- **Honestly licensed and kept fresh.** CC BY-SA 4.0 with [per-field attribution](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md),
  rebuilt monthly from upstream, and schema-validated in CI.

## What's inside

| Level | Words | Kanji | Grammar | |
|:---:|---:|---:|---:|---|
| **N5** | 674 | 84 | 81 | Beginner |
| **N4** | 630 | 169 | 98 | Elementary |
| **N3** | 1,659 | 387 | 101 | Intermediate |
| **N2** | 1,778 | 398 | 123 | Upper intermediate |
| **N1** | 3,070 | 1,345 | 123 | Advanced |
| **Total** | **7,811** | **2,383** | **526** | |

Each word appears once, at the easiest level that lists it. The counts come from
[`data/json/meta.json`](https://github.com/evanclan/OpenJLPT/blob/main/data/json/meta.json), which also records the upstream versions.

## Quick start

### No code

- **[The website](https://evanclan.github.io/OpenJLPT/)** has a page for every word, kanji and grammar point,
  plus search, spaced-repetition flashcards, and a *"what JLPT level is this text?"* analyzer.
- **[Anki decks](https://evanclan.github.io/OpenJLPT/data.html#anki)** for each level, with furigana, example sentences and text-to-speech.
- **[Yomitan dictionary](https://evanclan.github.io/OpenJLPT/data.html#yomitan)** that shows JLPT levels in your pop-up dictionary.
- **Spreadsheets:** open any [CSV](https://github.com/evanclan/OpenJLPT/tree/main/data/csv) in Excel or Google Sheets.

### JavaScript / TypeScript

```bash
npm install openjlpt
```

```ts
import { findWord, findKanji, searchVocab, getGrammar, kanjiIn } from 'openjlpt';

findWord('食べる');             // { reading: 'たべる', romaji: 'taberu', pos: ['v1', 'vt'], examples: [...] }
findKanji('日');                // { strokes: 4, radical: '日', onyomi: ['ニチ','ジツ'], words: ['明日', ...] }
searchVocab('taberu');          // kanji, kana, romaji or English; ranked
getGrammar('N4');               // 98 grammar points with examples
kanjiIn('日本語を勉強する').map((k) => k.level);   // ['N5', 'N5', 'N5', 'N4', 'N4']
```

**In the browser or a bundler** (Vite, Next.js, React Native): the main entry reads files with
`node:fs`, so import the JSON directly instead, or fetch it from the CDN:

```ts
import n5 from 'openjlpt/data/json/vocab/n5.json';   // bundled, fully static
const n4 = await fetch('https://cdn.jsdelivr.net/gh/evanclan/OpenJLPT@main/data/json/vocab/n4.json').then((r) => r.json());
```

### Python

```bash
pip install openjlpt
```

```python
from openjlpt import find_word, search_vocab, get_grammar, query

find_word("食べる").meanings                  # ['to eat']
search_vocab("weather", level="N5")[0].word  # '天気'
query("SELECT word, reading FROM vocab WHERE level = 'N5' LIMIT 2")
# [{'word': '会う', 'reading': 'あう'}, {'word': '青', 'reading': 'あお'}]
```

### Command line

```console
$ npx openjlpt 食べる          # or: pip install openjlpt && openjlpt 食べる
[N5] 食べる たべる taberu
   to eat
   Ichidan verb, transitive verb
   › ちょうど食べたかったものでした。
     That hit the spot.

$ npx openjlpt kanji 日        # kanji details
$ npx openjlpt grammar ながら   # grammar points
$ npx openjlpt quiz N4         # 10-word reading quiz in your terminal
```

### SQLite

```sql
-- Full-text search over words, readings, romaji and meanings
SELECT v.word, v.reading, v.level
FROM vocab_fts f JOIN vocab v ON v.rowid = f.rowid
WHERE vocab_fts MATCH 'weather';
```

## API at a glance

| TypeScript | Python | Returns |
|---|---|---|
| `getVocab(level?)` | `get_vocab(level=None)` | all words, or one level's |
| `findWord(word)` · `findWords(word)` | `find_word(word)` · `find_words(word)` | a word by spelling (also alternative spellings) · all homographs |
| `getVocabById(id)` | `get_vocab_by_id(id)` | a word by its stable ID |
| `searchVocab(q, {level, limit})` | `search_vocab(q, level, limit)` | ranked search over kanji, kana, romaji and English |
| `getKanji(level?)` · `findKanji(ch)` | `get_kanji(level)` · `find_kanji(ch)` | kanji |
| `kanjiIn(text)` | `kanji_in(text)` | the JLPT kanji in a text, in order |
| `getGrammar(level?)` · `getGrammarById(id)` | `get_grammar(level)` · `get_grammar_by_id(id)` | grammar points |
| `findGrammar(pattern)` · `searchGrammar(q)` | `find_grammar(pattern)` · `search_grammar(q)` | grammar lookup and search |
| `meta()` · `posLabels()` | `meta()` · `pos_labels()` | counts, source versions · part-of-speech legend |
| `sample(items, n)` | `sample(items, n, rng)` | random picks for flashcards and quizzes |
| `toRubyHtml(furigana)` | `to_ruby_html(furigana)` | an example's furigana as `<ruby>` HTML |
| — | `query(sql, params)` · `connect()` | the bundled SQLite database (read-only) |

## Download

| Format | Where |
|---|---|
| JSON, per level | [`data/json/`](https://github.com/evanclan/OpenJLPT/tree/main/data/json): `vocab/`, `kanji/`, `grammar/` × `n5.json` … `n1.json` |
| CSV, per level | [`data/csv/`](https://github.com/evanclan/OpenJLPT/tree/main/data/csv) |
| SQLite, everything | [`data/openjlpt.sqlite`](https://github.com/evanclan/OpenJLPT/raw/main/data/openjlpt.sqlite): tables `vocab`, `kanji`, `grammar`, `pos` and the FTS index `vocab_fts` |
| Anki decks, Yomitan | [the website](https://evanclan.github.io/OpenJLPT/data.html#anki) and [Releases](https://github.com/evanclan/OpenJLPT/releases) |

## Data format

Every entry is validated against the [JSON Schemas](https://github.com/evanclan/OpenJLPT/tree/main/schema) in CI.

<details open>
<summary><b>Vocabulary</b>: <code>data/json/vocab/n5.json</code></summary>

```json
{
  "id": "86f67e2dc3",
  "word": "食べる",
  "reading": "たべる",
  "romaji": "taberu",
  "meanings": ["to eat"],
  "level": "N5",
  "pos": ["v1", "vt"],
  "jmdict_id": 1358280,
  "examples": [
    {
      "ja": "ちょうど食べたかったものでした。",
      "furigana": "ちょうど{食|た}べたかったものでした。",
      "en": "That hit the spot.",
      "tatoeba_id": 202896
    }
  ]
}
```

| Field | |
|---|---|
| `id` | Stable ID. It is assigned once and frozen in [`sources/ids.lock.json`](https://github.com/evanclan/OpenJLPT/blob/main/sources/ids.lock.json), so it survives spelling and reading fixes. |
| `word` · `reading` · `romaji` | Headword, kana reading (kana-only words read as themselves), and Hepburn romaji without macrons (`toukyou`). |
| `meanings` | English glosses, most important first. |
| `pos` · `jmdict_id` | JMdict part-of-speech codes for the matching sense ([legend](https://github.com/evanclan/OpenJLPT/blob/main/data/json/pos.json): `v1` means "Ichidan verb"), and the JMdict entry number. |
| `other_forms` · `other_readings` | Other spellings (あさって → 明後日) and readings (四 → よん). Optional. |
| `examples` | Up to two Tatoeba sentences, with `tatoeba_id` for attribution. Optional. |
| `examples[].furigana` | The sentence with readings over its kanji, in `{漢字\|かんじ}` notation. Present only when every kanji could be read with confidence. `toRubyHtml()` / `to_ruby_html()` turn it into `<ruby>` HTML. |

</details>

<details>
<summary><b>Kanji</b>: <code>data/json/kanji/n5.json</code></summary>

```json
{
  "character": "日", "level": "N5", "strokes": 4, "grade": 1, "freq": 1,
  "radical": "日", "radical_number": 72,
  "onyomi": ["ニチ", "ジツ"], "kunyomi": ["ひ", "-び", "-か"], "nanori": ["あ", "あき", "いる"],
  "meanings": ["day", "sun", "Japan", "counter for days"],
  "words": ["明日", "一日", "五日", "昨日", "今日", "九日", "十日", "七日"]
}
```

- `freq` is the newspaper frequency rank (1 = most common).
- `radical` is the classical (Kangxi) radical.
- `kunyomi` uses KANJIDIC2 notation: `た.べる` marks okurigana, `-` marks prefix or suffix use.
- `words` lists OpenJLPT words that use the kanji, easiest first.
- `"supplementary": true` marks the 172 jōyō kanji that are missing from Waller's pre-2010 lists
  (誰, 頃, and even 分). They are placed at the easiest level of a word that uses them, otherwise N1.

</details>

<details>
<summary><b>Grammar</b>: <code>data/json/grammar/n5.json</code></summary>

```json
{
  "id": "te-mo-ii",
  "pattern": "〜てもいい",
  "romaji": "te mo ii",
  "level": "N5",
  "meaning": "may; it's okay to",
  "formation": "Verb-te + もいい",
  "examples": [
    { "ja": "この辞書を使ってもいいですか。", "en": "May I use this dictionary?" },
    { "ja": "今日は早く帰ってもいいです。", "en": "You may go home early today." }
  ],
  "tags": ["permission"],
  "notes": "Add ですか to ask for permission. A polite refusal is often just すみません、ちょっと…."
}
```

Patterns with kanji also have a kana `reading` (〜に対して → 〜にたいして). `tags` come from a
[controlled vocabulary](https://github.com/evanclan/OpenJLPT/blob/main/schema/grammar.schema.json).

</details>

## How the data is built

Waller's lists, JMdict, KANJIDIC2 and Tatoeba go in, and `scripts/build-*.ts` turns them into
`data/`. CI then validates the result. The level lists are the community standard, but the raw
files are messy. The build fixes them systematically, and
[`tests/ts/normalize.test.ts`](https://github.com/evanclan/OpenJLPT/blob/main/tests/ts/normalize.test.ts)
quotes the real source card behind every rule:

| Problem in the source | Example | Fix |
|---|---|---|
| Missing readings on kana words | `あさって` → `""` | reading = word (1,096 words) |
| する baked into readings | `勉強` → `べんきょうする` | strip it (30 words) |
| Notes and mojibake as readings | `はい` → `（感）`, `賛成` → `Uӣ[い` | reject; fill from JMdict |
| Glosses split mid-parenthesis | `to take (e.g. time` + `money)` | split outside parentheses only |
| Glosses cut off at 100 characters | `…;unwise;untime` | repair from JMdict (`untimely`) |
| Wrong readings | `途中` → `つちゅう`, `灰皿` → `はいさら` | corrected when kanji **and** meaning agree with JMdict |
| Typos in kanji | `著` for 着, `田ぼ` for 田んぼ | matched by reading and meaning |
| The same word at several levels | `あさって` (N5) and `明後日` (N3) | kept once, at the easiest level |
| Example sentences by substring | `あれ` matched `冷徹であれ！` | matched by dictionary form via Tatoeba's word index |
| Jōyō kanji missing from the lists | `分`, `誰`, `頃` | added as `supplementary` |

To rebuild everything yourself: `npm install && npm run build`. See [CONTRIBUTING.md](https://github.com/evanclan/OpenJLPT/blob/main/CONTRIBUTING.md).

## Alternatives: when to use something else

OpenJLPT stands on the shoulders of these projects. Pick the one that fits your need:

- **[jmdict-simplified](https://github.com/scriptin/jmdict-simplified)**: the *whole* JMdict and KANJIDIC2 as JSON.
  Use it if you need a full dictionary rather than JLPT lists.
- **[open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks)**: JLPT vocabulary Anki decks.
  Use it if you only want Anki vocab decks in its format.
- **[kanji-data](https://github.com/davidluzgouveia/kanji-data)**: kanji with JLPT and WaniKani levels.
  Use it if you need WaniKani levels.
- **OpenJLPT** fits best when you want vocabulary, kanji **and** grammar together, cleaned and linked
  to JMdict, with example sentences, in many formats, under one license.

## FAQ

**Can I use it in a commercial or closed-source app?** Yes. The data is under CC BY-SA 4.0, the same
license as JMdict, which many commercial apps already use. Credit OpenJLPT and its sources: one line
on your About screen is enough (copy it from [NOTICE.md](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md)).
ShareAlike applies to the *data* you redistribute, such as a modified word list. *(This is not legal advice.)*

**Why is word X at level Y?** Levels come from Waller's lists. If one looks wrong, [open an issue](https://github.com/evanclan/OpenJLPT/issues/new?template=data-error.yml) with a source.
Wrong *readings, meanings or examples* are bugs we fix.

**How current is it?** A scheduled job rebuilds from JMdict, KANJIDIC2, Waller and Tatoeba every month.

## A note on JLPT levels

The Japan Foundation does not publish vocabulary, kanji or grammar lists for the current (post-2010)
JLPT. Word and kanji levels come from [Jonathan Waller's lists](https://www.tanos.co.uk/jlpt/), the
community standard. Grammar levels follow the consensus of common JLPT preparation materials. All of
them are approximations, not a guarantee of what appears on the test.

## Roadmap

- [ ] Richer English meanings from JMdict alongside Waller's short glosses
- [ ] Audio (native or TTS)
- [ ] More example sentences for grammar points

Ideas and pull requests are welcome: [open an issue](https://github.com/evanclan/OpenJLPT/issues/new/choose).

## Contributing and support

Found a wrong reading or an unnatural sentence? Every page on the website has a *Report an error* link,
and [CONTRIBUTING.md](https://github.com/evanclan/OpenJLPT/blob/main/CONTRIBUTING.md) explains how
fixes flow into the data. If OpenJLPT saved you time, **⭐ star the repo** so others can find it, or
[sponsor the project](https://github.com/sponsors/evanclan).

## License

Dataset and code: **[CC BY-SA 4.0](https://github.com/evanclan/OpenJLPT/blob/main/LICENSE)**. Upstream attribution
(JMdict and KANJIDIC2 from EDRDG, Jonathan Waller's lists, and Tatoeba) is in [NOTICE.md](https://github.com/evanclan/OpenJLPT/blob/main/NOTICE.md).
To cite OpenJLPT, use GitHub's *"Cite this repository"* button, which reads [`CITATION.cff`](https://github.com/evanclan/OpenJLPT/blob/main/CITATION.cff).
