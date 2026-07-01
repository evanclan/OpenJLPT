/**
 * Build per-level vocabulary JSON + CSV from Waller's Anki decks.
 *
 * For each level we read two decks that share the same headword (Front):
 *   - *-vocab-eng.anki   : Front = word, Back = English meaning(s)
 *   - *-vocab-hira.anki   : Front = word, Back = kana reading
 * We join them on the cleaned headword.
 *
 * If the Tatoeba corpus has been fetched, up to two example sentences are attached
 * to each word (see lib/examples.ts).
 */
import { join } from 'node:path';
import { CACHE_DIR, DATA_DIR, LEVELS, cleanTerm, readAnkiFacts, splitMeanings, writeCsv, writeJson } from './lib/util.ts';
import { ExampleIndex, tatoebaAvailable, type Example } from './lib/examples.ts';

interface Vocab {
  word: string;
  reading: string;
  meanings: string[];
  level: string;
  examples?: Example[];
}

function build() {
  const index = tatoebaAvailable() ? new ExampleIndex() : null;
  if (index) console.log(`Example pool: ${index.size} Tatoeba sentence pairs`);
  else console.log('Tatoeba cache not found — building vocabulary without example sentences.');

  const summary: Record<string, number> = {};
  let withExamples = 0;

  for (const { level } of LEVELS) {
    const eng = readAnkiFacts(join(CACHE_DIR, `${level}-vocab-eng.anki`));
    const hira = readAnkiFacts(join(CACHE_DIR, `${level}-vocab-hira.anki`));

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
      const entry: Vocab = { word, reading: readings.get(word) ?? '', meanings, level };
      if (index) {
        const ex = index.find(word, 2);
        if (ex.length) {
          entry.examples = ex;
          withExamples++;
        }
      }
      entries.push(entry);
    }

    entries.sort((a, b) => a.word.localeCompare(b.word, 'ja'));
    writeJson(join(DATA_DIR, 'json', 'vocab', `${level.toLowerCase()}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `vocab-${level.toLowerCase()}.csv`),
      ['word', 'reading', 'meanings', 'level', 'example_ja', 'example_en'],
      entries.map((e) => [e.word, e.reading, e.meanings.join('; '), e.level, e.examples?.[0]?.ja ?? '', e.examples?.[0]?.en ?? '']),
    );
    summary[level] = entries.length;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Vocabulary:', summary, `(total ${total})`);
  if (index) console.log(`Example coverage: ${withExamples}/${total} words (${Math.round((withExamples / total) * 100)}%)`);
}

build();
