/**
 * Download all upstream source files into .cache/ (gitignored), then snapshot
 * Waller's JLPT lists into sources/waller/ (committed).
 *
 * Sources:
 *   - Jonathan Waller's JLPT lists (tanos.co.uk)  — vocab + kanji level lists    [CC BY]
 *   - JMdict (EDRDG)                              — vocab IDs, part of speech     [CC BY-SA 4.0]
 *   - KANJIDIC2 (EDRDG)                           — kanji readings/meanings       [CC BY-SA 4.0]
 *   - Tatoeba                                     — example sentences + indices   [CC BY 2.0 FR]
 *
 * See NOTICE.md for full attribution.
 *
 * Usage: tsx scripts/fetch-sources.ts [--force]
 */
import { join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CACHE_DIR, LEVELS, download } from './lib/util.ts';
import { importWaller } from './lib/waller.ts';

const TANOS = 'http://www.tanos.co.uk/jlpt';
const KANJIDIC2 = 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz';
const JMDICT = 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz';
const TATOEBA = 'https://downloads.tatoeba.org/exports';

/** Download a bzip2 file and decompress it to `out` (requires the `bzip2` CLI). */
async function fetchBz2(url: string, out: string, force: boolean): Promise<void> {
  if (!force && existsSync(out)) return;
  const bz2 = `${out}.bz2`;
  await download(url, bz2, force);
  execFileSync('bzip2', ['-df', bz2]); // -d decompress, -f overwrite, removes .bz2
}

/** Download a .tar.bz2 archive and extract its first `*.csv` member to `out` (requires `tar` + `bzip2`). */
async function fetchTarBz2Csv(url: string, out: string, force: boolean): Promise<void> {
  if (!force && existsSync(out)) return;
  const archive = `${out}.tar.bz2`;
  const tmp = `${out}.d`;
  await download(url, archive, force);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('tar', ['-xjf', archive, '-C', tmp]);
  const csv = readdirSync(tmp, { recursive: true, encoding: 'utf8' }).find((f) => f.endsWith('.csv'));
  if (!csv) throw new Error(`No .csv found in ${url}`);
  renameSync(join(tmp, csv), out);
  rmSync(tmp, { recursive: true, force: true });
  rmSync(archive, { force: true });
}

async function main() {
  const force = process.argv.includes('--force');
  const jobs: Promise<void>[] = [];

  for (const { level, tanos } of LEVELS) {
    const base = `${TANOS}/jlpt${tanos}`;
    jobs.push(
      download(`${base}/vocab/n${tanos}-vocab-kanji-eng.anki`, join(CACHE_DIR, `${level}-vocab-eng.anki`), force),
      download(`${base}/vocab/n${tanos}-vocab-kanji-hiragana.anki`, join(CACHE_DIR, `${level}-vocab-hira.anki`), force),
      download(`${base}/kanji/n${tanos}-kanji-char-eng.anki`, join(CACHE_DIR, `${level}-kanji-eng.anki`), force),
    );
  }
  jobs.push(download(KANJIDIC2, join(CACHE_DIR, 'kanjidic2.xml.gz'), force));
  jobs.push(download(JMDICT, join(CACHE_DIR, 'JMdict_e.gz'), force));

  // Tatoeba example sentences (Japanese, English, jpn->eng links) and the
  // Japanese word indices (the Tanaka-corpus "B lines") used for lemma matching.
  const tdir = join(CACHE_DIR, 'tatoeba');
  jobs.push(
    fetchBz2(`${TATOEBA}/per_language/jpn/jpn_sentences.tsv.bz2`, join(tdir, 'jpn.tsv'), force),
    fetchBz2(`${TATOEBA}/per_language/eng/eng_sentences.tsv.bz2`, join(tdir, 'eng.tsv'), force),
    fetchBz2(`${TATOEBA}/per_language/jpn/jpn-eng_links.tsv.bz2`, join(tdir, 'links.tsv'), force),
    fetchTarBz2Csv(`${TATOEBA}/jpn_indices.tar.bz2`, join(tdir, 'jpn_indices.csv'), force),
  );

  await Promise.all(jobs);
  console.log(`Fetched ${jobs.length} source files into ${CACHE_DIR}`);

  const counts = importWaller();
  console.log('Snapshotted Waller lists into sources/waller/:', counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
