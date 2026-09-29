# NOTICE — Data Sources & Attribution

OpenJLPT is a **derived work**. It is assembled from the open sources below, plus original
content written for the project (the grammar dataset and the corrections file). Because it
incorporates data licensed under **CC BY-SA 4.0** (a share-alike license), the entire
OpenJLPT dataset is released under **CC BY-SA 4.0** (see `LICENSE`).

If you use OpenJLPT, you must:

1. Give appropriate credit to OpenJLPT **and** the upstream sources listed here.
2. Provide a link to the CC BY-SA 4.0 license.
3. Distribute any derivative dataset under CC BY-SA 4.0 (ShareAlike).

A line like this is enough:

> Contains data from [OpenJLPT](https://github.com/evanclan/OpenJLPT) (CC BY-SA 4.0), which uses
> JMdict and KANJIDIC2 (EDRDG), Jonathan Waller's JLPT lists, and Tatoeba.

## Sources

| Source | Used for | License | Link |
|---|---|---|---|
| **Jonathan Waller's JLPT Resources** (tanos.co.uk) | The **N5–N1 level assignments** for vocabulary and kanji, plus the English glosses for vocabulary. A verbatim snapshot is in `sources/waller/`. | CC BY | https://www.tanos.co.uk/jlpt/ |
| **JMdict** — Electronic Dictionary Research and Development Group (EDRDG) | Vocabulary `jmdict_id` and `pos`, verification and repair of readings, spellings and truncated glosses | CC BY-SA 4.0 | https://www.edrdg.org/jmdict/j_jmdict.html |
| **KANJIDIC2** — EDRDG | Kanji readings, meanings, stroke counts, grade, frequency, radical and name readings | CC BY-SA 4.0 | https://www.edrdg.org/wiki/KANJIDIC_Project.html |
| **Tatoeba** | Vocabulary example sentences (Japanese + English), found via Tatoeba's Japanese word index (the Tanaka Corpus "B lines") | CC BY 2.0 FR | https://tatoeba.org |
| **KanjiVG** (website only) | Stroke-order diagrams shown on the website's kanji pages; not included in the dataset | CC BY-SA 3.0 | https://kanjivg.tagaini.net/ |
| **OpenJLPT contributors** | Grammar points (explanations and example sentences), `sources/corrections/` | CC BY-SA 4.0 | this repository |

The EDRDG files (JMdict, KANJIDIC2) are the property of the Electronic Dictionary Research and
Development Group, and are used in conformance with the Group's
[licence](https://www.edrdg.org/edrdg/licence.html).

Example sentences from [Tatoeba](https://tatoeba.org) are licensed
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Each carries its Tatoeba
sentence ID (`tatoeba_id`), which links to the sentence and its contributors at
`https://tatoeba.org/sentences/show/<id>`. Combining CC BY material into this CC BY-SA 4.0
dataset is permitted, and attribution to Tatoeba is given here.

## Important note on JLPT levels

The Japan Foundation / JLPT organisation does **not** publish official N5–N1 vocabulary, kanji
or grammar lists. Vocabulary and kanji levels come from **Jonathan Waller's community-standard
lists**, which are widely used and reliable, but they are *unofficial approximations* of the
real (undisclosed) test content. KANJIDIC2's own `jlpt` field refers to the **pre-2010
four-level system (1–4)** and is intentionally **not** used for level assignment. Grammar
levels follow the consensus of common JLPT preparation materials.

## Data freshness

Per the EDRDG license, projects redistributing this data should keep it reasonably current.
OpenJLPT rebuilds from upstream monthly (`.github/workflows/update-data.yml`), and
`data/json/meta.json` records the upstream versions used.
