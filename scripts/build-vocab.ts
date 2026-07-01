/**
 * Build per-level vocabulary JSON + CSV from Waller's Anki decks.
 *
 * For each level we read two decks that share the same headword (Front):
 *   - *-vocab-eng.anki   : Front = word, Back = English meaning(s)
 *   - *-vocab-hira.anki   : Front = word, Back = kana reading
 * We join them on the cleaned headword.
 */
import { join } from 'node:path';
import { CACHE_DIR, DATA_DIR, LEVELS, cleanTerm, readAnkiFacts, splitMeanings, writeCsv, writeJson } from './lib/util.ts';

interface Vocab {
  word: string;
  reading: string;
  meanings: string[];
  level: string;
}

function build() {
  const summary: Record<string, number> = {};

  for (const { level } of LEVELS) {
    const eng = readAnkiFacts(join(CACHE_DIR, `${level}-vocab-eng.anki`));
    const hira = readAnkiFacts(join(CACHE_DIR, `${level}-vocab-hira.anki`));

    // word -> reading
    const readings = new Map<string, string>();
    for (const f of hira) {
      const word = cleanTerm(f.Front);
      if (!word) continue;
      const reading = cleanTerm(f.Back).split(/[,、]/)[0].trim();
      if (!readings.has(word)) readings.set(word, reading);
    }

    const seen = new Set<string>();
    const entries: Vocab[] = [];
    for (const f of eng) {
      const word = cleanTerm(f.Front);
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const meanings = splitMeanings(f.Back);
      if (meanings.length === 0) continue;
      entries.push({ word, reading: readings.get(word) ?? '', meanings, level });
    }

    entries.sort((a, b) => a.word.localeCompare(b.word, 'ja'));
    writeJson(join(DATA_DIR, 'json', 'vocab', `${level.toLowerCase()}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `vocab-${level.toLowerCase()}.csv`),
      ['word', 'reading', 'meanings', 'level'],
      entries.map((e) => [e.word, e.reading, e.meanings.join('; '), e.level]),
    );
    summary[level] = entries.length;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Vocabulary:', summary, `(total ${total})`);
}

build();
