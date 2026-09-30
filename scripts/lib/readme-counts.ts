/**
 * The dataset counts quoted in README.md and README.ja.md live between marker comments
 * (<!-- counts:table --> … <!-- /counts:table -->) and are regenerated from meta.json by
 * build-meta, so the monthly rebuild keeps them current. validate.ts fails if they drift.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEVELS, ROOT } from './util.ts';

export interface MetaCounts {
  counts: Record<string, Record<string, number>>;
  vocab_with_examples: number;
}

const n = (x: number) => x.toLocaleString('en-US');
const LEVEL_NAMES_EN: Record<string, string> = { N5: 'Beginner', N4: 'Elementary', N3: 'Intermediate', N2: 'Upper intermediate', N1: 'Advanced' };

function blocks(meta: MetaCounts, lang: 'en' | 'ja'): Record<string, string> {
  const { vocab, kanji, grammar } = meta.counts;
  const pct = `${Math.round((100 * meta.vocab_with_examples) / vocab.total)}%`;
  const levels = LEVELS.map(({ level }) => level);
  if (lang === 'en') {
    return {
      line: `${n(vocab.total)} words · ${n(kanji.total)} kanji · ${n(grammar.total)} grammar points · example sentences with furigana for ${pct} of words`,
      examples: pct,
      table: [
        '| Level | Words | Kanji | Grammar | |',
        '|:---:|---:|---:|---:|---|',
        ...levels.map((l) => `| **${l}** | ${n(vocab[l])} | ${n(kanji[l])} | ${n(grammar[l])} | ${LEVEL_NAMES_EN[l]} |`),
        `| **Total** | **${n(vocab.total)}** | **${n(kanji.total)}** | **${n(grammar.total)}** | |`,
      ].join('\n'),
    };
  }
  return {
    line: `語彙 ${n(vocab.total)} 語 · 漢字 ${n(kanji.total)} 字 · 文法 ${n(grammar.total)} 項目 · 語彙の ${pct} にふりがなつき例文`,
    examples: pct,
    table: [
      '| レベル | 語彙 | 漢字 | 文法 |',
      '|:---:|---:|---:|---:|',
      ...levels.map((l) => `| **${l}** | ${n(vocab[l])} | ${n(kanji[l])} | ${n(grammar[l])} |`),
      `| **合計** | **${n(vocab.total)}** | **${n(kanji.total)}** | **${n(grammar.total)}** |`,
    ].join('\n'),
  };
}

export const README_FILES: [string, 'en' | 'ja'][] = [
  ['README.md', 'en'],
  ['README.ja.md', 'ja'],
];

/** The README text with every counts block regenerated from `meta`. */
export function withCounts(text: string, meta: MetaCounts, lang: 'en' | 'ja'): string {
  const b = blocks(meta, lang);
  return text.replace(/<!-- counts:(\w+) -->([\s\S]*?)<!-- \/counts:\1 -->/g, (whole, key: string, inner: string) => {
    if (!(key in b)) return whole;
    // Blocks on their own lines keep their surrounding line breaks.
    const nl = inner.startsWith('\n') ? '\n' : '';
    return `<!-- counts:${key} -->${nl}${b[key]}${nl}<!-- /counts:${key} -->`;
  });
}

export const readReadme = (file: string) => readFileSync(join(ROOT, file), 'utf8');
