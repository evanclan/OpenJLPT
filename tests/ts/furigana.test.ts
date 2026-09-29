import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignReading, annotate, stripFurigana, surfaceRuby, toNotation } from '../../scripts/lib/furigana.ts';
import { parseBLine } from '../../scripts/lib/examples.ts';

// A tiny stand-in for the JMdict lookups the build uses.
const READINGS: Record<string, string> = {
  本: 'ほん', 読む: 'よむ', 毎日: 'まいにち', 雨: 'あめ', 降る: 'ふる', 来る: 'くる', 見る: 'みる', 時間: 'じかん', 勉強: 'べんきょう',
  会社: 'かいしゃ', 旅行: 'りょこう', 人: 'ひと', 頃: 'ころ', 三: 'さん', 時: 'じ', 行く: 'いく',
};
const POS: Record<string, string[]> = {
  読む: ['v5m'], 降る: ['v5r'], 来る: ['vk'], 見る: ['v1'], 勉強: ['n', 'vs'], 食べる: ['v1'], 行う: ['v5u'], 生まれる: ['v1'],
  終わる: ['v5r'], 表す: ['v5s'], 少ない: ['adj-i'], 話: ['n'], 書く: ['v5k'], 高い: ['adj-i'], 行く: ['v5k-s'],
};
const lex = {
  reading: (w: string) => READINGS[w],
  affixReadings: (w: string, kind: string) => (w === '車' && kind === 'suffix' ? ['しゃ'] : []),
  pos: (w: string) => POS[w] ?? ['n'],
};
const ruby = (ja: string, bline: string) => annotate(ja, parseBLine(bline), lex);
const surface = (w: string, r: string, s: string) => {
  const seg = surfaceRuby(w, r, s, POS[w] ?? ['n']);
  return seg && toNotation(seg);
};

test('alignReading splits a word into kanji runs and kana', () => {
  assert.equal(toNotation(alignReading('食べる', 'たべる')!), '{食|た}べる');
  assert.equal(toNotation(alignReading('取り扱い', 'とりあつかい')!), '{取|と}り{扱|あつか}い');
  assert.equal(toNotation(alignReading('日本', 'にほん')!), '{日本|にほん}');
  assert.equal(toNotation(alignReading('ビール瓶', 'びーるびん')!), 'ビール{瓶|びん}');
  assert.equal(alignReading('食べる', 'のむ'), undefined); // doesn't fit
});

test('conjugated forms keep the kanji reading of the dictionary form', () => {
  assert.equal(surface('読む', 'よむ', '読んでいる'), '{読|よ}んでいる');
  assert.equal(surface('食べる', 'たべる', '食べさせた'), '{食|た}べさせた');
  assert.equal(surface('書く', 'かく', '書いて'), '{書|か}いて');
  assert.equal(surface('行く', 'いく', '行った'), '{行|い}った');
  assert.equal(surface('高い', 'たかい', '高かった'), '{高|たか}かった');
  assert.equal(surface('勉強', 'べんきょう', '勉強して'), '{勉強|べんきょう}して');
  assert.equal(surface('見る', 'みる', 'みなさい'), 'みなさい');
  assert.equal(surface('読む', 'よむ', '詠んだ'), undefined); // different kanji
});

test('spelling variants are not mistaken for conjugations', () => {
  assert.equal(surface('行う', 'おこなう', '行なって'), undefined); // not おこな+なって
  assert.equal(surface('生まれる', 'うまれる', '生れた'), undefined);
  assert.equal(surface('終わる', 'おわる', '終った'), undefined);
  assert.equal(surface('表す', 'あらわす', '表わす'), undefined);
  assert.equal(surface('少ない', 'すくない', '少い'), undefined);
  assert.equal(surface('話', 'はなし', '話し'), undefined);
});

test('verbs whose kanji reading changes with the ending', () => {
  assert.equal(surface('来る', 'くる', '来ない'), '{来|こ}ない');
  assert.equal(surface('来る', 'くる', '来ました'), '{来|き}ました');
  assert.equal(surface('来る', 'くる', '来る'), '{来|く}る');
  assert.equal(surface('来る', 'くる', '来まい'), undefined);
  assert.equal(surface('有り得る', 'ありうる', '有り得ない'), undefined); // ありえない
});

test('sentences are annotated from their B-line', () => {
  assert.equal(ruby('彼は本を読んでいる。', '彼(かれ) は 本 を 読む{読んでいる}~'), '{彼|かれ}は{本|ほん}を{読|よ}んでいる。');
  assert.equal(ruby('毎日、雨が降った。', '毎日 雨 が 降る{降った}'), '{毎日|まいにち}、{雨|あめ}が{降|ふ}った。');
  assert.equal(stripFurigana('{彼|かれ}は{本|ほん}を{読|よ}んでいる。'), '彼は本を読んでいる。');
});

test('no furigana when any kanji is uncertain', () => {
  // 東京 is not in the index line, so part of the sentence is unaccounted for.
  assert.equal(ruby('東京で本を読む。', '本 を 読む'), undefined);
  // No reading known for 蚊.
  assert.equal(ruby('蚊がいる。', '蚊 が 居る{いる}'), undefined);
  // Brackets (Anki's furigana syntax) are left alone.
  assert.equal(ruby('本[注]を読む。', '本 を 読む'), undefined);
});

test('numbers, counters and compounds that change sounds are left unannotated', () => {
  assert.equal(ruby('三本ある。', '三(さん) 本(ほん) 有る{ある}'), undefined); // さんぼん
  assert.equal(ruby('１０本ある。', '本(ほん) 有る{ある}'), undefined); // じっぽん
  assert.equal(ruby('三センチある。', '三(さん) センチ 有る{ある}'), undefined); // さんセンチ is fine, but 一センチ is いっ
  assert.equal(ruby('旅行会社に行った。', '旅行 会社 に 行く{行った}'), undefined); // がいしゃ
  assert.equal(ruby('ブラジル人です。', '人 です'), undefined); // じん
  assert.equal(ruby('３時頃来た。', '時 頃(ころ) 来る{来た}'), undefined); // ごろ
  // A lone kanji inside a compound may read differently there (新型車 しんがたしゃ).
  const car = { ...lex, reading: (w: string) => ({ ...READINGS, 新型: 'しんがた', 車: 'くるま' })[w] };
  assert.equal(annotate('新型車を見た。', parseBLine('新型 車 を 見る{見た}'), car), undefined);
  assert.equal(annotate('車を見た。', parseBLine('車 を 見る{見た}'), car), '{車|くるま}を{見|み}た。');
  // Words joined without a voiceable first sound are still fine.
  assert.equal(ruby('毎日雨が降った。', '毎日 雨 が 降る{降った}'), '{毎日|まいにち}{雨|あめ}が{降|ふ}った。');
});
