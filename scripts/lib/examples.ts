/**
 * Example sentences from the Tatoeba corpus (CC BY 2.0 FR).
 *
 * Files expected in .cache/tatoeba/ (downloaded + decompressed by fetch-sources):
 *   jpn.tsv           id \t lang \t text
 *   eng.tsv           id \t lang \t text
 *   links.tsv         jpn_id \t eng_id
 *   jpn_indices.csv   jpn_id \t eng_id \t B-line   (Tanaka-corpus word index)
 *
 * A B-line lists every word of a sentence in dictionary form, e.g.
 *   彼(かれ)[01] は 本 を 読む{読んでいる}~
 * where (reading), [sense], {surface form} are optional and `~` marks a checked,
 * good example of that word. Matching on B-lines finds conjugated uses (読む →
 * 読んでいる) and avoids false hits like あれ inside であれ. Words the index doesn't
 * cover fall back to a conservative surface-form search.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR } from './util.ts';
import { hasKanji, toHiragana } from './kana.ts';

export interface Example {
  ja: string;
  en: string;
  /** Tatoeba sentence ID of the Japanese sentence (https://tatoeba.org/sentences/show/<id>). */
  tatoeba_id?: number;
}

export interface IndexToken {
  headword: string;
  reading?: string;
  sense?: number;
  surface?: string;
  checked: boolean;
}

const TATOEBA_DIR = join(CACHE_DIR, 'tatoeba');
const MIN_LEN = 5;
const MAX_LEN = 45;
const IDEAL_LEN = 16;

/** Sentences we don't want to show learners by default (checked on both sides). */
const CRUDE = /\b(fuck\w*|shit\w*|bitch\w*|damn\w*|hell|bastard\w*|dick|cock|pussy|whore|slut|rape\w*|suicide|kill yourself|nigg\w*|fag\w*|retard\w*|porn\w*|sex\w*|naked|nude|semen|sperm|erection|erotic\w*|kinky|orgasm\w*|penis|vagina|masturbat\w*|horny|boobs?|tits?)\b/i;
const CRUDE_JA = /セックス|エッチ|エロ|ちんこ|ちんぽ|まんこ|おっぱい|精液|精子|勃起|朝立ち|しょんべん|ションベン|うんこ|自殺|殺してやる|ぶっ殺|レイプ|強姦|売春|淫|クソ|くそったれ|ファック/;

export function tatoebaAvailable(dir = TATOEBA_DIR): boolean {
  return ['jpn.tsv', 'eng.tsv', 'links.tsv'].every((f) => existsSync(join(dir, f)));
}

/**
 * Does `text` contain `form` as a word? Short kanji forms must not sit inside a longer
 * kanji compound (分母 is not in 充分母乳).
 */
function containsWord(text: string, form: string): boolean {
  const short = [...form].length <= 2 && hasKanji(form);
  for (let i = text.indexOf(form); i !== -1; i = text.indexOf(form, i + 1)) {
    if (!short) return true;
    const before = text[i - 1] ?? '';
    const after = text[i + form.length] ?? '';
    if (!hasKanji(before) && !hasKanji(after)) return true;
  }
  return false;
}

function bigrams(s: string): Set<string> {
  const chars = [...s.replace(/[。、！？!?「」\s]/g, '')];
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1]);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 1;
}

const TOKEN = /^(.+?)(?:\(([^)]+)\))?(?:\[(\d+)\])?(?:\{([^}]+)\})?(~)?$/;

/** Parse one B-line into tokens. */
export function parseBLine(line: string): IndexToken[] {
  const out: IndexToken[] = [];
  for (const raw of line.trim().split(/\s+/)) {
    const m = raw.match(TOKEN);
    if (!m) continue;
    out.push({
      headword: m[1].replace(/\|\d+$/, ''),
      reading: m[2],
      sense: m[3] ? Number(m[3]) : undefined,
      surface: m[4],
      checked: !!m[5],
    });
  }
  return out;
}

interface Sentence {
  id: number;
  ja: string;
  en: string;
}

interface Posting {
  s: number; // index into pool
  reading?: string;
  checked: boolean;
}

export interface ExampleQuery {
  /**
   * Forms to look up in the word index (headword, alternatives, JMdict kanji forms).
   * Include kana readings only for words normally written in kana — otherwise a
   * kanji word like 蚊 would match the particle か.
   */
  forms: string[];
  /** Kana readings of this word; used to reject index entries marked with a different reading. */
  readings: string[];
  /** The word's JLPT level (N5–N1), used to prefer sentences with easier kanji. */
  level: string;
}

export class ExampleIndex {
  private pool: Sentence[] = [];
  private byHeadword = new Map<string, Posting[]>();
  private charIndex = new Map<string, number[]>();
  /** kanji → JLPT level rank (5 = N5 ... 1 = N1), for difficulty scoring. */
  private kanjiRank = new Map<string, number>();

  /**
   * @param kanjiLevels kanji → JLPT level ("N5"…"N1"), used to prefer sentences with easier kanji
   * @param dir directory holding the Tatoeba exports (defaults to .cache/tatoeba)
   */
  constructor(kanjiLevels: Map<string, string> = new Map(), dir = TATOEBA_DIR) {
    for (const [ch, level] of kanjiLevels) this.kanjiRank.set(ch, Number(level.slice(1)));

    const readTsv = (file: string, fn: (cols: string[]) => void) => {
      for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
        if (line) fn(line.split('\t'));
      }
    };

    const jpn = new Map<string, string>();
    readTsv('jpn.tsv', ([id, , text]) => jpn.set(id, text));

    // Preferred English translation per Japanese sentence: the B-line's "meaning id"
    // (the curated Tanaka pairing) when present, else the first linked English sentence.
    const preferred = new Map<string, string>();
    const indices = new Map<string, string>();
    const indicesFile = join(dir, 'jpn_indices.csv');
    if (existsSync(indicesFile)) {
      readTsv('jpn_indices.csv', ([jp, en, bline]) => {
        if (!jpn.has(jp) || !bline) return;
        indices.set(jp, bline);
        if (en && en !== '-1' && en !== '0') preferred.set(jp, en);
      });
    }
    readTsv('links.tsv', ([jp, en]) => {
      if (jpn.has(jp) && !preferred.has(jp)) preferred.set(jp, en.trim());
    });

    const needed = new Set(preferred.values());
    const eng = new Map<string, string>();
    readTsv('eng.tsv', ([id, , text]) => {
      if (needed.has(id)) eng.set(id, text);
    });

    for (const [jpId, engId] of preferred) {
      const ja = jpn.get(jpId)!;
      const en = eng.get(engId);
      if (!en || ja.length < MIN_LEN || ja.length > MAX_LEN || CRUDE.test(en) || CRUDE_JA.test(ja)) continue;
      const s = this.pool.length;
      this.pool.push({ id: Number(jpId), ja, en });

      const bline = indices.get(jpId);
      if (bline) {
        for (const t of parseBLine(bline)) {
          let list = this.byHeadword.get(t.headword);
          if (!list) this.byHeadword.set(t.headword, (list = []));
          list.push({ s, reading: t.reading && toHiragana(t.reading), checked: t.checked });
        }
      }
      for (const ch of new Set(ja)) {
        let arr = this.charIndex.get(ch);
        if (!arr) this.charIndex.set(ch, (arr = []));
        arr.push(s);
      }
    }
  }

  get size(): number {
    return this.pool.length;
  }

  /**
   * Lower is better: prefer checked, readable-length sentences with kanji at or below
   * the word's level, that write the word with its kanji (見る, not みる).
   */
  private cost(s: Sentence, checked: boolean, levelRank: number, wordKanji: Set<string>): number {
    let hard = 0;
    for (const ch of s.ja) {
      if (!hasKanji(ch)) continue;
      const r = this.kanjiRank.get(ch);
      if (r === undefined) hard += 2;
      else if (r < levelRank) hard += levelRank - r;
    }
    const kanaOnly = wordKanji.size > 0 && ![...wordKanji].some((k) => s.ja.includes(k));
    return (checked ? 0 : 4) + Math.abs(s.ja.length - IDEAL_LEN) / 4 + hard * 1.5 + (kanaOnly ? 5 : 0);
  }

  /** Up to `max` example sentences for a word, best first. */
  find(q: ExampleQuery, max = 2): Example[] {
    const levelRank = Number(q.level.slice(1)) || 1;
    const wordKanji = new Set([...(q.forms[0] ?? '')].filter(hasKanji));
    const readings = new Set(q.readings.filter(Boolean).map(toHiragana));
    const scored = new Map<number, number>(); // pool index -> cost

    let indexed = false;
    for (const form of new Set(q.forms.filter(Boolean))) {
      const postings = this.byHeadword.get(form) ?? [];
      if (postings.length) indexed = true;
      for (const p of postings) {
        // Respect an explicit reading in the index (e.g. 一日(ついたち) is not いちにち).
        if (p.reading && readings.size && !readings.has(p.reading)) continue;
        const c = this.cost(this.pool[p.s], p.checked, levelRank, wordKanji);
        if (c < (scored.get(p.s) ?? Infinity)) scored.set(p.s, c);
      }
    }

    if (!indexed) {
      // Fallback for words the index doesn't know: surface search, only for forms
      // distinctive enough to avoid false hits.
      for (const form of q.forms.filter((f) => hasKanji(f) || [...f].length >= 3)) {
        let bucket: number[] | undefined;
        for (const ch of new Set(form)) {
          const arr = this.charIndex.get(ch);
          if (!arr) {
            bucket = undefined;
            break;
          }
          if (!bucket || arr.length < bucket.length) bucket = arr;
        }
        for (const s of bucket ?? []) {
          if (containsWord(this.pool[s].ja, form)) {
            const c = this.cost(this.pool[s], false, levelRank, wordKanji);
            if (c < (scored.get(s) ?? Infinity)) scored.set(s, c);
          }
        }
      }
    }

    const ranked = [...scored].sort((a, b) => a[1] - b[1] || this.pool[a[0]].id - this.pool[b[0]].id);
    const out: Example[] = [];
    const picked: Set<string>[] = [];
    const seenEn = new Set<string>();
    for (const [s] of ranked) {
      const { id, ja, en } = this.pool[s];
      const grams = bigrams(ja);
      // Skip near-duplicates (何時間勉強していますか / ２時間勉強していますか).
      if (seenEn.has(en) || picked.some((p) => jaccard(p, grams) >= 0.5)) continue;
      seenEn.add(en);
      picked.push(grams);
      out.push({ ja, en, tatoeba_id: id });
      if (out.length >= max) break;
    }
    return out;
  }
}
