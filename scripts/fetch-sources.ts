/**
 * Download all upstream source files into .cache/ (gitignored).
 *
 * Sources:
 *   - Jonathan Waller's JLPT lists (tanos.co.uk)      — vocab + kanji, per level  [CC BY]
 *   - KANJIDIC2 (EDRDG)                               — kanji readings/meanings    [CC BY-SA 4.0]
 *
 * See NOTICE.md for full attribution.
 */
import { join } from 'node:path';
import { CACHE_DIR, LEVELS, download } from './lib/util.ts';

const TANOS = 'http://www.tanos.co.uk/jlpt';
const KANJIDIC2 = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz';

async function main() {
  const force = process.argv.includes('--force');
  const jobs: Promise<void>[] = [];

  for (const { level, tanos } of LEVELS) {
    const n = tanos; // filenames use n5..n1 matching the tanos level number
    const base = `${TANOS}/jlpt${tanos}`;
    jobs.push(
      download(`${base}/vocab/n${n}-vocab-kanji-eng.anki`, join(CACHE_DIR, `${level}-vocab-eng.anki`), force),
      download(`${base}/vocab/n${n}-vocab-kanji-hiragana.anki`, join(CACHE_DIR, `${level}-vocab-hira.anki`), force),
      download(`${base}/kanji/n${n}-kanji-char-eng.anki`, join(CACHE_DIR, `${level}-kanji-eng.anki`), force),
    );
  }
  jobs.push(download(KANJIDIC2, join(CACHE_DIR, 'kanjidic2.xml.gz'), force));

  await Promise.all(jobs);
  console.log(`Fetched ${jobs.length} source files into ${CACHE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
