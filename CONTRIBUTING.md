# Contributing to OpenJLPT

Thanks for helping improve OpenJLPT! 🎌

## Important: don't hand-edit `data/`

The files under `data/` are **generated**. Editing them directly will be overwritten on the
next build. Fixes belong either upstream or in the build pipeline.

## How the data is built

```
scripts/
├── fetch-sources.ts   # download upstream sources into .cache/ (gitignored)
├── build-vocab.ts     # Waller decks → data/json/vocab + data/csv
├── build-kanji.ts     # Waller kanji lists + KANJIDIC2 → data/json/kanji + data/csv
├── build-sqlite.ts    # JSON → data/openjlpt.sqlite
└── validate.ts        # schema + sanity-count checks (runs in CI)
```

Rebuild everything:

```bash
npm install
npm run build
```

## Reporting data errors

Open an issue with the entry, its level, and what's wrong. Note that **level assignments
come from Jonathan Waller's lists** (they are the community standard but unofficial), and
kanji details come from **KANJIDIC2** — some corrections are best reported upstream, and
we'll pull them in on the next refresh.

## Changing the schema

The canonical model lives in [`schema/`](./schema). If you change it, update the build
scripts and make sure `npm run validate` passes. CI validates every entry against these
schemas on each PR.

## Licensing of contributions

By contributing you agree your contributions are licensed under **CC BY-SA 4.0**, matching
the project. Do not add data from sources whose license forbids redistribution (e.g.
proprietary APIs) — see [`NOTICE.md`](./NOTICE.md).
