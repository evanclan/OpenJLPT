import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHeadword, parseMeanings, parseReading } from '../../scripts/lib/normalize.ts';
import { isKana, toHiragana, toKatakana, toRomaji } from '../../scripts/lib/kana.ts';

// Every case below is a real card from Waller's decks (sources/waller/).

test('headword: optional-prefix dots are removed', () => {
  assert.deepEqual(parseHeadword('お・金持ち'), { word: 'お金持ち', otherForms: [] });
});

test('headword: slash- and space-separated alternatives', () => {
  assert.deepEqual(parseHeadword('いい/よい'), { word: 'いい', otherForms: ['よい'] });
  assert.deepEqual(parseHeadword('ラジカセ / ラジオカセット'), { word: 'ラジカセ', otherForms: ['ラジオカセット'] });
  assert.deepEqual(parseHeadword('見る 観る'), { word: '見る', otherForms: ['観る'] });
  assert.deepEqual(parseHeadword('より、ほう'), { word: 'より', otherForms: ['ほう'] });
});

test('headword: a shared kana ending is distributed across kanji-only alternatives', () => {
  assert.deepEqual(parseHeadword('堅/硬/固い'), { word: '堅い', otherForms: ['硬い', '固い'] });
  assert.deepEqual(parseHeadword('丸い/円い'), { word: '丸い', otherForms: ['円い'] });
  assert.deepEqual(parseHeadword('伯母さん/叔母さん'), { word: '伯母さん', otherForms: ['叔母さん'] });
});

test('headword: parenthetical cross-references are dropped', () => {
  assert.deepEqual(parseHeadword('あげる (=やる)'), { word: 'あげる', otherForms: [] });
});

test('reading: suru-verb marker is stripped from noun readings', () => {
  assert.equal(parseReading('べんきょうする', '勉強').reading, 'べんきょう');
  assert.equal(parseReading('しゅっせき・する', '出席').reading, 'しゅっせき');
  // ...but not from verbs whose reading genuinely ends in する
  assert.equal(parseReading('こする', '擦る').reading, 'こする');
  assert.equal(parseReading('する', '為る').reading, 'する');
});

test('reading: multiple readings', () => {
  assert.deepEqual(parseReading('なん/なに', '何'), { reading: 'なん', otherReadings: ['なに'] });
  assert.deepEqual(parseReading('じゅう  とお', '十'), { reading: 'じゅう', otherReadings: ['とお'] });
  assert.deepEqual(parseReading('し / よん', '四'), { reading: 'し', otherReadings: ['よん'] });
  assert.deepEqual(parseReading('かねもち/おかねもち', 'お・金持ち'), { reading: 'かねもち', otherReadings: ['おかねもち'] });
});

test('reading: optional okurigana in parentheses is kept', () => {
  assert.equal(parseReading('あたたか(い)', '暖かい').reading, 'あたたかい');
});

test('reading: part-of-speech notes and mojibake are rejected', () => {
  for (const back of ['（感）', '（接。感）', '（1000', '（終わる）', '（メートル）', '（カーペット）', 'Uӣ[い', '']) {
    assert.equal(parseReading(back, 'x').reading, '', back);
  }
});

test('meanings: commas inside parentheses do not split', () => {
  assert.deepEqual(parseMeanings('to take (e.g. time, money, etc),to hang').meanings, [
    'to take (e.g. time, money, etc)',
    'to hang',
  ]);
  assert.deepEqual(parseMeanings('hello,good day (daytime greeting, id)').meanings, [
    'hello',
    'good day (daytime greeting, id)',
  ]);
});

test('meanings: double spaces inside parentheses were commas', () => {
  assert.deepEqual(parseMeanings('arrival (in a country  at work  etc.)').meanings, [
    'arrival (in a country, at work, etc.)',
  ]);
});

test('meanings: numbered senses', () => {
  assert.deepEqual(parseMeanings('(1) one day, (2) first of month').meanings, ['one day', 'first of month']);
  assert.deepEqual(parseMeanings('1.  to thrust;to strike;to attack; 2.  to poke;to nudge;to pick at').meanings, [
    'to thrust',
    'to strike',
    'to attack',
    'to poke',
    'to nudge',
    'to pick at',
  ]);
});

test('meanings: leading part-of-speech codes are removed but register labels kept', () => {
  assert.deepEqual(parseMeanings('(conj,exp,int) Thank you').meanings, ['Thank you']);
  assert.deepEqual(parseMeanings('(humble) to go,to come').meanings, ['(humble) to go', 'to come']);
  assert.deepEqual(parseMeanings('(vulgar) something').meanings, ['(vulgar) something']);
});

test('meanings: a gloss cut off by the 100-character cap is dropped', () => {
  const back = 'unappetising;unpleasant (taste  appearance  situation);ugly;unskilful;awkward;bungling;unwise;untime';
  const m = parseMeanings(back);
  assert.equal(m.truncated, true);
  assert.equal(m.fragment, 'untime');
  assert.equal(m.meanings.at(-1), 'unwise');
  assert.equal(m.meanings[1], 'unpleasant (taste, appearance, situation)');
});

test('meanings: simple lists, duplicates removed', () => {
  assert.deepEqual(parseMeanings('the future,previous').meanings, ['the future', 'previous']);
  assert.deepEqual(parseMeanings('over there').meanings, ['over there']);
  assert.deepEqual(parseMeanings('to eat;to eat').meanings, ['to eat']);
});

test('kana helpers', () => {
  assert.equal(isKana('たべる'), true);
  assert.equal(isKana('アパート'), true);
  assert.equal(isKana('食べる'), false);
  assert.equal(toHiragana('アパート'), 'あぱーと');
  assert.equal(toKatakana('たべる'), 'タベル');
});

test('romaji: modified Hepburn without macrons', () => {
  const cases: [string, string][] = [
    ['たべる', 'taberu'],
    ['とうきょう', 'toukyou'],
    ['がっこう', 'gakkou'],
    ['まっちゃ', 'matcha'],
    ['しんぶん', 'shinbun'],
    ['きんよう', "kin'you"],
    ['れんあい', "ren'ai"],
    ['ラーメン', 'raamen'],
    ['パーティー', 'paatii'],
    ['フォーク', 'fooku'],
    ['ちょっと', 'chotto'],
    ['じゅぎょう', 'jugyou'],
    ['こんにちは', 'konnichiwa'],
  ];
  for (const [kana, romaji] of cases) assert.equal(toRomaji(kana), romaji, kana);
});
