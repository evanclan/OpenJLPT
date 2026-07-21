/**
 * Build per-level grammar JSON + CSV from the curated source files.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { DATA_DIR, LEVELS, ROOT, writeCsv, writeJson } from './lib/util.ts';

interface Example {
  ja: string;
  en: string;
}

interface Grammar {
  pattern: string;
  level: string;
  meaning: string;
  formation?: string;
  examples?: Example[];
  tags?: string[];
  notes?: string;
}

const SOURCE_DIR = join(ROOT, 'sources', 'grammar');

const readJson = (p: string): Grammar[] => JSON.parse(readFileSync(p, 'utf8'));

function build() {
  const summary: Record<string, number> = {};

  for (const { level } of LEVELS) {
    const entries = readJson(join(SOURCE_DIR, `${level.toLowerCase()}.json`));

    // Sort by pattern for stable output.
    entries.sort((a, b) => a.pattern.localeCompare(b.pattern, 'ja'));

    writeJson(join(DATA_DIR, 'json', 'grammar', `${level.toLowerCase()}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `grammar-${level.toLowerCase()}.csv`),
      ['pattern', 'level', 'meaning', 'formation', 'example_ja', 'example_en', 'tags', 'notes'],
      entries.map((e) => [
        e.pattern,
        e.level,
        e.meaning,
        e.formation ?? '',
        e.examples?.[0]?.ja ?? '',
        e.examples?.[0]?.en ?? '',
        (e.tags ?? []).join('; '),
        e.notes ?? '',
      ]),
    );
    summary[level] = entries.length;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  console.log('Grammar:', summary, `(total ${total})`);
}

build();
