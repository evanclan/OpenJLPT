# Grammar source data

Hand-written source for the OpenJLPT grammar dataset — one file per level
(`n5.json` … `n1.json`), in teaching order. `npm run build:grammar` turns them into
`data/json/grammar/`, the CSVs and the SQLite table (CI fails if you forget).

Every entry is original writing released under CC BY-SA 4.0: the explanations and
all example sentences were written for OpenJLPT, not copied from textbooks or sites.

## Entry format

```json
{
  "pattern": "〜に対して",
  "reading": "〜にたいして",
  "romaji": "ni taishite",
  "level": "N3",
  "meaning": "toward; against; in contrast to",
  "formation": "Noun + に対して / Noun + に対する + Noun",
  "examples": [
    {"ja": "先生に対して失礼なことを言ってはいけない。", "en": "You must not say rude things to your teacher."}
  ],
  "tags": ["relation", "contrast"],
  "notes": "Optional: nuance, register, or how it differs from a similar pattern."
}
```

- **pattern** — Japanese only; a full-width `（note）` disambiguates patterns with several meanings.
- **reading** — the pattern in kana; only when it contains kanji.
- **romaji** — modified Hepburn, no macrons. The entry's stable `id` is a slug of this
  (`ni taishite` → `ni-taishite`), so avoid changing it; if you must, add `"id": "<old id>"`.
- **formation** — use the tokens `Verb-dict`, `Verb-stem` (masu-stem), `Verb-te`, `Verb-ta`,
  `Verb-nai`, `Verb-nai stem`, `Verb-ba`, `Verb-volitional`, `Verb-plain`, `i-Adj`,
  `i-Adj stem`, `i-Adj-ku`, `na-Adj`, `Noun`, `Sentence`, joined with ` + ` and ` / `.
- **examples** — 2–3 natural sentences at the level's difficulty, with full-width punctuation.
- **tags** — 1–3 from the controlled list in [`schema/grammar.schema.json`](../../schema/grammar.schema.json).

## Levels

The JLPT publishes no official grammar list. Levels follow the consensus of common
JLPT preparation materials; where sources disagree, each point is placed once, at the
level where most learners meet it. Suggestions are welcome — open an issue with your
reasoning.
