/**
 * Preview the public website locally without building the app:
 *
 *   node scripts/preview-site.mjs        then open http://localhost:5190
 *
 * Serves apps/mobile/public (the site lives in /site). The phone view embeds the real app, which is
 * not part of that folder, so everything that is not a local file (the app bundle, its routes, /api)
 * is fetched from the live site. Set APP_ORIGIN to use another copy of the app.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/mobile/public');
const origin = (process.env.APP_ORIGIN ?? 'https://defikarta.stormlabs.cloud').replace(/\/$/, '');
const port = Number(process.env.PORT ?? 5190);

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
};

async function local(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(root, clean);
  if (!file.startsWith(root)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    return { file, body: await readFile(file) };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const dest = req.headers['sec-fetch-dest'];
  // The app's own pages (/, /emergency, /cpr ...) come from the live copy, except "/" opened as a page:
  // that is the template in public/, which sends desktop browsers to /site/. (A reload by the service
  // worker loses the iframe marker, so only an explicit "document" request counts as a page.)
  const appRoute = !extname(url.pathname) && !url.pathname.startsWith('/site');
  const localPage = url.pathname === '/' && dest === 'document';
  const hit = appRoute && !localPage ? null : await local(url.pathname);
  if (hit) {
    res.writeHead(200, { 'Content-Type': types[extname(hit.file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(hit.body);
    return;
  }
  try {
    const r = await fetch(origin + url.pathname + url.search, { headers: { 'User-Agent': req.headers['user-agent'] ?? 'preview' } });
    const headers = {};
    r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) headers[k] = v; });
    headers['cache-control'] = 'no-store';
    res.writeHead(r.status, headers);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Live app not reachable: ' + e.message);
  }
}).listen(port, '127.0.0.1', () => console.log(`Site preview on http://localhost:${port}  (app from ${origin})`));
