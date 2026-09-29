/**
 * Furigana for example sentences.
 *
 * Tatoeba's word index (B-lines) gives every word of a sentence in dictionary form, with a
 * reading where the form alone is ambiguous: 彼(かれ) は 本 を 読む{読んでいる}. JMdict gives
 * the reading of the remaining forms. We align each form with its reading (読む → 読|よ + む),
 * carry the kanji readings over to the conjugated form in the sentence (読んでいる → 読|よ),
 * and write the result in `{漢字|かんじ}` notation: {彼|かれ}は{本|ほん}を{読|よ}んでいる。
 *
 * A sentence is annotated only when every kanji in it is covered with a confident reading;
 * anything uncertain (an unindexed name, a numeral before a counter, whose sound may change)
 * leaves the sentence without furigana rather than risk a wrong one.
 */
import { hasKanji, toHiragana } from './kana.ts';
import type { IndexToken } from './examples.ts';

/** What the annotator needs from a dictionary. */
export interface Lexicon {
  /** The reading of a dictionary form, or undefined when it has several plausible ones. */
  reading(headword: string): string | undefined;
  /** Readings the form has when used as a prefix or suffix (車 as a suffix is しゃ). */
  affixReadings?(headword: string, kind: 'prefix' | 'suffix'): string[];
}

export interface Segment {
  text: string;
  /** Reading of `text` when it is a run of kanji. */
  rt?: string;
}

const KANJI_RUN = /[㐀-䶿一-鿿豈-﫿々〆ヶ]+/g;
const isKanjiRun = (s: string) => /^[㐀-䶿一-鿿豈-﫿々〆ヶ]+$/.test(s);
const NUMERAL = /^[一二三四五六七八九十百千万何数幾]+$/;
const NUMBER_CHAR = /[0-9０-９一二三四五六七八九十百千万何数幾]/;
/** Counters whose sound changes after a number (1本 いっぽん, 3階 さんがい, 2人 ふたり, 3日 みっか). */
const SHIFTING_COUNTER = /^[本杯匹分泊発百千階軒足羽日人箱袋方敗版片遍辺歩品票俵拍間貫筆]/;
const isKanjiChar = (c: string | undefined) => !!c && isKanjiRun(c);

/** Split a word into alternating kanji runs and other text. */
function runs(word: string): string[] {
  return word.split(new RegExp(`(${KANJI_RUN.source})`)).filter(Boolean);
}

/**
 * Align a word with its kana reading: 食べる + たべる → [食|た][べる]. Returns undefined when
 * the reading doesn't fit the word or the alignment is ambiguous.
 */
export function alignReading(word: string, reading: string): Segment[] | undefined {
  const parts = runs(word);
  if (!parts.some(isKanjiRun)) return toHiragana(word) === toHiragana(reading) ? [{ text: word }] : undefined;
  const escape = (s: string) => toHiragana(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const target = toHiragana(reading);
  const solve = (group: string) => target.match(new RegExp(`^${parts.map((p) => (isKanjiRun(p) ? group : escape(p))).join('')}$`));
  const lazy = solve('(.+?)');
  const greedy = solve('(.+)');
  if (!lazy || !greedy || lazy.slice(1).join('|') !== greedy.slice(1).join('|')) return undefined;
  let g = 1;
  return parts.map((p) => (isKanjiRun(p) ? { text: p, rt: lazy[g++] } : { text: p }));
}

/** 来る reads こ/き/く depending on what follows (来ない, 来ます, 来る). */
function kuruStem(rest: string): string | undefined {
  if (/^(る|れば)/.test(rest)) return 'く';
  if (/^(ま|た|て|そう|や)/.test(rest)) return 'き';
  if (/^(な|い|よ|さ|ら|ず|れる|れな)/.test(rest)) return 'こ';
  return undefined;
}

/**
 * Furigana for one word as it appears in the sentence (`surface`, possibly conjugated),
 * from its dictionary form and that form's reading.
 */
export function surfaceRuby(headword: string, reading: string, surface: string): Segment[] | undefined {
  if (!hasKanji(surface)) return [{ text: surface }];
  const lemma = alignReading(headword, reading);
  if (!lemma) return undefined;
  const lemmaRuns = lemma.filter((s) => s.rt);
  const parts = runs(surface);
  const surfaceRuns = parts.filter(isKanjiRun);
  // Conjugation only changes the kana; the kanji must be the same, in the same order.
  if (surfaceRuns.length !== lemmaRuns.length || surfaceRuns.some((r, i) => r !== lemmaRuns[i].text)) return undefined;
  if (surface === headword) return lemma;
  // Irregular stems: the kanji's reading changes with the ending.
  if (headword === '為る') return undefined;
  const out: Segment[] = [];
  let i = 0;
  for (const [n, p] of parts.entries()) {
    if (!isKanjiRun(p)) {
      out.push({ text: p });
      continue;
    }
    let rt = lemmaRuns[i++].rt!;
    if (headword.endsWith('来る') && p.endsWith('来') && rt.endsWith('く') && i === lemmaRuns.length) {
      const stem = kuruStem(parts.slice(n + 1).join(''));
      if (!stem) return undefined;
      rt = rt.slice(0, -1) + stem;
    }
    if (/^(良|善)い$/.test(headword) && reading === 'いい') rt = 'よ'; // 良かった is よかった
    out.push({ text: p, rt });
  }
  return out;
}

/** Render segments in `{漢字|かんじ}` notation. */
export const toNotation = (segments: Segment[]) => segments.map((s) => (s.rt ? `{${s.text}|${s.rt}}` : s.text)).join('');

/** Remove `{漢字|かんじ}` notation, leaving the plain sentence. */
export const stripFurigana = (s: string) => s.replace(/\{([^|{}]+)\|[^|{}]+\}/g, '$1');

/**
 * Annotate a sentence from its B-line tokens. Returns undefined unless every kanji in the
 * sentence is covered by a token with a confident reading.
 */
export function annotate(ja: string, tokens: IndexToken[], lexicon: Lexicon): string | undefined {
  if (/[{}|]/.test(ja)) return undefined;
  let out = '';
  let pos = 0;
  for (const t of tokens) {
    const surface = t.surface ?? t.headword;
    if (!hasKanji(surface)) continue; // kana needs no furigana; skipping keeps positions safe
    const at = ja.indexOf(surface, pos);
    if (at < 0) return undefined;
    const gap = ja.slice(pos, at);
    if (hasKanji(gap)) return undefined; // a kanji no token accounts for
    const before = ja[at - 1];
    const after = ja[at + surface.length];
    // A numeral before a counter may change its sound (三本 さんぼん, 一杯 いっぱい), and so
    // may the counter (１０本 じっぽん).
    if (NUMERAL.test(t.headword) && isKanjiChar(after)) return undefined;
    if (before && NUMBER_CHAR.test(before) && SHIFTING_COUNTER.test(surface)) return undefined;
    const reading = t.reading ? toHiragana(t.reading) : lexicon.reading(t.headword);
    if (!reading) return undefined;
    // A lone kanji right after (or before) another kanji may be a suffix (prefix) with its own
    // reading: 新型車 is しんがたしゃ, not くるま. Trust it only when the index spells the
    // reading out or the dictionary knows no such affix reading.
    if (!t.reading && [...t.headword].filter(isKanjiChar).length === 1 && lexicon.affixReadings) {
      const differs = (kind: 'prefix' | 'suffix') => lexicon.affixReadings!(t.headword, kind).some((r) => r !== reading);
      if (isKanjiChar(surface[0]) && isKanjiChar(before) && differs('suffix')) return undefined;
      if (isKanjiChar(surface.at(-1)) && isKanjiChar(after) && differs('prefix')) return undefined;
    }
    const ruby = surfaceRuby(t.headword, reading, surface);
    if (!ruby) return undefined;
    out += gap + toNotation(ruby);
    pos = at + surface.length;
  }
  const tail = ja.slice(pos);
  if (hasKanji(tail)) return undefined;
  out += tail;
  return stripFurigana(out) === ja ? out : undefined;
}
