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
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CACHE_DIR, LEVELS, download } from './lib/util.ts';

const TANOS = 'http://www.tanos.co.uk/jlpt';
const KANJIDIC2 = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz';
const TATOEBA = 'https://downloads.tatoeba.org/exports';

/** Download a bzip2 file and decompress it to `out` (requires the `bzip2` CLI). */
async function fetchBz2(url: string, out: string, force: boolean): Promise<void> {
  if (!force && existsSync(out)) return;
  const bz2 = `${out}.bz2`;
  await download(url, bz2, force);
  execFileSync('bzip2', ['-df', bz2]); // -d decompress, -f overwrite, removes .bz2
}

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

  // Tatoeba example sentences (Japanese, English, and the jpn->eng links).
  const tdir = join(CACHE_DIR, 'tatoeba');
  jobs.push(
    fetchBz2(`${TATOEBA}/per_language/jpn/jpn_sentences.tsv.bz2`, join(tdir, 'jpn.tsv'), force),
    fetchBz2(`${TATOEBA}/per_language/eng/eng_sentences.tsv.bz2`, join(tdir, 'eng.tsv'), force),
    fetchBz2(`${TATOEBA}/per_language/jpn/jpn-eng_links.tsv.bz2`, join(tdir, 'links.tsv'), force),
  );

  await Promise.all(jobs);
  console.log(`Fetched ${jobs.length} source files into ${CACHE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
