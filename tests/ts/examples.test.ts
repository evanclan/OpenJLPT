import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ExampleIndex, parseBLine } from '../../scripts/lib/examples.ts';

const dir = fileURLToPath(new URL('./fixtures/tatoeba', import.meta.url));
const index = new ExampleIndex(new Map(['本', '読', '毎', '日', '見', '何', '時', '間', '勉', '強', '三'].map((k) => [k, 'N5'])), dir);

test('B-line tokens: headword, reading, sense, surface form and checked flag', () => {
  assert.deepEqual(parseBLine('彼(かれ)[01]{彼の}~ 読む{読んでいる}'), [
    { headword: '彼', reading: 'かれ', sense: 1, surface: '彼の', checked: true },
    { headword: '読む', reading: undefined, sense: undefined, surface: '読んでいる', checked: false },
  ]);
});

test('conjugated uses are found through the dictionary form, checked examples first', () => {
  const ex = index.find({ forms: ['読む'], readings: ['よむ'], level: 'N5' }, 3);
  assert.equal(ex[0].ja, '彼は本を読んでいる。');
  assert.equal(ex[0].tatoeba_id, 103);
  assert.equal(ex.length, 3);
});

test('no false substring hits (あれ inside であれ)', () => {
  // The build passes JMdict's kanji forms too: あれ is JMdict 彼/彼れ.
  const ex = index.find({ forms: ['あれ', '彼', '彼れ'], readings: ['あれ'], level: 'N5' });
  assert.deepEqual(ex.map((e) => e.ja), ['あれは何ですか。']);
});

test('explicit readings in the index disambiguate homographs', () => {
  assert.deepEqual(index.find({ forms: ['一日'], readings: ['いちにち'], level: 'N5' }), []);
  assert.equal(index.find({ forms: ['一日'], readings: ['ついたち'], level: 'N5' })[0].ja, '一日は晴れでした。');
});

test('kana readings are not looked up for kanji words (蚊 ≠ the particle か)', () => {
  const ex = index.find({ forms: ['蚊'], readings: ['か'], level: 'N5' }, 3);
  assert.deepEqual(ex.map((e) => e.ja), ['これは蚊ではないか。']);
});

test('substring fallback respects kanji word boundaries (分母 is not in 充分母乳)', () => {
  const ex = index.find({ forms: ['分母'], readings: ['ぶんぼ'], level: 'N1' }, 3);
  assert.deepEqual(ex.map((e) => e.ja), ['分母を計算しなさい。']);
});

test('crude translations are filtered out', () => {
  assert.deepEqual(index.find({ forms: ['あっち'], readings: ['あっち'], level: 'N5' }), []);
});

test('near-duplicate sentences are not both chosen', () => {
  const ex = index.find({ forms: ['勉強'], readings: ['べんきょう'], level: 'N5' }, 3);
  const ja = ex.map((e) => e.ja);
  assert.equal(ja.includes('あなたは何時間勉強していますか。') && ja.includes('あなたは２時間勉強していますか。'), false);
  assert.ok(ja.includes('毎日三時間勉強します。'));
});

test('sentences that write the word in kanji are preferred', () => {
  assert.equal(index.find({ forms: ['見る'], readings: ['みる'], level: 'N5' })[0].ja, 'テレビを見ます。');
});
