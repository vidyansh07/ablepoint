// IndexNow notifier (Bing, Yandex, Seznam, Naver, Yep, ... ; NOT Google). docs/20-seo-growth-contract.md.
//   node scripts/indexnow.mjs --init                       # once: creates public/indexnow-key.txt (the key is public by design)
//   node scripts/indexnow.mjs --site https://example.com.au --urls /a/,/b/   # notify changed URLs
//   node scripts/indexnow.mjs --site https://example.com.au --from-sitemap dist/sitemap.xml
//   add --dry-run to print the request without sending it. Never run against staging. Submitting does not guarantee indexing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const keyFile = new URL('../public/indexnow-key.txt', import.meta.url).pathname;

export function buildPayload({ site, key, urls }) {
  const host = new URL(site).host;
  const absolute = [...new Set(urls.map((u) => new URL(u, site).toString()))];
  if (absolute.some((u) => new URL(u).host !== host)) throw new Error('all URLs must be on the site host');
  if (absolute.length === 0) throw new Error('no URLs to submit');
  if (absolute.length > 10000) throw new Error('IndexNow accepts at most 10,000 URLs per request');
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('key must be 8-128 letters, numbers or hyphens');
  return { host, key, keyLocation: new URL('/indexnow-key.txt', site).toString(), urlList: absolute };
}

async function main() {
  const args = process.argv.slice(2);
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--init')) {
    if (existsSync(keyFile)) { console.log('key already exists'); return; }
    writeFileSync(keyFile, randomBytes(16).toString('hex'));
    console.log('created public/indexnow-key.txt (commit it; deploy; then notify)');
    return;
  }
  const site = val('--site');
  if (!site || !existsSync(keyFile)) throw new Error('usage: --site https://host [--urls a,b | --from-sitemap file] ; run --init first');
  if (/localhost|staging|example\.invalid/.test(site)) throw new Error('refusing to notify a non-production host');
  const key = readFileSync(keyFile, 'utf8').trim();
  const urls = val('--urls') ? val('--urls').split(',') : readFileSync(val('--from-sitemap'), 'utf8').match(/<loc>[^<]+<\/loc>/g).map((m) => m.replace(/<\/?loc>/g, ''));
  const payload = buildPayload({ site, key, urls });
  if (args.includes('--dry-run')) { console.log(JSON.stringify({ endpoint: 'https://api.indexnow.org/indexnow', ...payload, urlList: `${payload.urlList.length} URLs` }, null, 2)); return; }
  const res = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
  console.log(JSON.stringify({ status: res.status, submitted: payload.urlList.length }));
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e.message); process.exit(1); });
