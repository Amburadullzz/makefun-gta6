// Development server for the game: `node serve.ts`, then open http://localhost:8080.
// Node's standard library only, no build step. It serves game/ at the server root, so the page
// lives at http://localhost:8080/index.html exactly as a static host would serve it, and it
// refuses anything that resolves outside game/. Pass --port <n> to listen elsewhere.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function portFromArgs(argv: string[]): number {
  const at = argv.indexOf('--port');
  const wanted = at === -1 ? NaN : Number(argv[at + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

const port = portFromArgs(process.argv.slice(2));

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = resolve(join(ROOT, normalize(pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    response.writeHead(403).end('outside game/');
    return;
  }

  let size: number;
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    size = info.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Sable Harbor is served from ${ROOT}`);
  console.log(`open http://localhost:${port}/index.html`);
});
