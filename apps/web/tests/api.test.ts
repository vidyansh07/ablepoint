import { describe, expect, it } from 'vitest';
import { buildApi, buildAtomFeed, buildLlmsTxt, type ApiInputs } from '../src/lib/api';
import { approvalFields } from '@ablepoint/schemas';
import { services } from '../src/data/services';
import { regions } from '../src/data/regions';
import { guides } from '../src/data/guides';
import { posts } from '../src/data/posts';
import { site } from '../src/data/site';
import type { Vacancy } from '../src/data/types';

const vacancy: Vacancy = { slug: 'v1', title: 'Sample home', regionSlug: 'central-coast', suburb: 'Sample', type: 'SIL', status: 'available', summary: 'Synthetic', features: ['Step-free entry'], lastVerifiedAt: '2026-11-01T00:00:00Z', reviewState: 'draft', updatedAt: '2026-11-01T00:00:00Z' };
const base = (env: ApiInputs['env'], over: Partial<ApiInputs> = {}): ApiInputs => ({ site, services, regions, guides, posts, vacancies: [vacancy], env, origin: 'https://example.invalid', now: new Date('2026-11-05T00:00:00Z'), reviewers: ['Test Reviewer'], ...over });

describe('public content API', () => {
  it('production exposes nothing that is not approved', () => {
    const api = buildApi(base('production'));
    for (const k of ['services', 'regions', 'guides', 'posts', 'vacancies', 'search-index']) expect((api[k] as { data: unknown[] }).data).toEqual([]);
  });
  it('staging exposes drafts and marks their review state', () => {
    const api = buildApi(base('staging'));
    const s = (api.services as { data: { status: string }[] }).data;
    expect(s.length).toBe(services.length);
    expect(s.every((x) => x.status === 'draft')).toBe(true);
  });
  it('an approved document appears in production; editing it afterwards removes it', () => {
    const svc = services[0]!;
    const approved = { ...svc, ...approvalFields(svc as unknown as Record<string, unknown>, 'Test Reviewer', new Date('2026-11-02T00:00:00Z')) };
    expect((buildApi(base('production', { services: [approved] })).services as { data: unknown[] }).data).toHaveLength(1);
    expect((buildApi(base('production', { services: [{ ...approved, summary: approved.summary + ' Edited.' }] })).services as { data: unknown[] }).data).toHaveLength(0);
  });
  it('vacancies expose only public fields and honour the lifecycle', () => {
    const api = buildApi(base('staging', { vacancies: [vacancy, { ...vacancy, slug: 'v2', status: 'draft' }, { ...vacancy, slug: 'v3', status: 'filled' }] }));
    const v = (api.vacancies as { data: Record<string, unknown>[] }).data;
    expect(v.map((x) => x.id)).toEqual(['v1', 'v3']); // draft hidden; filled shown as no longer available
    expect(v[1]!.availability).toBe('noLongerAvailable');
    expect(Object.keys(v[0]!).sort()).toEqual(['availability', 'features', 'id', 'lastVerifiedAt', 'region', 'suburb', 'summary', 'title', 'type', 'url', 'vacancyType']);
  });
  it('organisation lists no registration until one is supplied', () => {
    const o = (buildApi(base('staging')).organisation as { data: { registration: unknown; telephone: string } }).data;
    expect(o.registration).toBeNull();
    expect(o.telephone).toBe('+611300088549');
  });
  it('organisation points agents to the referral page', () => {
    const o = (buildApi(base('staging')).organisation as { data: { referralUrl: string } }).data;
    expect(new URL(o.referralUrl).pathname).toBe('/referral/');
  });
  it('every resource has an OpenAPI path and the index lists them all', () => {
    const api = buildApi(base('staging'));
    const paths = Object.keys((api.openapi as { paths: object }).paths);
    for (const k of Object.keys(api).filter((k) => !['openapi', 'index'].includes(k))) expect(paths).toContain(`/api/v1/${k}.json`);
    expect(paths).toContain('/api/v1/index.json');
    expect((api.openapi as { openapi: string }).openapi).toBe('3.1.0');
  });
  it('all URLs are absolute on the given origin', () => {
    const idx = (buildApi(base('staging'))['search-index'] as { data: { url: string }[] }).data;
    for (const i of idx) expect(i.url.startsWith('https://example.invalid/')).toBe(true);
  });
});

describe('llms.txt and feed', () => {
  it('llms.txt follows the llmstxt.org shape and only lists visible pages', () => {
    const t = buildLlmsTxt(base('production'));
    expect(t.startsWith('# AblePoint Australia\n\n> ')).toBe(true);
    expect(t).not.toContain('/core-support/');
    expect(buildLlmsTxt(base('staging'))).toContain('https://example.invalid/core-support/');
  });
  it('atom feed is well-formed and escapes text', () => {
    const x = buildAtomFeed(base('staging', { guides: [{ ...guides[0]!, title: 'A & B <c>' }] }));
    expect(x).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(x).toContain('A &amp; B &lt;c&gt;');
    expect((x.match(/<entry>/g) ?? []).length).toBe(1 + posts.length);
  });
});
