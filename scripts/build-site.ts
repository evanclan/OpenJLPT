/**
 * Generate the static website (GitHub Pages) into _site/.
 *
 *   /                       home: search, levels, tools
 *   /n5/ … /n1/             level hubs, with full vocab / kanji / grammar lists
 *   /vocab/<id>.html        one page per word
 *   /kanji/<hex>.html       one page per kanji (hex code point, e.g. 65e5 = 日)
 *   /grammar/<id>.html      one page per grammar point
 *   /flashcards.html, /analyzer.html, /data.html
 *   /data/*.json            minified data for the interactive tools
 *
 * Usage: SITE_URL=https://example.org/ tsx scripts/build-site.ts [outDir]
 */
import { join } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DATA_DIR, LEVELS, ROOT, type Level } from './lib/util.ts';

// ---------------------------------------------------------------------------
// Data

interface Example { ja: string; en: string; tatoeba_id?: number }
interface Vocab {
  id: string; word: string; reading: string; romaji: string; meanings: string[]; level: Level;
  pos?: string[]; jmdict_id?: number; other_forms?: string[]; other_readings?: string[]; examples?: Example[];
}
interface Kanji {
  character: string; level: Level; strokes: number | null; grade: number | null; freq: number | null;
  radical: string | null; radical_number: number | null; onyomi: string[]; kunyomi: string[];
  nanori?: string[]; meanings: string[]; words?: string[]; supplementary?: true;
}
interface Grammar {
  id: string; pattern: string; reading?: string; romaji: string; level: Level; meaning: string;
  formation: string; examples: Example[]; tags: string[]; notes?: string;
}

const OUT = process.argv[2] ?? join(ROOT, '_site');
const SITE_URL = (process.env.SITE_URL ?? 'https://evanclan.github.io/OpenJLPT/').replace(/\/?$/, '/');
const REPO = 'https://github.com/evanclan/OpenJLPT';
const LEVEL_NAMES = LEVELS.map((l) => l.level);
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));

const vocab = new Map<Level, Vocab[]>();
const kanji = new Map<Level, Kanji[]>();
const grammar = new Map<Level, Grammar[]>();
for (const level of LEVEL_NAMES) {
  const lc = level.toLowerCase();
  vocab.set(level, readJson(join(DATA_DIR, 'json', 'vocab', `${lc}.json`)));
  kanji.set(level, readJson(join(DATA_DIR, 'json', 'kanji', `${lc}.json`)));
  grammar.set(level, readJson(join(DATA_DIR, 'json', 'grammar', `${lc}.json`)));
}
const allVocab = [...vocab.values()].flat();
const allKanji = [...kanji.values()].flat();
const allGrammar = [...grammar.values()].flat();
const posLabels: Record<string, string> = readJson(join(DATA_DIR, 'json', 'pos.json'));
const meta = readJson<{ version: string; counts: Record<string, Record<string, number>> }>(join(DATA_DIR, 'json', 'meta.json'));
const kanjiByChar = new Map(allKanji.map((k) => [k.character, k]));
const vocabByWord = new Map<string, Vocab>();
for (const v of allVocab) if (!vocabByWord.has(v.word)) vocabByWord.set(v.word, v);

// ---------------------------------------------------------------------------
// Helpers

const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hex = (ch: string) => ch.codePointAt(0)!.toString(16);
const kanjiPath = (ch: string) => `kanji/${hex(ch)}.html`;
const vocabPath = (v: Vocab) => `vocab/${v.id}.html`;
const grammarPath = (g: Grammar) => `grammar/${g.id}.html`;
const isKanjiChar = (ch: string) => /[㐀-䶿一-鿿豈-﫿々]/.test(ch);
const lvl = (l: Level) => `<span class="lvl ${l}">${l}</span>`;
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

/**
 * Furigana: align the kana reading to the kanji runs of the word
 * (食べる + たべる → 食[た]べる). Falls back to the plain word when ambiguous.
 */
export function furigana(word: string, reading: string): string {
  const parts = word.match(/[㐀-䶿一-鿿豈-﫿々ヶ〆]+|[^㐀-䶿一-鿿豈-﫿々ヶ〆]+/g);
  if (!parts || parts.every((p) => !isKanjiChar(p[0]))) return esc(word);
  const pattern = parts.map((p) => (isKanjiChar(p[0]) ? '(.+?)' : `(${toHira(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)).join('');
  const m = toHira(reading).match(new RegExp(`^${pattern}$`));
  if (!m) return esc(word);
  return parts
    .map((p, i) => (isKanjiChar(p[0]) ? `<ruby>${esc(p)}<rt>${esc(m[i + 1])}</rt></ruby>` : esc(p)))
    .join('');
}

// ---------------------------------------------------------------------------
// Layout

const NAV: [string, string][] = [
  ['n5/index.html', 'N5'], ['n4/index.html', 'N4'], ['n3/index.html', 'N3'], ['n2/index.html', 'N2'], ['n1/index.html', 'N1'],
  ['flashcards.html', 'Flashcards'], ['analyzer.html', 'Analyzer'], ['data.html', 'Data & API'],
];

const GITHUB_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

interface Page {
  path: string;
  title: string;
  description: string;
  body: string;
  active?: string;
  scripts?: string[];
  noindex?: boolean;
}

const pages: string[] = [];

function writePage(p: Page): void {
  const depth = p.path.split('/').length - 1;
  const root = '../'.repeat(depth);
  const url = SITE_URL + p.path.replace(/index\.html$/, '');
  const nav = NAV.map(([href, label]) => `<a href="${root}${href}"${p.active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const scripts = ['assets/app.js', ...(p.scripts ?? [])].map((s) => `<script src="${root}${s}" defer></script>`).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(url)}">
${p.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="OpenJLPT">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE_URL}assets/social-preview.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#d7263d">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/style.css">
${scripts}
</head>
<body data-root="${root}">
<header class="site-header"><div class="wrap">
<a class="brand" href="${root}index.html"><span class="brand-mark">あ</span>OpenJLPT</a>
<nav class="nav" aria-label="Main">${nav}</nav>
<a class="gh-btn" href="${REPO}" rel="noopener">${GITHUB_ICON}<span>Star on GitHub</span></a>
</div></header>
<main><div class="wrap">
${p.body}
</div></main>
<footer class="site-footer"><div class="wrap">
<p><strong>OpenJLPT</strong> — the open JLPT dataset. <a href="${REPO}">GitHub</a> · <a href="${root}data.html">Download the data</a> · <a href="${REPO}/issues/new/choose">Report an error</a></p>
<p>Data <a href="${REPO}/blob/main/LICENSE">CC BY-SA 4.0</a>. Level lists by <a href="https://www.tanos.co.uk/jlpt/">Jonathan Waller</a> (CC BY);
dictionary data from <a href="https://www.edrdg.org/">JMdict &amp; KANJIDIC2 (EDRDG)</a>; example sentences from <a href="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR);
stroke order from <a href="https://kanjivg.tagaini.net/">KanjiVG</a> (CC BY-SA 3.0). JLPT levels are unofficial: the JLPT does not publish word lists.</p>
</div></footer>
</body>
</html>
`;
  const file = join(OUT, p.path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, html);
  if (!p.noindex) pages.push(url);
}

const crumbs = (root: string, items: [string, string?][]) =>
  `<nav class="crumbs" aria-label="Breadcrumb"><a href="${root}index.html">Home</a>${items
    .map(([label, href]) => ` › ${href ? `<a href="${root}${href}">${esc(label)}</a>` : esc(label)}`)
    .join('')}</nav>`;

const exampleList = (examples: Example[] | undefined) =>
  examples?.length
    ? `<ul class="examples">${examples
        .map(
          (e) => `<li><div class="ja" lang="ja">${esc(e.ja)}</div><div class="en">${esc(e.en)}</div>${
            e.tatoeba_id ? `<div class="src"><a href="https://tatoeba.org/en/sentences/show/${e.tatoeba_id}" rel="noopener">Tatoeba #${e.tatoeba_id}</a></div>` : ''
          }</li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">No example sentence yet.</p>';

const jsonBlock = (entry: unknown, snippet: string) => `<details class="json"><summary>Use this entry in code</summary>
<pre><code>${esc(snippet)}</code></pre>
<pre><code>${esc(JSON.stringify(entry, null, 2))}</code></pre></details>`;

const pager = (root: string, prev?: [string, string], next?: [string, string]) =>
  `<nav class="pager">${prev ? `<a href="${root}${prev[0]}">← ${esc(prev[1])}</a>` : '<span></span>'}${next ? `<a href="${root}${next[0]}">${esc(next[1])} →</a>` : '<span></span>'}</nav>`;

const reportUrl = (kind: string, entry: string) =>
  esc(`${REPO}/issues/new?template=data-error.yml&title=${encodeURIComponent(`Data error: ${entry}`)}&kind=${kind}&entry=${encodeURIComponent(entry)}`);

const speak = (text: string) => `<button class="speak" type="button" data-speak="${esc(text)}" title="Listen" aria-label="Listen">🔊</button>`;

// ---------------------------------------------------------------------------
// Entry pages

function vocabPages(): void {
  for (const level of LEVEL_NAMES) {
    const list = vocab.get(level)!;
    list.forEach((v, i) => {
      const root = '../';
      const kanjiCards = [...new Set(v.word)]
        .map((ch) => kanjiByChar.get(ch))
        .filter((k): k is Kanji => !!k)
        .map((k) => `<a class="kanji-link" href="${root}${kanjiPath(k.character)}"><span class="c">${esc(k.character)}</span><span>${lvl(k.level)}<br><span class="muted">${esc(truncate(k.meanings.slice(0, 3).join(', '), 40))}</span></span></a>`)
        .join('');
      const pos = (v.pos ?? []).map((p) => `<span class="chip" title="${esc(p)}">${esc(posLabels[p] ?? p)}</span>`).join('');
      const also = [
        v.other_forms?.length ? `<p class="muted">Also written <span lang="ja">${esc(v.other_forms.join('、'))}</span></p>` : '',
        v.other_readings?.length ? `<p class="muted">Also read <span lang="ja">${esc(v.other_readings.join('、'))}</span></p>` : '',
      ].join('');
      const reading = v.word === v.reading ? '' : `<span class="reading">${esc(v.reading)}</span>`;
      const gloss = v.meanings.slice(0, 3).join('; ');
      writePage({
        path: vocabPath(v),
        active: `${level.toLowerCase()}/index.html`,
        title: `${v.word}${v.word === v.reading ? '' : ` (${v.reading})`} — ${truncate(gloss, 50)} | JLPT ${level} vocabulary`,
        description: `${v.word} (${v.reading}, ${v.romaji}) means “${truncate(gloss, 90)}”. JLPT ${level} vocabulary with example sentences, part of speech and kanji breakdown.`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['Vocabulary', `${level.toLowerCase()}/vocab.html`], [v.word]])}
<div class="entry-head"><h1 class="headword" lang="ja">${furigana(v.word, v.reading)}</h1>${speak(v.reading)}${lvl(v.level)}</div>
<div>${reading} <span class="romaji">${esc(v.romaji)}</span></div>
<div class="two-col">
<section>
<ol class="meanings${v.meanings.length === 1 ? ' single' : ''}">${v.meanings.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
${pos ? `<div class="chips">${pos}</div>` : ''}
${also}
<h2>Examples</h2>
${exampleList(v.examples)}
</section>
<aside>
${kanjiCards ? `<h2>Kanji</h2><div class="kanji-links">${kanjiCards}</div>` : ''}
<h2>Look up</h2>
<p><a href="https://jisho.org/word/${encodeURIComponent(v.word)}" rel="noopener">Jisho</a>${
          v.jmdict_id ? ` · <a href="https://www.edrdg.org/jmwsgi/entry.py?svc=jmdict&amp;q=${v.jmdict_id}" rel="noopener">JMdict #${v.jmdict_id}</a>` : ''
        } · <a href="${reportUrl('Vocabulary', `${v.word} (${level})`)}" rel="noopener">Report an error</a></p>
</aside>
</div>
${jsonBlock(v, `import { getVocabById } from 'openjlpt';\ngetVocabById('${v.id}'); // ${v.word}`)}
${pager(root, list[i - 1] && [vocabPath(list[i - 1]), list[i - 1].word], list[i + 1] && [vocabPath(list[i + 1]), list[i + 1].word])}`,
      });
    });
  }
}

function kanjiPages(): void {
  for (const level of LEVEL_NAMES) {
    const list = kanji.get(level)!;
    list.forEach((k, i) => {
      const root = '../';
      const words = (k.words ?? [])
        .map((w) => vocabByWord.get(w))
        .filter((v): v is Vocab => !!v)
        .map((v) => `<tr><td class="w"><a href="${root}${vocabPath(v)}" lang="ja">${esc(v.word)}</a></td><td class="r" lang="ja">${esc(v.reading)}</td><td>${esc(truncate(v.meanings.slice(0, 3).join('; '), 70))}</td><td>${lvl(v.level)}</td></tr>`)
        .join('');
      const cp = hex(k.character).padStart(5, '0');
      writePage({
        path: kanjiPath(k.character),
        active: `${level.toLowerCase()}/index.html`,
        title: `${k.character} — ${truncate(k.meanings.slice(0, 3).join(', '), 40)} | JLPT ${level} kanji: readings, stroke order`,
        description: `The kanji ${k.character} means “${truncate(k.meanings.join(', '), 60)}”. JLPT ${level}. On'yomi ${k.onyomi.join('、') || '—'}; kun'yomi ${k.kunyomi.join('、') || '—'}. ${k.strokes ?? '?'} strokes${k.radical ? `, radical ${k.radical}` : ''}. Example words and stroke order.`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['Kanji', `${level.toLowerCase()}/kanji.html`], [k.character]])}
<div class="two-col">
<section>
<div class="entry-head"><h1 class="kanji-big" lang="ja">${esc(k.character)}</h1>${lvl(k.level)}</div>
<ol class="meanings${k.meanings.length === 1 ? ' single' : ''}">${k.meanings.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
<dl class="kv">
<dt>On'yomi</dt><dd>${esc(k.onyomi.join('、') || '—')}</dd>
<dt>Kun'yomi</dt><dd>${esc(k.kunyomi.join('、') || '—')}</dd>
<dt>Strokes</dt><dd>${k.strokes ?? '—'}</dd>
<dt>Radical</dt><dd>${k.radical ? `${esc(k.radical)} <span class="muted">(#${k.radical_number})</span>` : '—'}</dd>
${k.grade ? `<dt>School grade</dt><dd>${k.grade <= 6 ? k.grade : k.grade === 8 ? 'secondary (jōyō)' : 'jinmeiyō'}</dd>` : ''}
${k.freq ? `<dt>Frequency</dt><dd>#${k.freq} <span class="muted">in newspapers</span></dd>` : ''}
${k.nanori?.length ? `<dt>Name readings</dt><dd>${esc(k.nanori.join('、'))}</dd>` : ''}
</dl>
${k.supplementary ? `<p class="muted" style="font-size:14px">Not in Waller's JLPT lists (which predate the 2010 jōyō revision): placed at ${k.level} because ${k.words?.length ? 'OpenJLPT words at that level use it' : 'the N1 level completes the jōyō kanji'}.</p>` : ''}
</section>
<aside>
<h2>Stroke order</h2>
<img class="strokes-img" src="https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${cp}.svg" alt="Stroke order diagram for ${esc(k.character)}" loading="lazy" width="220" height="220">
<p class="muted" style="font-size:13px">Diagram: <a href="https://kanjivg.tagaini.net/">KanjiVG</a>, CC BY-SA 3.0</p>
</aside>
</div>
${words ? `<h2>Words with ${esc(k.character)}</h2><table class="list"><tbody>${words}</tbody></table>` : ''}
<p class="muted" style="margin-top:24px"><a href="https://jisho.org/search/${encodeURIComponent(k.character)}%20%23kanji" rel="noopener">Jisho</a> · <a href="${reportUrl('Kanji', `${k.character} (${level})`)}" rel="noopener">Report an error</a></p>
${jsonBlock(k, `import { findKanji } from 'openjlpt';\nfindKanji('${k.character}');`)}
${pager(root, list[i - 1] && [kanjiPath(list[i - 1].character), list[i - 1].character], list[i + 1] && [kanjiPath(list[i + 1].character), list[i + 1].character])}`,
      });
    });
  }
}

function grammarPages(): void {
  for (const level of LEVEL_NAMES) {
    const list = grammar.get(level)!;
    list.forEach((g, i) => {
      const root = '../';
      const related = list
        .filter((o) => o !== g && o.tags.some((t) => g.tags.includes(t)))
        .slice(0, 8)
        .map((o) => `<a class="chip" href="${root}${grammarPath(o)}" lang="ja">${esc(o.pattern)}</a>`)
        .join('');
      writePage({
        path: grammarPath(g),
        active: `${level.toLowerCase()}/index.html`,
        title: `${g.pattern} — ${truncate(g.meaning, 50)} | JLPT ${level} grammar`,
        description: `JLPT ${level} grammar: ${g.pattern} (${g.romaji}) — ${truncate(g.meaning, 80)}. Formation: ${truncate(g.formation, 60)}. With example sentences and usage notes.`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['Grammar', `${level.toLowerCase()}/grammar.html`], [g.pattern]])}
<div class="entry-head"><h1 class="headword" lang="ja" style="font-size:clamp(34px,6vw,54px)">${esc(g.pattern)}</h1>${lvl(g.level)}</div>
<div>${g.reading ? `<span class="reading">${esc(g.reading)}</span> ` : ''}<span class="romaji">${esc(g.romaji)}</span></div>
<p style="font-size:21px;margin:14px 0">${esc(g.meaning)}</p>
<h2>Formation</h2>
<div class="formation">${esc(g.formation)}</div>
<h2>Examples</h2>
${exampleList(g.examples)}
${g.notes ? `<h2>Notes</h2><p class="note">${esc(g.notes)}</p>` : ''}
<div class="chips">${g.tags.map((t) => `<span class="chip">#${esc(t)}</span>`).join('')}</div>
${related ? `<h2>Related ${level} grammar</h2><div class="chips">${related}</div>` : ''}
<p class="muted" style="margin-top:24px"><a href="${reportUrl('Grammar', `${g.pattern} (${level})`)}" rel="noopener">Suggest an improvement</a></p>
${jsonBlock(g, `import { getGrammarById } from 'openjlpt';\ngetGrammarById('${g.id}');`)}
${pager(root, list[i - 1] && [grammarPath(list[i - 1]), list[i - 1].pattern], list[i + 1] && [grammarPath(list[i + 1]), list[i + 1].pattern])}`,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Level pages

const levelBlurb: Record<Level, string> = {
  N5: 'Beginner. Basic phrases, hiragana, katakana and the first ~100 kanji.',
  N4: 'Upper beginner. Everyday conversation on familiar topics.',
  N3: 'Intermediate. The bridge between textbook and real-world Japanese.',
  N2: 'Upper intermediate. Newspapers, business and general-purpose Japanese.',
  N1: 'Advanced. Complex, abstract and literary Japanese.',
};

function levelPages(): void {
  for (const level of LEVEL_NAMES) {
    const lc = level.toLowerCase();
    const root = '../';
    const v = vocab.get(level)!;
    const k = kanji.get(level)!;
    const g = grammar.get(level)!;

    writePage({
      path: `${lc}/index.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} — ${v.length.toLocaleString('en-US')} words, ${k.length} kanji, ${g.length} grammar points | OpenJLPT`,
      description: `Everything for the JLPT ${level}: ${plural(v.length, 'vocabulary word')}, ${plural(k.length, 'kanji')} and ${plural(g.length, 'grammar point')} with readings, meanings and example sentences. Free and open data.`,
      body: `${crumbs(root, [[`JLPT ${level}`]])}
<h1>JLPT ${level} ${lvl(level)}</h1>
<p class="lead">${levelBlurb[level]}</p>
<div class="grid grid-3" style="margin-top:22px">
<a class="card level-card" href="vocab.html"><div class="big">${v.length.toLocaleString('en-US')}</div><div>vocabulary words →</div><ul><li lang="ja">${v.slice(0, 6).map((x) => esc(x.word)).join('、')}…</li></ul></a>
<a class="card level-card" href="kanji.html"><div class="big">${k.length.toLocaleString('en-US')}</div><div>kanji →</div><ul><li lang="ja" style="font-size:22px">${k.slice(0, 10).map((x) => esc(x.character)).join(' ')}</li></ul></a>
<a class="card level-card" href="grammar.html"><div class="big">${g.length}</div><div>grammar points →</div><ul><li lang="ja">${g.slice(0, 5).map((x) => esc(x.pattern)).join('、')}…</li></ul></a>
</div>
<div class="btn-row"><a class="btn primary" href="${root}flashcards.html#${level}">Study ${level} with flashcards</a><a class="btn" href="${root}data.html">Download ${level} as JSON / CSV / Anki</a></div>`,
    });

    writePage({
      path: `${lc}/vocab.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} Vocabulary List — all ${v.length.toLocaleString('en-US')} words with readings and meanings`,
      description: `The complete JLPT ${level} vocabulary list: ${plural(v.length, 'word')} with kana readings, romaji, English meanings and example sentences. Free to download as JSON, CSV or SQLite.`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['Vocabulary']])}
<h1>JLPT ${level} vocabulary <span class="muted" style="font-size:0.6em">${v.length.toLocaleString('en-US')} words</span></h1>
<input class="filter" type="search" placeholder="Filter (kanji, kana, romaji or English)…" data-filter="#vlist" aria-label="Filter words">
<table class="list" id="vlist"><thead><tr><th>Word</th><th class="r">Reading</th><th>Meaning</th></tr></thead><tbody>
${v.map((x) => `<tr data-s="${esc(`${x.word} ${x.reading} ${x.romaji} ${x.meanings.join(' ')}`.toLowerCase())}"><td class="w"><a href="${root}${vocabPath(x)}" lang="ja">${esc(x.word)}</a></td><td class="r" lang="ja">${esc(x.reading)}</td><td>${esc(truncate(x.meanings.join('; '), 90))}</td></tr>`).join('\n')}
</tbody></table>`,
    });

    writePage({
      path: `${lc}/kanji.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} Kanji List — ${k.length} kanji with readings, meanings and stroke order`,
      description: `All ${k.length} JLPT ${level} kanji with on'yomi, kun'yomi, English meanings, stroke counts, radicals, stroke order and example words.`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['Kanji']])}
<h1>JLPT ${level} kanji <span class="muted" style="font-size:0.6em">${k.length}</span></h1>
<p class="muted">Most frequent first.</p>
<div class="kanji-grid">${k.map((x) => `<a href="${root}${kanjiPath(x.character)}" title="${esc(x.meanings.slice(0, 3).join(', '))}" lang="ja">${esc(x.character)}<small>${esc(x.meanings[0] ?? '')}</small></a>`).join('')}</div>`,
    });

    writePage({
      path: `${lc}/grammar.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} Grammar List — ${g.length} grammar points with examples`,
      description: `All ${g.length} JLPT ${level} grammar points with meanings, formation rules, example sentences and usage notes.`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['Grammar']])}
<h1>JLPT ${level} grammar <span class="muted" style="font-size:0.6em">${g.length} points</span></h1>
<input class="filter" type="search" placeholder="Filter grammar…" data-filter="#glist" aria-label="Filter grammar">
<ul class="gram-list" id="glist">${g.map((x) => `<li data-s="${esc(`${x.pattern} ${x.reading ?? ''} ${x.romaji} ${x.meaning} ${x.tags.join(' ')}`.toLowerCase())}"><a href="${root}${grammarPath(x)}"><span class="p" lang="ja">${esc(x.pattern)}</span><span class="m">${esc(x.meaning)}</span></a></li>`).join('')}</ul>`,
    });
  }
}

// ---------------------------------------------------------------------------
// Home and tools

const levelShort: Record<Level, string> = { N5: 'Beginner', N4: 'Elementary', N3: 'Intermediate', N2: 'Upper intermediate', N1: 'Advanced' };

function homePage(): void {
  const c = meta.counts;
  const levelCards = LEVEL_NAMES.map(
    (l) => `<a class="card level-card" href="${l.toLowerCase()}/index.html"><div class="lv" style="color:var(--${l.toLowerCase()})">${l}</div><div class="lv-sub">${levelShort[l]}</div><ul>
<li>${c.vocab[l].toLocaleString('en-US')} words</li><li>${c.kanji[l].toLocaleString('en-US')} kanji</li><li>${c.grammar[l]} grammar points</li></ul></a>`,
  ).join('');
  writePage({
    path: 'index.html',
    title: 'OpenJLPT — every JLPT N5–N1 word, kanji and grammar point, free and open',
    description: `Free, open JLPT dataset and study site: ${c.vocab.total.toLocaleString('en-US')} vocabulary words, ${c.kanji.total.toLocaleString('en-US')} kanji and ${c.grammar.total} grammar points for N5–N1, with example sentences. Search, flashcards, text analyzer, and downloads as JSON, CSV, SQLite and Anki.`,
    body: `<section class="hero">
<h1>Every JLPT word, kanji and grammar point.<br><span class="accent">Free and open.</span></h1>
<p class="lead">Search ${c.vocab.total.toLocaleString('en-US')} words, ${c.kanji.total.toLocaleString('en-US')} kanji and ${c.grammar.total} grammar points from N5 to N1 — with readings, meanings and real example sentences. Or grab the whole dataset for your own app.</p>
<div class="search" id="search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input id="q" type="search" placeholder="Try 食べる, taberu, 日, eat or てもいい" autocomplete="off" aria-label="Search words, kanji and grammar"></div>
<ul class="results" id="results" aria-live="polite"></ul>
<div class="stats">
<div class="stat"><b>${c.vocab.total.toLocaleString('en-US')}</b><span>words</span></div>
<div class="stat"><b>${c.kanji.total.toLocaleString('en-US')}</b><span>kanji</span></div>
<div class="stat"><b>${c.grammar.total}</b><span>grammar points</span></div>
<div class="stat"><b>5</b><span>levels, N5 → N1</span></div>
</div>
</section>
<h2>Browse by level</h2>
<div class="grid grid-5">${levelCards}</div>
<h2>Study tools</h2>
<div class="grid grid-3">
<a class="card level-card" href="flashcards.html"><h3 style="margin-top:0">🃏 Flashcards</h3><p class="muted">Spaced-repetition review for any level — words, kanji or grammar. Progress saves in your browser.</p></a>
<a class="card level-card" href="analyzer.html"><h3 style="margin-top:0">🔍 Text analyzer</h3><p class="muted">Paste any Japanese text and see which JLPT level each kanji belongs to.</p></a>
<a class="card level-card" href="data.html"><h3 style="margin-top:0">📦 Data &amp; API</h3><p class="muted">JSON, CSV, SQLite and Anki downloads, a CDN, and loaders for JavaScript and Python.</p></a>
</div>
<h2>Built for developers</h2>
<p class="muted">The same data powers this site and can power your app: free to use, including commercially, under CC BY-SA 4.0.</p>
<pre><code>npm install openjlpt        # or: pip install openjlpt

import { findWord, getGrammar } from 'openjlpt';
findWord('食べる');   // { reading: 'たべる', level: 'N5', pos: ['v1','vt'], examples: [...] }
getGrammar('N4');     // ${c.grammar.N4} grammar points with examples</code></pre>
<div class="btn-row"><a class="btn primary" href="${REPO}">${GITHUB_ICON} Star OpenJLPT on GitHub</a><a class="btn" href="data.html">Get the data</a></div>`,
    scripts: ['assets/search.js'],
  });
}

function toolPages(): void {
  writePage({
    path: 'flashcards.html',
    active: 'flashcards.html',
    title: 'JLPT Flashcards — free spaced repetition for N5–N1 | OpenJLPT',
    description: 'Free JLPT flashcards in your browser: vocabulary, kanji and grammar for N5 to N1 with spaced repetition. No sign-up; progress is saved locally.',
    scripts: ['assets/flashcards.js'],
    body: `<div class="fc">
<h1>Flashcards</h1>
<p class="muted">Spaced repetition in your browser. Progress is stored on this device only.</p>
<div class="btn-row" style="justify-content:center">
<div class="seg" id="fc-level" role="group" aria-label="Level">${LEVEL_NAMES.map((l, i) => `<button type="button" data-v="${l}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
<div class="seg" id="fc-kind" role="group" aria-label="Deck"><button type="button" data-v="vocab" aria-pressed="true">Words</button><button type="button" data-v="kanji" aria-pressed="false">Kanji</button><button type="button" data-v="grammar" aria-pressed="false">Grammar</button></div>
</div>
<div class="fc-progress"><div id="fc-bar"></div></div>
<p class="muted" id="fc-status">Loading…</p>
<div class="card fc-card" id="fc-card" tabindex="0" aria-live="polite"><div class="fc-front" lang="ja" id="fc-front"></div><div class="fc-back" id="fc-back"></div></div>
<div class="btn-row" style="justify-content:center">
<button class="btn" type="button" id="fc-again">✗ Again <span class="kbd">1</span></button>
<button class="btn" type="button" id="fc-flip">Show <span class="kbd">space</span></button>
<button class="btn primary" type="button" id="fc-good">✓ Knew it <span class="kbd">2</span></button>
</div>
<p><button class="btn" type="button" id="fc-reset" style="font-size:13px;padding:6px 12px">Reset progress for this deck</button></p>
</div>`,
  });

  writePage({
    path: 'analyzer.html',
    active: 'analyzer.html',
    title: 'What JLPT level is this text? — Japanese kanji level analyzer | OpenJLPT',
    description: 'Paste any Japanese text to see the JLPT level (N5–N1) of every kanji, color-coded, with a level breakdown. Free and runs in your browser.',
    scripts: ['assets/analyzer.js'],
    body: `<h1>What JLPT level is this text?</h1>
<p class="lead">Paste Japanese text: every kanji is colored by its JLPT level. Click one to look it up.</p>
<textarea class="analyze" id="text" lang="ja" aria-label="Japanese text">吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。</textarea>
<div class="legend" style="margin-top:12px">${LEVEL_NAMES.map((l) => `<span><i style="background:var(--${l.toLowerCase()})"></i>${l}</span>`).join('')}<span><i style="background:var(--none)"></i>not in JLPT lists</span></div>
<div class="bar" id="bar"></div>
<p id="summary" class="muted"></p>
<div class="card"><div class="marked" id="marked" lang="ja"></div></div>`,
  });

  const cdn = 'https://cdn.jsdelivr.net/gh/evanclan/OpenJLPT@main';
  writePage({
    path: 'data.html',
    active: 'data.html',
    title: 'Download the JLPT dataset — JSON, CSV, SQLite, Anki | OpenJLPT',
    description: 'Download every JLPT N5–N1 word, kanji and grammar point as JSON, CSV or SQLite, or use the npm and PyPI packages and a free CDN. CC BY-SA 4.0.',
    body: `<h1>Data &amp; API</h1>
<p class="lead">All data is free to use — including commercially — under <a href="${REPO}/blob/main/LICENSE">CC BY-SA 4.0</a>, with attribution to OpenJLPT and the <a href="${REPO}/blob/main/NOTICE.md">upstream sources</a>.</p>
<h2>Download</h2>
<table class="list"><thead><tr><th>Level</th><th>Vocabulary</th><th>Kanji</th><th>Grammar</th></tr></thead><tbody>
${LEVEL_NAMES.map((l) => {
  const lc = l.toLowerCase();
  return `<tr><td>${lvl(l)}</td>${(['vocab', 'kanji', 'grammar'] as const).map((k) => `<td><a href="${cdn}/data/json/${k}/${lc}.json">JSON</a> · <a href="${cdn}/data/csv/${k}-${lc}.csv">CSV</a></td>`).join('')}</tr>`;
}).join('')}
</tbody></table>
<p><a class="btn" href="${REPO}/raw/main/data/openjlpt.sqlite">⬇ SQLite database (all levels)</a></p>
<h2 id="anki">Anki decks</h2>
<p>Ready-made <a href="https://apps.ankiweb.net/">Anki</a> decks with furigana, example sentences and text-to-speech. Re-importing a newer version updates your cards and keeps your review history.</p>
<table class="list"><thead><tr><th>Level</th><th>Vocabulary</th><th>Kanji</th><th>Grammar</th></tr></thead><tbody>
${LEVEL_NAMES.map((l) => `<tr><td>${lvl(l)}</td>${(['vocab', 'kanji', 'grammar'] as const).map((k) => `<td><a href="downloads/openjlpt-${l.toLowerCase()}-${k}.apkg">⬇ ${meta.counts[k][l].toLocaleString('en-US')} ${k === 'vocab' ? 'words' : k === 'kanji' ? 'kanji' : 'points'}</a></td>`).join('')}</tr>`).join('')}
</tbody></table>
<p><a class="btn primary" href="downloads/openjlpt-complete.apkg">⬇ Everything in one deck (N5–N1)</a></p>
<h2 id="yomitan">Yomitan dictionary</h2>
<p>See the JLPT level of any word or kanji right in the <a href="https://yomitan.wiki/">Yomitan</a> pop-up: <a href="downloads/openjlpt-yomitan.zip">⬇ openjlpt-yomitan.zip</a>, then import it in Yomitan's settings → Dictionaries.</p>
<h2>CDN (no install)</h2>
<p>Every file is served by jsDelivr — fetch it straight from a browser app:</p>
<pre><code>const n5 = await fetch('${cdn}/data/json/vocab/n5.json').then(r =&gt; r.json());</code></pre>
<h2>JavaScript / TypeScript</h2>
<pre><code>npm install openjlpt

import { getVocab, findWord, findKanji, searchVocab, getGrammar } from 'openjlpt';
getVocab('N5');            // ${meta.counts.vocab.N5} words, fully typed
findKanji('日');           // { strokes: 4, radical: '日', onyomi: ['ニチ','ジツ'], words: [...] }
searchVocab('taberu');     // kanji, kana, romaji or English
getGrammar('N3');          // ${meta.counts.grammar.N3} grammar points

npx openjlpt 食べる         # command-line lookup (also: kanji, grammar, quiz, random)</code></pre>
<h2>Python</h2>
<pre><code>pip install openjlpt

from openjlpt import get_vocab, find_word, search_vocab, query
find_word("食べる").meanings          # ['to eat']
query("SELECT word, reading FROM vocab WHERE level = 'N5' LIMIT 5")</code></pre>
<h2>SQLite</h2>
<pre><code>-- full-text search over words, readings, romaji and meanings
SELECT v.word, v.reading, v.level
FROM vocab_fts f JOIN vocab v ON v.rowid = f.rowid
WHERE vocab_fts MATCH 'weather';</code></pre>
<h2>Schema</h2>
<p>Every file is validated in CI against <a href="${REPO}/tree/main/schema">JSON Schemas</a>. See the <a href="${REPO}#readme">README</a> for field-by-field documentation.</p>`,
  });

  writePage({
    path: '404.html',
    title: 'Page not found | OpenJLPT',
    description: 'Page not found.',
    noindex: true,
    body: `<h1>Page not found</h1><p class="lead">That page doesn't exist. Try the <a href="${SITE_URL}">search on the home page</a>.</p>`,
  });
}

// ---------------------------------------------------------------------------
// Data for the interactive tools

function writeData(): void {
  const dir = join(OUT, 'data');
  mkdirSync(dir, { recursive: true });
  const w = (name: string, data: unknown) => writeFileSync(join(dir, name), JSON.stringify(data));
  for (const level of LEVEL_NAMES) {
    const lc = level.toLowerCase();
    w(`vocab-${lc}.json`, vocab.get(level)!.map((v) => [v.id, v.word, v.reading, v.romaji, v.meanings.slice(0, 4).join('; '), v.examples?.[0]?.ja ?? '', v.examples?.[0]?.en ?? '']));
    w(`kanji-${lc}.json`, kanji.get(level)!.map((k) => [hex(k.character), k.character, k.onyomi.join('、'), k.kunyomi.join('、'), k.meanings.slice(0, 4).join(', '), (k.words ?? []).slice(0, 3).join('、')]));
    w(`grammar-${lc}.json`, grammar.get(level)!.map((g) => [g.id, g.pattern, g.romaji, g.meaning, g.examples[0]?.ja ?? '', g.examples[0]?.en ?? '']));
  }
  // Search index: [kind, key, text, reading, romaji, gloss, level]
  const search = [
    ...allVocab.map((v) => ['v', v.id, v.word, v.reading, v.romaji, truncate(v.meanings.slice(0, 3).join('; '), 80), v.level, (v.other_forms ?? []).join(' ')]),
    ...allKanji.map((k) => ['k', hex(k.character), k.character, [...k.onyomi, ...k.kunyomi].join(' '), '', truncate(k.meanings.slice(0, 3).join(', '), 80), k.level, '']),
    ...allGrammar.map((g) => ['g', g.id, g.pattern, g.reading ?? '', g.romaji, truncate(g.meaning, 80), g.level, g.tags.join(' ')]),
  ];
  w('search.json', search);
  w('kanji-levels.json', Object.fromEntries(allKanji.map((k) => [k.character, k.level])));
}

function writeSeo(): void {
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((u) => `<url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
  writeFileSync(join(OUT, '.nojekyll'), '');
}

// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'site', 'assets'), join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'assets', 'social-preview.png'), join(OUT, 'assets', 'social-preview.png'));
homePage();
levelPages();
vocabPages();
kanjiPages();
grammarPages();
toolPages();
writeData();
writeSeo();
console.log(`Site: ${pages.length} pages -> ${OUT}`);
