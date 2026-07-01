/**
 * Build per-level kanji JSON + CSV.
 *
 * Level membership (N5–N1) comes from Waller's kanji decks; readings, meanings,
 * stroke count, grade and frequency are enriched from KANJIDIC2 (EDRDG).
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { CACHE_DIR, DATA_DIR, LEVELS, cleanTerm, readAnkiFacts, splitMeanings, writeCsv, writeJson } from './lib/util.ts';

interface Kanji {
  character: string;
  level: string;
  strokes: number | null;
  grade: number | null;
  freq: number | null;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
}

interface KdEntry {
  strokes: number | null;
  grade: number | null;
  freq: number | null;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
}

function loadKanjidic2(): Map<string, KdEntry> {
  const xml = gunzipSync(readFileSync(join(CACHE_DIR, 'kanjidic2.xml.gz'))).toString('utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['character', 'reading', 'meaning', 'rmgroup'].includes(name),
  });
  const doc = parser.parse(xml);
  const map = new Map<string, KdEntry>();

  for (const c of doc.kanjidic2.character as any[]) {
    const literal = String(c.literal);
    const misc = c.misc ?? {};
    const strokeRaw = Array.isArray(misc.stroke_count) ? misc.stroke_count[0] : misc.stroke_count;

    const onyomi: string[] = [];
    const kunyomi: string[] = [];
    const meanings: string[] = [];
    const rm = c.reading_meaning;
    if (rm?.rmgroup) {
      for (const g of rm.rmgroup as any[]) {
        for (const r of (g.reading ?? []) as any[]) {
          const val = typeof r === 'object' ? String(r['#text']) : String(r);
          const type = typeof r === 'object' ? r['@_r_type'] : undefined;
          if (type === 'ja_on') onyomi.push(val);
          else if (type === 'ja_kun') kunyomi.push(val);
        }
        for (const m of (g.meaning ?? []) as any[]) {
          // English meanings are bare strings; other languages carry an m_lang attribute.
          if (typeof m !== 'object') meanings.push(String(m));
        }
      }
    }

    map.set(literal, {
      strokes: strokeRaw != null ? Number(strokeRaw) : null,
      grade: misc.grade != null ? Number(misc.grade) : null,
      freq: misc.freq != null ? Number(misc.freq) : null,
      onyomi,
      kunyomi,
      meanings,
    });
  }
  return map;
}

function build() {
  const kdic = loadKanjidic2();
  const summary: Record<string, number> = {};
  let missing = 0;

  for (const { level } of LEVELS) {
    const facts = readAnkiFacts(join(CACHE_DIR, `${level}-kanji-eng.anki`));
    const seen = new Set<string>();
    const entries: Kanji[] = [];

    for (const f of facts) {
      const raw = cleanTerm(f.Front);
      if (!raw) continue;
      const char = [...raw][0]; // first code point (a single kanji)
      if (seen.has(char)) continue;
      seen.add(char);

      const kd = kdic.get(char);
      if (!kd) missing++;
      entries.push({
        character: char,
        level,
        strokes: kd?.strokes ?? null,
        grade: kd?.grade ?? null,
        freq: kd?.freq ?? null,
        onyomi: kd?.onyomi ?? [],
        kunyomi: kd?.kunyomi ?? [],
        meanings: kd?.meanings?.length ? kd.meanings : splitMeanings(f.Back),
      });
    }

    entries.sort((a, b) => (a.freq ?? 1e9) - (b.freq ?? 1e9));
    writeJson(join(DATA_DIR, 'json', 'kanji', `${level.toLowerCase()}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `kanji-${level.toLowerCase()}.csv`),
      ['character', 'level', 'strokes', 'grade', 'freq', 'onyomi', 'kunyomi', 'meanings'],
      entries.map((e) => [
        e.character,
        e.level,
        e.strokes,
        e.grade,
        e.freq,
        e.onyomi.join('; '),
        e.kunyomi.join('; '),
        e.meanings.join('; '),
      ]),
    );
    summary[level] = entries.length;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Kanji:', summary, `(total ${total}, ${missing} not found in KANJIDIC2)`);
}

build();
