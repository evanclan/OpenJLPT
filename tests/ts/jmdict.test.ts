import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JmdictIndex, bestFit, parseJmdict, stems } from '../../scripts/lib/jmdict.ts';

// Trimmed copies of real JMdict entries.
const XML = `<JMdict>
<entry><ent_seq>1293700</ent_seq>
<k_ele><keb>最も</keb><ke_pri>ichi1</ke_pri><ke_pri>news1</ke_pri><ke_pri>nf01</ke_pri></k_ele>
<k_ele><keb>尤も</keb></k_ele>
<r_ele><reb>もっとも</reb><re_pri>ichi1</re_pri><re_pri>news1</re_pri><re_pri>nf01</re_pri></r_ele>
<sense><pos>&adv;</pos><gloss>most</gloss><gloss>extremely</gloss></sense></entry>
<entry><ent_seq>1535810</ent_seq>
<k_ele><keb>尤も</keb><ke_pri>ichi1</ke_pri></k_ele>
<r_ele><reb>もっとも</reb><re_pri>ichi1</re_pri></r_ele>
<sense><pos>&conj;</pos><misc>&uk;</misc><gloss>but then</gloss><gloss>although</gloss><gloss>though</gloss></sense>
<sense><pos>&adj-na;</pos><misc>&uk;</misc><gloss>reasonable</gloss><gloss>natural</gloss><gloss>just</gloss></sense></entry>
<entry><ent_seq>1206100</ent_seq>
<k_ele><keb>角</keb><ke_pri>ichi1</ke_pri></k_ele>
<r_ele><reb>かく</reb><re_pri>ichi1</re_pri></r_ele>
<sense><pos>&n;</pos><gloss>angle</gloss></sense>
<sense><gloss>Chinese "horn" constellation</gloss></sense></entry>
<entry><ent_seq>1206120</ent_seq>
<k_ele><keb>角</keb><ke_pri>ichi1</ke_pri></k_ele>
<r_ele><reb>つの</reb><re_pri>ichi1</re_pri></r_ele>
<sense><pos>&n;</pos><gloss>horn</gloss><gloss>antler</gloss></sense></entry>
</JMdict>`;

const { entries } = parseJmdict(XML);
const index = new JmdictIndex(entries);

test('match: a rare spelling does not borrow the common word\'s priority', () => {
  // 尤も is listed (untagged) under 最も, but the card's glosses describe 尤も's own entry.
  const m = index.match({ word: '尤も', reading: 'もっとも', meanings: ['quite right', 'plausible', 'natural', 'but then', 'although'] });
  assert.equal(m?.entry.seq, 1535810);
});

test('bestFit: ties go to the entry whose first sense fits', () => {
  const fit = bestFit(index.entriesWithKanji('角'), stems(['horn']));
  assert.equal(fit?.e.seq, 1206120); // つの, not かく's constellation sense
  assert.equal(bestFit(index.entriesWithKanji('角'), stems(['bicycle'])), undefined);
});
