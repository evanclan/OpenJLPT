<div align="center">

<img src="https://raw.githubusercontent.com/evanclan/OpenJLPT/main/assets/logo-160.png" width="88" height="88" alt="OpenJLPT のロゴ">

# OpenJLPT

**JLPT（日本語能力試験）N5〜N1 の学習用リストにある語彙・漢字・文法を、JMdict で検証して整えた無料のオープンデータ**

<!-- counts:line -->語彙 7,811 語 · 漢字 2,383 字 · 文法 526 項目 · 語彙の 93% にふりがなつき例文<!-- /counts:line --><br>
**JSON**・**CSV**・**SQLite**・**Anki デッキ**・**Yomitan** 辞書、**npm** / **PyPI** パッケージで提供しています。

[![CI](https://github.com/evanclan/OpenJLPT/actions/workflows/ci.yml/badge.svg)](https://github.com/evanclan/OpenJLPT/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/openjlpt?color=cb3837&label=npm)](https://www.npmjs.com/package/openjlpt)
[![PyPI](https://img.shields.io/pypi/v/openjlpt?color=3775a9)](https://pypi.org/project/openjlpt/)
[![License: CC BY-SA 4.0](https://img.shields.io/badge/license-CC%20BY--SA%204.0-blue.svg)](./LICENSE)

**[🌐 ウェブサイト](https://evanclan.github.io/OpenJLPT/)** ·
**[🃏 Anki デッキ](https://evanclan.github.io/OpenJLPT/data.html#anki)** ·
**[English](./README.md)**

<img src="https://raw.githubusercontent.com/evanclan/OpenJLPT/main/assets/demo.png" width="860" alt="OpenJLPT の単語ページ（勉強）。例文にはふりがなが付き、右は漢字を JLPT レベル別に色分けする判定ツール">

</div>

> [!NOTE]
> 2010 年以降、JLPT は公式の語彙・漢字・文法リストを公開していません。語彙と漢字のレベルは、Jisho.org
> なども採用している [Jonathan Waller 氏のリスト](https://www.tanos.co.uk/jlpt/)に基づく目安です。

---

## 特長

- ✅ **学習リストを一通り**: 定番の学習用リストにある N5〜N1 の語彙・漢字と、文法 526 項目を収録しています。
- ✅ **クリーン**: 全語彙を [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) の見出しと照合し（99.7%）、品詞と辞書 ID を付けました。元データにあった読みの誤りや文字化けなど、数百件を修正しています。
- ✅ **本物の例文**: 語彙の <!-- counts:examples -->93%<!-- /counts:examples --> に [Tatoeba](https://tatoeba.org) の例文を付けています。辞書形で照合するので、「読む」で「読んでいる」を含む文も見つかります。例文の約 9 割には、すべての漢字にふりがなが付いています。
- ✅ **文法 526 項目**: 意味・接続・例文 2〜3 文・類似表現との違いを、オリジナルの文章で解説しています。
- ✅ **すぐ使える**: JSON、CSV、SQLite（全文検索つき）、Anki、Yomitan、npm、PyPI、CLI、CDN に対応しています。
- ✅ **安定 ID**: 各項目に更新後も変わらない `id` を付けています。学習アプリの進捗管理にそのまま使えます。
- ✅ **明確なライセンス**: CC BY-SA 4.0 です。各データの出典は [NOTICE](./NOTICE.md) にまとめています。

## 収録数

<!-- counts:table -->
| レベル | 語彙 | 漢字 | 文法 |
|:---:|---:|---:|---:|
| **N5** | 674 | 84 | 81 |
| **N4** | 630 | 169 | 98 |
| **N3** | 1,659 | 387 | 101 |
| **N2** | 1,778 | 398 | 123 |
| **N1** | 3,070 | 1,345 | 123 |
| **合計** | **7,811** | **2,383** | **526** |
<!-- /counts:table -->

## 使い方

### プログラミング不要

- **[ウェブサイト](https://evanclan.github.io/OpenJLPT/)**: 語彙・漢字・文法ごとのページに加えて、検索、フラッシュカード、「この文章は何級？」判定ツールがあります。
- **[Anki デッキ](https://evanclan.github.io/OpenJLPT/data.html#anki)**: レベル別のデッキです。ふりがな・例文・読み上げに対応しています。
- **[Yomitan 辞書](https://evanclan.github.io/OpenJLPT/data.html#yomitan)**: ポップアップ辞書で、語彙と漢字の JLPT レベルを表示します。データ更新時は Yomitan から自動で更新できます。

### CDN（インストール不要）

```js
const n5 = await fetch('https://cdn.jsdelivr.net/gh/evanclan/OpenJLPT@main/data/json/vocab/n5.json').then((r) => r.json());
```

### JavaScript / TypeScript

```ts
// npm install openjlpt
import { findWord, findKanji, searchVocab, getGrammar } from 'openjlpt';

findWord('食べる');      // { reading: 'たべる', level: 'N5', pos: ['v1', 'vt'], examples: [...] }
findKanji('日');         // { strokes: 4, radical: '日', onyomi: ['ニチ', 'ジツ'], ... }
searchVocab('たべる');   // 漢字・かな・ローマ字・英語で検索できます
getGrammar('N3');        // N3 の文法 101 項目
```

### Python

```python
# pip install openjlpt
from openjlpt import find_word, query

find_word("食べる").meanings   # ['to eat']
query("SELECT word, reading FROM vocab WHERE level = 'N5' LIMIT 5")
```

### コマンドライン

```console
$ npx openjlpt 食べる
$ npx openjlpt kanji 日
$ npx openjlpt quiz N4      # ターミナルで読みクイズ
```

## JLPT のレベルについて

国際交流基金は、現行の JLPT について公式の語彙・漢字・文法リストを公開していません。
語彙と漢字のレベルは、Jisho.org でも使われている
[Jonathan Waller 氏のリスト](https://www.tanos.co.uk/jlpt/)（コミュニティの標準）に基づきます。
文法のレベルは主要な JLPT 対策教材の傾向に合わせています。いずれも目安としてご利用ください。

## 貢献

読みの誤りやレベルの違和感など、お気づきの点があれば
[Issue](https://github.com/evanclan/OpenJLPT/issues/new/choose) でお知らせください。
文法の説明や例文の改善も歓迎します。詳しくは [CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

役に立ったら ⭐ をお願いします。ほかの学習者や開発者に届きやすくなります。

## ライセンス

データとコードは **[CC BY-SA 4.0](./LICENSE)** です。商用利用もできますが、クレジットの表示と同じライセンスでの共有が必要です。
JMdict・KANJIDIC2（EDRDG）、Jonathan Waller 氏、Tatoeba のクレジットは [NOTICE.md](./NOTICE.md) に記載しています。
