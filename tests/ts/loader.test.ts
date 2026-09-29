import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findGrammar,
  findKanji,
  findWord,
  findWords,
  getGrammar,
  getGrammarById,
  getKanji,
  getVocab,
  getVocabById,
  kanjiIn,
  levels,
  meta,
  normalize,
  posLabels,
  sample,
  searchGrammar,
  searchVocab,
} from '../../src/index.ts';

test('levels are ordered beginner → advanced', () => {
  assert.deepEqual(levels, ['N5', 'N4', 'N3', 'N2', 'N1']);
});

test('counts agree with meta.json', () => {
  const m = meta();
  for (const l of levels) {
    assert.equal(getVocab(l).length, m.counts.vocab[l]);
    assert.equal(getKanji(l).length, m.counts.kanji[l]);
    assert.equal(getGrammar(l).length, m.counts.grammar[l]);
  }
  assert.equal(getVocab().length, m.counts.vocab.total);
});

test('every word has an id, a kana reading and romaji', () => {
  const kana = /^[ぁ-ゖゝゞァ-ヺーヽヾ]+$/;
  for (const v of getVocab()) {
    assert.match(v.id, /^[0-9a-f]{10}$/);
    assert.match(v.reading, kana, `${v.word} reading ${v.reading}`);
    assert.ok(v.romaji.length > 0);
  }
});

test('findWord: 食べる', () => {
  const v = findWord('食べる');
  assert.ok(v);
  assert.equal(v.reading, 'たべる');
  assert.equal(v.romaji, 'taberu');
  assert.equal(v.level, 'N5');
  assert.ok(v.meanings.includes('to eat'));
  assert.ok(v.pos?.includes('v1'));
  assert.equal(getVocabById(v.id), v);
});

test('findWord matches alternative spellings; kana words read as themselves', () => {
  assert.equal(findWord('よい')?.word, 'いい');
  const asatte = findWord('明後日');
  assert.equal(asatte?.word, 'あさって');
  assert.equal(asatte?.reading, 'あさって');
  assert.equal(findWord('notaword'), undefined);
  assert.deepEqual(findWords('notaword'), []);
});

test('suru-nouns read without する (勉強 → べんきょう)', () => {
  assert.equal(findWord('勉強')?.reading, 'べんきょう');
});

test('findKanji: 日', () => {
  const k = findKanji('日');
  assert.ok(k);
  assert.equal(k.level, 'N5');
  assert.equal(k.strokes, 4);
  assert.equal(k.radical, '日');
  assert.equal(k.radical_number, 72);
  assert.ok(k.onyomi.includes('ニチ'));
  assert.ok(k.words && k.words.length > 0);
  for (const w of k.words ?? []) assert.ok(w.includes('日'));
});

test('kanjiIn lists JLPT kanji in order of appearance', () => {
  assert.deepEqual(kanjiIn('日本語を勉強する日').map((k) => k.character), ['日', '本', '語', '勉', '強']);
});

test('searchVocab ranks exact matches first across scripts', () => {
  assert.equal(searchVocab('たべる')[0].word, '食べる');
  assert.equal(searchVocab('タベル')[0].word, '食べる');
  assert.equal(searchVocab('taberu')[0].word, '食べる');
  assert.equal(searchVocab('食べる')[0].word, '食べる');
  assert.ok(searchVocab('eat', 'N5').some((v) => v.word === '食べる'));
  assert.equal(searchVocab('eat', { level: 'N5', limit: 3 }).length <= 3, true);
  assert.deepEqual(searchVocab('   '), []);
});

test('grammar: ids, lookup and search', () => {
  const ids = new Set(getGrammar().map((g) => g.id));
  assert.equal(ids.size, getGrammar().length);
  const g = findGrammar('〜てもいい')[0];
  assert.ok(g);
  assert.equal(getGrammarById(g.id), g);
  assert.ok(g.examples.length >= 2);
  assert.ok(searchGrammar('permission').some((x) => x.tags.includes('permission')));
  assert.ok(searchGrammar('ni taishite').length >= 1);
});

test('posLabels describes every code in use', () => {
  const labels = posLabels();
  for (const v of getVocab()) for (const p of v.pos ?? []) assert.ok(labels[p], p);
});

test('normalize and sample', () => {
  assert.equal(normalize(' カタカナ '), 'かたかな');
  const items = [1, 2, 3, 4, 5];
  const s = sample(items, 3);
  assert.equal(s.length, 3);
  assert.equal(new Set(s).size, 3);
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
  assert.equal(sample(items, 10).length, 5);
});
