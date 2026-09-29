/**
 * Assemble data/openjlpt.sqlite from the generated per-level JSON files.
 *
 * Array fields (meanings, pos, examples, …) are stored as JSON text — query them
 * with SQLite's JSON functions, e.g. `json_extract(meanings, '$[0]')`.
 * `vocab_fts` is an FTS5 index over word/reading/romaji/meanings:
 *   SELECT v.* FROM vocab_fts f JOIN vocab v ON v.rowid = f.rowid WHERE vocab_fts MATCH 'eat';
 */
import { join } from 'node:path';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { DATA_DIR, LEVELS } from './lib/util.ts';

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const json = (v: unknown) => JSON.stringify(v ?? []);

function build() {
  const out = join(DATA_DIR, 'openjlpt.sqlite');
  if (existsSync(out)) rmSync(out);
  const db = new Database(out);

  db.exec(`
    CREATE TABLE vocab (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL, reading TEXT NOT NULL, romaji TEXT NOT NULL,
      meanings TEXT NOT NULL, level TEXT NOT NULL,
      pos TEXT NOT NULL DEFAULT '[]', jmdict_id INTEGER,
      other_forms TEXT NOT NULL DEFAULT '[]', other_readings TEXT NOT NULL DEFAULT '[]',
      examples TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE kanji (
      character TEXT PRIMARY KEY, level TEXT NOT NULL,
      strokes INTEGER, grade INTEGER, freq INTEGER, radical TEXT, radical_number INTEGER,
      onyomi TEXT NOT NULL, kunyomi TEXT NOT NULL, nanori TEXT NOT NULL DEFAULT '[]',
      meanings TEXT NOT NULL, words TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE grammar (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL, reading TEXT, romaji TEXT NOT NULL, level TEXT NOT NULL,
      meaning TEXT NOT NULL, formation TEXT NOT NULL,
      examples TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]', notes TEXT
    );
    CREATE TABLE pos (code TEXT PRIMARY KEY, description TEXT NOT NULL);
    CREATE INDEX idx_vocab_level ON vocab(level);
    CREATE INDEX idx_vocab_word ON vocab(word);
    CREATE INDEX idx_vocab_reading ON vocab(reading);
    CREATE INDEX idx_vocab_jmdict ON vocab(jmdict_id);
    CREATE INDEX idx_kanji_level ON kanji(level);
    CREATE INDEX idx_grammar_level ON grammar(level);
    CREATE INDEX idx_grammar_pattern ON grammar(pattern);
    CREATE VIRTUAL TABLE vocab_fts USING fts5(word, reading, romaji, meanings, content='vocab', content_rowid='rowid');
  `);

  const insV = db.prepare(
    `INSERT INTO vocab (id, word, reading, romaji, meanings, level, pos, jmdict_id, other_forms, other_readings, examples)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insK = db.prepare(
    `INSERT INTO kanji (character, level, strokes, grade, freq, radical, radical_number, onyomi, kunyomi, nanori, meanings, words)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insG = db.prepare(
    `INSERT INTO grammar (id, pattern, reading, romaji, level, meaning, formation, examples, tags, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const insP = db.prepare('INSERT INTO pos (code, description) VALUES (?, ?)');

  let nv = 0;
  let nk = 0;
  let ng = 0;
  db.transaction(() => {
    for (const { level } of LEVELS) {
      const lc = level.toLowerCase();
      for (const v of readJson(join(DATA_DIR, 'json', 'vocab', `${lc}.json`))) {
        insV.run(v.id, v.word, v.reading, v.romaji, json(v.meanings), v.level, json(v.pos), v.jmdict_id ?? null,
          json(v.other_forms), json(v.other_readings), json(v.examples));
        nv++;
      }
      for (const k of readJson(join(DATA_DIR, 'json', 'kanji', `${lc}.json`))) {
        insK.run(k.character, k.level, k.strokes, k.grade, k.freq, k.radical, k.radical_number,
          json(k.onyomi), json(k.kunyomi), json(k.nanori), json(k.meanings), json(k.words));
        nk++;
      }
      for (const g of readJson(join(DATA_DIR, 'json', 'grammar', `${lc}.json`))) {
        insG.run(g.id, g.pattern, g.reading ?? null, g.romaji, g.level, g.meaning, g.formation,
          json(g.examples), json(g.tags), g.notes ?? null);
        ng++;
      }
    }
    for (const [code, description] of Object.entries(readJson(join(DATA_DIR, 'json', 'pos.json')))) {
      insP.run(code, description);
    }
  })();
  // FTS indexes meanings as plain text ("to eat to have a meal") rather than JSON.
  db.exec(`
    INSERT INTO vocab_fts(rowid, word, reading, romaji, meanings)
      SELECT rowid, word, reading, romaji, (SELECT group_concat(value, '; ') FROM json_each(vocab.meanings)) FROM vocab;
  `);
  db.exec('VACUUM;');
  db.close();
  console.log(`SQLite: ${nv} vocab + ${nk} kanji + ${ng} grammar -> ${out}`);
}

build();
