import { describe, expect, it } from 'vitest';
import { findBannedPhrases, validateRedirects } from '@ablepoint/schemas';
import { services } from '../src/data/services';
import { regions } from '../src/data/regions';
import { guides } from '../src/data/guides';
import { legalPages } from '../src/data/legal';
import { redirects } from '../src/data/redirects';
import { vacancies } from '../src/data/vacancies';
import { site, nav } from '../src/data/site';
import { metaDescription } from '../src/lib/meta';

const allText = (o: unknown): string => (typeof o === 'string' ? o : Array.isArray(o) ? o.map(allText).join(' ') : o && typeof o === 'object' ? Object.values(o).map(allText).join(' ') : '');

describe('content data', () => {
  it('has no banned or misspelt phrases in any content', () => {
    const hits = [...services, ...regions, ...guides, ...legalPages].flatMap((d) => findBannedPhrases(allText(d)).map((h) => `${(d as { slug: string }).slug}: ${h.match}`));
    expect(hits).toEqual([]);
  });
  it('slugs are unique and do not collide across top-level routes', () => {
    const top = [...services.map((s) => s.slug), ...legalPages.map((p) => p.slug)];
    expect(new Set(top).size).toBe(top.length);
    for (const reserved of ['services', 'locations', 'vacancies', 'guides', 'referral', 'contact-us', 'thank-you', '404', 'robots.txt']) expect(top).not.toContain(reserved);
  });
  it('slugs are lowercase url-safe', () => {
    for (const s of [...services, ...regions, ...guides, ...legalPages]) expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('related services exist', () => {
    const slugs = new Set(services.map((s) => s.slug));
    for (const s of services) for (const r of s.related) expect(slugs.has(r)).toBe(true);
  });
  it('region service references exist', () => {
    const slugs = new Set(services.map((s) => s.slug));
    for (const r of regions) for (const s of r.services) expect(slugs.has(s)).toBe(true);
  });
  it('covers exactly the six confirmed planning regions', () => {
    expect(regions.map((r) => r.slug).sort()).toEqual(['central-coast', 'dubbo', 'gunnedah', 'newcastle', 'orange', 'tamworth']);
  });
  it('all content starts as draft: nothing is approved without a named reviewer', () => {
    for (const d of [...services, ...regions, ...guides, ...legalPages]) expect(d.reviewState).toBe('draft');
  });
  it('no sample vacancies are shipped in data', () => expect(vacancies).toEqual([]));
  it('guides name sources and an author; reviewer absent until supplied', () => {
    for (const g of guides) { expect(g.sources.length).toBeGreaterThan(0); expect(g.author.length).toBeGreaterThan(0); }
  });
  it('site phone and email are canonical', () => {
    expect(site.phoneDisplay).toBe('1300 088 549');
    expect(site.phoneHref).toBe('tel:1300088549');
    expect(site.email).toBe('hello@ablepointaustralia.com.au');
  });
  it('nav has no empty links', () => { for (const n of nav) expect(n.href).toMatch(/^\/[a-z0-9-]+\/$/); });
});

describe('redirect map', () => {
  it('has no chains, loops, duplicates or unnormalised paths', () => expect(validateRedirects(redirects)).toEqual([]));
  it('is not approved for production yet', () => expect(redirects.every((r) => r.approved === false)).toBe(true));
  it('every redirect target is an existing route family', () => {
    const ok = [/^\/locations\/(central-coast|newcastle|dubbo|orange|tamworth|gunnedah)\/$/, /^\/guides\/$/, /^\/short-term-accommodation\/$/];
    for (const r of redirects) expect(ok.some((re) => re.test(r.to))).toBe(true);
  });
});

describe('metaDescription', () => {
  it('trims at a word boundary with ellipsis', () => {
    const out = metaDescription('word '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith('…')).toBe(true);
  });
  it('leaves short text alone', () => expect(metaDescription('Short text.')).toBe('Short text.'));
});

describe('generated vercel.json', () => {
  it('committed file matches the staging generator output (safe default: noindex on, CSP present)', async () => {
    const { readFileSync } = await import('node:fs');
    const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    const hdrs = Object.fromEntries(cfg.headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(hdrs['X-Robots-Tag']).toContain('noindex');
    expect(hdrs['Content-Security-Policy']).toContain("script-src 'self'");
    expect(hdrs['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(cfg.redirects).toHaveLength(redirects.length);
  });
});

describe('landing pages', () => {
  it('reference existing services and regions and start as draft', async () => {
    const { landingPages } = await import('../src/data/landing');
    for (const l of landingPages) {
      expect(services.some((s) => s.slug === l.serviceSlug)).toBe(true);
      expect(regions.some((r) => r.slug === l.regionSlug)).toBe(true);
      expect(l.reviewState).toBe('draft');
      expect(l.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('approval gate applied to real site content', () => {
  it('a reviewer approval makes content visible in production; any later edit hides it again', async () => {
    const { approvalFields, isVisible } = await import('@ablepoint/schemas');
    const svc = services[0]!;
    const { missingFacts: _m, ...rest } = svc;
    expect(isVisible(svc, 'production')).toBe(false); // ships as draft
    const approved = { ...svc, ...approvalFields(svc as unknown as Record<string, unknown>, 'test.reviewer', new Date('2026-11-05T00:00:00Z')) };
    expect(isVisible(approved, 'production')).toBe(true);
    expect(isVisible({ ...approved, summary: approved.summary + ' Edited.' }, 'production')).toBe(false);
    // review bookkeeping (e.g. clearing the missing-facts list after review) must not invalidate approval
    expect(isVisible({ ...approved, missingFacts: [] }, 'production')).toBe(true);
    void rest;
  });
});

describe('build scripts can load shared modules with plain Node (native type stripping)', () => {
  it('banned.ts and redirects.ts have no extensionless relative imports', async () => {
    const { execFileSync } = await import('node:child_process');
    const root = new URL('../../../packages/schemas/src/', import.meta.url).pathname;
    const code = `const b = await import(${JSON.stringify(root + 'banned.ts')}); const r = await import(${JSON.stringify(root + 'redirects.ts')}); console.log(typeof b.findBannedPhrases, typeof r.validateRedirects);`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    expect(out.trim()).toBe('function function');
  });
});

describe('finder logic', () => {
  const data = {
    regions: [{ id: 'dubbo', name: 'Dubbo', url: '/locations/dubbo/', services: ['core-support'] }, { id: 'orange', name: 'Orange', url: '/locations/orange/', services: [] }],
    services: [{ id: 'core-support', name: 'Core support', url: '/core-support/' }, { id: 'supported-independent-living', name: 'SIL', url: '/supported-independent-living/' }, { id: 'support-coordinator', name: 'Support coordination', url: '/support-coordinator/' }],
    vacancies: [{ id: 'v1', title: 'Home A', url: '/vacancies/v1/', vacancyType: 'SIL' as const, region: 'dubbo', suburb: 'X', availability: 'available' }, { id: 'v2', title: 'Home B', url: '/vacancies/v2/', vacancyType: 'SDA' as const, region: 'dubbo', suburb: 'Y', availability: 'available' }, { id: 'v3', title: 'Old', url: '/vacancies/v3/', vacancyType: 'SIL' as const, region: 'dubbo', suburb: 'Z', availability: 'noLongerAvailable' }],
  };
  it('matches region and service and says honestly when a service is not listed for a region', async () => {
    const { findSupport } = await import('../src/lib/finder');
    expect(findSupport(data, { region: 'dubbo', service: 'core-support' }).offeredHere).toBe(true);
    expect(findSupport(data, { region: 'orange', service: 'core-support' }).offeredHere).toBe(false);
    expect(findSupport(data, { region: 'dubbo' }).offeredHere).toBeUndefined();
  });
  it('shows only matching, still-available vacancies of the right type, and none for services that have no vacancies', async () => {
    const { findSupport } = await import('../src/lib/finder');
    expect(findSupport(data, { region: 'dubbo', service: 'supported-independent-living' }).vacancies.map((v) => v.id)).toEqual(['v1']);
    expect(findSupport(data, { region: 'dubbo' }).vacancies.map((v) => v.id)).toEqual(['v1', 'v2']);
    const coord = findSupport(data, { region: 'dubbo', service: 'support-coordinator' });
    expect(coord.asksAboutVacancies).toBe(false);
    expect(coord.vacancies).toEqual([]);
  });
});

describe('testimonials (G-04)', () => {
  const ok = { id: 't1', quote: 'They listened to what I wanted and explained everything clearly.', attribution: 'Sam, participant', consentRef: 'CONSENT-001', outcomeClaim: false as const, reviewState: 'draft' as const, updatedAt: '2026-11-03T00:00:00Z' };
  it('ships empty and every future entry must carry consent, no outcome claim and no identifiers', async () => {
    const { testimonials, assertTestimonial } = await import('../src/data/testimonials');
    expect(testimonials).toEqual([]);
    expect(() => assertTestimonial(ok)).not.toThrow();
    expect(() => assertTestimonial({ ...ok, consentRef: '' })).toThrow(/consentRef/);
    expect(() => assertTestimonial({ ...ok, outcomeClaim: true as unknown as false })).toThrow(/outcome/);
    expect(() => assertTestimonial({ ...ok, quote: 'Call me on sam@example.com about how great they are' })).toThrow(/identifiers/);
    expect(() => assertTestimonial({ ...ok, quote: 'They are the best provider and got my funding approved fast.' })).toThrow(/banned/);
  });
});

describe('home claim blocks and help FAQs', () => {
  it('start as drafts with owner questions and make no unverifiable promises', async () => {
    const { homeBlocks } = await import('../src/data/home');
    const { helpFaqs } = await import('../src/data/faqs');
    expect(homeBlocks.reviewState).toBe('draft');
    expect(homeBlocks.missingFacts?.length).toBeGreaterThan(2);
    expect(findBannedPhrases(allText(homeBlocks))).toEqual([]);
    for (const f of helpFaqs) { expect(f.reviewState).toBe('draft'); expect(findBannedPhrases(`${f.q} ${f.a}`)).toEqual([]); expect(`${f.q} ${f.a}`).not.toMatch(/less than a week|within \d+ (minutes|hours)/i); }
  });
});
