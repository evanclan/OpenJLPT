# Contributing to OpenJLPT

Thanks for helping make OpenJLPT better! 🎌 Corrections from learners, teachers and native
speakers are the most valuable contributions of all.

## Quick ways to help

- **Report a data error.** Wrong reading, bad meaning, a word at the wrong level? Use the
  [data error form](https://github.com/evanclan/OpenJLPT/issues/new?template=data-error.yml).
  Every page on the website has a *Report an error* link that fills in the details.
- **Improve grammar.** Better explanations, more natural example sentences, missing points.
- **Share what you built.** Apps, bots and decks using OpenJLPT can go in the README's "Used by" list.

## Don't hand-edit `data/`

Everything under `data/` is **generated** and gets overwritten on the next build. Fixes go in
the sources:

| To fix… | Edit | Then run |
|---|---|---|
| a grammar point | `sources/grammar/<level>.json` | `npm run build:grammar` |
| a vocabulary card the pipeline can't fix | `sources/corrections/vocab.json` | the full build (see below) |
| a systematic problem (e.g. a parsing rule) | `scripts/lib/*.ts`, with a test in `tests/ts/` | `npm test` |

`sources/waller/` is a verbatim snapshot of the upstream level lists; don't edit it by hand.

### Corrections file

`sources/corrections/vocab.json` is a short, reviewed list of fixes for individual source
cards. Each entry names the card by level and its original `front` text, says **why**, and
either drops the card or overrides fields:

```json
{"level": "N1", "front": "徐々", "why": "Wrong reading (そろそろ is a different word).", "set": {"reading": "じょじょ"}}
```

The build fails if a correction no longer matches any card, so the file can't go stale silently.

## Development setup

```bash
npm install          # Node 20+; also builds the TypeScript package
npm test             # pipeline + loader unit tests
npm run typecheck
npm run validate     # schema + invariant checks on data/

pip install -e ".[test]" && pytest     # Python package
```

### Rebuilding the data

```bash
npm run build        # fetch upstream → build JSON/CSV/SQLite → validate
```

`npm run fetch` downloads JMdict, KANJIDIC2 and Tatoeba (about 60 MB compressed) into `.cache/`
and refreshes the Waller snapshot. If you can't download them, push a branch and run the
**Update data** workflow on it from the Actions tab. On a non-default branch it commits the
rebuilt data back to that branch.

```
scripts/
├── fetch-sources.ts   download upstream sources; snapshot Waller's lists
├── build-vocab.ts     Waller → normalize → corrections → JMdict → dedupe → Tatoeba examples
├── build-kanji.ts     Waller + KANJIDIC2 → kanji (+ links to vocabulary)
├── build-grammar.ts   sources/grammar → grammar (+ stable IDs)
├── build-sqlite.ts    JSON → data/openjlpt.sqlite (+ FTS5 index)
├── build-meta.ts      counts and upstream versions → data/json/meta.json
├── validate.ts        schema + cross-file checks (runs in CI)
├── build-site.ts      the website (GitHub Pages)
└── build_exports.py   Anki decks + Yomitan dictionary
```

## Writing grammar entries

See [`sources/grammar/README.md`](./sources/grammar/README.md) for the format. The essentials:

- **Everything must be original.** Never copy explanations or sentences from textbooks,
  websites or other datasets. Short glosses in your own words are fine.
- Example sentences should be natural and match the level: short and simple for N5,
  richer for N1.
- `romaji` drives the entry's stable `id`, so avoid changing it on existing entries.

## Changing the schema

The canonical model lives in [`schema/`](./schema). If you change it, update the build
scripts, both loaders (`src/index.ts`, `openjlpt/`), the tests and the README, and add a
`CHANGELOG.md` entry.

## Licensing of contributions

By contributing, you agree that your contributions are licensed under **CC BY-SA 4.0**, like
the rest of the project. Don't add data from sources whose license forbids redistribution
(for example, proprietary APIs or copyrighted textbooks). See [`NOTICE.md`](./NOTICE.md).
