/**
 * JMdict (EDRDG, CC BY-SA 4.0) parsing and matching.
 *
 * Waller's lists give us a headword, a reading and short English glosses, but no
 * dictionary identity. We match each word to its JMdict entry to add a stable
 * JMdict ID and part of speech, fill in missing/garbled readings, and repair
 * glosses the source decks truncated.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { hasKanji, isKana, toHiragana } from './kana.ts';
import { CACHE_DIR } from './util.ts';

export const JMDICT_FILE = join(CACHE_DIR, 'JMdict_e.gz');

export interface JmKanji {
  text: string;
  pri: string[];
  inf: string[];
}

export interface JmKana {
  text: string;
  pri: string[];
  inf: string[];
  /** Kanji forms this reading applies to (empty = all). */
  restr: string[];
  nokanji: boolean;
}

export interface JmSense {
  pos: string[];
  misc: string[];
  gloss: string[];
}

export interface JmEntry {
  seq: number;
  kanji: JmKanji[];
  kana: JmKana[];
  senses: JmSense[];
}

export interface Jmdict {
  entries: JmEntry[];
  /** Entity code → description, from the DTD (e.g. v1 → "Ichidan verb"). */
  entities: Record<string, string>;
  /** Creation date from the file header, e.g. "2026-09-28". */
  created?: string;
}

const XML_ESCAPES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => XML_ESCAPES[e]);

const all = (block: string, tag: string): string[] => {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  return [...block.matchAll(re)].map((m) => m[1]);
};
/** Entity-valued elements (<pos>&v1;</pos>) → entity names. */
const codes = (block: string, tag: string) => all(block, tag).map((v) => v.replace(/^&([\w-]+);$/, '$1'));

/** Parse the full JMdict XML text. Entity references are kept as their short codes. */
export function parseJmdict(xml: string): Jmdict {
  const entities: Record<string, string> = {};
  for (const m of xml.matchAll(/<!ENTITY\s+([\w-]+)\s+"([^"]*)">/g)) entities[m[1]] = m[2];
  const created = xml.match(/JMdict created:\s*(\d{4}-\d{2}-\d{2})/)?.[1];

  const entries: JmEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const kanji = all(e, 'k_ele').map((k) => ({
      text: decode(all(k, 'keb')[0] ?? ''),
      pri: all(k, 'ke_pri'),
      inf: codes(k, 'ke_inf'),
    }));
    const kana = all(e, 'r_ele').map((r) => ({
      text: decode(all(r, 'reb')[0] ?? ''),
      pri: all(r, 're_pri'),
      inf: codes(r, 're_inf'),
      restr: all(r, 're_restr').map(decode),
      nokanji: /<re_nokanji\s*\/?>/.test(r),
    }));
    const senses: JmSense[] = [];
    for (const s of all(e, 'sense')) {
      const pos = codes(s, 'pos');
      senses.push({
        // Per the JMdict DTD, part of speech carries over from the previous sense when omitted.
        pos: pos.length ? pos : (senses.at(-1)?.pos ?? []),
        misc: codes(s, 'misc'),
        gloss: all(s, 'gloss').map(decode),
      });
    }
    entries.push({ seq: Number(all(e, 'ent_seq')[0]), kanji, kana, senses });
  }
  return { entries, entities, created };
}

/** Load and parse .cache/JMdict_e.gz (downloaded by `npm run fetch`). */
export function loadJmdict(file = JMDICT_FILE): Jmdict {
  if (!existsSync(file)) throw new Error(`${file} not found — run \`npm run fetch\` first.`);
  return parseJmdict(gunzipSync(readFileSync(file)).toString('utf8'));
}

/** Priority tags that JMdict uses to mark common words. */
const COMMON = new Set(['news1', 'ichi1', 'spec1', 'spec2', 'gai1']);
/** Irregular / rare / search-only forms. */
const RARE_FORMS = new Set(['iK', 'ik', 'io', 'oK', 'ok', 'rK', 'rk', 'sK', 'sk', 'ateji']);

const isCommon = (pri: string[]) => pri.some((p) => COMMON.has(p));
const nfRank = (pri: string[]) => {
  const nf = pri.find((p) => p.startsWith('nf'));
  return nf ? Number(nf.slice(2)) : 99;
};

/** Kana readings that apply to a given kanji form (all readings when `keb` is undefined). */
export function readingsFor(entry: JmEntry, keb?: string): JmKana[] {
  if (!keb) return entry.kana;
  return entry.kana.filter((r) => !r.nokanji && (r.restr.length === 0 || r.restr.includes(keb)));
}

const WORD = /[a-z]+/g;
const STOP = new Set(['to', 'a', 'an', 'the', 'of', 'be', 'or', 'and', 'in', 'on', 'for', 'one', 's', 'etc', 'e', 'g', 'i', 'eg', 'ie', 'esp', 'something', 'someone', 'sth', 'so']);

/** Fold spelling variants so "colour"/"color", "skilful"/"skillful", "centre"/"center", "cars"/"car" meet. */
const fold = (w: string) =>
  w
    .replace(/ll/g, 'l')
    .replace(/our$/, 'or')
    .replace(/is(e|ed|ing|ation)$/, 'iz$1')
    .replace(/([^aeiou])re$/, '$1er')
    .replace(/(.{3,})s$/, '$1');

/** Content words of some English glosses, spelling-folded. */
export const tokens = (texts: string[]) =>
  new Set(texts.flatMap((t) => t.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w)).map(fold));

/** Fraction of `a`'s tokens that also occur in `b`. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / a.size;
}

/** Tokens of every gloss in an entry. */
export const entryTokens = (entry: JmEntry) => tokens(entry.senses.flatMap((s) => s.gloss));

/**
 * Crude stems (first four letters) so derived forms meet: prepare/preparation,
 * depart/departure, kind/kindness, hate/hated. Used only to decide whether two
 * glosses could describe the same word, never for ranking.
 */
export const stems = (texts: string[]) => new Set([...tokens(texts)].map((t) => t.slice(0, 4)));
export const entryStems = (entry: JmEntry) => stems(entry.senses.flatMap((s) => s.gloss));

const rareForm = (inf: string[]) => inf.some((i) => RARE_FORMS.has(i));
/** Irregular spellings. Ateji (無駄, 流石, 寿司) are normal written forms, so they don't count. */
const IRREGULAR_KANJI = new Set(['iK', 'io', 'oK', 'rK', 'sK']);

/** The most common reading of a kanji form, if it has a common (priority-tagged) one. */
export function commonReading(entry: JmEntry, keb: string): JmKana | undefined {
  return readingsFor(entry, keb).find((r) => isCommon(r.pri) && !rareForm(r.inf));
}

/** Is this reading element a common (priority-tagged), regular reading? */
export const isCommonReading = (r: JmKana | undefined) => !!r && isCommon(r.pri) && !rareForm(r.inf);

/**
 * The usual kanji spelling for a reading: among regular kanji forms the reading applies
 * to, the first common (priority-tagged) one, else the first (布団, not the older 蒲団).
 */
export function usualSpelling(entry: JmEntry, reading: string): string | undefined {
  const hira = toHiragana(reading);
  const forms = entry.kanji.filter(
    (k) =>
      !k.inf.some((i) => IRREGULAR_KANJI.has(i)) &&
      entry.kana.some((r) => toHiragana(r.text) === hira && !r.nokanji && (r.restr.length === 0 || r.restr.includes(k.text))),
  );
  return (forms.find((k) => isCommon(k.pri)) ?? forms[0])?.text;
}

/** Is `keb` a common (priority-tagged) spelling in this entry? */
export const isCommonSpelling = (entry: JmEntry, keb: string) => isCommon(entry.kanji.find((k) => k.text === keb)?.pri ?? []);

/** Is `keb` an irregular, out-dated, rare or search-only spelling in this entry? */
export const isIrregularSpelling = (entry: JmEntry, keb: string) =>
  (entry.kanji.find((k) => k.text === keb)?.inf ?? []).some((i) => IRREGULAR_KANJI.has(i));

/** Does `form` appear in the entry as a regular spelling (kanji form or kana reading)? */
export function isRegularForm(entry: JmEntry, form: string): boolean {
  const k = entry.kanji.find((x) => x.text === form);
  if (k) return !rareForm(k.inf);
  const hira = toHiragana(form);
  return entry.kana.some((r) => toHiragana(r.text) === hira && !rareForm(r.inf));
}

export interface Query {
  word: string;
  reading?: string;
  otherReadings?: string[];
  meanings?: string[];
  otherForms?: string[];
}

export interface Match {
  entry: JmEntry;
  /** Kanji form that matched, if the word is written with kanji. */
  keb?: string;
  /** Best kana reading for the matched form. */
  reading: string;
  /** Index of the sense that best fits the query's glosses. */
  sense: number;
  score: number;
  /** Set when the query's reading contradicted JMdict and the dictionary reading was used instead. */
  readingCorrected?: boolean;
}

/** Forms to try when the headword itself is not a JMdict headword: 〜する verbs, 〜と/〜に adverbs. */
function derivedForms(word: string): string[] {
  const out: string[] = [];
  for (const suffix of ['する', 'と', 'に']) {
    if (word.endsWith(suffix) && word.length > suffix.length + 1) out.push(word.slice(0, -suffix.length));
  }
  return out;
}

export class JmdictIndex {
  private byKeb = new Map<string, JmEntry[]>();
  private byReb = new Map<string, JmEntry[]>();

  /** All entries that list `keb` as a kanji form. */
  entriesWithKanji(keb: string): JmEntry[] {
    return this.byKeb.get(keb) ?? [];
  }

  /** All entries with `reading` as a kana form. */
  entriesWithReading(reading: string): JmEntry[] {
    return this.byReb.get(toHiragana(reading)) ?? [];
  }

  constructor(entries: JmEntry[]) {
    const add = (map: Map<string, JmEntry[]>, key: string, e: JmEntry) => {
      const list = map.get(key);
      if (!list) map.set(key, [e]);
      else if (list.at(-1) !== e) list.push(e);
    };
    for (const e of entries) {
      for (const k of e.kanji) add(this.byKeb, k.text, e);
      for (const r of e.kana) add(this.byReb, toHiragana(r.text), e);
    }
  }

  /** Find the JMdict entry that best matches a Waller word, or undefined when nothing plausible exists. */
  match(q: Query): Match | undefined {
    const glossTokens = tokens(q.meanings ?? []);
    const readings = [q.reading, ...(q.otherReadings ?? [])].filter((r): r is string => !!r).map(toHiragana);
    const primary = [q.word, ...(q.otherForms ?? [])];
    const tiers: { forms: string[]; penalty: number }[] = [
      { forms: [q.word], penalty: 0 },
      { forms: primary.slice(1), penalty: 1 },
      { forms: primary.flatMap(derivedForms), penalty: 1 },
    ];
    for (const { forms, penalty } of tiers) {
      let best: Match | undefined;
      for (const form of forms) {
        for (const m of this.candidates(form, readings, glossTokens)) {
          m.score -= penalty;
          if (!best || m.score > best.score || (m.score === best.score && m.entry.seq < best.entry.seq)) best = m;
        }
      }
      if (best) return best;
    }
    return undefined;
  }

  /**
   * Fallback for kanji words whose listed reading is wrong (e.g. 途中 "つちゅう"): accept the
   * dictionary entry only when the kanji form matches and the English glosses clearly agree.
   */
  matchCorrectingReading(q: Query, minOverlap = 0.5): Match | undefined {
    if (!hasKanji(q.word)) return undefined;
    const glossTokens = tokens(q.meanings ?? []);
    if (glossTokens.size === 0) return undefined;
    let best: Match | undefined;
    let bestOverlap = 0;
    for (const entry of this.byKeb.get(q.word) ?? []) {
      const ov = overlap(glossTokens, tokens(entry.senses.flatMap((s) => s.gloss)));
      if (ov < minOverlap) continue;
      const m = this.score(entry, q.word, undefined, glossTokens);
      if (m && (!best || ov > bestOverlap || (ov === bestOverlap && m.score > best.score))) {
        best = m;
        bestOverlap = ov;
      }
    }
    return best && { ...best, readingCorrected: true };
  }

  /**
   * Fallback for rare or variant spellings (e.g. 真中 for 真ん中): match on the reading and
   * accept only when the English glosses clearly agree. The caller keeps its own headword.
   */
  matchByReading(q: Query, minOverlap = 0.6): Match | undefined {
    if (!q.reading || !hasKanji(q.word)) return undefined;
    const glossTokens = tokens(q.meanings ?? []);
    if (glossTokens.size < 2) return undefined; // too little evidence (e.g. "gun", "at")
    let best: Match | undefined;
    for (const entry of this.byReb.get(toHiragana(q.reading)) ?? []) {
      if (entry.kanji.length === 0) continue;
      if (overlap(glossTokens, tokens(entry.senses.flatMap((s) => s.gloss))) < minOverlap) continue;
      const m = this.score(entry, undefined, toHiragana(q.reading), glossTokens);
      if (m && (!best || m.score > best.score)) best = m;
    }
    return best;
  }

  private *candidates(form: string, readings: string[], glossTokens: Set<string>): Generator<Match> {
    if (hasKanji(form)) {
      for (const entry of this.byKeb.get(form) ?? []) {
        for (const r of readings.length ? readings : [undefined]) {
          const m = this.score(entry, form, r, glossTokens);
          if (m) yield m;
        }
      }
    } else if (isKana(form)) {
      for (const entry of this.byReb.get(toHiragana(form)) ?? []) {
        const m = this.score(entry, undefined, toHiragana(form), glossTokens);
        // Same script beats a hiragana-normalised match (ダブる is not ダブル).
        if (m && entry.kana.some((r) => r.text === form)) m.score += 3;
        if (m) yield m;
      }
    }
  }

  /** Score one entry for a spelling/reading/glosses (undefined when the reading doesn't fit). */
  evaluate(entry: JmEntry, keb: string | undefined, reading: string | undefined, glossTokens: Set<string>): Match | undefined {
    return this.score(entry, keb, reading === undefined ? undefined : toHiragana(reading), glossTokens);
  }

  private score(entry: JmEntry, keb: string | undefined, reading: string | undefined, glossTokens: Set<string>): Match | undefined {
    const rebs = readingsFor(entry, keb);
    const readingEl = reading ? rebs.find((r) => toHiragana(r.text) === reading) : undefined;
    // A kanji word whose reading contradicts the entry is a different word (e.g. 一日 いちにち vs ついたち).
    if (keb && reading && !readingEl) return undefined;

    let score = 0;
    const k = keb ? entry.kanji.find((x) => x.text === keb) : undefined;
    const pri = [...(k?.pri ?? []), ...(readingEl?.pri ?? [])];
    if (isCommon(pri)) score += 3;
    score += (99 - nfRank(pri)) / 50; // up to ~2 for the most frequent words
    if (k?.inf.some((i) => RARE_FORMS.has(i))) score -= 2;
    if (readingEl?.inf.some((i) => RARE_FORMS.has(i))) score -= 2;

    if (!keb) {
      // Kana headword: favour entries normally written in kana.
      if (entry.kanji.length === 0 || readingEl?.nokanji) score += 2;
      else if (entry.senses[0]?.misc.includes('uk')) score += 2;
    }

    // Best-fitting sense (earliest wins ties); the entry-level score uses the first few senses.
    let sense = 0;
    let senseFit = -1;
    entry.senses.forEach((s, i) => {
      const fit = overlap(glossTokens, tokens(s.gloss));
      if (fit > senseFit) {
        senseFit = fit;
        sense = i;
      }
    });
    score += 6 * overlap(glossTokens, tokens(entry.senses.slice(0, 5).flatMap((s) => s.gloss)));

    const usual = rebs.filter((r) => !r.inf.some((i) => RARE_FORMS.has(i)));
    const chosen = readingEl ?? usual.find((r) => isCommon(r.pri)) ?? usual[0] ?? rebs[0] ?? entry.kana[0];
    return { entry, keb, reading: chosen?.text ?? '', sense, score };
  }
}

/**
 * Repair a gloss that the source cut off mid-word, e.g. "untime" → "untimely",
 * using the matched entry's glosses. Returns undefined when there's no unique completion.
 */
export function completeGloss(entry: JmEntry, fragment: string): string | undefined {
  const f = fragment.toLowerCase();
  if (f.length < 3) return undefined;
  const hits = new Set(
    entry.senses.flatMap((s) => s.gloss).filter((g) => g.toLowerCase().startsWith(f) && g.length > f.length),
  );
  return hits.size === 1 ? [...hits][0] : undefined;
}
