import type { SiteEnv } from '@ablepoint/schemas';
import { isShown } from './gate';
import type { ApiInputs } from './api';
import { legalPages } from '../data/legal';
import { helpFaqs } from '../data/faqs';
import { glossary } from '../data/glossary';

/**
 * Crawler policy and sitemap (docs/20-seo-growth-contract.md). Facts used here come from official crawler documentation
 * read on 3 Nov 2026 (Google, OpenAI, Anthropic, Perplexity, Apple, Meta, Common Crawl, IndexNow).
 */
export const SEARCH_AND_ANSWER_BOTS = ['Googlebot', 'Bingbot', 'DuckDuckBot', 'Applebot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'meta-webindexer', 'Amazonbot'] as const;
/** Crawlers whose purpose is model training. Allowed by default (owner wants AI models to learn about AblePoint); flip with AI_TRAINING=block. */
export const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Meta-ExternalAgent'] as const;
/** Pages that must never be crawled for indexing. thank-you is noindex too; the form-adjacent paths are listed for crawl hygiene. */
export const DISALLOWED_PATHS = ['/thank-you/'] as const;

export function buildRobotsTxt(opts: { env: SiteEnv; origin: string; aiTraining?: 'allow' | 'block' }): string {
  if (opts.env !== 'production') return 'User-agent: *\nDisallow: /\n';
  const training = opts.aiTraining ?? 'allow';
  const rules = (allow: boolean) => (allow ? ['Allow: /', ...DISALLOWED_PATHS.map((p) => `Disallow: ${p}`)] : ['Disallow: /']).join('\n');
  // A crawler uses only its most specific group, so every named group repeats the disallow rules.
  const groups: string[] = [`User-agent: *\n${rules(true)}`];
  for (const b of SEARCH_AND_ANSWER_BOTS) groups.push(`User-agent: ${b}\n${rules(true)}`);
  for (const b of TRAINING_BOTS) groups.push(`User-agent: ${b}\n${rules(training === 'allow')}`);
  return [
    '# AblePoint Australia. Search and answer-engine crawlers are welcome on public pages.',
    '# Model-training crawlers follow the AI_TRAINING site setting. robots.txt is not access control: private pages need authentication.',
    '',
    groups.join('\n\n'),
    '',
    `Sitemap: ${new URL('/sitemap.xml', opts.origin).toString()}`,
    '',
  ].join('\n');
}

export interface SitemapEntry { loc: string; lastmod?: string }

/**
 * Only canonical, indexable, visible pages. `lastmod` is included ONLY where a real content update date exists
 * (Google uses lastmod only if it is consistently and verifiably accurate; Bing treats it as a key freshness signal).
 */
export function buildSitemapEntries(i: ApiInputs): SitemapEntry[] {
  const vis = <T extends Parameters<typeof isShown>[0]>(xs: T[]) => xs.filter((x) => isShown(x, i.env, i.reviewers));
  const u = (p: string) => new URL(p, i.origin).toString();
  const iso = (d: string) => new Date(d).toISOString();
  const entries: SitemapEntry[] = [
    { loc: u('/') }, { loc: u('/services/') }, { loc: u('/locations/') }, { loc: u('/vacancies/') }, { loc: u('/guides/') }, { loc: u('/blog/') }, { loc: u('/referral/') }, { loc: u('/contact-us/') },
    ...(vis(helpFaqs).length ? [{ loc: u('/faq/') }] : []),
    ...(vis(glossary).length ? [{ loc: u('/glossary/') }] : []),
    ...vis(legalPages).map((p) => ({ loc: u(`/${p.slug}/`), lastmod: iso(p.updatedAt) })),
    ...vis(i.services).map((s) => ({ loc: u(`/${s.slug}/`), lastmod: iso(s.updatedAt) })),
    ...vis(i.regions).map((r) => ({ loc: u(`/locations/${r.slug}/`), lastmod: iso(r.updatedAt) })),
    ...vis(i.guides).map((g) => ({ loc: u(`/guides/${g.slug}/`), lastmod: iso(g.updatedAt) })),
    ...vis(i.posts).map((p) => ({ loc: u(`/blog/${p.slug}/`), lastmod: iso(p.updatedAt) })),
    ...[...new Set(vis(i.posts).map((p) => p.category))].map((c) => ({ loc: u(`/blog/topic/${c}/`) })),
    ...vis(i.vacancies).filter((v) => v.status === 'available' || v.status === 'temporarilyUnavailable').map((v) => ({ loc: u(`/vacancies/${v.slug}/`), lastmod: v.lastVerifiedAt ? iso(v.lastVerifiedAt) : undefined })),
  ];
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)));
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}
