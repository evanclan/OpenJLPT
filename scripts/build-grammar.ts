/**
 * Build per-level grammar JSON + CSV from the curated source files in sources/grammar/.
 *
 * Each entry gets a stable `id`, a slug of its romaji (e.g. "te mo ii" → te-mo-ii).
 * A source entry may set `id` explicitly to keep an ID stable when its romaji changes.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { DATA_DIR, LEVELS, ROOT, writeCsv, writeJson, type Level } from './lib/util.ts';

interface Example {
  ja: string;
  en: string;
}

export interface Grammar {
  id: string;
  pattern: string;
  reading?: string;
  romaji: string;
  level: Level;
  meaning: string;
  formation: string;
  examples: Example[];
  tags: string[];
  notes?: string;
}

const SOURCE_DIR = join(ROOT, 'sources', 'grammar');

export const grammarId = (romaji: string) =>
  romaji
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function build() {
  const summary: Record<string, number> = {};
  const ids = new Map<string, string>();
  const patterns = new Map<string, string>();

  for (const { level } of LEVELS) {
    const source: (Omit<Grammar, 'id'> & { id?: string })[] = JSON.parse(
      readFileSync(join(SOURCE_DIR, `${level.toLowerCase()}.json`), 'utf8'),
    );
    const entries: Grammar[] = source.map((g) => {
      const id = g.id ?? grammarId(g.romaji);
      if (ids.has(id)) throw new Error(`Grammar id "${id}" (${level} ${g.pattern}) collides with ${ids.get(id)} — set an explicit "id" in the source.`);
      ids.set(id, `${level} ${g.pattern}`);
      if (patterns.has(g.pattern)) throw new Error(`Grammar pattern ${g.pattern} appears at ${patterns.get(g.pattern)} and ${level}.`);
      patterns.set(g.pattern, level);
      if (g.level !== level) throw new Error(`${g.pattern} is in ${level.toLowerCase()}.json but says level ${g.level}.`);
      // Fixed key order in the output.
      const { pattern, reading, romaji, meaning, formation, examples, tags, notes } = g;
      return { id, pattern, ...(reading ? { reading } : {}), romaji, level, meaning, formation, examples, tags, ...(notes ? { notes } : {}) };
    });
    // Source order is teaching order (particles first, etc.) — keep it.

    const lc = level.toLowerCase();
    writeJson(join(DATA_DIR, 'json', 'grammar', `${lc}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `grammar-${lc}.csv`),
      ['id', 'pattern', 'reading', 'romaji', 'level', 'meaning', 'formation', 'example_ja', 'example_en', 'tags', 'notes'],
      entries.map((e) => [
        e.id,
        e.pattern,
        e.reading ?? '',
        e.romaji,
        e.level,
        e.meaning,
        e.formation,
        e.examples[0]?.ja ?? '',
        e.examples[0]?.en ?? '',
        e.tags.join('; '),
        e.notes ?? '',
      ]),
    );
    summary[level] = entries.length;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Grammar:', summary, `(total ${total})`);
}

build();
