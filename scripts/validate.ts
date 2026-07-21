/**
 * Validate every generated JSON file against the canonical schemas and check
 * that per-level counts are within sane bounds. Exits non-zero on any failure
 * (used by CI).
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { DATA_DIR, LEVELS, ROOT } from './lib/util.ts';

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

// Rough sanity bounds per level; catches a broken join that silently drops rows.
const BOUNDS = {
  vocab: { N5: [400, 1200], N4: [400, 1200], N3: [1000, 3000], N2: [1000, 3000], N1: [2500, 12000] },
  kanji: { N5: [60, 150], N4: [100, 400], N3: [250, 700], N2: [250, 700], N1: [600, 1500] },
  grammar: { N5: [1, 200], N4: [1, 200], N3: [1, 200], N2: [1, 200], N1: [1, 200] },
} as const;

function main() {
  const ajv = new Ajv({ allErrors: true });
  const validators = {
    vocab: ajv.compile(readJson(join(ROOT, 'schema', 'vocab.schema.json'))),
    kanji: ajv.compile(readJson(join(ROOT, 'schema', 'kanji.schema.json'))),
    grammar: ajv.compile(readJson(join(ROOT, 'schema', 'grammar.schema.json'))),
  };

  let errors = 0;
  for (const kind of ['vocab', 'kanji', 'grammar'] as const) {
    const validate = validators[kind];
    for (const { level } of LEVELS) {
      const file = join(DATA_DIR, 'json', kind, `${level.toLowerCase()}.json`);
      const rows = readJson(file);
      if (!Array.isArray(rows) || rows.length === 0) {
        console.error(`✗ ${kind}/${level}: empty or not an array`);
        errors++;
        continue;
      }
      let bad = 0;
      for (const row of rows) {
        if (!validate(row)) {
          if (bad < 3) console.error(`✗ ${kind}/${level} invalid:`, ajv.errorsText(validate.errors));
          bad++;
        }
      }
      const [min, max] = BOUNDS[kind][level as keyof (typeof BOUNDS)[typeof kind]];
      const countOk = rows.length >= min && rows.length <= max;
      if (bad) errors += bad;
      if (!countOk) {
        console.error(`✗ ${kind}/${level}: count ${rows.length} outside [${min}, ${max}]`);
        errors++;
      }
      console.log(`${bad === 0 && countOk ? '✓' : '✗'} ${kind}/${level}: ${rows.length} entries${bad ? `, ${bad} invalid` : ''}`);
    }
  }

  if (errors) {
    console.error(`\nValidation FAILED with ${errors} problem(s).`);
    process.exit(1);
  }
  console.log('\nValidation passed.');
}

main();
