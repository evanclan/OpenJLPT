/**
 * Build per-level vocabulary JSON + CSV.
 *
 *   sources/waller/vocab-*.json     level lists (headword, reading, English)   — Waller, CC BY
 *   sources/corrections/vocab.json  hand-reviewed fixes for bad source cards
 *   .cache/JMdict_e.gz              IDs, part of speech, reading/gloss repair  — EDRDG, CC BY-SA 4.0
 *   .cache/tatoeba/                 example sentences                          — Tatoeba, CC BY 2.0 FR
 *
 * Every word keeps the easiest level it appears at (Waller lists some words at
 * several levels).
 */
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DATA_DIR, LEVELS, ROOT, writeCsv, writeJson, type Level } from './lib/util.ts';
import { readCards } from './lib/waller.ts';
import { parseHeadword, parseMeanings, parseReading } from './lib/normalize.ts';
import { hasKanji, isKana, toHiragana, toRomaji } from './lib/kana.ts';
import { JmdictIndex, completeGloss, loadJmdict, type Match } from './lib/jmdict.ts';
import { ExampleIndex, tatoebaAvailable, type Example } from './lib/examples.ts';

export interface Vocab {
  id: string;
  word: string;
  reading: string;
  romaji: string;
  meanings: string[];
  level: Level;
  pos?: string[];
  jmdict_id?: number;
  other_forms?: string[];
  other_readings?: string[];
  examples?: Example[];
}

interface Correction {
  level: Level;
  front: string;
  why: string;
  drop?: boolean;
  set?: Partial<Pick<Vocab, 'word' | 'reading' | 'meanings' | 'other_forms' | 'other_readings'>>;
}

const RARE_KANJI_FORM = new Set(['iK', 'oK', 'rK', 'sK', 'ateji']);

/** Stable ID: derived from the written form and reading, so it survives re-ordering and level changes. */
export const vocabId = (word: string, reading: string) =>
  createHash('sha1').update(`${word}\u0000${reading}`).digest('hex').slice(0, 10);

const kanjiOf = (s: string) => new Set([...s].filter(hasKanji));
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

/**
 * Two spellings that JMdict files under one entry are the same *learner* word only if
 * one is kana, or they differ just in okurigana (終わる/終る, 見付ける/見つける).
 * JMdict also groups distinct kanji words (早い/速い, 表す/現す) — those stay separate.
 */
function sameWord(kept: Vocab | undefined, word: string): boolean {
  if (!kept) return false;
  const a = kanjiOf(kept.word);
  const b = kanjiOf(word);
  return a.size === 0 || b.size === 0 || subset(a, b) || subset(b, a);
}

function loadCorrections(): Map<string, Correction> {
  const list: Correction[] = JSON.parse(readFileSync(join(ROOT, 'sources', 'corrections', 'vocab.json'), 'utf8'));
  return new Map(list.map((c) => [`${c.level}\u0000${c.front}`, c]));
}

function kanjiLevels(): Map<string, string> {
  const map = new Map<string, string>();
  for (const { level } of LEVELS) {
    for (const c of readCards('kanji-eng', level)) {
      const ch = [...c.front.trim()][0];
      if (ch && !map.has(ch)) map.set(ch, level);
    }
  }
  return map;
}

function build() {
  const corrections = loadCorrections();
  const usedCorrections = new Set<string>();
  const jm = loadJmdict();
  const jmIndex = new JmdictIndex(jm.entries);
  console.log(`JMdict: ${jm.entries.length} entries (created ${jm.created ?? 'unknown'})`);

  const examples = tatoebaAvailable() ? new ExampleIndex(kanjiLevels()) : null;
  if (examples) console.log(`Example pool: ${examples.size} Tatoeba sentence pairs`);
  else console.warn('⚠ Tatoeba cache not found — building vocabulary WITHOUT example sentences. Run `npm run fetch`.');

  const report = { dropped: 0, noMeaning: [] as string[], unmatched: 0, respelled: [] as string[], reread: [] as string[], repaired: 0 };
  const perLevel = new Map<Level, Vocab[]>();
  const seen = new Map<string, Vocab>();
  let duplicates = 0;

  for (const { level } of LEVELS) {
    const hira = new Map(readCards('vocab-hira', level).map((c) => [c.front, c.back]));
    const entries: Vocab[] = [];

    for (const card of readCards('vocab-eng', level)) {
      const key = `${level}\u0000${card.front}`;
      const fix = corrections.get(key);
      if (fix) usedCorrections.add(key);
      if (fix?.drop) {
        report.dropped++;
        continue;
      }

      const head = parseHeadword(card.front);
      const read = parseReading(hira.get(card.front) ?? '', head.word);
      const gloss = parseMeanings(card.back);
      const v = {
        word: head.word,
        reading: read.reading,
        meanings: gloss.meanings,
        other_forms: head.otherForms,
        other_readings: read.otherReadings,
        ...fix?.set,
      };

      // --- JMdict enrichment -------------------------------------------------
      const q = { word: v.word, reading: v.reading || undefined, otherReadings: v.other_readings, meanings: v.meanings, otherForms: v.other_forms };
      let m: Match | undefined = jmIndex.match(q);
      if (!m) {
        m = jmIndex.matchByReading(q);
        if (m) {
          // The card's kanji is a typo or rare spelling: use the dictionary's usual form.
          const usuallyKana = m.entry.senses[m.sense]?.misc.includes('uk');
          const usual = usuallyKana ? m.reading : m.entry.kanji.find((k) => !k.inf.some((i) => RARE_KANJI_FORM.has(i)))?.text;
          if (usual && usual !== v.word) {
            report.respelled.push(`${level} ${v.word} → ${usual}`);
            v.other_forms = [...new Set([v.word, ...v.other_forms])].filter((f) => f !== usual);
            v.word = usual;
          }
        }
      }
      if (!m) {
        m = jmIndex.matchCorrectingReading(q);
        if (m && m.reading !== v.reading) {
          report.reread.push(`${level} ${v.word} [${v.reading || '—'} → ${m.reading}]`);
          v.reading = m.reading;
        }
      }
      if (m) {
        if (!v.reading) v.reading = m.reading;
        if (gloss.fragment && !fix?.set?.meanings) {
          const full = completeGloss(m.entry, gloss.fragment);
          if (full) {
            v.meanings.push(full);
            report.repaired++;
          }
        }
        if (v.meanings.length === 0) v.meanings = m.entry.senses[m.sense].gloss.slice(0, 4);
      } else {
        report.unmatched++;
      }

      if (!v.reading && isKana(v.word)) v.reading = v.word;
      if (v.meanings.length === 0) {
        report.noMeaning.push(`${level} ${card.front}`);
        continue;
      }
      if (!v.reading) throw new Error(`${level} ${card.front}: no reading — add an entry to sources/corrections/vocab.json`);

      // --- de-duplicate: a word belongs to the easiest level that lists it -----
      const keys = [`${v.word}\u0000${toHiragana(v.reading)}`];
      if (m) keys.push(`#${m.entry.seq}\u0000${toHiragana(v.reading)}`);
      const kept = seen.get(keys[0]) ?? (keys[1] && sameWord(seen.get(keys[1]), v.word) ? seen.get(keys[1]) : undefined);
      if (kept) {
        // Same word listed again at a harder level: keep the easier entry, remember the spelling.
        duplicates++;
        for (const form of [v.word, ...v.other_forms]) {
          if (form !== kept.word && !kept.other_forms?.includes(form)) (kept.other_forms ??= []).push(form);
        }
        // Waller sometimes splits one word over two cards at the same level (キロ = kilogram / kilometre).
        if (kept.level === level) kept.meanings.push(...v.meanings.filter((g) => !kept.meanings.includes(g)));
        if (process.env.OPENJLPT_DEBUG && kept.word !== v.word) console.log(`  merge ${level} ${v.word} → ${kept.level} ${kept.word}`);
        continue;
      }

      const entry: Vocab = {
        id: vocabId(v.word, v.reading),
        word: v.word,
        reading: v.reading,
        romaji: toRomaji(v.reading),
        meanings: v.meanings,
        level,
      };
      if (m) {
        const pos = m.entry.senses[m.sense]?.pos ?? [];
        if (pos.length) entry.pos = pos;
        entry.jmdict_id = m.entry.seq;
      }
      const otherForms = v.other_forms.filter((f) => f !== v.word);
      const otherReadings = v.other_readings.filter((r) => r !== v.reading);
      if (otherForms.length) entry.other_forms = otherForms;
      if (otherReadings.length) entry.other_readings = otherReadings;

      if (examples) {
        const forms = [entry.word, ...otherForms, ...(m?.entry.kanji.map((k) => k.text) ?? [])];
        const readings = [entry.reading, ...otherReadings];
        const ex = examples.find({ forms, readings, level });
        if (ex.length) entry.examples = ex;
      }
      for (const k of keys) seen.set(k, entry);
      entries.push(entry);
    }
    perLevel.set(level, entries);
  }

  // Every correction must still apply to a card, or it has gone stale.
  const stale = [...corrections.keys()].filter((k) => !usedCorrections.has(k));
  if (stale.length) throw new Error(`Stale corrections (no matching card): ${stale.map((k) => k.replace('\u0000', ' ')).join(', ')}`);

  const ids = new Set<string>();
  const collator = new Intl.Collator('ja');
  const summary: Record<string, number> = {};
  let total = 0;
  let withExamples = 0;
  for (const [level, entries] of perLevel) {
    entries.sort((a, b) => collator.compare(toHiragana(a.reading), toHiragana(b.reading)) || collator.compare(a.word, b.word));
    for (const e of entries) {
      if (ids.has(e.id)) throw new Error(`Duplicate vocab id ${e.id} (${e.word} ${e.reading})`);
      ids.add(e.id);
      if (e.examples) withExamples++;
    }
    const lc = level.toLowerCase();
    writeJson(join(DATA_DIR, 'json', 'vocab', `${lc}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `vocab-${lc}.csv`),
      ['id', 'word', 'reading', 'romaji', 'meanings', 'level', 'pos', 'jmdict_id', 'other_forms', 'example_ja', 'example_en'],
      entries.map((e) => [
        e.id,
        e.word,
        e.reading,
        e.romaji,
        e.meanings.join('; '),
        e.level,
        (e.pos ?? []).join('; '),
        e.jmdict_id ?? null,
        (e.other_forms ?? []).join('; '),
        e.examples?.[0]?.ja ?? '',
        e.examples?.[0]?.en ?? '',
      ]),
    );
    summary[level] = entries.length;
    total += entries.length;
  }

  // Legend for the part-of-speech codes actually used, from JMdict's own DTD.
  const posCodes = [...new Set([...perLevel.values()].flat().flatMap((e) => e.pos ?? []))].sort();
  writeJson(join(DATA_DIR, 'json', 'pos.json'), Object.fromEntries(posCodes.map((c) => [c, jm.entities[c] ?? c])));

  console.log('Vocabulary:', summary, `(total ${total})`);
  console.log(`  cross-level duplicates removed: ${duplicates}; dropped by corrections: ${report.dropped}`);
  console.log(`  JMdict: ${total - report.unmatched} matched, ${report.unmatched} unmatched; ${report.repaired} truncated glosses repaired`);
  if (report.respelled.length) console.log(`  respelled from JMdict (${report.respelled.length}):\n    ${report.respelled.join('\n    ')}`);
  if (report.reread.length) console.log(`  readings corrected from JMdict (${report.reread.length}):\n    ${report.reread.join('\n    ')}`);
  if (report.noMeaning.length) console.log(`  skipped, no meaning (${report.noMeaning.length}): ${report.noMeaning.join(', ')}`);
  if (examples) console.log(`  example coverage: ${withExamples}/${total} words (${Math.round((withExamples / total) * 100)}%)`);
}

build();
