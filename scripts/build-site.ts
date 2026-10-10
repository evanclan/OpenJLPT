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
import { POS_SHORT } from './lib/pos.ts';

// ---------------------------------------------------------------------------
// Data

interface Example { ja: string; furigana?: string; en: string; tatoeba_id?: number }
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
interface Translation { source: string; translation: string }

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
const POS_ZH: Record<string, string> = {
  n: '名词', 'n-pref': '前缀名词', 'n-suf': '后缀名词', pn: '代词', num: '数词', ctr: '量词',
  pref: '前缀', suf: '后缀', prt: '助词', conj: '连词', int: '感叹词', exp: '惯用表达',
  adv: '副词', 'adv-to': '副词（〜と）', 'adj-i': 'い形容词', 'adj-ix': 'い形容词（いい／よい）',
  'adj-na': 'な形容词', 'adj-nari': 'な形容词（古语）', 'adj-no': 'の形容词',
  'adj-pn': '连体词', 'adj-t': 'たる形容词', 'adj-f': '连体词', aux: '助动词',
  'aux-adj': '助形容词', 'aux-v': '助动词', v1: '一段动词', 'v1-s': '一段动词（くれる）',
  vz: '一段动词（〜ずる）', v5aru: '五段动词（〜ある）', v5b: '五段动词',
  v5g: '五段动词', v5k: '五段动词', 'v5k-s': '五段动词（行く）', v5m: '五段动词',
  v5n: '五段动词', v5r: '五段动词', 'v5r-i': '五段动词（不规则）', v5s: '五段动词',
  v5t: '五段动词', v5u: '五段动词', 'v5u-s': '五段动词（特殊）', vk: '不规则动词（来る）',
  vs: 'サ变动词', 'vs-i': 'サ变动词', 'vs-s': 'サ变动词（特殊）', vi: '自动词', vt: '他动词',
};
const GRAMMAR_TAGS_ZH: Record<string, string> = {
  ability: '能力', addition: '补充', advice: '建议', appearance: '样态', attempt: '尝试',
  casual: '随意表达', change: '变化', command: '命令', comparison: '比较', completion: '完成',
  concession: '让步', condition: '条件', conjecture: '推测', conjugation: '活用', contrast: '对比',
  copula: '判断助动词', criticism: '批评', decision: '决定', degree: '程度', demonstrative: '指示词',
  desire: '愿望', emotion: '情感', emphasis: '强调', example: '举例', exclamation: '感叹',
  exclusion: '排除', experience: '经历', formal: '正式表达', 'giving-receiving': '授受表达',
  hearsay: '传闻', honorific: '尊敬语', humble: '自谦语', intention: '意图', invitation: '邀请',
  limitation: '限定', manner: '方式', means: '手段', necessity: '必要性', negation: '否定',
  nominalization: '名词化', obligation: '义务', particle: '助词', permission: '许可',
  politeness: '礼貌表达', possibility: '可能性', prohibition: '禁止', purpose: '目的',
  quantity: '数量', question: '疑问', quotation: '引用', range: '范围', reason: '原因',
  recollection: '回忆', regret: '遗憾', relation: '关系', request: '请求', result: '结果',
  sequence: '顺序', simultaneity: '同时', standpoint: '立场', state: '状态', suggestion: '提议',
  surprise: '惊讶', tendency: '倾向', tense: '时态', time: '时间', topic: '主题', voice: '语态',
  wish: '希望', written: '书面语',
};
const translations = readJson<Record<string, Translation>>(join(DATA_DIR, 'translations', 'zh-CN.json'));
const meta = readJson<{ version: string; counts: Record<string, Record<string, number>>; sources?: Record<string, { created?: string }> }>(
  join(DATA_DIR, 'json', 'meta.json'),
);
const kanjiByChar = new Map(allKanji.map((k) => [k.character, k]));
const vocabByWord = new Map<string, Vocab>();
for (const v of allVocab) if (!vocabByWord.has(v.word)) vocabByWord.set(v.word, v);

// ---------------------------------------------------------------------------
// Helpers

const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hex = (ch: string) => ch.codePointAt(0)!.toString(16);
/** File-name-safe text (Japanese is fine in URLs; a few ASCII characters are not). */
const safe = (s: string) => s.replace(/[\/\\?#%:*"<>|\s]/g, '_');

// Readable URLs: vocab/食べる.html, kanji/食.html. A homograph that is not the first
// (easiest) entry with its spelling gets the reading appended: vocab/上-うわ.html.
const vocabPaths = new Map<Vocab, string>();
{
  const taken = new Set<string>();
  for (const v of allVocab) {
    const base = safe(v.word);
    vocabPaths.set(v, taken.has(base) ? `vocab/${base}-${safe(v.reading)}.html` : `vocab/${base}.html`);
    taken.add(base);
  }
}
const vocabPath = (v: Vocab) => vocabPaths.get(v)!;
const kanjiPath = (ch: string) => `kanji/${ch}.html`;
const grammarPath = (g: Grammar) => `grammar/${g.id}.html`;
const absolute = (path: string) => SITE_URL + encodeURI(path.replace(/index\.html$/, ''));
const isKanjiChar = (ch: string) => /[㐀-䶿一-鿿豈-﫿々]/.test(ch);
const lvl = (l: Level) => `<span class="lvl ${l}">${l}</span>`;
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;
const translation = (key: string, source: string) => {
  const entry = translations[key];
  return entry?.source === source ? entry.translation : '';
};
const chineseLine = (text: string) => text ? `<span class="meaning-zh" lang="zh-CN">${esc(text)}</span>` : '';
const meaningLines = (kind: 'vocab' | 'kanji', id: string, meanings: string[]) =>
  meanings.map((m, i) => `${esc(m)}${chineseLine(translation(`${kind}.${id}.meaning.${i}`, m))}`).join('; ');
const meaningSummary = (kind: 'vocab' | 'kanji', id: string, meanings: string[]) =>
  `<span>${esc(truncate(meanings.join('; '), 90))}</span>${chineseLine(meanings.map((m, i) => translation(`${kind}.${id}.meaning.${i}`, m)).filter(Boolean).join('；'))}`;

/**
 * Furigana: align the kana reading to the kanji runs of the word
 * (食べる + たべる → 食[た]べる). Falls back to the plain word when ambiguous.
 */
// Per-kanji furigana: 勉強 べんきょう → 勉(べん)強(きょう), when the kanji's own readings split
// the reading in exactly one way. Otherwise (jukujikun such as 今日, or kanji outside the
// dataset) the reading stays over the whole run.
const VOICED: Record<string, string> = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const SEMI: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const kanjiSounds = new Map<string, Set<string>>();
function soundsOf(ch: string): Set<string> {
  let out = kanjiSounds.get(ch);
  if (out) return out;
  out = new Set();
  const k = kanjiByChar.get(ch);
  const base = k ? [...k.onyomi, ...k.kunyomi].map((r) => toHira(r.split('.')[0].replace(/-/g, ''))).filter(Boolean) : [];
  for (const r of base) {
    out.add(r);
    const [first, rest] = [r[0], r.slice(1)];
    if (VOICED[first]) out.add(VOICED[first] + rest); // rendaku: 本棚 ほんだな
    if (SEMI[first]) out.add(SEMI[first] + rest); // 一本 いっぽん
    if (/[つちくき]$/.test(r) && r.length > 1) out.add(r.slice(0, -1) + 'っ'); // 学校 がっこう
  }
  kanjiSounds.set(ch, out);
  return out;
}

/** Split one kanji run's reading between its kanji, or return undefined if that isn't certain. */
function splitRun(run: string, rt: string): string[] | undefined {
  const chars = [...run];
  if (chars.length < 2) return undefined;
  const found: string[][] = [];
  const walk = (i: number, rest: string, acc: string[]) => {
    if (found.length > 1) return;
    if (i === chars.length) {
      if (rest === '') found.push(acc);
      return;
    }
    const sounds = chars[i] === '々' && i > 0 ? soundsOf(chars[i - 1]) : soundsOf(chars[i]);
    for (const s of sounds) if (rest.startsWith(s)) walk(i + 1, rest.slice(s.length), [...acc, s]);
  };
  walk(0, rt, []);
  return found.length === 1 ? found[0] : undefined;
}

/** <ruby> for a kanji run, one per kanji where the split is certain. */
function rubyRun(run: string, rt: string): string {
  const parts = splitRun(run, rt);
  if (!parts) return `<ruby>${esc(run)}<rt>${esc(rt)}</rt></ruby>`;
  return [...run].map((ch, i) => `<ruby>${esc(ch)}<rt>${esc(parts[i])}</rt></ruby>`).join('');
}

export function furigana(word: string, reading: string): string {
  const parts = word.match(/[㐀-䶿一-鿿豈-﫿々ヶ〆]+|[^㐀-䶿一-鿿豈-﫿々ヶ〆]+/g);
  if (!parts || parts.every((p) => !isKanjiChar(p[0]))) return esc(word);
  const pattern = parts.map((p) => (isKanjiChar(p[0]) ? '(.+?)' : `(${toHira(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)).join('');
  const m = toHira(reading).match(new RegExp(`^${pattern}$`));
  if (!m) return esc(word);
  return parts
    .map((p, i) => (isKanjiChar(p[0]) ? rubyRun(p, m[i + 1]) : esc(p)))
    .join('');
}

// ---------------------------------------------------------------------------
// Layout

const NAV: [string, string][] = [
  ['n5/index.html', 'N5 入门'], ['n4/index.html', 'N4 初级'], ['n3/index.html', 'N3 中级'], ['n2/index.html', 'N2 中高级'], ['n1/index.html', 'N1 高级'],
  ['flashcards.html', '单词卡'], ['analyzer.html', '文本分析'], ['data.html', '数据下载'],
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
  // The 404 page is served at arbitrary missing paths, so it needs absolute links.
  const root = p.path === '404.html' ? SITE_URL : '../'.repeat(depth);
  const url = absolute(p.path);
  const nav = NAV.map(([href, label]) => `<a href="${root}${href}"${p.active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const scripts = ['assets/app.js', ...(p.scripts ?? [])].map((s) => `<script src="${root}${s}" defer></script>`).join('');
  const html = `<!doctype html>
<html lang="zh-CN">
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
<meta property="og:image" content="${SITE_URL}assets/og-image.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#d7263d">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${root}assets/style.css">
${scripts}
</head>
<body data-root="${root}">
<header class="site-header"><div class="wrap">
<a class="brand" href="${root}index.html"><span class="brand-mark">あ</span><span>OpenJLPT <small>日语词典</small></span></a>
${p.path === 'index.html' ? '' : `<form class="hsearch" action="${root}index.html" role="search"><input type="search" name="q" placeholder="搜索单词、汉字、语法…" aria-label="搜索单词、汉字和语法"></form>`}
<nav class="nav" aria-label="主导航">${nav}</nav>
<a class="gh-btn" href="${REPO}" rel="noopener" aria-label="访问 GitHub 项目">${GITHUB_ICON}<span>GitHub 项目</span></a>
</div></header>
<main><div class="wrap">
${p.body}
</div></main>
<footer class="site-footer"><div class="wrap">
<p><strong>OpenJLPT</strong> — 开放的 JLPT 日语学习词典。<a href="${REPO}">GitHub</a> · <a href="${root}data.html">下载数据</a> · <a href="${REPO}/issues/new/choose">反馈问题</a></p>
<p>数据采用 <a href="${REPO}/blob/main/LICENSE">CC BY-SA 4.0</a> 协议。等级词表由 <a href="https://www.tanos.co.uk/jlpt/">Jonathan Waller</a> 提供（CC BY）；
词典数据来自 <a href="https://www.edrdg.org/">JMdict 与 KANJIDIC2（EDRDG）</a>；例句来自 <a href="https://tatoeba.org">Tatoeba</a>（CC BY 2.0 FR）；
笔顺图来自 <a href="https://kanjivg.tagaini.net/">KanjiVG</a>（CC BY-SA 3.0）。JLPT 等级仅供参考；官方不发布词汇表。</p>
</div></footer>
</body>
</html>
`;
  const file = join(OUT, p.path);
  mkdirSync(join(file, '..'), { recursive: true });
  // Link directory pages by their canonical URL (n5/, not n5/index.html).
  writeFileSync(file, html.replace(/(href="|"item":")([^"]*\/)?index\.html"/g, (_, attr: string, dir = '') => `${attr}${dir || './'}"`));
  if (!p.noindex) pages.push(url);
}

/** Breadcrumb trail, plus schema.org BreadcrumbList markup for search engines. */
const crumbs = (root: string, items: [string, string?][]) => {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [['Home', 'index.html'] as [string, string?], ...items].map(([name, href], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      ...(href ? { item: absolute(href) } : {}),
    })),
  };
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="${root}index.html">首页</a>${items
    .map(([label, href]) => ` › ${href ? `<a href="${root}${href}">${esc(label)}</a>` : esc(label)}`)
    .join('')}</nav><script type="application/ld+json">${jsonLd(ld)}</script>`;
};

/** JSON for a <script> block: escape "<" so data can never close the tag. */
const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/** `{漢字|かんじ}` notation → <ruby>. */
const rubyHtml = (furigana: string) =>
  furigana
    .split(/(\{[^|{}]+\|[^|{}]+\})/)
    .map((part) => {
      const m = part.match(/^\{([^|{}]+)\|([^|{}]+)\}$/);
      return m ? rubyRun(m[1], m[2]) : esc(part);
    })
    .join('');

/** Section heading for example sentences, with a furigana switch when any sentence has furigana. */
const examplesHeading = (examples: Example[] | undefined) =>
  `<div class="ex-head"><h2>例句</h2>${
    examples?.some((e) => e.furigana)
      ? '<label class="furi-toggle"><input type="checkbox" data-furigana checked> 显示假名</label>'
      : ''
  }</div>`;

const exampleList = (examples: Example[] | undefined, kind: 'vocab' | 'grammar', id: string) =>
  examples?.length
    ? `<ul class="examples">${examples
        .map(
          (e, i) => `<li><div class="ja" lang="ja">${e.furigana ? rubyHtml(e.furigana) : esc(e.ja)}</div><div class="en">${esc(e.en)}</div>${chineseLine(translation(`${kind}.${id}.example.${i}`, e.en))}${
            e.tatoeba_id ? `<div class="src"><a href="https://tatoeba.org/en/sentences/show/${e.tatoeba_id}" rel="noopener">Tatoeba #${e.tatoeba_id}</a></div>` : ''
          }</li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">暂无例句。</p>';

const jsonBlock = (entry: unknown, snippet: string) => `<details class="json"><summary>在代码中使用</summary>
<pre><code>${esc(snippet)}</code></pre>
<pre><code>${esc(JSON.stringify(entry, null, 2))}</code></pre></details>`;

const pager = (root: string, prev?: [string, string], next?: [string, string]) =>
  `<nav class="pager">${prev ? `<a href="${root}${prev[0]}">← ${esc(prev[1])}</a>` : '<span></span>'}${next ? `<a href="${root}${next[0]}">${esc(next[1])} →</a>` : '<span></span>'}</nav>`;

const reportUrl = (kind: string, entry: string) =>
  esc(`${REPO}/issues/new?template=data-error.yml&title=${encodeURIComponent(`Data error: ${entry}`)}&kind=${kind}&entry=${encodeURIComponent(entry)}`);

const speak = (text: string) => `<button class="speak" type="button" data-speak="${esc(text)}" title="播放读音" aria-label="播放读音">🔊</button>`;

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
      const pos = [...new Set((v.pos ?? []).map((p) => POS_ZH[p] ?? POS_ZH[p.split('-')[0]] ?? POS_SHORT[p] ?? posLabels[p] ?? p))]
        .map((label) => `<span class="chip">${esc(label)}</span>`)
        .join('');
      const also = [
        v.other_forms?.length ? `<p class="muted">其他写法 <span lang="ja">${esc(v.other_forms.join('、'))}</span></p>` : '',
        v.other_readings?.length ? `<p class="muted">其他读音 <span lang="ja">${esc(v.other_readings.join('、'))}</span></p>` : '',
      ].join('');
      const reading = v.word === v.reading ? '' : `<span class="reading">${esc(v.reading)}</span>`;
      const gloss = v.meanings.slice(0, 3).join('; ');
      writePage({
        path: vocabPath(v),
        active: `${level.toLowerCase()}/index.html`,
        title: `${v.word}（${v.word === v.reading ? '' : `${v.reading}，`}${v.romaji}）释义：${truncate(gloss, 40)} — JLPT ${level} | OpenJLPT`,
        description: `${v.word}（${v.reading}，${v.romaji}），JLPT ${level} 单词，含释义、例句、词性和汉字拆解。`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['单词', `${level.toLowerCase()}/vocab.html`], [v.word]])}
<div class="entry-head"><h1 class="headword" lang="ja">${furigana(v.word, v.reading)}</h1>${speak(v.reading)}${lvl(v.level)}</div>
<div>${reading} <span class="romaji">${esc(v.romaji)}</span></div>
<div class="two-col">
<section>
<ol class="meanings${v.meanings.length === 1 ? ' single' : ''}">${v.meanings.map((m, i) => `<li>${esc(m)}${chineseLine(translation(`vocab.${v.id}.meaning.${i}`, m))}</li>`).join('')}</ol>
${pos ? `<div class="chips">${pos}</div>` : ''}
${also}
${examplesHeading(v.examples)}
${exampleList(v.examples, 'vocab', v.id)}
</section>
<aside>
${kanjiCards ? `<h2>相关汉字</h2><div class="kanji-links">${kanjiCards}</div>` : ''}
<h2>更多词典</h2>
<p><a href="https://jisho.org/word/${encodeURIComponent(v.word)}" rel="noopener">Jisho</a>${
          v.jmdict_id ? ` · <a href="https://www.edrdg.org/jmwsgi/entry.py?svc=jmdict&amp;q=${v.jmdict_id}" rel="noopener">JMdict #${v.jmdict_id}</a>` : ''
        } · <a href="${reportUrl('Vocabulary', `${v.word} (${level})`)}" rel="noopener">反馈词条</a></p>
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
        .map((v) => `<tr><td class="w"><a href="${root}${vocabPath(v)}" lang="ja">${esc(v.word)}</a></td><td class="r" lang="ja">${esc(v.reading)}</td><td>${meaningLines('vocab', v.id, v.meanings.slice(0, 3))}</td><td>${lvl(v.level)}</td></tr>`)
        .join('');
      const cp = hex(k.character).padStart(5, '0');
      writePage({
        path: kanjiPath(k.character),
        active: `${level.toLowerCase()}/index.html`,
        title: `${k.character} 汉字：${truncate(k.meanings.slice(0, 3).join(', '), 36)} — JLPT ${level} 读音、笔顺与例词 · OpenJLPT`,
        description: `JLPT ${level} 汉字 ${k.character}，释义：${truncate(k.meanings.join(', '), 60)}；音读：${k.onyomi.join('、') || '—'}；训读：${k.kunyomi.join('、') || '—'}；${k.strokes ?? '?'} 画。`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['汉字', `${level.toLowerCase()}/kanji.html`], [k.character]])}
<div class="two-col">
<section>
<div class="entry-head"><h1 class="kanji-big" lang="ja">${esc(k.character)}</h1>${lvl(k.level)}</div>
<ol class="meanings${k.meanings.length === 1 ? ' single' : ''}">${k.meanings.map((m, i) => `<li>${esc(m)}${chineseLine(translation(`kanji.${k.character}.meaning.${i}`, m))}</li>`).join('')}</ol>
<dl class="kv">
<dt>音读</dt><dd>${esc(k.onyomi.join('、') || '—')}</dd>
<dt>训读</dt><dd>${esc(k.kunyomi.join('、') || '—')}</dd>
<dt>笔画</dt><dd>${k.strokes ?? '—'}</dd>
<dt>部首</dt><dd>${k.radical ? `${esc(k.radical)} <span class="muted">（第 ${k.radical_number} 部）</span>` : '—'}</dd>
${k.grade ? `<dt>日语学校年级</dt><dd>${k.grade <= 6 ? `小学${k.grade}年级` : k.grade === 8 ? '中学常用汉字' : '人名用汉字'}</dd>` : ''}
${k.freq ? `<dt>常用频率</dt><dd>第 ${k.freq} 位 <span class="muted">（报刊用字）</span></dd>` : ''}
${k.nanori?.length ? `<dt>人名读音</dt><dd>${esc(k.nanori.join('、'))}</dd>` : ''}
</dl>
${k.supplementary ? `<p class="muted" style="font-size:14px">该汉字未收录于 Waller 的 JLPT 词表（该词表早于 2010 年常用汉字修订版），因此列入 ${k.level}：${k.words?.length ? `它用于 OpenJLPT 的 ${k.level} 级词汇` : 'N1 级收录其余常用汉字'}。</p>` : ''}
</section>
<aside>
<h2>笔顺</h2>
<img class="strokes-img" src="https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${cp}.svg" alt="${esc(k.character)} 的笔顺图" loading="lazy" width="220" height="220">
<p class="muted" style="font-size:13px">笔顺图：<a href="https://kanjivg.tagaini.net/">KanjiVG</a>，CC BY-SA 3.0</p>
</aside>
</div>
${words ? `<h2>包含「${esc(k.character)}」的单词</h2><table class="list"><tbody>${words}</tbody></table>` : ''}
<p class="muted" style="margin-top:24px"><a href="https://jisho.org/search/${encodeURIComponent(k.character)}%20%23kanji" rel="noopener">Jisho 汉字词典</a> · <a href="${reportUrl('Kanji', `${k.character} (${level})`)}" rel="noopener">反馈词条</a></p>
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
        title: `${g.pattern}（${g.romaji}）— ${truncate(g.meaning, 44)} | JLPT ${level} 语法 · OpenJLPT`,
        description: `JLPT ${level} 语法 ${g.pattern}（${g.romaji}），含中文释义、接续方式和例句。`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['语法', `${level.toLowerCase()}/grammar.html`], [g.pattern]])}
<div class="entry-head"><h1 class="headword" lang="ja" style="font-size:clamp(34px,6vw,54px)">${esc(g.pattern)}</h1>${lvl(g.level)}</div>
<div>${g.reading ? `<span class="reading">${esc(g.reading)}</span> ` : ''}<span class="romaji">${esc(g.romaji)}</span></div>
<p class="grammar-meaning" style="font-size:21px;margin:14px 0">${esc(g.meaning)}${chineseLine(translation(`grammar.${g.id}.meaning`, g.meaning))}</p>
<h2>接续方式</h2>
<div class="formation">${chineseLine(translation(`grammar.${g.id}.formation`, g.formation)) || '暂无接续方式译文。'}</div>
${examplesHeading(g.examples)}
${exampleList(g.examples, 'grammar', g.id)}
${g.notes && translation(`grammar.${g.id}.notes`, g.notes) ? `<h2>用法说明</h2><p class="note">${chineseLine(translation(`grammar.${g.id}.notes`, g.notes))}</p>` : ''}
<div class="chips">${g.tags.map((t) => `<span class="chip">#${esc(GRAMMAR_TAGS_ZH[t] ?? '其他')}</span>`).join('')}</div>
${related ? `<h2>相关语法点</h2><div class="chips">${related}</div>` : ''}
<p class="muted" style="margin-top:24px"><a href="${reportUrl('Grammar', `${g.pattern} (${level})`)}" rel="noopener">反馈语法条目</a></p>
${jsonBlock(g, `import { getGrammarById } from 'openjlpt';\ngetGrammarById('${g.id}');`)}
${pager(root, list[i - 1] && [grammarPath(list[i - 1]), list[i - 1].pattern], list[i + 1] && [grammarPath(list[i + 1]), list[i + 1].pattern])}`,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Level pages

const cdnBase = 'https://cdn.jsdelivr.net/gh/evanclan/OpenJLPT@main';

/** Filter box, self-test toggles and download links above a level list. */
function listTools(lc: string, kind: 'vocab' | 'grammar', target: string, readings: boolean): string {
  return `<div class="list-tools">
<input class="filter" type="search" placeholder="筛选汉字、假名、罗马音或英文释义…" data-filter="${target}" aria-label="筛选词条">
${kind === 'vocab' ? `<label><input type="checkbox" data-hide="r" data-target="${target}"> 隐藏读音</label>` : ''}
<label><input type="checkbox" data-hide="m" data-target="${target}"> 隐藏释义</label>
<span class="dl">下载：<a href="${cdnBase}/data/csv/${kind}-${lc}.csv">CSV</a> · <a href="${cdnBase}/data/json/${kind}/${lc}.json">JSON</a> · <a href="../downloads/openjlpt-${lc}-${kind}.apkg">Anki 卡组</a></span>
</div>`;
}

const levelBlurb: Record<Level, string> = {
  N5: '入门。学习基础表达、平假名、片假名及常用汉字。',
  N4: '初级。掌握日常生活中常见的会话与表达。',
  N3: '中级。从基础教材过渡到真实语境中的日语。',
  N2: '中高级。学习报刊、商务和一般场景中使用的日语。',
  N1: '高级。理解复杂、抽象及书面语表达。',
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
      title: `JLPT ${level} — ${v.length.toLocaleString('en-US')} 个单词、${k.length} 个汉字、${g.length} 个语法点 | OpenJLPT`,
      description: `JLPT ${level} 学习词库：${v.length} 个单词、${k.length} 个汉字和 ${g.length} 个语法点，附读音、释义与例句。`,
      body: `${crumbs(root, [[`JLPT ${level}`]])}
<h1>JLPT ${level} ${lvl(level)}</h1>
<p class="lead">${levelBlurb[level]}</p>
<div class="grid grid-3" style="margin-top:22px">
<a class="card level-card" href="vocab.html"><div class="big">${v.length.toLocaleString('en-US')}</div><div>单词 →</div><ul><li lang="ja">${v.slice(0, 6).map((x) => esc(x.word)).join('、')}…</li></ul></a>
<a class="card level-card" href="kanji.html"><div class="big">${k.length.toLocaleString('en-US')}</div><div>汉字 →</div><ul><li lang="ja" style="font-size:22px">${k.slice(0, 10).map((x) => esc(x.character)).join(' ')}</li></ul></a>
<a class="card level-card" href="grammar.html"><div class="big">${g.length}</div><div>语法点 →</div><ul><li lang="ja">${g.slice(0, 5).map((x) => esc(x.pattern)).join('、')}…</li></ul></a>
</div>
<div class="btn-row"><a class="btn primary" href="${root}flashcards.html#${level}">使用单词卡学习 ${level}</a><a class="btn" href="${root}data.html">下载 ${level} 数据（JSON / CSV / Anki）</a></div>`,
    });

    writePage({
      path: `${lc}/vocab.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} 单词表 — ${v.length.toLocaleString('en-US')} 个单词，含读音、释义与例句`,
      description: `JLPT ${level} 单词表：${v.length} 个单词，附假名读音、罗马音、释义和例句。`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['单词']])}
<h1>JLPT ${level} 单词 <span class="muted" style="font-size:0.6em">${v.length.toLocaleString('en-US')} 个</span></h1>
${listTools(lc, 'vocab', '#vlist', true)}
<table class="list" id="vlist"><thead><tr><th>单词</th><th class="r">读音</th><th>释义（含英文原文）</th></tr></thead><tbody>
${v.map((x) => `<tr data-s="${esc(`${x.word} ${x.reading} ${x.romaji} ${x.meanings.join(' ')} ${x.meanings.map((m, i) => translation(`vocab.${x.id}.meaning.${i}`, m)).join(' ')}`.toLowerCase())}"><td class="w"><a href="${root}${vocabPath(x)}" lang="ja">${esc(x.word)}</a>${x.word === x.reading ? '' : `<span class="r-m" lang="ja">${esc(x.reading)}</span>`}</td><td class="r" lang="ja"><span>${esc(x.reading)}</span></td><td class="m">${meaningSummary('vocab', x.id, x.meanings)}</td></tr>`).join('\n')}
</tbody></table>`,
    });

    writePage({
      path: `${lc}/kanji.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} 汉字表 — ${k.length} 个汉字，含读音、释义和笔顺`,
      description: `JLPT ${level} 汉字表：${k.length} 个汉字，附音读、训读、释义、笔画、部首、笔顺和例词。`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['汉字']])}
<h1>JLPT ${level} 汉字 <span class="muted" style="font-size:0.6em">${k.length} 个</span></h1>
<p class="muted">按常用程度排序。<a href="${cdnBase}/data/csv/kanji-${lc}.csv">CSV</a> · <a href="${cdnBase}/data/json/kanji/${lc}.json">JSON</a> · <a href="${root}downloads/openjlpt-${lc}-kanji.apkg">Anki 卡组</a></p>
<div class="kanji-grid">${k.map((x) => `<a href="${root}${kanjiPath(x.character)}" title="${esc(x.meanings.slice(0, 3).join(', '))}" lang="ja">${esc(x.character)}<small>${esc(x.meanings[0] ?? '')}${translation(`kanji.${x.character}.meaning.0`, x.meanings[0] ?? '') ? ` · ${esc(translation(`kanji.${x.character}.meaning.0`, x.meanings[0] ?? ''))}` : ''}</small></a>`).join('')}</div>`,
    });

    writePage({
      path: `${lc}/grammar.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} 语法表 — ${g.length} 个语法点及例句`,
      description: `JLPT ${level} 语法表：${g.length} 个语法点，含释义、接续方式、例句和用法说明。`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['语法']])}
<h1>JLPT ${level} 语法 <span class="muted" style="font-size:0.6em">${g.length} 个</span></h1>
${listTools(lc, 'grammar', '#glist', false)}
<ul class="gram-list" id="glist">${g.map((x) => `<li data-s="${esc(`${x.pattern} ${x.reading ?? ''} ${x.romaji} ${x.meaning} ${translation(`grammar.${x.id}.meaning`, x.meaning)} ${x.tags.join(' ')}`.toLowerCase())}"><a href="${root}${grammarPath(x)}"><span class="p" lang="ja">${esc(x.pattern)}</span><span class="m"><span>${esc(x.meaning)}</span>${chineseLine(translation(`grammar.${x.id}.meaning`, x.meaning))}</span></a></li>`).join('')}</ul>`,
    });
  }
}

// ---------------------------------------------------------------------------
// Home and tools

const levelShort: Record<Level, string> = { N5: '入门', N4: '初级', N3: '中级', N2: '中高级', N1: '高级' };

function homePage(): void {
  const c = meta.counts;
  const updated = meta.sources?.jmdict?.created;
  const levelCards = LEVEL_NAMES.map(
    (l) => `<a class="level-link ${l}" href="${l.toLowerCase()}/index.html"><span class="level-mark">${l}</span><span><strong>${levelShort[l]}</strong><small>${c.vocab[l].toLocaleString('en-US')} 词 · ${c.grammar[l]} 个语法点</small></span><span class="level-arrow" aria-hidden="true">›</span></a>`,
  ).join('');
  writePage({
    path: 'index.html',
    title: 'OpenJLPT 日语词典 — 查单词、汉字与 JLPT 语法',
    description: `免费日语学习词典：查询 ${c.vocab.total.toLocaleString('en-US')} 个单词、${c.kanji.total.toLocaleString('en-US')} 个汉字和 ${c.grammar.total} 个 JLPT 语法点，提供读音、释义和例句。`,
    body: `<div class="dictionary-home">
<section class="dict-hero">
<div class="dict-brandline"><span class="dict-mark" aria-hidden="true">日</span><div><p class="dict-kicker">OPENJLPT · 日语学习词典</p><h1>查词、学语法，读懂日语</h1></div></div>
<p class="dict-intro">收录 JLPT N5–N1 单词、汉字与语法，附读音、例句和等级信息。</p>
<div class="dict-panel">
<div class="search-tabs" role="group" aria-label="选择查询类别">
<button type="button" data-kind="v" aria-pressed="true">单词</button>
<button type="button" data-kind="g" aria-pressed="false">语法</button>
<button type="button" data-kind="k" aria-pressed="false">汉字</button>
<button type="button" data-kind="all" aria-pressed="false">全部</button>
</div>
<label class="sr-only" for="q">搜索日语单词、读音、释义或语法</label>
<div class="search dict-search" id="search"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input id="q" type="search" placeholder="输入日文、假名、罗马音或中文释义" autocomplete="off" aria-label="搜索单词、汉字和语法"><button class="search-submit" type="button" aria-label="搜索">搜索</button></div>
<div class="search-hint">试试：<button type="button" data-query="食べる">食べる</button><button type="button" data-query="ありがとう">ありがとう</button><button type="button" data-query="てもいい">てもいい</button><button type="button" data-query="日">日</button></div>
<div class="result-caption" id="result-caption" aria-live="polite">输入关键词，搜索日语词汇、汉字或语法</div>
<ul class="results" id="results" aria-live="polite"></ul>
</div>
<p class="dict-note">词汇与语法释义、例句提供中英文对照。JLPT 等级为社区整理的参考等级。${updated ? ` 数据更新：${updated}。` : ''}</p>
</section>
<aside class="dict-aside">
<section class="aside-card">
<div class="aside-heading"><span>JLPT 分级词库</span><small>由 N5 到 N1</small></div>
<div class="level-links">${levelCards}</div>
<a class="aside-more" href="n5/index.html">浏览全部等级词汇与语法 <span aria-hidden="true">→</span></a>
</section>
<section class="aside-card tools-card">
<div class="aside-heading"><span>学习工具</span><small>继续练习</small></div>
<a class="tool-link" href="flashcards.html"><span class="tool-icon">記</span><span><strong>单词卡片</strong><small>复习单词、汉字和语法</small></span><span class="level-arrow">›</span></a>
<a class="tool-link" href="analyzer.html"><span class="tool-icon">文</span><span><strong>日文等级分析</strong><small>查看文章中的 JLPT 汉字等级</small></span><span class="level-arrow">›</span></a>
</section>
<p class="dict-counts"><strong>${c.vocab.total.toLocaleString('en-US')}</strong> 单词 <i>·</i> <strong>${c.grammar.total}</strong> 个语法点 <i>·</i> <strong>${c.kanji.total.toLocaleString('en-US')}</strong> 个汉字</p>
</aside>
</div>`,
    scripts: ['assets/search.js'],
  });
}

function toolPages(): void {
  writePage({
    path: 'flashcards.html',
    active: 'flashcards.html',
    title: 'JLPT 单词卡 — N5–N1 日语间隔复习 | OpenJLPT',
    description: '使用间隔复习单词卡学习 JLPT N5–N1 单词、汉字和语法，学习进度保存在当前设备。',
    scripts: ['assets/flashcards.js'],
    body: `<div class="fc">
<h1>单词卡片</h1>
<p class="muted">使用间隔复习学习单词、汉字和语法。学习进度仅保存在当前设备。</p>
<div class="btn-row" style="justify-content:center">
<div class="seg" id="fc-level" role="group" aria-label="JLPT 等级">${LEVEL_NAMES.map((l, i) => `<button type="button" data-v="${l}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
<div class="seg" id="fc-kind" role="group" aria-label="学习内容"><button type="button" data-v="vocab" aria-pressed="true">单词</button><button type="button" data-v="kanji" aria-pressed="false">汉字</button><button type="button" data-v="grammar" aria-pressed="false">语法</button></div>
</div>
<div class="fc-progress"><div id="fc-bar"></div></div>
<p class="muted" id="fc-status">正在加载…</p>
<div class="card fc-card" id="fc-card" tabindex="0" aria-live="polite"><div class="fc-front" lang="ja" id="fc-front"></div><div class="fc-back" id="fc-back"></div></div>
<div class="btn-row" style="justify-content:center">
<button class="btn" type="button" id="fc-again">✗ 再复习 <span class="kbd">1</span></button>
<button class="btn" type="button" id="fc-flip">显示答案 <span class="kbd">空格</span></button>
<button class="btn primary" type="button" id="fc-good">✓ 已掌握 <span class="kbd">2</span></button>
</div>
<p><button class="btn" type="button" id="fc-reset" style="font-size:13px;padding:6px 12px">重置当前卡组进度</button></p>
</div>`,
  });

  writePage({
    path: 'analyzer.html',
    active: 'analyzer.html',
    title: '日文等级分析 — 查看文章中的 JLPT 汉字等级 | OpenJLPT',
    description: '粘贴日文，查看文章中每个汉字对应的 JLPT 等级与统计。所有分析均在浏览器本地完成。',
    scripts: ['assets/analyzer.js'],
    body: `<h1>日文等级分析</h1>
<p class="lead">粘贴日文，按 JLPT 等级标记文章中的汉字。点击汉字可查看详细释义。</p>
<textarea class="analyze" id="text" lang="ja" aria-label="日文分析文本">吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。</textarea>
<div class="legend" style="margin-top:12px">${LEVEL_NAMES.map((l) => `<span class="k-${l}"><i style="background:var(--${l.toLowerCase()})"></i>${l}</span>`).join('')}<span><i style="background:var(--none)"></i>未收录于 JLPT 汉字表</span></div>
<div class="bar" id="bar"></div>
<p id="summary" class="muted"></p>
<div class="card"><div class="marked" id="marked" lang="ja"></div></div>
<div class="btn-row"><button class="btn" type="button" id="share">🔗 复制分析链接</button></div>
<p class="muted" style="font-size:14px">等级还会以线条区分：N5 无线条、N4 点线、N3 虚线、N2 实线、N1 双线。本工具只分析汉字，不分析假名和词汇。</p>`,
  });

  const cdn = 'https://cdn.jsdelivr.net/gh/evanclan/OpenJLPT@main';
  writePage({
    path: 'data.html',
    active: 'data.html',
    title: 'JLPT 日语学习数据下载 — JSON、CSV、SQLite、Anki | OpenJLPT',
    description: '下载 JLPT N5–N1 单词、汉字和语法数据，格式包括 JSON、CSV、SQLite 和 Anki。采用 CC BY-SA 4.0 协议。',
    body: `<h1>数据下载与开发接口</h1>
<p class="lead">所有数据均可免费使用，也可用于商业项目，遵循 <a href="${REPO}/blob/main/LICENSE">CC BY-SA 4.0</a> 协议。使用时请注明 OpenJLPT 和<a href="${REPO}/blob/main/NOTICE.md">上游数据来源</a>。</p>
<h2>分级数据</h2>
<table class="list"><thead><tr><th>等级</th><th>单词</th><th>汉字</th><th>语法</th></tr></thead><tbody>
${LEVEL_NAMES.map((l) => {
  const lc = l.toLowerCase();
  return `<tr><td>${lvl(l)}</td>${(['vocab', 'kanji', 'grammar'] as const).map((k) => `<td><a href="${cdn}/data/json/${k}/${lc}.json">JSON</a> · <a href="${cdn}/data/csv/${k}-${lc}.csv">CSV</a></td>`).join('')}</tr>`;
}).join('')}
</tbody></table>
<div class="btn-row"><a class="btn primary" href="${REPO}/releases/latest/download/openjlpt-data.zip">⬇ 下载完整数据：JSON + CSV + SQLite（ZIP）</a><a class="btn" href="${REPO}/raw/main/data/openjlpt.sqlite">⬇ 下载 SQLite 数据库</a></div>
<p class="muted small">也可在程序中读取 CSV 文件：<code>pd.read_csv("${cdn}/data/csv/vocab-n5.csv")</code></p>
<h2 id="anki">Anki 记忆卡组</h2>
<p>下载包含振假名、例句和语音播放的 <a href="https://apps.ankiweb.net/">Anki</a> 卡组。导入新版卡组会更新卡片，同时保留你的复习进度。</p>
<table class="list"><thead><tr><th>等级</th><th>单词</th><th>汉字</th><th>语法</th></tr></thead><tbody>
${LEVEL_NAMES.map((l) => `<tr><td>${lvl(l)}</td>${(['vocab', 'kanji', 'grammar'] as const).map((k) => `<td><a href="downloads/openjlpt-${l.toLowerCase()}-${k}.apkg">⬇ ${meta.counts[k][l].toLocaleString('en-US')} ${k === 'vocab' ? '个单词' : k === 'kanji' ? '个汉字' : '个语法点'}</a></td>`).join('')}</tr>`).join('')}
</tbody></table>
<p><a class="btn primary" href="downloads/openjlpt-complete.apkg">⬇ 下载完整 N5–N1 卡组</a></p>
<h2 id="yomitan">Yomitan 日语词典</h2>
<p>在 <a href="https://yomitan.wiki/">Yomitan</a> 弹出词典中查看单词或汉字的 JLPT 等级：先下载 <a href="downloads/openjlpt-yomitan.zip">⬇ openjlpt-yomitan.zip</a>，再前往 Yomitan 设置中的「词典」导入。数据更新后，可在词典设置中检查更新。</p>
<h2>CDN 在线数据</h2>
<p>使用 jsDelivr CDN 可直接在网页应用中获取数据：</p>
<pre><code>const n5 = await fetch('${cdn}/data/json/vocab/n5.json').then(r =&gt; r.json());</code></pre>
<h2>JavaScript / TypeScript 接口</h2>
<pre><code>npm install openjlpt

import { getVocab, findWord, findKanji, searchVocab, getGrammar } from 'openjlpt';
getVocab('N5');            // ${meta.counts.vocab.N5} 个单词，包含完整类型定义
findKanji('日');           // { strokes: 4, radical: '日', onyomi: ['ニチ','ジツ'], words: [...] }
searchVocab('taberu');     // 支持汉字、假名、罗马音或英文释义搜索
getGrammar('N3');          // ${meta.counts.grammar.N3} 个语法点

npx openjlpt 食べる         # 也可查询汉字、语法，或练习随机测验</code></pre>
<h2>Python 接口</h2>
<pre><code>pip install openjlpt

from openjlpt import get_vocab, find_word, search_vocab, query
find_word("食べる").meanings          # ['to eat'] 单词释义
query("SELECT word, reading FROM vocab WHERE level = 'N5' LIMIT 5")</code></pre>
<h2>SQLite 数据库</h2>
<pre><code>-- 对单词、读音、罗马音及释义进行全文搜索
SELECT v.word, v.reading, v.level
FROM vocab_fts f JOIN vocab v ON v.rowid = f.rowid
WHERE vocab_fts MATCH 'eat';</code></pre>
<h2>数据格式说明</h2>
<p>每个数据文件都会在持续集成中按<a href="${REPO}/tree/main/schema"> JSON Schema</a> 检查。字段说明请参阅<a href="${REPO}#readme">项目文档</a>。</p>
<script type="application/ld+json">${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'OpenJLPT',
  description: `Open JLPT N5–N1 dataset: ${meta.counts.vocab.total} vocabulary words, ${meta.counts.kanji.total} kanji and ${meta.counts.grammar.total} grammar points with readings, meanings, part of speech and example sentences.`,
  url: SITE_URL,
  sameAs: REPO,
  license: 'https://creativecommons.org/licenses/by-sa/4.0/',
  isAccessibleForFree: true,
  version: meta.version,
  creator: { '@type': 'Organization', name: 'OpenJLPT contributors', url: REPO },
  keywords: ['JLPT', 'Japanese', 'vocabulary', 'kanji', 'grammar', 'language learning', 'JMdict', 'Tatoeba'],
  inLanguage: ['ja', 'en'],
  ...(meta.sources?.jmdict?.created ? { dateModified: meta.sources.jmdict.created } : {}),
  citation: `OpenJLPT contributors. OpenJLPT: an open JLPT N5–N1 dataset (version ${meta.version}). ${REPO}`,
  isBasedOn: [
    { '@type': 'Dataset', name: 'JMdict', url: 'https://www.edrdg.org/jmdict/j_jmdict.html' },
    { '@type': 'Dataset', name: 'KANJIDIC2', url: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project' },
    { '@type': 'Dataset', name: 'Tatoeba', url: 'https://tatoeba.org' },
    { '@type': 'Dataset', name: "Jonathan Waller's JLPT lists", url: 'https://www.tanos.co.uk/jlpt/' },
  ],
  distribution: [
    { '@type': 'DataDownload', encodingFormat: 'application/zip', contentUrl: `${REPO}/releases/latest/download/openjlpt-data.zip` },
    ...LEVEL_NAMES.flatMap((l) => [
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${cdnBase}/data/json/vocab/${l.toLowerCase()}.json` },
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${cdnBase}/data/csv/vocab-${l.toLowerCase()}.csv` },
    ]),
    { '@type': 'DataDownload', encodingFormat: 'application/vnd.sqlite3', contentUrl: `${REPO}/raw/main/data/openjlpt.sqlite` },
  ],
})}</script>`,
  });

  writePage({
    path: '404.html',
    title: '页面不存在 | OpenJLPT',
    description: '你访问的页面不存在。',
    noindex: true,
    body: `<h1>页面不存在</h1><p class="lead">你访问的页面不存在，请返回<a href="${SITE_URL}">词典首页</a>重新搜索。</p>`,
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
    // Keep English glosses and example translations paired with their saved Chinese translations.
    w(`vocab-${lc}.json`, vocab.get(level)!.map((v) => [v.id, v.word, v.reading, v.romaji, v.meanings.slice(0, 4).join('; '), v.meanings.map((m, i) => translation(`vocab.${v.id}.meaning.${i}`, m)).filter(Boolean).join('；'), v.examples?.[0]?.furigana ?? v.examples?.[0]?.ja ?? '', v.examples?.[0]?.en ?? '', v.examples?.[0] ? translation(`vocab.${v.id}.example.0`, v.examples[0].en) : '', vocabPath(v)]));
    w(`kanji-${lc}.json`, kanji.get(level)!.map((k) => [k.character, k.character, k.onyomi.join('、'), k.kunyomi.join('、'), k.meanings.slice(0, 4).join(', '), k.meanings.map((m, i) => translation(`kanji.${k.character}.meaning.${i}`, m)).filter(Boolean).join('；'), (k.words ?? []).slice(0, 3).join('、'), kanjiPath(k.character)]));
    w(`grammar-${lc}.json`, grammar.get(level)!.map((g) => [g.id, g.pattern, g.romaji, g.meaning, translation(`grammar.${g.id}.meaning`, g.meaning), g.examples[0]?.ja ?? '', g.examples[0]?.en ?? '', g.examples[0] ? translation(`grammar.${g.id}.example.0`, g.examples[0].en) : '', grammarPath(g)]));
  }
  // Search index: [kind, page path, text, reading, romaji, gloss, level, extra forms/tags]
  const search = [
    ...allVocab.map((v) => ['v', vocabPath(v), v.word, v.reading, v.romaji, truncate(v.meanings.slice(0, 3).join('; '), 80), v.level, (v.other_forms ?? []).join(' '), v.meanings.map((m, i) => translation(`vocab.${v.id}.meaning.${i}`, m)).filter(Boolean).join('; ')]),
    ...allKanji.map((k) => ['k', kanjiPath(k.character), k.character, [...k.onyomi, ...k.kunyomi].join(' '), '', truncate(k.meanings.slice(0, 3).join(', '), 80), k.level, '', k.meanings.map((m, i) => translation(`kanji.${k.character}.meaning.${i}`, m)).filter(Boolean).join(', ')]),
    ...allGrammar.map((g) => ['g', grammarPath(g), g.pattern, g.reading ?? '', g.romaji, truncate(g.meaning, 80), g.level, g.tags.join(' '), translation(`grammar.${g.id}.meaning`, g.meaning)]),
  ];
  w('search.json', search);
  w('kanji-levels.json', Object.fromEntries(allKanji.map((k) => [k.character, k.level])));
}

function writeSeo(): void {
  // Every page is generated from the data, so the data date is when its content last changed.
  const updated = meta.sources?.jmdict?.created;
  writeFileSync(
    join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((u) => `<url><loc>${esc(u.replace(/index\.html$/, ''))}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`,
  );
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
  writeFileSync(join(OUT, '.nojekyll'), '');
}

// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'site', 'assets'), join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'assets', 'og-image.png'), join(OUT, 'assets', 'og-image.png'));
homePage();
levelPages();
vocabPages();
kanjiPages();
grammarPages();
toolPages();
writeData();
writeSeo();
console.log(`Site: ${pages.length} pages -> ${OUT}`);
