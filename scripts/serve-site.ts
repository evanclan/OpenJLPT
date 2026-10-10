import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? '_site');
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

if (!existsSync(root) || !statSync(root).isDirectory()) {
  throw new Error(`Site directory does not exist: ${root}. Run "npm run build:site" first.`);
}

const server = createServer((req, res) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', `http://${host}:${port}`).pathname);
  } catch {
    res.writeHead(400).end('Invalid URL');
    return;
  }

  let file = resolve(root, `.${pathname}`);
  const relativePath = relative(root, file);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': contentTypes[extname(file).toLowerCase()] ?? 'application/octet-stream' });
  if (req.method === 'HEAD') res.end();
  else res.end(readFileSync(file));
});

server.listen(port, host, () => {
  console.log(`OpenJLPT is available at http://${host}:${port}`);
});
