/**
 * OpenJLPT — typed loader for the open JLPT N5–N1 dataset.
 *
 * @example
 * import { getVocab, findWord, findKanji, searchVocab, getGrammar } from 'openjlpt';
 * getVocab('N5');                 // all N5 words
 * findWord('食べる');              // { reading: 'たべる', level: 'N5', pos: ['v1','vt'], ... }
 * findKanji('日');                 // { strokes: 4, radical: '日', words: ['明日', ...], ... }
 * searchVocab('taberu');           // romaji, kana, kanji or English all work
 * getGrammar('N4');                // grammar points with examples
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type Level = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export interface Example {
  ja: string;
  en: string;
  /** Tatoeba ID of the Japanese sentence (Tatoeba examples only): https://tatoeba.org/sentences/show/<id> */
  tatoeba_id?: number;
}

export interface Vocab {
  /** Stable ID: first 10 hex digits of SHA-1(word + "\0" + reading). */
  id: string;
  word: string;
  /** Kana reading (equals `word` for kana-only words). */
  reading: string;
  /** Hepburn romanization of the reading, without macrons. */
  romaji: string;
  meanings: string[];
  level: Level;
  /** JMdict part-of-speech codes (see `posLabels`). */
  pos?: string[];
  /** JMdict entry sequence number. */
  jmdict_id?: number;
  other_forms?: string[];
  other_readings?: string[];
  /** Example sentences from Tatoeba (CC BY 2.0 FR). */
  examples?: Example[];
}

export interface Kanji {
  character: string;
  level: Level;
  strokes: number | null;
  grade: number | null;
  /** Newspaper frequency rank (1 = most frequent). */
  freq: number | null;
  /** Classical (Kangxi) radical, e.g. 日. */
  radical: string | null;
  radical_number: number | null;
  onyomi: string[];
  kunyomi: string[];
  nanori?: string[];
  meanings: string[];
  /** OpenJLPT words that use this kanji, easiest first. */
  words?: string[];
  /** A jōyō kanji missing from Waller's (pre-2010) lists, levelled by the words that use it. */
  supplementary?: true;
}

export interface Grammar {
  /** Stable ID, a slug of the romaji (e.g. `te-mo-ii`). */
  id: string;
  pattern: string;
  /** Kana form of `pattern` when it contains kanji. */
  reading?: string;
  romaji: string;
  level: Level;
  meaning: string;
  formation: string;
  examples: Example[];
  tags: string[];
  notes?: string;
}

export interface Meta {
  name: string;
  version: string;
  license: string;
  homepage: string;
  counts: Record<'vocab' | 'kanji' | 'grammar', Record<Level | 'total', number>>;
  vocab_with_examples: number;
  sources: Record<string, Record<string, string | null>>;
}

export const levels: readonly Level[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'json');
const cache = new Map<string, unknown>();

function readJson<T>(path: string): T {
  if (!cache.has(path)) cache.set(path, JSON.parse(readFileSync(join(DATA_DIR, path), 'utf8')));
  return cache.get(path) as T;
}

const load = <T>(kind: 'vocab' | 'kanji' | 'grammar', level: Level) => readJson<T[]>(`${kind}/${level.toLowerCase()}.json`);

function all<T>(kind: 'vocab' | 'kanji' | 'grammar', level?: Level): T[] {
  return level ? load<T>(kind, level) : levels.flatMap((l) => load<T>(kind, l));
}

/** Memoize an index built from the full dataset. */
function lazy<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

// ---------------------------------------------------------------------------
// Vocabulary

/** All vocabulary, or just one level. Sorted by reading within each level. */
export const getVocab = (level?: Level): Vocab[] => all<Vocab>('vocab', level);

const vocabById = lazy(() => new Map(getVocab().map((v) => [v.id, v])));
const vocabByForm = lazy(() => {
  const map = new Map<string, Vocab[]>();
  const add = (key: string, v: Vocab) => {
    const list = map.get(key);
    if (!list) map.set(key, [v]);
    else if (!list.includes(v)) list.push(v);
  };
  for (const v of getVocab()) {
    add(v.word, v);
    for (const f of v.other_forms ?? []) add(f, v);
  }
  return map;
});

/** Look up a word by its stable ID. */
export const getVocabById = (id: string): Vocab | undefined => vocabById().get(id);

/** Look up a word by its written form (or an alternative spelling). Returns the easiest-level match. */
export const findWord = (word: string): Vocab | undefined => vocabByForm().get(word)?.[0];

/** All entries written as `word` (homographs such as 上 うえ / じょう are separate entries). */
export const findWords = (word: string): Vocab[] => vocabByForm().get(word) ?? [];

// ---------------------------------------------------------------------------
// Kanji

/** All kanji, or just one level. Most frequent first within each level. */
export const getKanji = (level?: Level): Kanji[] => all<Kanji>('kanji', level);

const kanjiByChar = lazy(() => new Map(getKanji().map((k) => [k.character, k])));

/** Look up a single kanji. */
export const findKanji = (character: string): Kanji | undefined => kanjiByChar().get(character);

/**
 * The JLPT kanji in a piece of text, in order of first appearance.
 * Handy for estimating how hard a sentence is: `kanjiIn('日本語を勉強する').map(k => k.level)`.
 */
export function kanjiIn(text: string): Kanji[] {
  const seen = new Set<string>();
  const out: Kanji[] = [];
  for (const ch of text) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    const k = findKanji(ch);
    if (k) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grammar

/** All grammar points, or just one level, in teaching order. */
export const getGrammar = (level?: Level): Grammar[] => all<Grammar>('grammar', level);

const grammarById = lazy(() => new Map(getGrammar().map((g) => [g.id, g])));

/** Look up a grammar point by its stable ID (e.g. `te-mo-ii`). */
export const getGrammarById = (id: string): Grammar | undefined => grammarById().get(id);

/** Grammar points whose pattern (or kana reading) contains `pattern`; 〜 is optional. */
export function findGrammar(pattern: string): Grammar[] {
  const p = pattern.replace(/^[〜~]/, '');
  return getGrammar().filter((g) => g.pattern.includes(p) || g.reading?.includes(p));
}

// ---------------------------------------------------------------------------
// Search

/** Normalise for matching: katakana → hiragana, lowercase, trim. */
export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export interface SearchOptions {
  level?: Level;
  /** Maximum number of results (default: no limit). */
  limit?: number;
}

/**
 * Search vocabulary by kanji, kana (hiragana/katakana-insensitive), romaji, or English.
 * Results are ranked: exact matches, then prefix matches, then substring matches.
 *
 * `searchVocab('eat', 'N5')` also accepts a level as the second argument.
 */
export function searchVocab(query: string, options: SearchOptions | Level = {}): Vocab[] {
  const { level, limit } = typeof options === 'string' ? { level: options, limit: undefined } : options;
  const q = normalize(query);
  if (!q) return [];
  const scored: [number, Vocab][] = [];
  for (const v of getVocab(level)) {
    const forms = [v.word, ...(v.other_forms ?? []), v.reading, ...(v.other_readings ?? []), v.romaji].map(normalize);
    const glosses = v.meanings.map((m) => m.toLowerCase());
    let score = 0;
    if (forms.includes(q)) score = 100;
    else if (glosses.some((m) => m === q || m === `to ${q}`)) score = 90;
    else if (forms.some((f) => f.startsWith(q))) score = 60;
    else if (glosses.some((m) => new RegExp(`\\b${escapeRegExp(q)}\\b`).test(m))) score = 50;
    else if (forms.some((f) => f.includes(q))) score = 30;
    else if (glosses.some((m) => m.includes(q))) score = 20;
    if (score) scored.push([score, v]);
  }
  scored.sort((a, b) => b[0] - a[0] || levels.indexOf(a[1].level) - levels.indexOf(b[1].level));
  const out = scored.map(([, v]) => v);
  return limit ? out.slice(0, limit) : out;
}

/** Case-insensitive search across grammar pattern, reading, romaji, meaning, formation and tags. */
export function searchGrammar(query: string, options: SearchOptions | Level = {}): Grammar[] {
  const { level, limit } = typeof options === 'string' ? { level: options, limit: undefined } : options;
  const q = normalize(query.replace(/^[〜~]/, ''));
  if (!q) return [];
  const out = getGrammar(level).filter((g) =>
    [g.pattern, g.reading ?? '', g.romaji, g.meaning, g.formation, ...g.tags].some((f) => normalize(f).includes(q)),
  );
  return limit ? out.slice(0, limit) : out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------------------
// Misc

/** Dataset version, counts and upstream source versions. */
export const meta = (): Meta => readJson<Meta>('meta.json');

/** Descriptions of the JMdict part-of-speech codes used in `Vocab.pos`, e.g. `v1` → "Ichidan verb". */
export const posLabels = (): Record<string, string> => readJson<Record<string, string>>('pos.json');

/**
 * `n` random items (without replacement) — for flashcards and quizzes.
 * Pass your own `random` (e.g. a seeded PRNG) for reproducible draws.
 */
export function sample<T>(items: readonly T[], n = 1, random: () => number = Math.random): T[] {
  const pool = items.slice();
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
