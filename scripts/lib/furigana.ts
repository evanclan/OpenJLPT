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
  /** JMdict part-of-speech codes of the word with this spelling and reading (v1, v5k, adj-i…). */
  pos?(headword: string, reading: string): string[];
}

export interface Segment {
  text: string;
  /** Reading of `text` when it is a run of kanji. */
  rt?: string;
}

const KANJI_RUN = /[㐀-䶿一-鿿豈-﫿々〆ヶ]+/g;
const isKanjiRun = (s: string) => /^[㐀-䶿一-鿿豈-﫿々〆ヶ]+$/.test(s);
const NUMERAL = /^[一二三四五六七八九十百千万何数幾]+$/;
const NUMBER_CHAR = /[0-9０-９一二三四五六七八九十百千万何数幾]/;
/** Counters whose sound changes after a number (1本 いっぽん, 3階 さんがい, 2人 ふたり, 20歳 はたち). */
const SHIFTING_COUNTER = /^[本杯匹分泊発百千階軒足羽日人箱袋方敗版片遍辺歩品票俵拍間貫筆歳才服編篇派]/;
const isKanjiChar = (c: string | undefined) => !!c && isKanjiRun(c);
/** Katakana (and ー): a loanword or name that a suffix may attach to (ブラジル人, トム君). */
const isKatakanaChar = (c: string | undefined) => !!c && /^[ァ-ヺー]$/.test(c);
/** Kana that voice in compounds (rendaku): 会社 → 旅行会社 りょこうがいしゃ, 頃 → 3時頃 さんじごろ. */
const VOICEABLE = /^[かきくけこさしすせそたちつてとはひふへほ]/;

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
  if (/^(まい)/.test(rest)) return undefined; // こまい or くまい
  if (/^(ま|た|て|そう|や)/.test(rest)) return 'き';
  if (/^(な|い|よ|さ|ら|ず|れる|れな)/.test(rest)) return 'こ';
  return undefined;
}

const ROWS = ['かきくけこ', 'がぎぐげご', 'さしすせそ', 'ざじずぜぞ', 'たちつてと', 'だぢづでど', 'なにぬねの', 'ばびぶべぼ', 'まみむめも', 'らりるれろ'];

/** Kana that can follow a godan verb's stem: its row, plus the sound-change forms (書いて, 読んで, 待って). */
function godanNext(last: string, pos: string): string {
  const row = last === 'う' ? 'わいうえお' : (ROWS.find((r) => r.includes(last)) ?? '');
  const euphonic = /[うつる]/.test(last) || pos === 'v5k-s' ? 'っ' : /[ぬぶむ]/.test(last) ? 'ん' : /[くぐ]/.test(last) ? 'い' : '';
  return row + euphonic;
}

/**
 * Is `surfaceTail` (the kana after the last kanji in the sentence) an inflection of
 * `lemmaTail` (the kana after it in the dictionary form)? Spelling variants fail here:
 * 生れた is not a form of 生まれる, 行なって not of 行う, 話し not of 話.
 */
function inflects(lemmaTail: string, surfaceTail: string, pos: string[], kanjiCount: number): boolean {
  if (surfaceTail === lemmaTail) return true;
  // A する noun (勉強 → 勉強して). Single kanji are excluded: 話し is a spelling of 話, not 話+し.
  if (lemmaTail === '') return kanjiCount >= 2 && pos.some((p) => /^vs/.test(p)) && /^(する|すれ|しろ|せよ|し|さ|せ)/.test(surfaceTail);
  const stem = lemmaTail.slice(0, -1);
  const last = lemmaTail.slice(-1);
  if (!surfaceTail.startsWith(stem)) return false;
  const next = surfaceTail.slice(stem.length, stem.length + 1);
  // Ichidan verbs take anything after the stem (食べ(る/た/ない/させる…)); for 来る the
  // kanji's own reading is then checked against the ending.
  if (last === 'る' && pos.some((p) => /^(v1|vz|vk)/.test(p))) return true;
  const godan = pos.find((p) => /^v5/.test(p));
  if (godan) return next !== '' && godanNext(last, godan).includes(next);
  if (last === 'い' && pos.some((p) => /^adj-i/.test(p))) return next === '' || 'かくけさそすめみがい'.includes(next);
  return false;
}

/**
 * Furigana for one word as it appears in the sentence (`surface`, possibly conjugated),
 * from its dictionary form, that form's reading and its part of speech.
 */
export function surfaceRuby(headword: string, reading: string, surface: string, pos: string[] = []): Segment[] | undefined {
  if (!hasKanji(surface)) return [{ text: surface }];
  const lemma = alignReading(headword, reading);
  if (!lemma) return undefined;
  if (surface === headword) return lemma;
  // Readings that change with the ending, or verbs too irregular to follow (得る える/うる).
  if (headword === '為る' || headword.endsWith('得る')) return undefined;
  const parts = runs(surface);
  const lemmaParts = lemma.map((s) => s.text);
  // Conjugation changes only the kana after the last kanji: everything before it (the
  // kanji and the kana between them) must be spelled exactly as in the dictionary form.
  const lastKanji = (xs: string[]) => xs.reduce((at, x, i) => (isKanjiRun(x) ? i : at), -1);
  const lk = lastKanji(parts);
  const llk = lastKanji(lemmaParts);
  if (lk !== llk || parts.slice(0, lk + 1).some((p, i) => toHiragana(p) !== toHiragana(lemmaParts[i]))) return undefined;
  const kanjiCount = [...headword].filter(isKanjiChar).length;
  const tail = (xs: string[], at: number) => toHiragana(xs.slice(at + 1).join(''));
  if (!inflects(tail(lemmaParts, llk), tail(parts, lk), pos, kanjiCount)) return undefined;
  const out: Segment[] = [];
  for (const [n, p] of parts.entries()) {
    const seg = lemma[n];
    if (n > lk || !seg.rt) {
      out.push({ text: p });
      continue;
    }
    let rt = seg.rt;
    if (headword.endsWith('来る') && p.endsWith('来') && rt.endsWith('く') && n === lk) {
      const stem = kuruStem(parts.slice(n + 1).join(''));
      if (!stem) return undefined;
      rt = rt.slice(0, -1) + stem;
    }
    if (/^(良|善|好)い$/.test(headword) && reading === 'いい') rt = 'よ'; // 良かった is よかった
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
  // Notation characters, Anki's [ ] and characters outside the BMP (𠮟, which the kanji
  // patterns can't see) are left alone.
  if (/[{}|[\]\ud800-\udfff]/.test(ja)) return undefined;
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
    // A numeral before a counter may change its sound (三本 さんぼん, 一センチ いっ, 六か月 ろっ),
    // and so may the counter (１０本 じっぽん).
    if (NUMERAL.test(t.headword) && (isKanjiChar(after) || isKatakanaChar(after) || /^[かカケヶ]$/.test(after ?? ''))) return undefined;
    if (before && NUMBER_CHAR.test(before) && SHIFTING_COUNTER.test(surface)) return undefined;
    const reading = t.reading ? toHiragana(t.reading) : lexicon.reading(t.headword);
    if (!reading) return undefined;
    // Joined to the word before it, a word may be a suffix with its own reading (新型車 is
    // しんがたしゃ, ブラジル人 is じん) or voice its first sound (旅行会社 がいしゃ, 3時頃 ごろ).
    // The index gives dictionary readings, not these, so such words are left unannotated.
    const joinedBefore = isKanjiChar(surface[0]) && (isKanjiChar(before) || isKatakanaChar(before));
    if (joinedBefore && VOICEABLE.test(reading)) return undefined;
    if (!t.reading && [...t.headword].filter(isKanjiChar).length === 1 && lexicon.affixReadings) {
      const differs = (kind: 'prefix' | 'suffix') => lexicon.affixReadings!(t.headword, kind).some((r) => r !== reading);
      if (joinedBefore && differs('suffix')) return undefined;
      if (isKanjiChar(surface.at(-1)) && isKanjiChar(after) && differs('prefix')) return undefined;
    }
    const ruby = surfaceRuby(t.headword, reading, surface, lexicon.pos?.(t.headword, reading) ?? []);
    if (!ruby) return undefined;
    out += gap + toNotation(ruby);
    pos = at + surface.length;
  }
  const tail = ja.slice(pos);
  if (hasKanji(tail)) return undefined;
  out += tail;
  return stripFurigana(out) === ja ? out : undefined;
}
