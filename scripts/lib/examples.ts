/**
 * Example-sentence matcher built on the Tatoeba corpus (CC BY 2.0 FR).
 *
 * Files expected in .cache/tatoeba/ (downloaded + decompressed by fetch-sources):
 *   jpn.tsv    id \t lang \t text
 *   eng.tsv    id \t lang \t text
 *   links.tsv  jpn_id \t eng_id
 *
 * Matching a word against ~200k sentences for 8k words would be O(n·m). Instead we
 * index sentences by character: for a query word we only scan the bucket of its
 * *rarest* character, which is tiny for kanji. Buckets are built in length-ascending
 * order so the first matches found are the shortest (nicer) sentences.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR } from './util.ts';

export interface Example {
  ja: string;
  en: string;
}

const TATOEBA_DIR = join(CACHE_DIR, 'tatoeba');
const MIN_LEN = 6;
const MAX_LEN = 60;
const SCAN_CAP = 4000; // max candidates scanned per word (bounds worst case)

export function tatoebaAvailable(): boolean {
  return ['jpn.tsv', 'eng.tsv', 'links.tsv'].every((f) => existsSync(join(TATOEBA_DIR, f)));
}

export class ExampleIndex {
  private pool: Example[] = [];
  private charIndex = new Map<string, number[]>();

  constructor() {
    // 1) Japanese sentences: id -> text
    const jpn = new Map<string, string>();
    for (const line of readFileSync(join(TATOEBA_DIR, 'jpn.tsv'), 'utf8').split('\n')) {
      const tab1 = line.indexOf('\t');
      if (tab1 < 0) continue;
      const id = line.slice(0, tab1);
      const text = line.slice(line.indexOf('\t', tab1 + 1) + 1);
      jpn.set(id, text);
    }

    // 2) links: jpn_id -> eng_id (keep the first english translation per jp sentence)
    const jpToEng = new Map<string, string>();
    const neededEng = new Set<string>();
    for (const line of readFileSync(join(TATOEBA_DIR, 'links.tsv'), 'utf8').split('\n')) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const jp = line.slice(0, tab);
      const en = line.slice(tab + 1).trim();
      if (!jpToEng.has(jp) && jpn.has(jp)) {
        jpToEng.set(jp, en);
        neededEng.add(en);
      }
    }

    // 3) english sentences we actually need: id -> text (stream, keep only referenced)
    const eng = new Map<string, string>();
    for (const line of readFileSync(join(TATOEBA_DIR, 'eng.tsv'), 'utf8').split('\n')) {
      const tab1 = line.indexOf('\t');
      if (tab1 < 0) continue;
      const id = line.slice(0, tab1);
      if (!neededEng.has(id)) continue;
      eng.set(id, line.slice(line.indexOf('\t', tab1 + 1) + 1));
    }

    // 4) assemble (ja, en) pairs, filter by length, sort shortest-first
    for (const [jpId, engId] of jpToEng) {
      const ja = jpn.get(jpId)!;
      const en = eng.get(engId);
      if (!en) continue;
      if (ja.length < MIN_LEN || ja.length > MAX_LEN) continue;
      this.pool.push({ ja, en });
    }
    this.pool.sort((a, b) => a.ja.length - b.ja.length);

    // 5) character -> sentence indices (length-ascending, since pool is sorted)
    for (let i = 0; i < this.pool.length; i++) {
      for (const ch of new Set(this.pool[i].ja)) {
        let arr = this.charIndex.get(ch);
        if (!arr) this.charIndex.set(ch, (arr = []));
        arr.push(i);
      }
    }
  }

  get size(): number {
    return this.pool.length;
  }

  /** Up to `max` example sentences containing `word` (surface form). */
  find(word: string, max = 2): Example[] {
    if (!word) return [];
    // choose the rarest character present in the index
    let bucket: number[] | undefined;
    for (const ch of new Set(word)) {
      const arr = this.charIndex.get(ch);
      if (!arr) return []; // a character with zero sentences => no match possible
      if (!bucket || arr.length < bucket.length) bucket = arr;
    }
    if (!bucket) return [];

    const out: Example[] = [];
    const seenEn = new Set<string>();
    const limit = Math.min(bucket.length, SCAN_CAP);
    for (let i = 0; i < limit && out.length < max; i++) {
      const s = this.pool[bucket[i]];
      if (s.ja.includes(word) && !seenEn.has(s.en)) {
        seenEn.add(s.en);
        out.push(s);
      }
    }
    return out;
  }
}
