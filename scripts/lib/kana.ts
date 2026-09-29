/** Kana helpers: script detection, hiragana/katakana conversion and Hepburn romaji. */

const HIRA_START = 0x3041;
const HIRA_END = 0x3096;
const KATA_OFFSET = 0x60; // ア (U+30A2) - あ (U+3042)

/** Hiragana, katakana (incl. small/extended forms), the long-vowel mark and iteration marks. */
const KANA_RE = /^[ぁ-ゖゝゞァ-ヺーヽヾ]+$/;
const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;

export const isKana = (s: string): boolean => KANA_RE.test(s);
export const hasKanji = (s: string): boolean => KANJI_RE.test(s);

export function toHiragana(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= HIRA_START + KATA_OFFSET && c <= HIRA_END + KATA_OFFSET ? String.fromCodePoint(c - KATA_OFFSET) : ch;
  }
  return out;
}

export function toKatakana(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= HIRA_START && c <= HIRA_END ? String.fromCodePoint(c + KATA_OFFSET) : ch;
  }
  return out;
}

// Modified Hepburn. Two-kana digraphs are listed first so they win over single kana.
const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', しぇ: 'she', じゃ: 'ja', じゅ: 'ju', じょ: 'jo', じぇ: 'je',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', ちぇ: 'che', ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo', ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo', りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  // extended katakana sounds (compared in hiragana form)
  てぃ: 'ti', でぃ: 'di', てゅ: 'tyu', でゅ: 'dyu', とぅ: 'tu', どぅ: 'du',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso', くぁ: 'kwa', ぐぁ: 'gwa', いぇ: 'ye',
};

const MONO: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  ゔ: 'vu', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa', ゕ: 'ka', ゖ: 'ke',
};

/** Fixed expressions where は/へ are read as particles. */
const EXCEPTIONS: Record<string, string> = {
  こんにちは: 'konnichiwa',
  こんばんは: 'konbanwa',
  では: 'dewa',
  じゃあ: 'jaa',
  ではまた: 'dewa mata',
};

/**
 * Convert kana to lowercase modified-Hepburn romaji without macrons
 * (long vowels are spelled out: とうきょう → toukyou, ラーメン → raamen).
 * Non-kana characters are passed through unchanged.
 */
export function toRomaji(kana: string): string {
  const s = toHiragana(kana);
  if (EXCEPTIONS[s]) return EXCEPTIONS[s];
  let out = '';
  let geminate = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === 'っ') {
      geminate = true;
      continue;
    }
    if (ch === 'ー') {
      const m = out.match(/[aeiou]$/);
      if (m) out += m[0];
      continue;
    }
    if (ch === 'ゝ' || ch === 'ゞ') {
      // iteration marks repeat the previous syllable (ゞ voiced) — rare in vocab, approximate
      const prev = s[i - 1];
      if (prev && MONO[prev]) out += MONO[prev];
      continue;
    }
    let syl = DIGRAPHS[s.slice(i, i + 2)];
    if (syl) i++;
    else syl = MONO[ch] ?? ch;
    if (geminate) {
      // っ doubles the next consonant (っち → tchi); at the end of a word it is dropped
      if (/^[a-z]/.test(syl) && !/^[aeioun]/.test(syl)) out += syl.startsWith('ch') ? 't' : syl[0];
      geminate = false;
    }
    if (ch === 'ん') {
      const next = DIGRAPHS[s.slice(i + 1, i + 3)] ?? MONO[s[i + 1]] ?? '';
      out += /^[aeiouy]/.test(next) ? "n'" : 'n';
      continue;
    }
    out += syl;
  }
  return out;
}
