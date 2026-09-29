/**
 * Write data/json/meta.json: dataset version, entry counts and upstream source
 * versions, so apps can show attribution and check freshness.
 */
import { join } from 'node:path';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { CACHE_DIR, DATA_DIR, LEVELS, ROOT, writeJson } from './lib/util.ts';

/** Decompress just the first `bytes` of a .gz file (enough for its header). */
async function gzipHead(file: string, bytes = 256 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const stream = createReadStream(file).pipe(createGunzip());
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
    size += (chunk as Buffer).length;
    if (size >= bytes) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const metaPath = join(DATA_DIR, 'json', 'meta.json');
  const previous = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  const counts: Record<string, Record<string, number>> = {};
  for (const kind of ['vocab', 'kanji', 'grammar']) {
    counts[kind] = {};
    let total = 0;
    for (const { level } of LEVELS) {
      const n = JSON.parse(readFileSync(join(DATA_DIR, 'json', kind, `${level.toLowerCase()}.json`), 'utf8')).length;
      counts[kind][level] = n;
      total += n;
    }
    counts[kind].total = total;
  }
  const sentences = LEVELS.flatMap(({ level }) =>
    JSON.parse(readFileSync(join(DATA_DIR, 'json', 'vocab', `${level.toLowerCase()}.json`), 'utf8')),
  ).filter((v: any) => v.examples?.length).length;

  const sources = { ...previous.sources };
  const jmdict = join(CACHE_DIR, 'JMdict_e.gz');
  if (existsSync(jmdict)) {
    sources.jmdict = { created: (await gzipHead(jmdict)).match(/JMdict created:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null };
  }
  const kanjidic = join(CACHE_DIR, 'kanjidic2.xml.gz');
  if (existsSync(kanjidic)) {
    const head = await gzipHead(kanjidic, 16 * 1024);
    sources.kanjidic2 = {
      database_version: head.match(/<database_version>([^<]+)</)?.[1] ?? null,
      created: head.match(/<date_of_creation>([^<]+)</)?.[1] ?? null,
    };
  }

  writeJson(metaPath, {
    name: 'OpenJLPT',
    version: pkg.version,
    license: 'CC-BY-SA-4.0',
    homepage: 'https://github.com/evanclan/OpenJLPT',
    counts,
    vocab_with_examples: sentences,
    sources: {
      waller: { url: 'https://www.tanos.co.uk/jlpt/', license: 'CC BY', snapshot: 'sources/waller/' },
      ...sources,
      tatoeba: { url: 'https://tatoeba.org', license: 'CC BY 2.0 FR' },
    },
  });
  console.log('Meta:', JSON.stringify(counts));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
