import { describe, expect, it } from 'vitest';
import { approvalFields } from '@ablepoint/schemas';
import { buildRobotsTxt, buildSitemapEntries, buildSitemapXml, SEARCH_AND_ANSWER_BOTS, TRAINING_BOTS } from '../src/lib/seo';
import type { ApiInputs } from '../src/lib/api';
import { services } from '../src/data/services';
import { regions } from '../src/data/regions';
import { guides } from '../src/data/guides';
import { posts } from '../src/data/posts';
import { site } from '../src/data/site';
import { buildPayload } from '../scripts/indexnow.mjs';

const inputs = (env: ApiInputs['env'], over: Partial<ApiInputs> = {}): ApiInputs => ({ site, services, regions, guides, posts, vacancies: [], env, origin: 'https://example.invalid', now: new Date('2026-11-05T00:00:00Z'), reviewers: ['Test Reviewer'], ...over });

describe('robots.txt', () => {
  it('blocks everything outside production', () => expect(buildRobotsTxt({ env: 'staging', origin: 'https://x.invalid' })).toBe('User-agent: *\nDisallow: /\n'));
  it('production welcomes search and answer engines and repeats the disallow rules in every group', () => {
    const t = buildRobotsTxt({ env: 'production', origin: 'https://example.invalid' });
    for (const b of [...SEARCH_AND_ANSWER_BOTS, ...TRAINING_BOTS]) expect(t).toContain(`User-agent: ${b}\nAllow: /\nDisallow: /thank-you/`);
    expect(t).toContain('Sitemap: https://example.invalid/sitemap.xml');
    expect(t).not.toMatch(/Disallow: \/\n/);
  });
  it('can opt out of model training without touching search or answer bots', () => {
    const t = buildRobotsTxt({ env: 'production', origin: 'https://example.invalid', aiTraining: 'block' });
    for (const b of TRAINING_BOTS) expect(t).toContain(`User-agent: ${b}\nDisallow: /\n`);
    for (const b of SEARCH_AND_ANSWER_BOTS) expect(t).toContain(`User-agent: ${b}\nAllow: /`);
  });
});

describe('sitemap', () => {
  it('lists only visible content, with absolute URLs and no duplicates', () => {
    const svc = services[0]!;
    const approved = { ...svc, ...approvalFields(svc as unknown as Record<string, unknown>, 'Test Reviewer', new Date('2026-11-02T00:00:00Z')) };
    const e = buildSitemapEntries(inputs('production', { services: [approved, ...services.slice(1)] }));
    const locs = e.map((x) => x.loc);
    expect(locs).toContain(`https://example.invalid/${svc.slug}/`);
    expect(locs).not.toContain(`https://example.invalid/${services[1]!.slug}/`); // draft stays out of production
    expect(new Set(locs).size).toBe(locs.length);
    expect(locs.every((l) => l.startsWith('https://example.invalid/'))).toBe(true);
    expect(locs.some((l) => /thank-you|api|lp\/|styleguide/.test(l))).toBe(false);
  });
  it('includes lastmod only where a real update date exists, in ISO 8601', () => {
    const e = buildSitemapEntries(inputs('staging'));
    expect(e.find((x) => x.loc.endsWith('/services/'))!.lastmod).toBeUndefined();
    for (const x of e.filter((y) => y.lastmod)) expect(x.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
  it('produces well-formed XML and escapes ampersands', () => {
    expect(buildSitemapXml([{ loc: 'https://x.invalid/?a=1&b=2' }])).toContain('?a=1&amp;b=2');
  });
});

describe('IndexNow payload', () => {
  it('builds a valid payload with the key location and de-duplicated absolute URLs', () => {
    const p = buildPayload({ site: 'https://example.com.au', key: 'abcdef0123456789abcdef0123456789', urls: ['/a/', 'https://example.com.au/a/', '/b/'] });
    expect(p.urlList).toEqual(['https://example.com.au/a/', 'https://example.com.au/b/']);
    expect(p.keyLocation).toBe('https://example.com.au/indexnow-key.txt');
    expect(p.host).toBe('example.com.au');
  });
  it('rejects other hosts, empty lists and bad keys', () => {
    expect(() => buildPayload({ site: 'https://example.com.au', key: 'abcdef0123456789', urls: ['https://evil.example/x'] })).toThrow();
    expect(() => buildPayload({ site: 'https://example.com.au', key: 'abcdef0123456789', urls: [] })).toThrow();
    expect(() => buildPayload({ site: 'https://example.com.au', key: 'bad key!', urls: ['/a/'] })).toThrow();
  });
});
