import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const CACHE_DIR = join(ROOT, '.cache');
export const DATA_DIR = join(ROOT, 'data');

/** JLPT levels. `tanos` is the legacy number used in tanos.co.uk URLs/filenames. */
export const LEVELS = [
  { level: 'N5', tanos: 5 },
  { level: 'N4', tanos: 4 },
  { level: 'N3', tanos: 3 },
  { level: 'N2', tanos: 2 },
  { level: 'N1', tanos: 1 },
] as const;

export type Level = (typeof LEVELS)[number]['level'];

/** Download a URL to `dest` unless it already exists (or `force`). */
export async function download(url: string, dest: string, force = false): Promise<void> {
  const { existsSync } = await import('node:fs');
  if (!force && existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

/**
 * Read an old-format Anki (.anki) SQLite deck and reconstruct each "fact" as a
 * map of {fieldModelName -> value}. Field-model and fact IDs are 64-bit integers
 * that overflow JS Number precision, so we CAST them to TEXT in SQL.
 */
export function readAnkiFacts(path: string): Record<string, string>[] {
  const db = new Database(path, { readonly: true });
  try {
    const models = new Map<string, string>();
    for (const r of db.prepare('SELECT CAST(id AS TEXT) id, name FROM fieldModels').all() as any[]) {
      models.set(r.id, r.name);
    }
    const facts = new Map<string, Record<string, string>>();
    const rows = db
      .prepare('SELECT CAST(factId AS TEXT) factId, CAST(fieldModelId AS TEXT) fieldModelId, value FROM fields')
      .all() as any[];
    for (const r of rows) {
      const name = models.get(r.fieldModelId);
      if (!name) continue;
      let f = facts.get(r.factId);
      if (!f) {
        f = {};
        facts.set(r.factId, f);
      }
      f[name] = r.value ?? '';
    }
    return [...facts.values()];
  } finally {
    db.close();
  }
}

/** Waller uses a middle-dot (・) to mark optional okurigana/prefixes; strip it for a clean headword. */
export function cleanTerm(s: string): string {
  return (s ?? '').replace(/・/g, '').replace(/\s+/g, ' ').trim();
}

/** Split an English gloss cell into individual meanings. */
export function splitMeanings(s: string): string[] {
  return (s ?? '')
    .split(/[,;/]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

/** Minimal RFC-4180 CSV writer. */
export function writeCsv(path: string, headers: string[], rows: (string | number | null)[][]): void {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
}
