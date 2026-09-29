# Changelog

All notable changes to OpenJLPT are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/). Data changes that alter field names or meanings
count as breaking.

## [0.3.0] — 2026-09-29

A big data-quality release: every word is verified against JMdict, grammar grows from 100 to
526 points, and there are new learner downloads and a website.

### Added
- **Vocabulary fields:** stable `id`, `romaji`, JMdict `pos` and `jmdict_id`, `other_forms`,
  `other_readings`, and `tatoeba_id` on example sentences.
- **Kanji fields:** `radical`, `radical_number`, `nanori`, and `words` (vocabulary that uses the kanji).
- **Grammar:** 526 original, reviewed points (was 100), each with a stable `id`, `romaji`,
  `formation`, 2–3 examples, controlled `tags` and notes on similar patterns.
- `data/json/meta.json` (counts, upstream versions) and `data/json/pos.json` (part-of-speech legend).
- SQLite: `pos` table and a `vocab_fts` FTS5 full-text index; tables now use the JSON IDs as keys.
- **npm package:** `findWords`, `getVocabById`, `getGrammarById`, `kanjiIn`, `meta`, `posLabels`,
  `sample`, `normalize`; ranked search across kanji, kana, romaji and English; an `openjlpt` CLI.
- **Python package:** the same API (`find_words`, `get_vocab_by_id`, `kanji_in`, …), a read-only
  SQLite connection, and an `openjlpt` CLI (`python -m openjlpt`).
- **Website** (GitHub Pages): pages for every word, kanji and grammar point, search,
  spaced-repetition flashcards, and a JLPT kanji-level text analyzer.
- **Anki decks** (per level and complete) and a **Yomitan** JLPT-level dictionary.
- `sources/waller/`: a verbatim snapshot of the upstream level lists, for reproducible builds.
- `sources/corrections/vocab.json`: reviewed fixes for individual source cards.

### Fixed
- 1,096 kana-only words had an empty `reading`.
- 30 suru-nouns had する in their reading (勉強 read べんきょうする).
- Part-of-speech notes and mojibake stored as readings (はい → `（感）`, 賛成 → `Uӣ[い`).
- Glosses split inside parentheses, numbered senses, leading POS codes, and glosses cut off at
  100 characters in the source.
- Dozens of wrong readings and misspelled headwords, corrected against JMdict (途中 つちゅう →
  とちゅう, 灰皿 はいさら → はいざら, 著 → 着, 田ぼ → 田んぼ).
- Words listed at several levels now appear once, at the easiest level; other spellings are kept in `other_forms`.
- Example sentences are matched by dictionary form (via Tatoeba's word index) instead of
  substring, so there are no more false matches (あれ in 冷徹であれ). Coverage rose from 89% to 95%.
- The monthly data refresh had failed on every run because its token couldn't push.
- `find_word` / `findKanji` no longer scan the whole dataset on every call.

### Changed
- Vocabulary is sorted by reading within each level; grammar keeps teaching order.
- Mis-levelled seed grammar points were moved (for example 〜がち and 〜だらけ from N1 to N3).
- Python `examples`, `pos` and similar list fields default to `[]` instead of `None`.

## [0.2.0] — 2026-07-21

### Added
- 100 seed grammar points (20 per level) with JSON/CSV/SQLite output and loader support.

## [0.1.0] — 2026-07-01

### Added
- N5–N1 vocabulary and kanji as JSON, CSV and SQLite; Tatoeba example sentences; npm loader;
  Python package on PyPI.

[0.3.0]: https://github.com/evanclan/OpenJLPT/compare/c42fd9f...HEAD
[0.2.0]: https://github.com/evanclan/OpenJLPT/commit/c42fd9f
[0.1.0]: https://github.com/evanclan/OpenJLPT/commit/b1bd4c5
