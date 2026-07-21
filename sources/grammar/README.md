# Grammar source data

These files are the hand-curated source for the OpenJLPT grammar dataset.

- `n5.json`, `n4.json`, `n3.json`, `n2.json`, `n1.json` — seed grammar points per JLPT level.

`npm run build:data` copies them into `data/json/grammar/` and generates the
CSV and SQLite tables. Do not edit files under `data/` directly; edit these
source files and rebuild.

## Status

This is a **v0.1 seed dataset**. It contains representative grammar points for
each level to establish the schema and tooling. Community contributions are
welcome to expand coverage.
