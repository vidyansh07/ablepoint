// Static checks on the built site (docs/11 §4). Exit code 1 on any error.
// Usage: node scripts/lint-dist.mjs [distDir]
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { findBannedPhrases } from '../../../packages/schemas/src/banned.ts';

const dist = resolve(process.argv[2] ?? 'dist');
const env = process.env.PUBLIC_SITE_ENV ?? 'development';
const PLACEHOLDERS = [/Street Name/i, /621-254-2147/, /@support\.com/i, /Opens in your application/i, /lorem ipsum/i];

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);

const routeOf = (f) => '/' + f.slice(dist.length + 1).replace(/index\.html$/, '').replace(/\.html$/, '');
const titles = new Map();

const resolves = (href) => {
  const path = href.split('#')[0].split('?')[0];
  if (path === '') return true;
  const candidates = [join(dist, path), join(dist, path, 'index.html'), join(dist, path.replace(/\/$/, '') + '.html')];
  return candidates.some((c) => existsSync(c) && (statSync(c).isFile() || existsSync(join(c, 'index.html'))));
};

for (const f of htmlFiles) {
  const route = routeOf(f);
  const html = readFileSync(f, 'utf8');
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

  // <html lang>, title, description, canonical, robots
  if (!/<html[^>]*\slang="[a-z-]+"/i.test(html)) err(route, 'missing <html lang>');
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim();
  if (!title) err(route, 'missing <title>');
  else {
    if (titles.has(title)) err(route, `duplicate title with ${titles.get(title)}`);
    titles.set(title, route);
    if (title.length > 70) warnings.push(`${route}: title ${title.length} chars`);
  }
  const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!desc) err(route, 'missing meta description');
  else if (desc.length > 200) warnings.push(`${route}: description ${desc.length} chars`);
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!canon) err(route, 'missing canonical');
  const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1] ?? '';
  const isNoindexPage = route === '/thank-you/' || route === '/404.html' || route === '/404' || route.startsWith('/lp/');
  if (env !== 'production' && !/noindex/.test(robots)) err(route, 'non-production page is indexable');
  if (env === 'production' && !isNoindexPage && /noindex/.test(robots)) err(route, 'production page unexpectedly noindex');
  if (/<meta name="keywords"/i.test(html)) err(route, 'meta keywords tag present');

  // headings
  const heads = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  if (heads.filter((h) => h === 1).length !== 1) err(route, `expected exactly one h1, found ${heads.filter((h) => h === 1).length}`);
  for (let i = 1; i < heads.length; i++) if (heads[i] - heads[i - 1] > 1) err(route, `heading level skips h${heads[i - 1]} -> h${heads[i]}`);

  // links
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]*)"/g)) {
    const href = m[1];
    if (href === '#' || href === '') err(route, 'empty or "#" link');
    else if (href.startsWith('/')) { if (!resolves(href)) err(route, `broken internal link ${href}`); }
    else if (href.startsWith('#')) { if (!new RegExp(`id="${href.slice(1)}"`).test(html)) err(route, `broken anchor ${href}`); }
  }
  // images
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt(=|\s|>|\/)/.test(m[0])) err(route, 'image without alt');
  // third-party scripts / resources
  for (const m of html.matchAll(/<(?:script|link|img|iframe)\b[^>]*(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    if (!/rel="(canonical|noopener)"/.test(m[0]) && !/<link[^>]*rel="canonical"/.test(m[0])) {
      if (m[0].startsWith('<script') || m[0].startsWith('<iframe') || m[0].startsWith('<img')) err(route, `third-party resource ${m[1]}`);
    }
  }
  // inline executable scripts (CSP)
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    if (!/type="application\/ld\+json"/.test(m[1]) && !/\ssrc="/.test(m[1])) err(route, 'inline executable script (breaks strict CSP)');
  }
  if (/<style[\s>]/i.test(html)) err(route, 'inline <style> element (blocked by CSP style-src self)');
  // inline style attributes are blocked by the strict CSP (style-src 'self')
  if (/<[a-z][^>]*\sstyle=/i.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) err(route, 'inline style attribute (blocked by CSP)');
  // JSON-LD parses
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { err(route, 'invalid JSON-LD'); }
  }
  // content rules
  for (const p of PLACEHOLDERS) if (p.test(text)) err(route, `placeholder text matches ${p}`);
  for (const hit of findBannedPhrases(text)) err(route, `banned phrase "${hit.match}": ${hit.reason}`);
  // draft content must never appear in production
  if (env === 'production' && /Draft, not approved/.test(text)) err(route, 'draft banner present in production build');
}

// Region pages must not be keyword-swapped copies of each other (docs/08 §5, W-15). Shingle similarity with the place name removed.
const regionPages = htmlFiles.filter((f) => /\/locations\/[a-z-]+\/index\.html$/.test(f));
const shingles = (f) => {
  const slugName = f.split('/locations/')[1].split('/')[0].replace(/-/g, ' ');
  const main = (readFileSync(f, 'utf8').match(/<main[\s\S]*?<\/main>/) ?? [''])[0]
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').toLowerCase().replace(new RegExp(slugName, 'g'), ' ');
  const w = main.split(/\W+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + 2 < w.length; i++) set.add(w.slice(i, i + 3).join(' '));
  return set;
};
const sets = regionPages.map((f) => [routeOf(f), shingles(f)]);
for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
  const [a, sa] = sets[i]; const [b, sb] = sets[j];
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const jac = inter / (sa.size + sb.size - inter || 1);
  if (jac > 0.8) (env === 'production' ? errors : warnings).push(`${a} and ${b}: ${(jac * 100).toFixed(0)}% similar once the place name is removed (templated region pages)`);
}

// agent surfaces: JSON API, feed, llms.txt (docs/21)
for (const f of files.filter((x) => /\/api\/v1\/[^/]+\.json$/.test(x))) {
  const route = '/' + f.slice(dist.length + 1);
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (!/openapi\.json$/.test(f) && (j.apiVersion !== '1' || !('data' in j))) err(route, 'API envelope missing apiVersion/data');
    if (env === 'production' && JSON.stringify(j).includes('"status": "draft"')) err(route, 'draft content in production API');
  } catch { err(route, 'invalid JSON'); }
}
if (!existsSync(join(dist, 'api/v1/index.json'))) err('/api/v1/index.json', 'missing');
for (const f of ['feed.xml', 'llms.txt']) {
  const p = join(dist, f);
  if (!existsSync(p)) { err('/' + f, 'missing'); continue; }
  const t = readFileSync(p, 'utf8');
  const urlRe = f === 'feed.xml' ? /(?:href="|<id>)(https?:\/\/[^"<]+)/g : /\((https?:\/\/[^)\s]+)\)/g;
  for (const m of t.matchAll(urlRe)) {
    const path = (() => { try { return new URL(m[1]).pathname; } catch { return ''; } })();
    if (path.startsWith('/') && !/^\/(api|feed\.xml|llms\.txt)/.test(path) && path !== '/' && !resolves(path)) err('/' + f, `link to a page that does not exist: ${path}`);
  }
  if (f === 'feed.xml' && !/<feed[^>]*>[\s\S]*<\/feed>/.test(t)) err('/feed.xml', 'malformed feed');
}

const sitemap = existsSync(join(dist, 'sitemap.xml'));
if (env !== 'production' && sitemap) err('/', 'sitemap emitted for non-production build');
if (env === 'production' && !sitemap) err('/sitemap.xml', 'missing in production build');
const robotsTxt = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : '';
if (env !== 'production' && !/Disallow: \//.test(robotsTxt)) err('/robots.txt', 'non-production robots.txt does not disallow all');

// Performance budget (docs/25 §5.4): transferred (gzip) JavaScript and CSS per page. Measured 3 Nov 2026: content pages 2.3 to 3.6 KB JS,
// /referral/ 27 KB JS (form validation), CSS about 7 KB. Budgets leave headroom but stop a framework or tracker from creeping in.
const BUDGET = { jsDefault: 10 * 1024, jsReferral: 40 * 1024, css: 16 * 1024 };
const gz = (urlPath) => {
  const p = join(dist, urlPath.split('?')[0]);
  return existsSync(p) && statSync(p).isFile() ? gzipSync(readFileSync(p), { level: 9 }).length : 0;
};
for (const f of htmlFiles) {
  const route = routeOf(f);
  const html = readFileSync(f, 'utf8');
  const js = new Set([...html.matchAll(/<script[^>]+\ssrc="(\/[^"]+)"/g)].map((m) => m[1]).concat([...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="(\/[^"]+)"/g)].map((m) => m[1])));
  const css = new Set([...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/[^"]+)"/g)].map((m) => m[1]));
  const jsBytes = [...js].reduce((n, u) => n + gz(u), 0);
  const cssBytes = [...css].reduce((n, u) => n + gz(u), 0);
  const jsLimit = route === '/referral/' ? BUDGET.jsReferral : BUDGET.jsDefault;
  if (jsBytes > jsLimit) err(route, `JavaScript budget exceeded: ${(jsBytes / 1024).toFixed(1)} KB gzip (limit ${(jsLimit / 1024).toFixed(0)} KB)`);
  if (cssBytes > BUDGET.css) err(route, `CSS budget exceeded: ${(cssBytes / 1024).toFixed(1)} KB gzip (limit ${(BUDGET.css / 1024).toFixed(0)} KB)`);
}

console.log(`lint-dist [${env}]: ${htmlFiles.length} pages, ${errors.length} errors, ${warnings.length} warnings`);
for (const w of warnings) console.log('  warn  ' + w);
for (const e of errors) console.log('  ERROR ' + e);
process.exit(errors.length ? 1 : 0);
