/**
 * Redirect records (docs/07-sitemap-migration.md). Validated so a map can never contain
 * chains, loops, query-string surprises or non-canonical paths.
 */

export interface RedirectRecord {
  from: string;
  to: string;
  status: 301 | 302 | 308 | 410;
  reason: string;
  /** Owner approval required before this goes live on the production domain. */
  approved: boolean;
}

export function normalisePath(p: string): string {
  if (!p.startsWith('/')) throw new Error(`Path must start with "/": ${p}`);
  const [pathOnly = '', hash = ''] = p.split('#');
  const base = pathOnly.toLowerCase();
  const withSlash = base.endsWith('/') || /\.[a-z0-9]+$/.test(base) ? base : base + '/';
  return hash ? `${withSlash}#${hash}` : withSlash;
}

export interface RedirectProblem {
  from: string;
  problem: string;
}

export function validateRedirects(records: RedirectRecord[]): RedirectProblem[] {
  const problems: RedirectProblem[] = [];
  const bySource = new Map<string, RedirectRecord>();
  for (const r of records) {
    if (r.from !== normalisePath(r.from)) problems.push({ from: r.from, problem: 'source not normalised (lowercase, trailing slash)' });
    if (bySource.has(r.from)) problems.push({ from: r.from, problem: 'duplicate source' });
    bySource.set(r.from, r);
  }
  for (const r of records) {
    if (r.status === 410) continue;
    const toPath = r.to.split('#')[0] ?? '';
    if (toPath === r.from) problems.push({ from: r.from, problem: 'redirects to itself' });
    if (r.to.startsWith('/') && r.to !== normalisePath(r.to)) problems.push({ from: r.from, problem: `target not normalised: ${r.to}` });
    // chain: target is itself a source
    const next = bySource.get(toPath);
    if (next) problems.push({ from: r.from, problem: `chain: ${r.to} is itself redirected` });
  }
  return problems;
}
