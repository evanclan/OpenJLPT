import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignReading, annotate, stripFurigana, surfaceRuby, toNotation } from '../../scripts/lib/furigana.ts';
import { parseBLine } from '../../scripts/lib/examples.ts';

// A tiny stand-in for the JMdict lookup the build uses.
const READINGS: Record<string, string> = { 本: 'ほん', 読む: 'よむ', 毎日: 'まいにち', 雨: 'あめ', 降る: 'ふる', 来る: 'くる', 見る: 'みる', 時間: 'じかん', 勉強: 'べんきょう' };
const read = (w: string) => READINGS[w];
const ruby = (ja: string, bline: string) => annotate(ja, parseBLine(bline), read);

test('alignReading splits a word into kanji runs and kana', () => {
  assert.equal(toNotation(alignReading('食べる', 'たべる')!), '{食|た}べる');
  assert.equal(toNotation(alignReading('取り扱い', 'とりあつかい')!), '{取|と}り{扱|あつか}い');
  assert.equal(toNotation(alignReading('日本', 'にほん')!), '{日本|にほん}');
  assert.equal(toNotation(alignReading('ビール瓶', 'びーるびん')!), 'ビール{瓶|びん}');
  assert.equal(alignReading('食べる', 'のむ'), undefined); // doesn't fit
});

test('conjugated forms keep the kanji reading of the dictionary form', () => {
  assert.equal(toNotation(surfaceRuby('読む', 'よむ', '読んでいる')!), '{読|よ}んでいる');
  assert.equal(toNotation(surfaceRuby('見る', 'みる', 'みなさい')!), 'みなさい');
  assert.equal(surfaceRuby('読む', 'よむ', '詠んだ'), undefined); // different kanji
});

test('来る changes its reading with the ending', () => {
  assert.equal(toNotation(surfaceRuby('来る', 'くる', '来ない')!), '{来|こ}ない');
  assert.equal(toNotation(surfaceRuby('来る', 'くる', '来ました')!), '{来|き}ました');
  assert.equal(toNotation(surfaceRuby('来る', 'くる', '来る')!), '{来|く}る');
});

test('sentences are annotated from their B-line', () => {
  assert.equal(ruby('彼は本を読んでいる。', '彼(かれ) は 本 を 読む{読んでいる}~'), '{彼|かれ}は{本|ほん}を{読|よ}んでいる。');
  assert.equal(ruby('毎日雨が降った。', '毎日 雨 が 降る{降った}'), '{毎日|まいにち}{雨|あめ}が{降|ふ}った。');
  assert.equal(stripFurigana('{彼|かれ}は{本|ほん}を{読|よ}んでいる。'), '彼は本を読んでいる。');
});

test('no furigana when any kanji is uncertain', () => {
  // 東京 is not in the index line, so part of the sentence is unaccounted for.
  assert.equal(ruby('東京で本を読む。', '本 を 読む'), undefined);
  // No reading known for 蚊.
  assert.equal(ruby('蚊がいる。', '蚊 が 居る{いる}'), undefined);
  // A numeral before a counter may change its sound (三本 さんぼん).
  assert.equal(annotate('三本ある。', parseBLine('三(さん) 本(ほん) 有る{ある}'), read), undefined);
});
