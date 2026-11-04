// Minimal static server for e2e: serves dist/ with directory indexes and the real 404 page.
// (astro preview daemonises in non-interactive shells, which breaks Playwright's webServer.)
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
// Apply the same response headers Vercel would (CSP, nosniff, noindex...) so e2e runs under the real policy.
// `upgrade-insecure-requests` is dropped only because this local server speaks plain http.
const configPath = resolve(process.env.VERCEL_CONFIG ?? 'vercel.json');
const rules = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')).headers ?? [] : [];
const headersFor = (pathname) => {
  const out = {};
  for (const r of rules) {
    const re = new RegExp('^' + r.source.replace('(.*)', '.*') + '$');
    if (!re.test(pathname)) continue;
    for (const h of r.headers) out[h.key] = h.key === 'Content-Security-Policy' ? h.value.replace(/;?\s*upgrade-insecure-requests/, '') : h.value;
  }
  return out;
};
const port = Number(process.env.PORT ?? 4331);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch { /* fall through to 404 */ }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', ...headersFor(url.pathname) }).end(body);
  } catch {
    const body = await readFile(join(root, '404.html')).catch(() => Buffer.from('Not found'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...headersFor(url.pathname) }).end(body);
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
