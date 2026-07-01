# NOTICE — Data Sources & Attribution

OpenJLPT is a **derived work**. The dataset is assembled from the open sources below.
Because it incorporates data licensed under **CC BY-SA 4.0** (a share-alike / copyleft
license), the entire OpenJLPT dataset is released under **CC BY-SA 4.0** (see `LICENSE`).

If you use OpenJLPT, you must:

1. Give appropriate credit to OpenJLPT **and** the upstream sources listed here.
2. Provide a link to the CC BY-SA 4.0 license.
3. Distribute any derivative dataset under CC BY-SA 4.0 (ShareAlike).

## Sources

| Source | Used for | License | Link |
|---|---|---|---|
| **JMdict / EDICT** — Electronic Dictionary Research and Development Group (EDRDG) | Vocabulary readings & glosses (via Waller's decks, which build on EDICT) | CC BY-SA 4.0 | https://www.edrdg.org/ |
| **KANJIDIC2** — EDRDG | Kanji readings, meanings, stroke counts, grade, frequency | CC BY-SA 4.0 | https://www.edrdg.org/wiki/KANJIDIC_Project.html |
| **Jonathan Waller's JLPT Resources** (tanos.co.uk) | The **N5–N1 level assignments** for vocabulary and kanji | CC BY | https://www.tanos.co.uk/jlpt/ |

The EDRDG files (JMdict, KANJIDIC2) are the property of the Electronic Dictionary Research
and Development Group, and are used in conformance with the Group's
[licence](https://www.edrdg.org/edrdg/licence.html).

## Important note on JLPT levels

The Japan Foundation / JLPT organisation does **not** publish official N5–N1 vocabulary or
kanji lists. The current N5–N1 groupings in this project are derived from **Jonathan
Waller's community-standard lists**. They are widely used and reliable, but are
*unofficial approximations* of the real (undisclosed) test content. KANJIDIC2's own `jlpt`
field refers to the **pre-2010 four-level system (1–4)** and is intentionally **not** used
for level assignment here.

## Data freshness

Per the EDRDG license, projects redistributing this data should keep it reasonably current.
OpenJLPT regenerates from upstream on a scheduled basis; see `.github/workflows/`.
