// A tiny static server for game/ (Node 22, standard library only), so the game
// can be played locally with no build step: `node serve.ts` serves game/ on
// http://localhost:8080. It sends the MIME types a browser game needs, refuses
// any path that escapes game/, and otherwise does nothing clever — a dev
// convenience, not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';
  const cleaned = normalize(path).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = resolve(join(root, cleaned));
  if (!resolved.startsWith(root + sep) && resolved !== root) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  if (!stat.isFile()) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(resolved)] ?? 'application/octet-stream',
    'cache-control': 'no-store', // dev server: always serve the latest edit
  });
  createReadStream(resolved).pipe(response);
}).listen(port, () => {
  console.log(`NIGHTSHIFT on http://localhost:${port}`);
});
