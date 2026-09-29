/**
 * Build per-level kanji JSON + CSV.
 *
 * Level membership (N5–N1) comes from Waller's kanji lists (sources/waller/);
 * readings, meanings, stroke count, grade, frequency, radical and name readings
 * come from KANJIDIC2 (EDRDG). Each kanji also links to OpenJLPT vocabulary that
 * uses it, easiest words first — run build-vocab first.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';
import { CACHE_DIR, DATA_DIR, LEVELS, writeCsv, writeJson, type Level } from './lib/util.ts';
import { readCards } from './lib/waller.ts';
import { parseMeanings } from './lib/normalize.ts';

export interface Kanji {
  character: string;
  level: Level;
  strokes: number | null;
  grade: number | null;
  freq: number | null;
  radical: string | null;
  radical_number: number | null;
  onyomi: string[];
  kunyomi: string[];
  nanori?: string[];
  meanings: string[];
  words?: string[];
}

interface KdEntry {
  strokes: number | null;
  grade: number | null;
  freq: number | null;
  radical: number | null;
  onyomi: string[];
  kunyomi: string[];
  nanori: string[];
  meanings: string[];
}

const MAX_WORDS = 8;
const LEVEL_RANK: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/** Kangxi radical number (1–214) → its ordinary CJK character (72 → 日). */
export const radicalChar = (n: number) => String.fromCodePoint(0x2f00 + n - 1).normalize('NFKC');

const text = (v: unknown) => (typeof v === 'object' && v !== null ? String((v as any)['#text']) : String(v));

function loadKanjidic2(): { map: Map<string, KdEntry>; version?: string } {
  const xml = gunzipSync(readFileSync(join(CACHE_DIR, 'kanjidic2.xml.gz'))).toString('utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['character', 'reading', 'meaning', 'rmgroup', 'rad_value', 'nanori'].includes(name),
  });
  const doc = parser.parse(xml);
  const map = new Map<string, KdEntry>();

  for (const c of doc.kanjidic2.character as any[]) {
    const misc = c.misc ?? {};
    const strokeRaw = Array.isArray(misc.stroke_count) ? misc.stroke_count[0] : misc.stroke_count;
    const classical = (c.radical?.rad_value ?? []).find((r: any) => r['@_rad_type'] === 'classical');

    const onyomi: string[] = [];
    const kunyomi: string[] = [];
    const meanings: string[] = [];
    const rm = c.reading_meaning;
    for (const g of (rm?.rmgroup ?? []) as any[]) {
      for (const r of (g.reading ?? []) as any[]) {
        const type = typeof r === 'object' ? r['@_r_type'] : undefined;
        if (type === 'ja_on') onyomi.push(text(r));
        else if (type === 'ja_kun') kunyomi.push(text(r));
      }
      // English meanings are bare strings; other languages carry an m_lang attribute.
      for (const m of (g.meaning ?? []) as any[]) if (typeof m !== 'object') meanings.push(String(m));
    }

    map.set(String(c.literal), {
      strokes: strokeRaw != null ? Number(strokeRaw) : null,
      grade: misc.grade != null ? Number(misc.grade) : null,
      freq: misc.freq != null ? Number(misc.freq) : null,
      radical: classical ? Number(text(classical)) : null,
      onyomi,
      kunyomi,
      nanori: ((rm?.nanori ?? []) as unknown[]).map(text),
      meanings,
    });
  }
  return { map, version: doc.kanjidic2.header?.database_version };
}

/** Vocabulary words containing each kanji, easiest level first, then shortest. */
function wordsByKanji(): Map<string, string[]> {
  const words: { word: string; level: string }[] = [];
  for (const { level } of LEVELS) {
    const path = join(DATA_DIR, 'json', 'vocab', `${level.toLowerCase()}.json`);
    for (const v of JSON.parse(readFileSync(path, 'utf8'))) words.push({ word: v.word, level });
  }
  words.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || [...a.word].length - [...b.word].length);
  const map = new Map<string, string[]>();
  for (const { word } of words) {
    for (const ch of new Set(word)) {
      let list = map.get(ch);
      if (!list) map.set(ch, (list = []));
      if (list.length < MAX_WORDS && !list.includes(word)) list.push(word);
    }
  }
  return map;
}

function build() {
  const { map: kdic, version } = loadKanjidic2();
  console.log(`KANJIDIC2: ${kdic.size} characters (database version ${version ?? 'unknown'})`);
  const words = wordsByKanji();
  const summary: Record<string, number> = {};
  const seen = new Set<string>();
  let missing = 0;

  for (const { level } of LEVELS) {
    const entries: Kanji[] = [];
    for (const card of readCards('kanji-eng', level)) {
      const char = [...card.front.replace(/・/g, '').trim()][0]; // first code point (a single kanji)
      if (!char || seen.has(char)) continue; // a kanji belongs to the easiest level that lists it
      seen.add(char);

      const kd = kdic.get(char);
      if (!kd) missing++;
      const entry: Kanji = {
        character: char,
        level,
        strokes: kd?.strokes ?? null,
        grade: kd?.grade ?? null,
        freq: kd?.freq ?? null,
        radical: kd?.radical ? radicalChar(kd.radical) : null,
        radical_number: kd?.radical ?? null,
        onyomi: kd?.onyomi ?? [],
        kunyomi: kd?.kunyomi ?? [],
        meanings: kd?.meanings?.length ? kd.meanings : parseMeanings(card.back).meanings,
      };
      if (kd?.nanori.length) entry.nanori = kd.nanori;
      const w = words.get(char);
      if (w?.length) entry.words = w;
      entries.push(entry);
    }

    // Most frequent first; ties (and kanji without a frequency rank) by code point, for stable output.
    entries.sort((a, b) => (a.freq ?? 1e9) - (b.freq ?? 1e9) || a.character.codePointAt(0)! - b.character.codePointAt(0)!);
    const lc = level.toLowerCase();
    writeJson(join(DATA_DIR, 'json', 'kanji', `${lc}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `kanji-${lc}.csv`),
      ['character', 'level', 'strokes', 'grade', 'freq', 'radical', 'radical_number', 'onyomi', 'kunyomi', 'nanori', 'meanings', 'words'],
      entries.map((e) => [
        e.character,
        e.level,
        e.strokes,
        e.grade,
        e.freq,
        e.radical,
        e.radical_number,
        e.onyomi.join('; '),
        e.kunyomi.join('; '),
        (e.nanori ?? []).join('; '),
        e.meanings.join('; '),
        (e.words ?? []).join('; '),
      ]),
    );
    summary[level] = entries.length;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Kanji:', summary, `(total ${total}, ${missing} not found in KANJIDIC2)`);
}

build();
