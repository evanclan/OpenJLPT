/**
 * Jonathan Waller's JLPT lists (tanos.co.uk, CC BY) are the source of every
 * N5–N1 level assignment in OpenJLPT. They ship as old-format Anki decks, so
 * `importWaller()` extracts the raw cards into a committed, diff-friendly JSON
 * snapshot under sources/waller/. The build reads the snapshot, which keeps
 * the dataset reproducible even if the upstream site changes or goes away.
 *
 * Snapshot files hold the cards verbatim (no cleaning); all normalisation
 * happens in the build so it can be reviewed and tested.
 */
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CACHE_DIR, LEVELS, ROOT, readAnkiFacts, type Level } from './util.ts';

export const WALLER_DIR = join(ROOT, 'sources', 'waller');

/** One Anki card: `front` is the headword, `back` the answer (meaning or reading). */
export interface Card {
  front: string;
  back: string;
}

export type Deck = 'vocab-eng' | 'vocab-hira' | 'kanji-eng';
export const DECKS: readonly Deck[] = ['vocab-eng', 'vocab-hira', 'kanji-eng'];

const snapshotPath = (deck: Deck, level: Level) => join(WALLER_DIR, `${deck}-${level.toLowerCase()}.json`);

/** One card per line so upstream changes show up as clean, reviewable diffs. */
function writeCards(path: string, cards: Card[]): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const body = cards.map((c) => '  ' + JSON.stringify(c)).join(',\n');
  writeFileSync(path, `[\n${body}\n]\n`);
}

/** Convert the cached .anki decks into sources/waller/*.json. Returns card counts. */
export function importWaller(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { level } of LEVELS) {
    for (const deck of DECKS) {
      const facts = readAnkiFacts(join(CACHE_DIR, `${level}-${deck}.anki`));
      const cards = facts.map((f) => ({ front: f.Front ?? '', back: f.Back ?? '' }));
      writeCards(snapshotPath(deck, level), cards);
      counts[`${deck}-${level}`] = cards.length;
    }
  }
  return counts;
}

/** Read a committed snapshot. */
export function readCards(deck: Deck, level: Level): Card[] {
  return JSON.parse(readFileSync(snapshotPath(deck, level), 'utf8'));
}
