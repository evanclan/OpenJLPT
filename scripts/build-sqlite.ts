/**
 * Assemble data/openjlpt.sqlite from the generated per-level JSON files.
 * Array fields (meanings, onyomi, kunyomi) are stored as JSON text.
 */
import { join } from 'node:path';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { DATA_DIR, LEVELS } from './lib/util.ts';

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function build() {
  const out = join(DATA_DIR, 'openjlpt.sqlite');
  if (existsSync(out)) rmSync(out);
  const db = new Database(out);

  db.exec(`
    CREATE TABLE vocab (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL, reading TEXT, meanings TEXT NOT NULL, level TEXT NOT NULL,
      examples TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE kanji (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character TEXT NOT NULL, level TEXT NOT NULL,
      strokes INTEGER, grade INTEGER, freq INTEGER,
      onyomi TEXT NOT NULL, kunyomi TEXT NOT NULL, meanings TEXT NOT NULL
    );
    CREATE INDEX idx_vocab_level ON vocab(level);
    CREATE INDEX idx_vocab_word  ON vocab(word);
    CREATE INDEX idx_kanji_level ON kanji(level);
    CREATE INDEX idx_kanji_char  ON kanji(character);
  `);

  const insV = db.prepare('INSERT INTO vocab (word, reading, meanings, level, examples) VALUES (?,?,?,?,?)');
  const insK = db.prepare(
    'INSERT INTO kanji (character, level, strokes, grade, freq, onyomi, kunyomi, meanings) VALUES (?,?,?,?,?,?,?,?)',
  );

  let nv = 0;
  let nk = 0;
  const tx = db.transaction(() => {
    for (const { level } of LEVELS) {
      const lc = level.toLowerCase();
      for (const v of readJson(join(DATA_DIR, 'json', 'vocab', `${lc}.json`))) {
        insV.run(v.word, v.reading, JSON.stringify(v.meanings), v.level, JSON.stringify(v.examples ?? []));
        nv++;
      }
      for (const k of readJson(join(DATA_DIR, 'json', 'kanji', `${lc}.json`))) {
        insK.run(
          k.character,
          k.level,
          k.strokes,
          k.grade,
          k.freq,
          JSON.stringify(k.onyomi),
          JSON.stringify(k.kunyomi),
          JSON.stringify(k.meanings),
        );
        nk++;
      }
    }
  });
  tx();
  db.exec('VACUUM;');
  db.close();
  console.log(`SQLite: ${nv} vocab + ${nk} kanji -> ${out}`);
}

build();
