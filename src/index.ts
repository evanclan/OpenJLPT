/**
 * OpenJLPT — typed loader for the JLPT dataset.
 *
 * @example
 * import { getVocab, getKanji, findKanji } from 'openjlpt';
 * const n5 = getVocab('N5');        // all N5 vocabulary
 * const day = findKanji('日');       // -> { level: 'N5', strokes: 4, ... }
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Level = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export interface Example {
  ja: string;
  en: string;
}

export interface Vocab {
  word: string;
  reading: string;
  meanings: string[];
  level: Level;
  /** Example sentences from Tatoeba (CC BY 2.0 FR), when available. */
  examples?: Example[];
}

export interface Kanji {
  character: string;
  level: Level;
  strokes: number | null;
  grade: number | null;
  freq: number | null;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
}

export const levels: readonly Level[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'json');
const cache = new Map<string, unknown>();

function load<T>(kind: 'vocab' | 'kanji', level: Level): T[] {
  const key = `${kind}/${level}`;
  if (!cache.has(key)) {
    cache.set(key, JSON.parse(readFileSync(join(DATA_DIR, kind, `${level.toLowerCase()}.json`), 'utf8')));
  }
  return cache.get(key) as T[];
}

/** All vocabulary, or just one level. */
export function getVocab(level?: Level): Vocab[] {
  return level ? load<Vocab>('vocab', level) : levels.flatMap((l) => load<Vocab>('vocab', l));
}

/** All kanji, or just one level. */
export function getKanji(level?: Level): Kanji[] {
  return level ? load<Kanji>('kanji', level) : levels.flatMap((l) => load<Kanji>('kanji', l));
}

/** Look up a single vocabulary entry by its written form. */
export function findWord(word: string): Vocab | undefined {
  return getVocab().find((v) => v.word === word);
}

/** Look up a single kanji entry by character. */
export function findKanji(character: string): Kanji | undefined {
  return getKanji().find((k) => k.character === character);
}

/** Case-insensitive substring search across word, reading, and meanings. */
export function searchVocab(query: string, level?: Level): Vocab[] {
  const q = query.toLowerCase();
  return getVocab(level).filter(
    (v) =>
      v.word.includes(query) ||
      v.reading.includes(query) ||
      v.meanings.some((m) => m.toLowerCase().includes(q)),
  );
}
