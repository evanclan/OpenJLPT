/**
 * Build per-level vocabulary JSON + CSV.
 *
 *   sources/waller/vocab-*.json     level lists (headword, reading, English)   — Waller, CC BY
 *   sources/corrections/vocab.json  hand-reviewed fixes for bad source cards
 *   .cache/JMdict_e.gz              IDs, part of speech, reading/gloss repair  — EDRDG, CC BY-SA 4.0
 *   .cache/tatoeba/                 example sentences                          — Tatoeba, CC BY 2.0 FR
 *
 * Every word keeps the easiest level it appears at (Waller lists some words at
 * several levels).
 */
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DATA_DIR, LEVELS, ROOT, writeCsv, writeJson, type Level } from './lib/util.ts';
import { readCards } from './lib/waller.ts';
import { parseHeadword, parseMeanings, parseReading } from './lib/normalize.ts';
import { hasKanji, isKana, readingFits, toHiragana, toRomaji } from './lib/kana.ts';
import {
  JmdictIndex,
  bestFit,
  commonReading,
  completeGloss,
  entryStems,
  isCommonReading,
  isCommonSpelling,
  isIrregularSpelling,
  isRegularForm,
  loadJmdict,
  overlap,
  readingsFor,
  stems,
  tokens,
  usualSpelling,
  type JmEntry,
  type Match,
} from './lib/jmdict.ts';
import { ExampleIndex, tatoebaAvailable, type Example } from './lib/examples.ts';

export interface Vocab {
  id: string;
  word: string;
  reading: string;
  romaji: string;
  meanings: string[];
  level: Level;
  pos?: string[];
  jmdict_id?: number;
  other_forms?: string[];
  other_readings?: string[];
  examples?: Example[];
}

interface Correction {
  level: Level;
  front: string;
  why: string;
  drop?: boolean;
  set?: Partial<Pick<Vocab, 'word' | 'reading' | 'meanings' | 'other_forms' | 'other_readings' | 'level'>>;
}

/** One source card after cleaning and dictionary matching, before de-duplication. */
interface Candidate {
  /** ID-lock key: the card's headword and raw reading, independent of its level. */
  cardKey: string;
  level: Level;
  word: string;
  reading: string;
  meanings: string[];
  otherForms: string[];
  otherReadings: string[];
  m?: Match;
}

const LEVEL_RANK: Record<Level, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

const RARE_KANJI_FORM = new Set(['iK', 'oK', 'rK', 'sK', 'ateji']);

/** A new entry's ID: derived from its written form and reading. */
export const vocabId = (word: string, reading: string) =>
  createHash('sha1').update(`${word}\u0000${reading}`).digest('hex').slice(0, 10);

/**
 * IDs are assigned once and then frozen in sources/ids.lock.json, keyed by the
 * source card (Waller's headword + raw reading, not its level). Later fixes to a
 * word's spelling, reading or level therefore never change its ID, so apps' saved
 * progress and Anki note GUIDs stay valid.
 */
const ID_LOCK = join(ROOT, 'sources', 'ids.lock.json');
const readIdLock = (): Record<string, string> => (existsSync(ID_LOCK) ? JSON.parse(readFileSync(ID_LOCK, 'utf8')) : {});
function writeIdLock(lock: Record<string, string>): void {
  const keys = Object.keys(lock).sort();
  writeFileSync(ID_LOCK, `{\n${keys.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(lock[k])}`).join(',\n')}\n}\n`);
}

const kanjiOf = (s: string) => new Set([...s].filter(hasKanji));
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

/**
 * Two spellings that JMdict files under one entry are the same *learner* word only if
 * one is kana, or they differ just in okurigana (終わる/終る, 見付ける/見つける).
 * JMdict also groups distinct kanji words (早い/速い, 表す/現す) — those stay separate.
 */
function sameWord(kept: { word: string } | undefined, word: string): boolean {
  if (!kept) return false;
  const a = kanjiOf(kept.word);
  const b = kanjiOf(word);
  return a.size === 0 || b.size === 0 || subset(a, b) || subset(b, a);
}

function loadCorrections(): Map<string, Correction> {
  const list: Correction[] = JSON.parse(readFileSync(join(ROOT, 'sources', 'corrections', 'vocab.json'), 'utf8'));
  return new Map(list.map((c) => [`${c.level}\u0000${c.front}`, c]));
}

function kanjiLevels(): Map<string, string> {
  const map = new Map<string, string>();
  for (const { level } of LEVELS) {
    for (const c of readCards('kanji-eng', level)) {
      const ch = [...c.front.trim()][0];
      if (ch && !map.has(ch)) map.set(ch, level);
    }
  }
  return map;
}

function build() {
  const idLock = readIdLock();
  const lockedIds = new Set(Object.values(idLock));
  const corrections = loadCorrections();
  const usedCorrections = new Set<string>();
  const jm = loadJmdict();
  const jmIndex = new JmdictIndex(jm.entries);
  console.log(`JMdict: ${jm.entries.length} entries (created ${jm.created ?? 'unknown'})`);

  const examples = tatoebaAvailable() ? new ExampleIndex(kanjiLevels()) : null;
  if (examples) console.log(`Example pool: ${examples.size} Tatoeba sentence pairs`);
  else console.warn('⚠ Tatoeba cache not found — building vocabulary WITHOUT example sentences. Run `npm run fetch`.');

  const log = {
    dropped: [] as string[],
    noMeaning: [] as string[],
    leaked: [] as string[],
    unmatched: 0,
    respelled: [] as string[],
    reread: [] as string[],
    recommon: [] as string[],
    reglossed: [] as string[],
    switched: [] as string[],
    rematched: [] as string[],
    realigned: [] as string[],
    repaired: 0,
  };

  // --- Phase 1: clean each card and match it to JMdict ----------------------
  const candidates: Candidate[] = [];
  for (const { level } of LEVELS) {
    const hira = new Map(readCards('vocab-hira', level).map((c) => [c.front, c.back]));
    for (const card of readCards('vocab-eng', level)) {
      const key = `${level}\u0000${card.front}`;
      const fix = corrections.get(key);
      if (fix) usedCorrections.add(key);
      if (fix?.drop) {
        log.dropped.push(`${level} ${card.front}`);
        continue;
      }
      const rawReading = hira.get(card.front) ?? '';
      const c = cleanCard(card.front, rawReading, card.back, fix);
      const cand = matchCandidate(c, fix, level, jmIndex, log);
      if (!cand) continue;
      candidates.push({ ...cand, cardKey: `${card.front} | ${rawReading}`, level: fix?.set?.level ?? level });
    }
  }

  // Every correction must still apply to a card, or it has gone stale.
  const stale = [...corrections.keys()].filter((k) => !usedCorrections.has(k));
  if (stale.length) throw new Error(`Stale corrections (no matching card): ${stale.map((k) => k.replace('\u0000', ' ')).join(', ')}`);

  // --- Phase 2: one entry per word, at the easiest level --------------------
  candidates.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]); // stable: keeps card order within a level
  const seen = new Map<string, Candidate>();
  const kept: Candidate[] = [];
  let duplicates = 0;
  for (const c of candidates) {
    const keys = [`${c.word}\u0000${toHiragana(c.reading)}`];
    if (c.m) keys.push(`#${c.m.entry.seq}\u0000${toHiragana(c.reading)}`);
    const k = seen.get(keys[0]) ?? (keys[1] && sameWord(seen.get(keys[1]), c.word) ? seen.get(keys[1]) : undefined);
    if (k) {
      duplicates++;
      for (const form of [c.word, ...c.otherForms]) if (form !== k.word && !k.otherForms.includes(form)) k.otherForms.push(form);
      // Waller sometimes splits one word over two cards at the same level (キロ = kilogram / kilometre).
      if (k.level === c.level) k.meanings.push(...c.meanings.filter((g) => !k.meanings.includes(g)));
      if (process.env.OPENJLPT_DEBUG && k.word !== c.word) console.log(`  merge ${c.level} ${c.word} → ${k.level} ${k.word}`);
      continue;
    }
    for (const key of keys) seen.set(key, c);
    kept.push(c);
  }

  // --- Phase 3: finish entries -----------------------------------------------
  // Spelling → readings of the entries written that way, to spot true duplicates.
  const headwords = new Map<string, Set<string>>();
  for (const c of kept) {
    if (!headwords.has(c.word)) headwords.set(c.word, new Set());
    headwords.get(c.word)!.add(toHiragana(c.reading));
  }
  const perLevel = new Map<Level, Vocab[]>(LEVELS.map(({ level }) => [level, []]));
  for (const c of kept) {
    const entry: Vocab = {
      id: '',
      word: c.word,
      reading: c.reading,
      romaji: toRomaji(c.reading, c.word),
      meanings: c.meanings,
      level: c.level,
    };
    if (c.m) {
      const pos = c.m.entry.senses[c.m.sense]?.pos ?? [];
      if (pos.length) entry.pos = pos;
      entry.jmdict_id = c.m.entry.seq;
    }
    // Other spellings: not another entry with the same spelling and reading ("each word
    // appears once": 川 keeps no 河 when 河 かわ has its own entry, but あさって keeps
    // 明後日 although 明後日 みょうごにち does), and, for dictionary-matched words, only
    // regular spellings JMdict knows (no typos like 田ぼ).
    const otherForms = [...new Set(c.otherForms)].filter(
      (f) =>
        f !== c.word &&
        !headwords.get(f)?.has(toHiragana(c.reading)) &&
        (!c.m || !hasKanji(f) || isRegularForm(c.m.entry, f)),
    );
    const otherReadings = [...new Set(c.otherReadings)].filter((r) => r !== c.reading && isKana(r));
    if (otherForms.length) entry.other_forms = otherForms;
    if (otherReadings.length) entry.other_readings = otherReadings;

    if (examples) {
      const usuallyKana = isKana(c.word) || !!c.m?.entry.senses[c.m.sense]?.misc.includes('uk');
      const kebs = c.m?.entry.kanji.filter((k) => isRegularForm(c.m!.entry, k.text)).map((k) => k.text) ?? [];
      const readings = [c.reading, ...otherReadings];
      const forms = [c.word, ...otherForms, ...kebs, ...(usuallyKana ? readings : [])];
      const ex = examples.find({ forms, readings, level: c.level });
      if (ex.length) entry.examples = ex;
    }

    entry.id = idLock[c.cardKey] ?? '';
    if (!entry.id) {
      // New card: derive an ID, stepping past any collision with an existing one.
      let id = vocabId(c.word, c.reading);
      for (let n = 2; lockedIds.has(id); n++) id = vocabId(c.word, `${c.reading}#${n}`);
      entry.id = id;
      idLock[c.cardKey] = id;
      lockedIds.add(id);
    }
    perLevel.get(c.level)!.push(entry);
  }
  writeIdLock(idLock);

  const ids = new Set<string>();
  const collator = new Intl.Collator('ja');
  const summary: Record<string, number> = {};
  let total = 0;
  let withExamples = 0;
  for (const [level, entries] of perLevel) {
    entries.sort((a, b) => collator.compare(toHiragana(a.reading), toHiragana(b.reading)) || collator.compare(a.word, b.word));
    for (const e of entries) {
      if (ids.has(e.id)) throw new Error(`Duplicate vocab id ${e.id} (${e.word} ${e.reading})`);
      ids.add(e.id);
      if (e.examples) withExamples++;
    }
    const lc = level.toLowerCase();
    writeJson(join(DATA_DIR, 'json', 'vocab', `${lc}.json`), entries);
    writeCsv(
      join(DATA_DIR, 'csv', `vocab-${lc}.csv`),
      ['id', 'word', 'reading', 'romaji', 'meanings', 'level', 'pos', 'jmdict_id', 'other_forms', 'example_ja', 'example_en'],
      entries.map((e) => [
        e.id,
        e.word,
        e.reading,
        e.romaji,
        e.meanings.join('; '),
        e.level,
        (e.pos ?? []).join('; '),
        e.jmdict_id ?? null,
        (e.other_forms ?? []).join('; '),
        e.examples?.[0]?.ja ?? '',
        e.examples?.[0]?.en ?? '',
      ]),
    );
    summary[level] = entries.length;
    total += entries.length;
  }

  // Legend for the part-of-speech codes actually used, from JMdict's own DTD.
  const posCodes = [...new Set([...perLevel.values()].flat().flatMap((e) => e.pos ?? []))].sort();
  writeJson(join(DATA_DIR, 'json', 'pos.json'), Object.fromEntries(posCodes.map((c) => [c, jm.entities[c] ?? c])));

  const list = (title: string, items: string[]) => {
    if (items.length) console.log(`  ${title} (${items.length}):\n    ${items.join('\n    ')}`);
  };
  console.log('Vocabulary:', summary, `(total ${total})`);
  console.log(`  duplicates merged: ${duplicates}; JMdict: ${total - log.unmatched} matched, ${log.unmatched} unmatched; ${log.repaired} truncated glosses repaired`);
  list('dropped by corrections', log.dropped);
  list('kanji cards dropped from the word list', log.leaked);
  list('respelled to the usual form', log.respelled);
  list('readings corrected from JMdict', log.reread);
  list('rare readings replaced by the common one', log.recommon);
  list('readings realigned with the written form', log.realigned);
  list('glosses replaced (did not match the word)', log.reglossed);
  list('switched to the word the gloss describes', log.switched);
  list('moved to the dictionary entry the gloss describes', log.rematched);
  list('skipped, no meaning', log.noMeaning);
  if (examples) console.log(`  example coverage: ${withExamples}/${total} words (${Math.round((withExamples / total) * 100)}%)`);
}

type Log = {
  noMeaning: string[];
  leaked: string[];
  unmatched: number;
  respelled: string[];
  reread: string[];
  recommon: string[];
  reglossed: string[];
  switched: string[];
  rematched: string[];
  realigned: string[];
  repaired: number;
};

interface Cleaned {
  word: string;
  reading: string;
  meanings: string[];
  otherForms: string[];
  otherReadings: string[];
  fragment?: string;
}

/** Parse one Waller card and apply its correction, if any. */
function cleanCard(front: string, rawReading: string, back: string, fix?: Correction): Cleaned {
  const head = parseHeadword(front);
  const read = parseReading(rawReading, head.word);
  const gloss = parseMeanings(back);
  return {
    word: fix?.set?.word ?? head.word,
    reading: fix?.set?.reading ?? read.reading,
    meanings: fix?.set?.meanings ?? gloss.meanings,
    otherForms: fix?.set?.other_forms ?? head.otherForms,
    otherReadings: fix?.set?.other_readings ?? read.otherReadings,
    fragment: fix?.set?.meanings ? undefined : gloss.fragment,
  };
}

const readingElement = (entry: JmEntry, keb: string, reading: string) =>
  readingsFor(entry, keb).find((r) => toHiragana(r.text) === toHiragana(reading));

/** Match a cleaned card to JMdict and apply the dictionary-backed repairs. */
function matchCandidate(
  v: Cleaned,
  fix: Correction | undefined,
  level: Level,
  jmIndex: JmdictIndex,
  log: Log,
): Omit<Candidate, 'cardKey' | 'level'> | undefined {
  const tag = `${level} ${v.word}`;
  // A kana headword is its own reading (コピーする, not the matched stem's コピー).
  if (isKana(v.word)) v.reading = v.word;
  // The reading must fit the written form's kana (お金持ち is not かねもち).
  if (v.reading && !readingFits(v.word, v.reading)) {
    const alt = v.otherReadings.find((r) => readingFits(v.word, r));
    if (alt) {
      log.realigned.push(`${tag} [${v.reading} → ${alt}]`);
      v.otherReadings = [v.reading, ...v.otherReadings.filter((r) => r !== alt)];
      v.reading = alt;
    }
  }

  const q = () => ({ word: v.word, reading: v.reading || undefined, otherReadings: v.otherReadings, meanings: v.meanings, otherForms: v.otherForms });
  let m: Match | undefined = jmIndex.match(q());
  if (!m) {
    m = jmIndex.matchByReading(q());
    if (m) {
      // The card's kanji is a typo or rare spelling: use the dictionary's usual form.
      const usuallyKana = m.entry.senses[m.sense]?.misc.includes('uk');
      const usual = usuallyKana ? m.reading : usualSpelling(m.entry, m.reading);
      if (usual && usual !== v.word) {
        log.respelled.push(`${tag} → ${usual}`);
        v.otherForms = [v.word, ...v.otherForms];
        v.word = usual;
      }
    }
  }
  if (!m) {
    m = jmIndex.matchCorrectingReading(q());
    if (m && m.reading !== v.reading) {
      log.reread.push(`${tag} [${v.reading || '—'} → ${m.reading}]`);
      v.reading = m.reading;
    }
  }

  if (!m) {
    log.unmatched++;
    // A lone kanji with no dictionary match is a kanji card that leaked into the word list.
    if ([...v.word].length === 1 && hasKanji(v.word)) {
      log.leaked.push(`${tag} [${v.reading}] ${v.meanings.slice(0, 2).join('; ')}`);
      return undefined;
    }
  } else {
    if (!v.reading) v.reading = m.reading;
    const ws = stems(v.meanings);
    // Irregular or out-dated spelling (明い, 落る) that isn't in common use either.
    if (m.keb && isIrregularSpelling(m.entry, m.keb) && !isCommonSpelling(m.entry, m.keb)) {
      // Sometimes the spelling is regular in *another* entry that fits the gloss: the card
      // paired it with an archaic reading (金庫 かねぐら is really 金庫 きんこ "safe"), or with
      // the wrong word (後 うしろ "afterwards" is 後 のち). Switch only on that evidence;
      // otherwise the card's reading stands and only the spelling changes (集る あつまる is
      // 集まる, not 集る たかる; 居る いる is いる, not the humble 居る おる).
      const keb = m.keb;
      const fitHere = overlap(ws, entryStems(m.entry));
      const readingIsCommon = isCommonReading(readingElement(m.entry, keb, v.reading));
      const alt = bestFit(jmIndex.entriesWithKanji(keb).filter((e) => e !== m!.entry && !isIrregularSpelling(e, keb) && commonReading(e, keb)), ws);
      const r = alt && (alt.fit > fitHere || !readingIsCommon) ? commonReading(alt.e, keb) : undefined;
      const next = alt && r && jmIndex.evaluate(alt.e, keb, r.text, tokens(v.meanings));
      if (next && r) {
        // A different word, so the card's reading is not one of its readings.
        log.recommon.push(`${tag} [${v.reading} → ${r.text}] (JMdict ${next.entry.seq})`);
        v.reading = r.text;
        m = next;
      } else {
        // Words usually written in kana (攫う → さらう) keep their usual kanji as another form.
        const kanji = usualSpelling(m.entry, v.reading);
        const usual = m.entry.senses[m.sense]?.misc.includes('uk') ? v.reading : kanji;
        if (usual && usual !== v.word) {
          log.respelled.push(`${tag} → ${usual}`);
          v.otherForms = [...(kanji && kanji !== usual ? [kanji] : []), v.word, ...v.otherForms];
          v.word = usual;
          m = { ...m, keb: hasKanji(usual) ? usual : undefined };
        }
      }
    }
    // Rare or archaic reading (黄色 おうしょく, 梯子 ていし) when the spelling has a common one.
    // Deliberate second words (汚す けがす beside 汚す よごす) are pinned in the corrections file.
    if (m.keb && !fix?.set?.reading) {
      const current = readingElement(m.entry, m.keb, v.reading);
      const common = commonReading(m.entry, m.keb);
      if (current && !isCommonReading(current) && common && toHiragana(common.text) !== toHiragana(v.reading)) {
        log.recommon.push(`${tag} [${v.reading} → ${common.text}]`);
        v.otherReadings = [v.reading, ...v.otherReadings];
        v.reading = common.text;
      }
    }
    // The card mixed up two words: its gloss shares nothing with the matched entry but
    // fits another entry with the same spelling (人気 にんき "sign of life" is ひとけ;
    // 生物 せいぶつ "raw food" is なまもの). A gloss that merely paraphrases is kept.
    if (ws.size > 0 && !fix?.set?.meanings && overlap(ws, entryStems(m.entry)) === 0) {
      const others = (m.keb ? jmIndex.entriesWithKanji(m.keb) : jmIndex.entriesWithReading(v.word)).filter((e) => e !== m!.entry);
      const alt = bestFit(others, ws);
      // Same kanji spelling *and* reading: the card simply belongs to that entry (尤も もっとも
      // "plausible" is not 最も もっとも "most"). Kana homophones are no such evidence.
      const rematch = alt && m.keb && readingElement(alt.e, m.keb, v.reading) ? jmIndex.evaluate(alt.e, m.keb, v.reading, tokens(v.meanings)) : undefined;
      if (rematch) {
        log.rematched.push(`${tag} [${v.reading}] JMdict ${m.entry.seq} → ${rematch.entry.seq}`);
        m = rematch;
      } else if (alt) {
        // Keep the card's reading only if that spelling+reading is the common word;
        // 反る read かえる is a rare spelling of 返る, while 反る (そる) is the gloss's word.
        const readingIsCommon = m.keb
          ? isCommonReading(readingElement(m.entry, m.keb, v.reading)) && (isCommonSpelling(m.entry, m.keb) || !isCommonSpelling(alt.e, m.keb))
          : true;
        const r = m.keb ? (commonReading(alt.e, m.keb) ?? readingsFor(alt.e, m.keb)[0]) : undefined;
        const next = r ? jmIndex.evaluate(alt.e, m.keb, r.text, tokens(v.meanings)) : undefined;
        if (!readingIsCommon && next && r) {
          log.switched.push(`${tag} [${v.reading} → ${r.text}] ${v.meanings.slice(0, 2).join('; ')}`);
          v.reading = r.text;
          m = next;
        } else {
          const glosses = m.entry.senses[0].gloss.slice(0, 4);
          log.reglossed.push(`${tag} [${v.reading}] "${v.meanings.slice(0, 2).join('; ')}" → "${glosses.join('; ')}"`);
          v.meanings = glosses;
          m = { ...m, sense: 0 };
        }
      }
    }
    if (v.fragment) {
      const full = completeGloss(m.entry, v.fragment);
      if (full) {
        v.meanings.push(full);
        log.repaired++;
      }
    }
    if (v.meanings.length === 0) v.meanings = m.entry.senses[m.sense].gloss.slice(0, 4);
  }

  if (isKana(v.word)) v.reading = v.word;
  if (v.meanings.length === 0) {
    log.noMeaning.push(tag);
    return undefined;
  }
  if (!v.reading) throw new Error(`${tag}: no reading — add an entry to sources/corrections/vocab.json`);
  return { word: v.word, reading: v.reading, meanings: v.meanings, otherForms: v.otherForms, otherReadings: v.otherReadings, m };
}

build();
