import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, LEVELS } from './lib/util.ts';

interface Example { ja: string; en: string }
interface Vocab { id: string; meanings: string[]; examples?: Example[] }
interface Kanji { character: string; meanings: string[] }
interface Grammar {
  id: string;
  meaning: string;
  formation: string;
  notes?: string;
  examples: Example[];
}
interface Translation { source: string; translation: string }
interface Task { key: string; source: string; context?: string }
interface ChatCompletion { choices?: { message?: { content?: string } }[]; error?: { message?: string } }

const STORE = join(DATA_DIR, 'translations', 'zh-CN.json');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const tasks: Task[] = [];
const add = (key: string, source: string, context?: string) => {
  if (source.trim()) tasks.push({ key, source, ...(context ? { context } : {}) });
};

for (const { level } of LEVELS) {
  const lc = level.toLowerCase();
  const vocab = readJson<Vocab[]>(join(DATA_DIR, 'json', 'vocab', `${lc}.json`));
  const kanji = readJson<Kanji[]>(join(DATA_DIR, 'json', 'kanji', `${lc}.json`));
  const grammar = readJson<Grammar[]>(join(DATA_DIR, 'json', 'grammar', `${lc}.json`));

  for (const word of vocab) {
    word.meanings.forEach((meaning, i) => add(`vocab.${word.id}.meaning.${i}`, meaning, `日语词条：${word.id}`));
    word.examples?.forEach((example, i) =>
      add(`vocab.${word.id}.example.${i}`, example.en, `对应日语例句：${example.ja}`),
    );
  }
  for (const entry of kanji) {
    entry.meanings.forEach((meaning, i) => add(`kanji.${entry.character}.meaning.${i}`, meaning, `日语汉字：${entry.character}`));
  }
  for (const entry of grammar) {
    add(`grammar.${entry.id}.meaning`, entry.meaning, `日语语法：${entry.id}`);
    add(`grammar.${entry.id}.formation`, entry.formation, `日语语法：${entry.id}`);
    if (entry.notes) add(`grammar.${entry.id}.notes`, entry.notes, `日语语法：${entry.id}`);
    entry.examples.forEach((example, i) =>
      add(`grammar.${entry.id}.example.${i}`, example.en, `日语例句：${example.ja}`),
    );
  }
}

const existing: Record<string, Translation> = existsSync(STORE) ? readJson(STORE) : {};
const refresh = process.argv.includes('--refresh');
let missing = tasks.filter((task) => refresh || existing[task.key]?.source !== task.source);

if (process.argv.includes('--list-missing')) {
  console.log(`${missing.length} Chinese translations need to be generated.`);
  for (const task of missing.slice(0, 10)) console.log(`${task.key}: ${task.source}`);
  process.exit(0);
}

const endpoint = process.env.OPENJLPT_TRANSLATION_ENDPOINT;
const model = process.env.OPENJLPT_TRANSLATION_MODEL;
if (!endpoint || !model) {
  throw new Error(
    'Set OPENJLPT_TRANSLATION_ENDPOINT and OPENJLPT_TRANSLATION_MODEL for an OpenAI-compatible Chat Completions API. ' +
    'Use --list-missing to inspect the translation workload without contacting a service.',
  );
}

let endpointUrl: URL;
try {
  endpointUrl = new URL(endpoint);
} catch {
  throw new Error('OPENJLPT_TRANSLATION_ENDPOINT must be a valid HTTP or HTTPS URL.');
}
if (endpointUrl.protocol !== 'https:' && endpointUrl.hostname !== 'localhost' && endpointUrl.hostname !== '127.0.0.1') {
  throw new Error('Use HTTPS for remote translation endpoints; plain HTTP is supported only for localhost.');
}

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
if (limitArg) {
  const limit = Number(limitArg.slice('--limit='.length));
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer.');
  missing = missing.slice(0, limit);
}
if (!missing.length) {
  console.log('All Chinese translations are up to date.');
  process.exit(0);
}

const batchSize = 30;
for (let start = 0; start < missing.length; start += batchSize) {
  const batch = missing.slice(start, start + batchSize);
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.OPENJLPT_TRANSLATION_API_KEY
        ? { Authorization: `Bearer ${process.env.OPENJLPT_TRANSLATION_API_KEY}` }
        : {}),
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Translate each source into natural Simplified Chinese for a Japanese-learning dictionary. ' +
            'For meanings, translate the sense concisely. For example sentences, produce a faithful, natural Chinese translation using the Japanese context to resolve ambiguity. ' +
            'Preserve Japanese grammar forms and placeholders in formation rules; do not translate Japanese text itself. ' +
            'Return only one JSON object whose keys are exactly the supplied IDs and whose values are Chinese strings.',
        },
        { role: 'user', content: JSON.stringify(batch) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Translation API returned HTTP ${response.status} ${response.statusText}.`);
  }
  const completion = (await response.json()) as ChatCompletion;
  if (completion.error?.message) throw new Error(`Translation API error: ${completion.error.message}`);
  const content = completion.choices?.[0]?.message?.content;
  if (!content) throw new Error('Translation API response has no choices[0].message.content.');

  let results: Record<string, string>;
  try {
    results = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new Error('Translation API did not return a valid JSON object of translations.');
  }

  for (const task of batch) {
    const translated = results[task.key];
    if (typeof translated !== 'string' || !translated.trim()) {
      throw new Error(`Translation API omitted a non-empty translation for ${task.key}.`);
    }
    existing[task.key] = { source: task.source, translation: translated.trim() };
  }
  writeFileSync(STORE, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`Saved translations ${Math.min(start + batch.length, missing.length)}/${missing.length}.`);
}
