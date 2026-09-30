#!/usr/bin/env node
/**
 * openjlpt — look up JLPT words, kanji and grammar from the terminal.
 *
 *   npx openjlpt 食べる              search words (kanji, kana, romaji or English)
 *   npx openjlpt kanji 日            kanji details
 *   npx openjlpt grammar てもいい     grammar points
 *   npx openjlpt random N5          a random word (add --kanji or --grammar)
 *   npx openjlpt quiz N4            flashcard quiz in the terminal
 *   npx openjlpt stats              dataset counts and sources
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import {
  findGrammar,
  findKanji,
  getGrammar,
  getKanji,
  getVocab,
  levels,
  meta,
  normalize,
  posLabels,
  sample,
  searchGrammar,
  searchVocab,
  type Grammar,
  type Kanji,
  type Level,
  type Vocab,
} from './index.js';

const color = stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const cyan = paint(36);
const levelTag = (l: Level) => paint(({ N5: 32, N4: 36, N3: 34, N2: 35, N1: 31 } as const)[l])(`[${l}]`);

function showVocab(v: Vocab, full = true): void {
  const head = v.word === v.reading ? bold(v.word) : `${bold(v.word)} ${cyan(v.reading)}`;
  console.log(`${levelTag(v.level)} ${head} ${dim(v.romaji)}`);
  console.log(`   ${v.meanings.join('; ')}`);
  if (!full) return;
  if (v.pos?.length) {
    const labels = posLabels();
    console.log(dim(`   ${v.pos.map((p) => labels[p] ?? p).join(', ')}`));
  }
  if (v.other_forms?.length) console.log(dim(`   also written: ${v.other_forms.join('、')}`));
  for (const ex of v.examples ?? []) console.log(`   ${green('›')} ${ex.ja}\n     ${dim(ex.en)}`);
}

function showKanji(k: Kanji): void {
  console.log(`${levelTag(k.level)} ${bold(k.character)}  ${k.meanings.join(', ')}`);
  if (k.onyomi.length) console.log(`   on:  ${cyan(k.onyomi.join('、'))}`);
  if (k.kunyomi.length) console.log(`   kun: ${cyan(k.kunyomi.join('、'))}`);
  const facts = [
    k.strokes && `${k.strokes} strokes`,
    k.radical && `radical ${k.radical} (#${k.radical_number})`,
    k.grade && `grade ${k.grade}`,
    k.freq && `frequency #${k.freq}`,
  ].filter(Boolean);
  console.log(dim(`   ${facts.join(' · ')}`));
  if (k.words?.length) console.log(`   words: ${k.words.join('、')}`);
}

function showGrammar(g: Grammar): void {
  console.log(`${levelTag(g.level)} ${bold(g.pattern)} ${dim(g.romaji)}`);
  console.log(`   ${g.meaning}`);
  console.log(dim(`   ${g.formation}`));
  for (const ex of g.examples.slice(0, 2)) console.log(`   ${green('›')} ${ex.ja}\n     ${dim(ex.en)}`);
  if (g.notes) console.log(dim(`   note: ${g.notes}`));
}

const parseLevel = (s?: string): Level | undefined => {
  const l = s?.toUpperCase();
  return (levels as readonly string[]).includes(l ?? '') ? (l as Level) : undefined;
};

async function quiz(level?: Level): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  const deck = sample(getVocab(level), 10);
  let right = 0;
  console.log(bold(`OpenJLPT quiz — ${level ?? 'all levels'}, ${deck.length} words. Type the reading (kana or romaji), or press Enter to reveal.\n`));
  let closed = false;
  rl.on('close', () => (closed = true));
  try {
    for (const [i, v] of deck.entries()) {
      if (closed) break; // stdin ended (piped input or Ctrl-D)
      let raw: string;
      try {
        raw = await rl.question(`${dim(`${i + 1}/${deck.length}`)} ${bold(v.word)}  ${dim(v.meanings[0])}\n  › `);
      } catch {
        break;
      }
      // Kana-insensitive: てすと counts for テスト.
      const answer = normalize(raw);
      const ok = answer !== '' && [v.reading, v.romaji, ...(v.other_readings ?? [])].map(normalize).includes(answer);
      if (ok) right++;
      console.log(`  ${ok ? green('✓') : red('✗')} ${cyan(v.reading)} ${dim(v.romaji)} — ${v.meanings.join('; ')}\n`);
    }
  } finally {
    rl.close();
  }
  console.log(bold(`Score: ${right}/${deck.length}`));
}

function usage(): void {
  console.log(`${bold('openjlpt')} — JLPT N5–N1 words, kanji and grammar

  openjlpt <word|kana|romaji|english>   search vocabulary
  openjlpt kanji <character>            kanji details
  openjlpt grammar <pattern|english>    grammar points
  openjlpt random [N5..N1] [--kanji|--grammar]
  openjlpt quiz [N5..N1]                10-word reading quiz
  openjlpt stats                        dataset counts and sources

Data: CC BY-SA 4.0 — https://github.com/evanclan/OpenJLPT`);
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const arg = rest.join(' ');
  switch (cmd) {
    case undefined:
    case '-h':
    case '--help':
      usage();
      return 0;
    case 'kanji': {
      const chars = [...arg].map(findKanji).filter((k): k is Kanji => !!k);
      if (!chars.length) return notFound(arg);
      chars.forEach(showKanji);
      return 0;
    }
    case 'grammar': {
      const found = findGrammar(arg);
      const results = found.length ? found : searchGrammar(arg, { limit: 8 });
      if (!results.length) return notFound(arg);
      results.slice(0, 8).forEach(showGrammar);
      return 0;
    }
    case 'random': {
      const level = parseLevel(rest.find((r) => !r.startsWith('--')));
      if (rest.includes('--kanji')) showKanji(sample(getKanji(level))[0]);
      else if (rest.includes('--grammar')) showGrammar(sample(getGrammar(level))[0]);
      else showVocab(sample(getVocab(level))[0]);
      return 0;
    }
    case 'quiz':
      await quiz(parseLevel(rest[0]));
      return 0;
    case 'stats': {
      const m = meta();
      console.log(bold(`OpenJLPT ${m.version}`));
      for (const kind of ['vocab', 'kanji', 'grammar'] as const) {
        console.log(`  ${kind.padEnd(8)} ${levels.map((l) => `${l} ${m.counts[kind][l]}`).join('  ')}  ${dim(`total ${m.counts[kind].total}`)}`);
      }
      console.log(dim(`  JMdict ${m.sources.jmdict?.created ?? '?'} · KANJIDIC2 ${m.sources.kanjidic2?.database_version ?? '?'} · Waller · Tatoeba`));
      return 0;
    }
    default: {
      const query = argv.join(' ');
      const results = searchVocab(query, { limit: 8 });
      if (!results.length) return notFound(query);
      results.forEach((v, i) => showVocab(v, i === 0));
      return 0;
    }
  }
}

function notFound(q: string): number {
  console.error(`No results for "${q}".`);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
