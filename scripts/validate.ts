/**
 * Validate every generated JSON file against the canonical schemas, plus
 * cross-file invariants the schemas can't express (unique IDs, one level per
 * item, sane counts). Exits non-zero on any failure (used by CI).
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { DATA_DIR, LEVELS, ROOT } from './lib/util.ts';
import { stripFurigana } from './lib/furigana.ts';

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

// Rough sanity bounds per level; catches a broken join that silently drops rows.
const BOUNDS = {
  vocab: { N5: [500, 1000], N4: [450, 1000], N3: [1200, 2500], N2: [1200, 2500], N1: [2200, 4000] },
  kanji: { N5: [60, 150], N4: [100, 400], N3: [250, 700], N2: [250, 700], N1: [600, 1500] },
  grammar: { N5: [60, 200], N4: [60, 200], N3: [60, 250], N2: [60, 250], N1: [60, 250] },
} as const;

type Kind = keyof typeof BOUNDS;

function main() {
  const ajv = new Ajv({ allErrors: true });
  const validators = Object.fromEntries(
    (Object.keys(BOUNDS) as Kind[]).map((k) => [k, ajv.compile(readJson(join(ROOT, 'schema', `${k}.schema.json`)))]),
  ) as Record<Kind, ReturnType<typeof ajv.compile>>;

  let errors = 0;
  const fail = (msg: string) => {
    console.error(`✗ ${msg}`);
    errors++;
  };

  for (const kind of Object.keys(BOUNDS) as Kind[]) {
    const validate = validators[kind];
    const keyOf = (row: any) => (kind === 'kanji' ? row.character : row.id);
    const seen = new Map<string, string>();
    let withExamples = 0;
    let total = 0;

    for (const { level } of LEVELS) {
      const rows = readJson(join(DATA_DIR, 'json', kind, `${level.toLowerCase()}.json`));
      if (!Array.isArray(rows) || rows.length === 0) {
        fail(`${kind}/${level}: empty or not an array`);
        continue;
      }
      let bad = 0;
      for (const row of rows) {
        if (!validate(row)) {
          if (bad < 3) console.error(`✗ ${kind}/${level} ${JSON.stringify(keyOf(row))}:`, ajv.errorsText(validate.errors));
          bad++;
        }
        if (row.level !== level) fail(`${kind}/${level}: ${keyOf(row)} says level ${row.level}`);
        const key = keyOf(row);
        if (seen.has(key)) fail(`${kind}: ${key} appears at ${seen.get(key)} and ${level}`);
        seen.set(key, level);
        if (row.examples?.length) withExamples++;
        for (const ex of row.examples ?? []) {
          if (ex.furigana && stripFurigana(ex.furigana) !== ex.ja) fail(`${kind}/${level} ${key}: furigana does not match the sentence: ${ex.furigana}`);
        }
      }
      errors += bad;
      total += rows.length;
      const [min, max] = BOUNDS[kind][level as keyof (typeof BOUNDS)[Kind]];
      const countOk = rows.length >= min && rows.length <= max;
      if (!countOk) fail(`${kind}/${level}: count ${rows.length} outside [${min}, ${max}]`);
      console.log(`${bad === 0 && countOk ? '✓' : '✗'} ${kind}/${level}: ${rows.length} entries${bad ? `, ${bad} invalid` : ''}`);
    }
    if (kind === 'vocab' && withExamples / total < 0.8) {
      fail(`vocab: only ${withExamples}/${total} words have examples — was the Tatoeba cache missing?`);
    }
  }

  // Kanji → vocab links must point at real words.
  const words = new Set(LEVELS.flatMap(({ level }) => readJson(join(DATA_DIR, 'json', 'vocab', `${level.toLowerCase()}.json`)).map((v: any) => v.word)));
  for (const { level } of LEVELS) {
    for (const k of readJson(join(DATA_DIR, 'json', 'kanji', `${level.toLowerCase()}.json`))) {
      for (const w of k.words ?? []) if (!words.has(w)) fail(`kanji ${k.character}: linked word ${w} is not in vocab`);
    }
  }

  if (errors) {
    console.error(`\nValidation FAILED with ${errors} problem(s).`);
    process.exit(1);
  }
  console.log('\nValidation passed.');
}

main();
