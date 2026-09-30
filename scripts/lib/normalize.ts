/**
 * Clean up the raw cards in Waller's Anki decks (see sources/waller/).
 *
 * The decks are hand-made and inconsistent, so every rule here exists because of
 * a real card — the unit tests in tests/ts/normalize.test.ts quote them.
 */
import { hasKanji, isKana } from './kana.ts';

export interface Headword {
  /** Primary written form. */
  word: string;
  /** Other spellings listed on the same card (e.g. いい/よい → ['よい']). */
  otherForms: string[];
}

export interface Reading {
  /** Primary kana reading, or '' when the card has no usable reading. */
  reading: string;
  /** Other readings listed on the same card (e.g. 何 なん/なに → ['なに']). */
  otherReadings: string[];
}

/** Waller uses ・ to mark optional prefixes/okurigana (お・金持ち); drop it. */
const stripDots = (s: string) => s.replace(/・/g, '');

/** Split on `/`, `／`, `、` or runs of whitespace — the separators Waller uses between alternatives. */
const splitAlternatives = (s: string) =>
  s
    .split(/\s*[/／、]\s*|\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Parse a card front into a headword and alternative spellings.
 *  - `あげる (=やる)` → あげる (parenthetical cross-references are dropped)
 *  - `堅/硬/固い` → 堅い, 硬い, 固い (a shared kana ending is distributed)
 */
export function parseHeadword(front: string): Headword {
  const cleaned = stripDots(front)
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .trim();
  let parts = splitAlternatives(cleaned);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const ending = last.match(/[ぁ-ゖ]+$/)?.[0];
    if (ending && hasKanji(last)) {
      parts = parts.map((p, i) => (i < parts.length - 1 && !/[ぁ-ゖ]/.test(p) ? p + ending : p));
    }
  }
  const unique = [...new Set(parts)];
  return { word: unique[0] ?? '', otherForms: unique.slice(1) };
}

/**
 * Parse the back of a hiragana-deck card into a reading.
 *  - `しゅっせき・する` for 出席 → しゅっせき (suru-verb marker is not part of the noun's reading)
 *  - `あたたか(い)` → あたたかい (optional okurigana)
 *  - `（感）`, `（接。感）`, `（1000` → '' (part-of-speech notes, not readings)
 *  - `なん/なに`, `じゅう  とお` → なん + [なに], じゅう + [とお]
 *  - mojibake such as `Uӣ[い` → ''
 */
export function parseReading(back: string, word: string): Reading {
  let s = stripDots(back ?? '').trim();
  // A card whose whole answer is wrapped in brackets (or starts with an unclosed one) is a note, not a reading.
  if (/^[（(]/.test(s)) return { reading: '', otherReadings: [] };
  // Optional okurigana in parentheses: keep the kana, drop the brackets.
  s = s.replace(/[（(]([ぁ-ゖァ-ヺー]+)[）)]/g, '$1');
  const candidates = splitAlternatives(s)
    .map((r) => (r.endsWith('する') && r.length > 2 && !word.endsWith('る') ? r.slice(0, -2) : r))
    .filter((r) => isKana(r));
  const unique = [...new Set(candidates)];
  return { reading: unique[0] ?? '', otherReadings: unique.slice(1) };
}

/** Split `s` on any of `seps` that occur outside parentheses. */
function splitTopLevel(s: string, seps: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '（') depth++;
    else if ((ch === ')' || ch === '）') && depth > 0) depth--;
    if (depth === 0 && seps.test(ch)) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** JMdict-style part-of-speech codes that occasionally lead a gloss, e.g. `(conj,exp,int) Thank you`. */
const POS_CODE = String.raw`(?:n(?:-adv|-t|-suf|-pref)?|v(?:\d\w*|s|t|i|k|z)?|adj(?:-\w+)?|adv(?:-to)?|exp|int|conj|prt|pn|pref|suf|ctr|aux(?:-\w+)?|num|uk|P|fr:?)`;
const POS_NOTE = new RegExp(String.raw`^\((?:\s*${POS_CODE}\s*(?=[,)]),?)+\)\s*`);

/** Remove every leading part-of-speech note: "(fr:) (n) questionnaire" → "questionnaire". */
function stripPosNotes(m: string): string {
  let prev;
  do {
    prev = m;
    m = m.replace(POS_NOTE, '');
  } while (m !== prev);
  return m;
}

/** Leftovers from spreadsheets and dictionary tooling that are not glosses at all. */
const JUNK = /#NAME\?|\bTODO\b|JIS X 0212|\d+\^\d+|\d+E\d+:\d|^#\s*\d*$/;

/** Dictionary register tags → readable labels ("(sl) meals" → "(slang) meals"). */
const TAG_LABELS: Record<string, string> = {
  abbr: 'abbreviation', sl: 'slang', col: 'colloquial', hon: 'honorific', hum: 'humble', pol: 'polite',
  fam: 'familiar', arch: 'archaic', vulg: 'vulgar', 'X': 'vulgar', obs: 'obsolete', derog: 'derogatory',
};
const expandTags = (m: string) => m.replace(/\((\w+)\)/g, (all, t: string) => (TAG_LABELS[t] ? `(${TAG_LABELS[t]})` : all));

/** Fragments that qualify the previous gloss rather than stand alone ("to fall" + "e.g. rain or snow"). */
const QUALIFIER = /^(e\.g\.|i\.e\.|esp\.|incl\.|etc\.?$)/i;

/** Waller's decks cap the English field at 100 characters, cutting the last gloss mid-word. */
export const GLOSS_CAP = 99;

export interface Meanings {
  meanings: string[];
  /** True when the source text hit the length cap and its last (cut-off) gloss was dropped. */
  truncated: boolean;
  /** The dropped, cut-off fragment (useful for repairing it from a dictionary). */
  fragment?: string;
}

/**
 * Parse the back of an English-deck card into a list of glosses.
 *  - senses may be numbered `(1) … (2) …` or `1.  …; 2.  …`
 *  - glosses are separated by `,` `;` or `/`, but never inside parentheses
 *  - commas inside parentheses were sometimes replaced by double spaces: `(taste  appearance)` → `(taste, appearance)`
 */
export function parseMeanings(back: string): Meanings {
  const raw = (back ?? '').trim();
  const truncated = raw.length >= GLOSS_CAP && !/[,;/.)]$/.test(raw);
  let s = raw
    // restore commas lost inside parentheses
    .replace(/\(([^()]*)\)/g, (_, inner: string) => `(${inner.replace(/\s{2,}/g, ', ')})`)
    // sense numbers: "(1) " / "1.  " at the start or after a separator
    .replace(/(^|[,;/\s])\(\d{1,2}\)\s*/g, '$1;')
    .replace(/(^|[,;\s])\d{1,2}\.\s+/g, '$1;')
    .replace(/\s{2,}/g, ' ');

  const parts = splitTopLevel(s, /[,;/]/)
    .map((m) => stripPosNotes(m).replace(/\s+/g, ' ').trim())
    .map((m) => m.replace(/^[,;.\s]+|[,;\s]+$/g, ''))
    .filter(Boolean);

  let fragment: string | undefined;
  if (truncated && parts.length > 1) fragment = parts.pop();
  const joined: string[] = [];
  for (const part of parts) {
    if (JUNK.test(part)) continue;
    const prev = joined.length - 1;
    if (prev >= 0 && QUALIFIER.test(part)) {
      joined[prev] = /^etc/i.test(part) ? `${joined[prev]}, etc.` : `${joined[prev]} (${part})`;
    } else {
      joined.push(expandTags(part));
    }
  }
  const meanings = [...new Set(joined.map(closeParens))];
  return { meanings, truncated, fragment };
}

/** Balance parentheses left open by a truncated source string. */
function closeParens(m: string): string {
  const open = (m.match(/\(/g) ?? []).length - (m.match(/\)/g) ?? []).length;
  return open > 0 ? m + ')'.repeat(open) : m;
}
