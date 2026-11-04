// Legacy-URL parity (docs/07 §4): every URL in the old sitemap must be (a) still served, (b) redirected to a route that exists,
// or (c) listed as a pending owner decision. Writes docs/evidence/migration-parity.{json,md}. Exit 1 on any unresolved URL.
// Usage: node scripts/migration-parity.mjs [distDir]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { redirects, pendingLegacy } from '../src/data/redirects.ts';

const dist = resolve(process.argv[2] ?? 'dist');
const evidence = resolve(import.meta.dirname, '../../../docs/evidence');
const legacy = [...readFileSync(join(evidence, 'live-sitemap-2026-11-03.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname)
  .filter((p) => !/\.(jpe?g|png|webp|gif|svg)$/i.test(p));
const crawl = JSON.parse(readFileSync(join(evidence, 'live-site-crawl-2026-11-03.json'), 'utf8'));
const byPath = new Map(crawl.filter((r) => r.url).map((r) => [new URL(r.url).pathname, r]));

const routeExists = (p) => existsSync(join(dist, p.split('#')[0], 'index.html'));
const redirectOf = new Map(redirects.map((r) => [r.from, r]));
const pending = new Map(pendingLegacy.map((r) => [r.from, r.reason]));

const rows = legacy.map((p) => {
  const meta = byPath.get(p);
  const base = { legacy: p, words: meta?.words ?? null, title: meta?.title ?? '' };
  if (redirectOf.has(p)) {
    const r = redirectOf.get(p);
    const ok = routeExists(r.to);
    return { ...base, outcome: ok ? 'redirect' : 'BROKEN-REDIRECT', target: r.to, note: ok ? `${r.status} (${r.reason}); approved=${r.approved}` : 'redirect target is not a built route' };
  }
  if (routeExists(p)) return { ...base, outcome: 'kept', target: p, note: 'URL preserved; content must be re-checked (new copy, draft)' };
  if (pending.has(p)) return { ...base, outcome: 'pending-decision', target: null, note: pending.get(p) };
  return { ...base, outcome: 'UNMAPPED', target: null, note: 'no route, redirect or decision' };
});

const count = (o) => rows.filter((r) => r.outcome === o).length;
const summary = { legacyUrls: rows.length, kept: count('kept'), redirect: count('redirect'), pendingDecision: count('pending-decision'), brokenRedirect: count('BROKEN-REDIRECT'), unmapped: count('UNMAPPED') };
writeFileSync(join(evidence, 'migration-parity.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), summary, rows }, null, 2));
const md = [
  '# Legacy URL parity (generated)', '',
  `Source: live sitemap captured 2026-11-03 (${rows.length} URLs). Checked against build output \`${dist.split('/').slice(-2).join('/')}\`. Regenerate: \`node scripts/migration-parity.mjs\`.`, '',
  `Kept ${summary.kept} · Redirected ${summary.redirect} · Pending owner decision ${summary.pendingDecision} · Broken redirect ${summary.brokenRedirect} · Unmapped ${summary.unmapped}`, '',
  'Redirect rows are drafts (`approved:false`) and are not active on any production domain. "Kept" means the URL exists in the new build, not that its content has been migrated or approved.', '',
  '| Legacy URL | Outcome | Target | Old words | Note |', '|---|---|---|---:|---|',
  ...rows.map((r) => `| \`${r.legacy}\` | ${r.outcome} | ${r.target ? `\`${r.target}\`` : ''} | ${r.words ?? ''} | ${r.note} |`),
].join('\n');
writeFileSync(join(evidence, 'migration-parity.md'), md + '\n');
console.log(JSON.stringify(summary));
for (const r of rows.filter((r) => ['UNMAPPED', 'BROKEN-REDIRECT'].includes(r.outcome))) console.log(`  ERROR ${r.outcome} ${r.legacy}`);
for (const r of rows.filter((r) => r.outcome === 'pending-decision')) console.log(`  warn  pending decision ${r.legacy}`);
process.exit(summary.unmapped + summary.brokenRedirect ? 1 : 0);
