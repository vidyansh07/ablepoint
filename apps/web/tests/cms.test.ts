import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { isApprovalCurrent, type Reviewable } from '@ablepoint/schemas';
import { SITE_QUERIES, byIdsQuery, stripInternalFields } from '../../studio/src/queries';
import type { Faq, Guide, LegalPage, Region, Vacancy } from '../src/data/types';
import type { HelpFaq } from '../src/data/faqs';
import { isShown } from '../src/lib/gate';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  SANITY_API_VERSION,
  SanityConfigError,
  SanityFetchError,
  buildQueryUrl,
  createSanityClient,
  readSanityConfig,
  type FetchLike,
} from '../src/lib/cms/fetch';
import { portableTextToParagraphs } from '../src/lib/cms/map';
import { REF_CHUNK_SIZE, PullError, fixtureSource, gate, httpSource, resolveOutDir, runPull, stableStringify, type PullResult } from '../src/lib/cms/pull';
import { makeCmsOr, cmsOr, readContentSource } from '../src/lib/cms/source';
import { FIXTURE_APPROVER, INTERNAL_MARKERS, approve, asDraft, block, buildFixture, editedAfterApproval, pt, type Doc } from './fixtures/cms/docs';

const web = new URL('..', import.meta.url).pathname;
const TMP_ROOT = join(web, 'node_modules', '.cache', 'cms-test');
mkdirSync(TMP_ROOT, { recursive: true });
const tmp = () => mkdtempSync(join(TMP_ROOT, 'run-'));
afterAll(() => rmSync(TMP_ROOT, { recursive: true, force: true }));

const TOKEN = 'sk-FAKE-TEST-TOKEN-0123456789abcdef';
const ENV = { SANITY_PROJECT_ID: 'abcd1234', SANITY_DATASET: 'staging', SANITY_READ_TOKEN: TOKEN };

const pull = (docs: Doc[]): Promise<PullResult> => runPull(fixtureSource(docs));
const exclusionsOf = (r: PullResult) => r.manifest.exclusions.map((e) => `${e.type}:${e.id}:${e.reason}`);
const sys = (id: string, type: string): Doc => ({ _id: id, _type: type, _rev: 'r', _createdAt: '2026-01-01T00:00:00.000Z', _updatedAt: '2026-01-02T00:00:00.000Z' });
const region = (id: string, extra: Doc = {}): Doc => ({ ...sys(id, 'region'), name: 'Testland Fixture', slug: { _type: 'slug', current: id }, summary: 'Fake summary.', ...extra });
const faq = (id: string, extra: Doc = {}): Doc => ({ ...sys(id, 'faq'), question: 'Fake question?', shortAnswer: 'Fake answer.', topics: ['Housing'], ...extra });

// ---------------------------------------------------------------------------------------------------------------------
describe('the gate (isApprovalCurrent on the exact raw object)', () => {
  const doc = approve(region('fx-r1'));
  it('passes an approved document whose hash is current', () => {
    expect(gate(doc).ok).toBe(true);
    expect(isApprovalCurrent(doc as unknown as Reviewable)).toBe(true);
  });
  it('excludes a document edited after approval', () => {
    const r = gate(editedAfterApproval(region('fx-r2'), 'summary', 'Fake summary, changed.'));
    expect(r).toEqual({ ok: false, reason: 'approvalStale' });
  });
  it('excludes drafts and in-review documents as not approved', () => {
    expect(gate(asDraft(region('fx-r3')))).toEqual({ ok: false, reason: 'notApproved' });
    expect(gate({ ...region('fx-r4'), reviewState: 'inReview' })).toEqual({ ok: false, reason: 'notApproved' });
  });
  it('excludes an approved state with an incomplete approval record', () => {
    for (const field of ['approvedBy', 'approvedAt', 'approvedContentHash']) {
      const { [field]: _removed, ...rest } = doc;
      expect(gate(rest)).toEqual({ ok: false, reason: 'approvalStale' });
    }
  });
  it('excludes an approved copy that has a drafts. or versions. id (approved is not published)', () => {
    expect(gate({ ...doc, _id: 'drafts.fx-r1' })).toEqual({ ok: false, reason: 'notApproved' });
    expect(gate({ ...doc, _id: 'versions.rel.fx-r1' })).toEqual({ ok: false, reason: 'notApproved' });
  });
  it('fails closed if any extra field appears after approval, such as a system field Sanity might add (unverified assumption)', () => {
    expect(gate({ ...doc, _system: { note: 'fake' } })).toEqual({ ok: false, reason: 'approvalStale' });
  });
  it('does not weaken the gate on a bookkeeping-only change: review fields and _rev do not matter', () => {
    expect(gate({ ...doc, _rev: 'another-revision', _updatedAt: '2030-01-01T00:00:00.000Z', reviewedAt: '2026-02-02T00:00:00.000Z' }).ok).toBe(true);
  });
  it('order matters: the hash covers internal fields, so stripping BEFORE the gate would wrongly reject (the pipeline gates first)', () => {
    const withInternal = approve({ ...sys('fx-v1', 'vacancy'), title: 'Fake', internalOwner: INTERNAL_MARKERS.internalOwner });
    expect(isApprovalCurrent(withInternal as unknown as Reviewable)).toBe(true);
    expect(isApprovalCurrent(stripInternalFields(withInternal) as unknown as Reviewable)).toBe(false);
    const g = gate(withInternal);
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.gated.doc).not.toHaveProperty('internalOwner');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('pipeline over the fake fixture', () => {
  it('writes only gated, mappable documents and records every exclusion with its reason', async () => {
    const r = await pull(buildFixture());
    expect(r.outputs.region.map((x) => x.slug)).toEqual(['alphaville-fixture']);
    expect(r.outputs.guide.map((x) => x.slug)).toEqual(['fake-guide-ok']);
    expect(r.outputs.faq.map((x) => x.topic)).toEqual(['Referrals', 'Housing']);
    expect(r.outputs.vacancy.map((x) => x.slug)).toEqual(['fake-vacancy-ok']);
    expect(r.outputs.legalPage.map((x) => x.slug)).toEqual(['fake-policy-nosections', 'fake-policy-ok']);
    expect(exclusionsOf(r)).toEqual([
      'faq:fx-faq-draft:notApproved',
      'faq:fx-faq-othertopic:mappingFailed',
      'guide:fx-guide-authordraft:referenceNotApproved',
      'guide:fx-guide-badurl:mappingFailed',
      'guide:fx-guide-bold:mappingFailed',
      'guide:fx-guide-draft:notApproved',
      'guide:fx-guide-dup-a:mappingFailed',
      'guide:fx-guide-dup-b:mappingFailed',
      'guide:fx-guide-heading:mappingFailed',
      'guide:fx-guide-list:mappingFailed',
      'guide:fx-guide-nosources:mappingFailed',
      'legalPage:fx-legal-bold:mappingFailed',
      'region:fx-region-badref:referenceNotApproved',
      'region:fx-region-draft:notApproved',
      'region:fx-region-edited:approvalStale',
      'region:fx-region-inreview:notApproved',
      'region:fx-region-noapprover:approvalStale',
      'serviceCoverage:fx-cov-4:approvalStale',
      'vacancy:fx-vacancy-badproperty:referenceNotApproved',
      'vacancy:fx-vacancy-draftstatus:mappingFailed',
      'vacancy:fx-vacancy-edited:approvalStale',
    ]);
  });

  it('manifest counts add up for every type, and the drafts.-prefixed copy is never counted', async () => {
    const { manifest } = await pull(buildFixture());
    for (const t of Object.values(manifest.types)) {
      expect(t.fetched).toBe(t.written + Object.values(t.excluded).reduce((a, b) => a + b, 0));
    }
    expect(manifest.types.region.fetched).toBe(6); // 7 region documents in the fixture, one has a drafts. id
    expect(manifest.types.region).toEqual({ fetched: 6, written: 1, excluded: { notApproved: 2, approvalStale: 2, mappingFailed: 0, referenceNotApproved: 1 } });
    expect(manifest.support.serviceCoverage).toEqual({ fetched: 4, passedGate: 3, excluded: { notApproved: 0, approvalStale: 1 } });
    expect(manifest.references.requested).toBe(manifest.references.resolved + manifest.references.failedGate + manifest.references.notReturned);
  });

  it('records the dataset name and source, never a token or a timestamp', async () => {
    const { manifest, files } = await pull(buildFixture());
    expect(manifest.source).toBe('fixture');
    expect(manifest.dataset).toBeNull();
    expect(Object.keys(manifest).sort()).toEqual(['apiVersion', 'dataset', 'exclusions', 'perspective', 'references', 'schemaVersion', 'source', 'support', 'types']);
    expect(files['_manifest.json']).not.toMatch(/token|2026-11|pulledAt|generatedAt/i);
  });

  it('derives region.services from approved coverage only: available, with an approved service and region', async () => {
    const { outputs } = await pull(buildFixture());
    expect(outputs.region[0]!.services).toEqual(['fake-service-alpha']); // cov-2 is not available, cov-3 points at a draft service, cov-4 is stale
  });

  it('maps fields exactly: no invented values, unmappable Sanity fields not carried, names resolved from approved author documents', async () => {
    const { outputs } = await pull(buildFixture());
    const g: Guide = outputs.guide[0]!;
    expect(g).toMatchObject({
      slug: 'fake-guide-ok',
      author: 'Fixture Author One',
      reviewer: 'Fixture Reviewer Two',
      reviewedAt: '2026-01-12T00:00:00.000Z',
      publishedAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-11T00:00:00.000Z',
      sections: [
        { heading: 'Fake heading one', body: ['Fake paragraph one.', 'Fake paragraph two.'] },
        { heading: 'Fake heading two', body: ['Fake paragraph three.'] },
      ],
      sources: [{ label: 'Fake source', url: 'https://example.com/fake-source' }],
      faqs: [{ q: 'Fake question about referrals?', a: 'Fake short answer about referrals.' }],
    });
    const r: Region = outputs.region[0]!;
    expect(r).not.toHaveProperty('narrative');
    expect(r).not.toHaveProperty('suburbs');
    expect(r).not.toHaveProperty('seo');
    const v: Vacancy = outputs.vacancy[0]!;
    expect(v).not.toHaveProperty('accessibilityFeatures');
    expect(v).not.toHaveProperty('photos');
    expect(v.regionSlug).toBe('alphaville-fixture');
    const l: LegalPage = outputs.legalPage.find((x) => x.slug === 'fake-policy-nosections')!;
    expect(l.sections).toEqual([]);
    expect(l).not.toHaveProperty('easyRead');
    const f: HelpFaq = outputs.faq[0]!;
    expect(f.a).toBe('Fake short answer about referrals.'); // short answer only; the long answer has no home in the site type
    const embedded: Faq = r.faqs[0]!;
    expect(embedded).toEqual({ q: 'Fake question about referrals?', a: 'Fake short answer about referrals.' });
  });

  it('never lets internal-only fields or Sanity bookkeeping reach the output', async () => {
    const raw = JSON.stringify(buildFixture());
    for (const marker of Object.values(INTERNAL_MARKERS)) expect(raw).toContain(marker); // the scan below is not vacuous
    const { files } = await pull(buildFixture());
    for (const [name, text] of Object.entries(files)) {
      for (const field of ['internalOwner', 'capacityNote', 'consentRef']) expect(text, `${name} mentions ${field}`).not.toContain(field);
      for (const marker of Object.values(INTERNAL_MARKERS)) expect(text, `${name} contains an internal value`).not.toContain(marker);
      for (const field of ['_rev', '_createdAt', '_id', '_type', 'nextReviewDue', 'longAnswer']) expect(text).not.toContain(`"${field}"`);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('production gate semantics are unchanged on the generated documents (src/lib/gate.ts)', () => {
  it('shows a pulled document only if its approver is on the allow-list, and hides it after any edit to the generated file', async () => {
    const { outputs } = await pull(buildFixture());
    const doc = outputs.region[0]!;
    expect(isApprovalCurrent(doc)).toBe(true);
    expect(isShown(doc, 'production', [FIXTURE_APPROVER])).toBe(true);
    expect(isShown(doc, 'production', ['someone-else'])).toBe(false);
    expect(isShown(doc, 'production', [])).toBe(false);
    expect(isShown(doc, 'production')).toBe(false); // the committed allow-list is empty today
    expect(isShown(doc, 'staging', [])).toBe(true);
    expect(isShown({ ...doc, summary: 'Edited by hand in the generated file.' }, 'production', [FIXTURE_APPROVER])).toBe(false);
  });

  it('a document approved by someone not on the list is still pulled (the allow-list is enforced at render time, as for local data)', async () => {
    const r = await pull([approve(region('fx-r-other'), 'unlisted-person')]);
    expect(r.outputs.region).toHaveLength(1);
    expect(isShown(r.outputs.region[0]!, 'production', [FIXTURE_APPROVER])).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('references', () => {
  it('excludes the referrer when a referenced document is a draft, missing, stale or not approved', async () => {
    const r = await pull([
      approve(faq('fx-f-ok')),
      asDraft(faq('fx-f-draft')),
      editedAfterApproval(faq('fx-f-stale'), 'shortAnswer', 'Fake answer, edited.'),
      approve(region('fx-r-ok', { faqs: [{ _type: 'reference', _ref: 'fx-f-ok' }] })),
      approve(region('fx-r-draftref', { faqs: [{ _type: 'reference', _ref: 'fx-f-draft' }] })),
      approve(region('fx-r-staleref', { faqs: [{ _type: 'reference', _ref: 'fx-f-stale' }] })),
      approve(region('fx-r-missingref', { faqs: [{ _type: 'reference', _ref: 'fx-f-nowhere' }] })),
    ]);
    expect(r.outputs.region.map((x) => x.slug)).toEqual(['fx-r-ok']);
    expect(exclusionsOf(r).filter((e) => e.startsWith('region:'))).toEqual([
      'region:fx-r-draftref:referenceNotApproved',
      'region:fx-r-missingref:referenceNotApproved',
      'region:fx-r-staleref:referenceNotApproved',
    ]);
    expect(r.manifest.references).toEqual({ requested: 4, resolved: 1, failedGate: 2, notReturned: 1 });
  });

  it('gates every reference, including ones the view model does not use (vacancy.property)', async () => {
    const r = await pull(buildFixture());
    expect(exclusionsOf(r)).toContain('vacancy:fx-vacancy-badproperty:referenceNotApproved');
  });

  it('does not treat image and file asset references as documents to gate', async () => {
    const r = await pull(buildFixture());
    expect(r.outputs.region.map((x) => x.slug)).toContain('alphaville-fixture'); // it carries an ogImage asset ref
    expect(r.manifest.exclusions.some((e) => /image-fakeasset/.test(e.detail ?? ''))).toBe(false);
  });

  it('a referenced document is checked again by id even if it was also fetched in a collection', async () => {
    const calls: string[] = [];
    const src = fixtureSource(buildFixture());
    const spy = { ...src, byIds: async (spec: Parameters<typeof src.byIds>[0]) => (calls.push(spec.query), src.byIds(spec)) };
    await runPull(spy);
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(calls)).toEqual(new Set([byIdsQuery]));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('mapping fails closed', () => {
  const guide = (extra: Doc) =>
    approve({
      ...sys('fx-g', 'guide'),
      title: 'Fake',
      slug: { _type: 'slug', current: 'fake' },
      answer: 'Fake.',
      sections: [{ _type: 'guideSection', _key: 'a', heading: 'H', body: pt('P') }],
      sources: [{ _type: 'source', _key: 's', label: 'L', url: 'https://example.com/x' }],
      author: { _type: 'reference', _ref: 'fx-a' },
      ...extra,
    });
  const author = approve({ ...sys('fx-a', 'author'), name: 'Fake Author', slug: { _type: 'slug', current: 'fake-author' } });
  const reasonFor = async (docs: Doc[]) => (await pull(docs)).manifest.exclusions.filter((e) => e.type !== 'serviceCoverage');

  it('accepts the minimal valid guide (so the failures below are caused by the one thing changed)', async () => {
    expect((await pull([guide({}), author])).outputs.guide).toHaveLength(1);
  });
  it.each([
    ['a missing title', { title: undefined }, /guide\.title/],
    ['a bad slug', { slug: { _type: 'slug', current: 'Not A Slug' } }, /guide\.slug/],
    ['no sections', { sections: [] }, /guide\.sections is empty/],
    ['a missing answer', { answer: ' ' }, /guide\.answer/],
    ['a non-https source link', { sources: [{ _type: 'source', _key: 's', label: 'L', url: 'http://example.com/x' }] }, /not an https link/],
    ['a missing author reference', { author: undefined }, /guide\.author/],
    ['an unparseable publication date', { publishedAt: 'last week' }, /guide\.publishedAt/],
  ])('excludes a guide with %s', async (_name, extra, pattern) => {
    const ex = await reasonFor([guide(extra as Doc), author]);
    expect(ex).toHaveLength(1);
    expect(ex[0]!.reason).toBe('mappingFailed');
    expect(ex[0]!.detail).toMatch(pattern);
  });
  it('excludes a document without a usable _updatedAt instead of inventing a date', async () => {
    const ex = await reasonFor([approve({ ...region('fx-r'), _updatedAt: undefined })]);
    expect(ex[0]).toMatchObject({ reason: 'mappingFailed', detail: '_updatedAt is missing or not a date' });
  });
  it('reasons name fields and positions, never content', async () => {
    const ex = await reasonFor([guide({ sections: [{ _type: 'guideSection', _key: 'a', heading: 'SECRET-HEADING', body: [block('SECRET-TEXT', {}, { marks: ['em'] })] }] }), author]);
    expect(ex[0]!.detail).not.toMatch(/SECRET/);
  });

  describe('portableTextToParagraphs', () => {
    it('keeps plain paragraphs, joins spans, drops blank paragraphs', () => {
      const two = { ...block('Fake one, '), children: [{ _type: 'span', text: 'Fake one, ', marks: [] }, { _type: 'span', text: 'continued.' }] };
      expect(portableTextToParagraphs([two, block('   '), block('Fake two.')], 'x')).toEqual(['Fake one, continued.', 'Fake two.']);
      expect(portableTextToParagraphs(undefined, 'x')).toEqual([]);
    });
    it.each([
      ['a heading', [block('H', { style: 'h2' })]],
      ['a quote', [block('Q', { style: 'blockquote' })]],
      ['a bullet', [block('B', { listItem: 'bullet' })]],
      ['a numbered item', [block('N', { listItem: 'number' })]],
      ['bold text', [block('B', {}, { marks: ['strong'] })]],
      ['a link', [{ ...block('L'), markDefs: [{ _key: 'k', _type: 'link', href: 'https://example.com' }], children: [{ _type: 'span', text: 'L', marks: ['k'] }] }]],
      ['an image block', [{ _type: 'image', asset: { _ref: 'image-x' } }]],
      ['a non-array', 'plain string'],
    ])('refuses %s', (_name, value) => {
      expect(() => portableTextToParagraphs(value, 'x')).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('deterministic output', () => {
  it('is byte-identical across runs and independent of input order', async () => {
    const docs = buildFixture();
    const a = await pull(docs);
    const b = await pull(docs);
    const c = await pull([...docs].reverse());
    const d = await pull([...docs.slice(7), ...docs.slice(0, 7)]);
    expect(b.files).toEqual(a.files);
    expect(c.files).toEqual(a.files);
    expect(d.files).toEqual(a.files);
  });
  it('sorts keys at every depth and ends with a newline', () => {
    const s = stableStringify({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } });
    expect(s).toBe('{\n  "a": {\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
  });
  it('orders documents by slug, then id, and faqs by creation time', async () => {
    const r = await pull([approve(region('b-region')), approve(region('a-region')), approve({ ...faq('f2'), _createdAt: '2026-03-01T00:00:00.000Z' }), approve({ ...faq('f1'), _createdAt: '2026-03-02T00:00:00.000Z', question: 'Second?' })]);
    expect(r.outputs.region.map((x) => x.slug)).toEqual(['a-region', 'b-region']);
    expect(r.outputs.faq.map((x) => x.q)).toEqual(['Fake question?', 'Second?']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('configuration (env only)', () => {
  it('reads a valid configuration and keeps the token out of every enumeration of it', () => {
    const c = readSanityConfig(ENV);
    expect(c.projectId).toBe('abcd1234');
    expect(c.dataset).toBe('staging');
    expect(c.token).toBe(TOKEN);
    expect(JSON.stringify(c)).not.toContain(TOKEN);
    expect(Object.keys(c)).toEqual(['projectId', 'dataset']);
    expect(JSON.stringify({ ...c })).not.toContain(TOKEN);
  });
  it('refuses to run if any variable is missing, naming each one', () => {
    expect(() => readSanityConfig({})).toThrow(/SANITY_PROJECT_ID, SANITY_DATASET, SANITY_READ_TOKEN/);
    expect(() => readSanityConfig({ ...ENV, SANITY_READ_TOKEN: undefined })).toThrow(/SANITY_READ_TOKEN/);
    expect(() => readSanityConfig({ ...ENV, SANITY_DATASET: '  ' })).toThrow(/SANITY_DATASET/);
    expect(() => readSanityConfig({ ...ENV, SANITY_PROJECT_ID: '' })).toThrow(SanityConfigError);
  });
  it('validates the formats like apps/studio/src/env.ts and never echoes a value', () => {
    for (const bad of [{ SANITY_PROJECT_ID: 'Bad ID!' }, { SANITY_PROJECT_ID: 'abc' }, { SANITY_DATASET: 'Prod Data' }, { SANITY_DATASET: '-x' }, { SANITY_READ_TOKEN: 'short' }, { SANITY_READ_TOKEN: 'has space in the token value' }]) {
      let message = '';
      try {
        readSanityConfig({ ...ENV, ...bad });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/looks invalid/);
      for (const v of Object.values(bad)) expect(message).not.toContain(v);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
const okResponse = (result: unknown, init: ResponseInit = {}) => new Response(JSON.stringify({ ms: 1, result }), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const config = () => readSanityConfig(ENV);

describe('HTTP client', () => {
  it('builds the documented URL: api host, dated version, dataset path, query and published perspective', () => {
    const url = buildQueryUrl(config(), '*[_type == "x"]');
    expect(url).toBe(`https://abcd1234.api.sanity.io/${SANITY_API_VERSION}/data/query/staging?query=${encodeURIComponent('*[_type == "x"]')}&perspective=published`);
    expect(SANITY_API_VERSION).toMatch(/^v\d{4}-\d{2}-\d{2}$/);
    expect(url).not.toContain('apicdn');
  });
  it('sends parameters as $name=<JSON>, sorted', () => {
    const u = new URL(buildQueryUrl(config(), '*[_id in $ids && x == $b]', { ids: ['a', 'b'], b: 'v' }));
    expect(u.searchParams.get('$ids')).toBe('["a","b"]');
    expect(u.searchParams.get('$b')).toBe('"v"');
    expect(u.searchParams.get('perspective')).toBe('published');
    expect(() => buildQueryUrl(config(), 'x', { 'bad name': 1 })).toThrow(SanityFetchError);
    expect(() => buildQueryUrl(config(), '')).toThrow(SanityFetchError);
    expect(() => buildQueryUrl(config(), 'x', { ids: Array.from({ length: 2000 }, (_, i) => `id-${i}`) })).toThrow(/too long/);
  });
  it('sends GET with a bearer token, refuses redirects, and returns the result', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const client = createSanityClient(config(), { fetch: async (url, init) => (seen.push({ url, init }), okResponse([{ _id: 'a' }])) });
    await expect(client.query('*[_type == "x"]', { ids: ['a'] })).resolves.toEqual([{ _id: 'a' }]);
    expect(seen).toHaveLength(1);
    const { url, init } = seen[0]!;
    expect(url.startsWith('https://abcd1234.api.sanity.io/')).toBe(true);
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('error');
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' });
    expect(init.body).toBeUndefined();
  });
  it('never puts the token in the URL', async () => {
    let seenUrl = '';
    await createSanityClient(config(), { fetch: async (url) => ((seenUrl = url), okResponse([])) }).query('*');
    expect(seenUrl).not.toContain(TOKEN);
  });

  const failing = (res: () => Response | Promise<Response>): FetchLike => async () => res();
  const caught = async (client: ReturnType<typeof createSanityClient>) => {
    try {
      await client.query('*');
    } catch (e) {
      return e as SanityFetchError;
    }
    throw new Error('expected the query to fail');
  };
  const BODY_SECRET = 'RESPONSE-BODY-SECRET-TEXT';

  it('HTTP errors carry the status but never the token, the response body or the query', async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 502]) {
      const e = await caught(createSanityClient(config(), { fetch: failing(() => new Response(JSON.stringify({ error: { description: `${BODY_SECRET} ${TOKEN}` } }), { status })) }));
      expect(e).toBeInstanceOf(SanityFetchError);
      expect(e.code).toBe('http');
      expect(e.status).toBe(status);
      for (const text of [e.message, String(e), e.stack ?? '', JSON.stringify(e)]) {
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain(BODY_SECRET);
      }
    }
  });
  it('network errors are reduced to fixed wording even if the thrown error contains the token', async () => {
    const e = await caught(createSanityClient(config(), { fetch: async () => { throw Object.assign(new TypeError(`fetch failed: ${TOKEN}`), { cause: { code: 'ECONNRESET', message: TOKEN } }); } }));
    expect(e.code).toBe('network');
    expect(e.message).toBe('Could not reach Sanity (ECONNRESET).');
    expect(`${e.stack}${e.message}`).not.toContain(TOKEN);
  });
  it('times out (default is 10 s) even when the fetch ignores the abort signal', async () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    const never: FetchLike = () => new Promise<Response>(() => undefined);
    const e = await caught(createSanityClient(config(), { fetch: never, timeoutMs: 25 }));
    expect(e.code).toBe('timeout');
    expect(e.message).toBe('Sanity request timed out after 25 ms.');
  });
  it('times out while reading a body that never finishes', async () => {
    const stalled: FetchLike = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"result":')); } }), { status: 200 });
    const e = await caught(createSanityClient(config(), { fetch: stalled, timeoutMs: 25 }));
    expect(e.code).toBe('timeout');
  });
  it('honours the abort signal it passes to fetch', async () => {
    let signal: AbortSignal | undefined;
    const f: FetchLike = (_u, init) => new Promise<Response>((_res, rej) => { signal = init.signal as AbortSignal; signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); });
    const e = await caught(createSanityClient(config(), { fetch: f, timeoutMs: 20 }));
    expect(e.code).toBe('timeout');
    expect(signal?.aborted).toBe(true);
  });
  it('enforces the size cap on the stream and on a declared content-length', async () => {
    expect(DEFAULT_MAX_BYTES).toBe(8 * 1024 * 1024);
    const big = JSON.stringify({ result: 'x'.repeat(5000) });
    const e1 = await caught(createSanityClient(config(), { fetch: failing(() => new Response(big)), maxBytes: 1000 }));
    expect(e1.code).toBe('too_large');
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(400)); } });
    const e2 = await caught(createSanityClient(config(), { fetch: failing(() => new Response(endless)), maxBytes: 1000 }));
    expect(e2.code).toBe('too_large');
    expect(pulled).toBeLessThan(10); // stopped reading, did not buffer without limit
    const e3 = await caught(createSanityClient(config(), { fetch: failing(() => new Response('{"result":1}', { headers: { 'content-length': '999999' } })), maxBytes: 1000 }));
    expect(e3.code).toBe('too_large');
    await expect(createSanityClient(config(), { fetch: failing(() => okResponse('x'.repeat(500))), maxBytes: 1000 }).query('*')).resolves.toBe('x'.repeat(500));
  });
  it('rejects non-JSON and unexpected shapes without quoting them', async () => {
    const e1 = await caught(createSanityClient(config(), { fetch: failing(() => new Response(`<html>${BODY_SECRET}</html>`)) }));
    expect(e1.code).toBe('parse');
    expect(e1.message).not.toContain(BODY_SECRET);
    const e2 = await caught(createSanityClient(config(), { fetch: failing(() => new Response(JSON.stringify({ nope: BODY_SECRET }))) }));
    expect(e2.code).toBe('shape');
    expect(e2.message).not.toContain(BODY_SECRET);
    const e3 = await caught(createSanityClient(config(), { fetch: failing(() => new Response(JSON.stringify([BODY_SECRET]))) }));
    expect(e3.code).toBe('shape');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
/** A fake Sanity Query API backed by the fixture. Answers only the exact queries exported by apps/studio/src/queries.ts. */
function fakeSanity(docs: Doc[], log: { query: string; ids?: string[]; auth: string | null }[] = []): FetchLike {
  const source = fixtureSource(docs);
  const typeByQuery = new Map<string, string>([
    [SITE_QUERIES.regions, 'region'],
    [SITE_QUERIES.guides, 'guide'],
    [SITE_QUERIES.faqs, 'faq'],
    [SITE_QUERIES.vacancies, 'vacancy'],
    [SITE_QUERIES.legalPages, 'legalPage'],
    [SITE_QUERIES.serviceCoverage, 'serviceCoverage'],
  ]);
  return async (url, init) => {
    const u = new URL(url);
    const query = u.searchParams.get('query') ?? '';
    const ids = u.searchParams.has('$ids') ? (JSON.parse(u.searchParams.get('$ids')!) as string[]) : undefined;
    log.push({ query, ...(ids ? { ids } : {}), auth: new Headers(init.headers).get('authorization') });
    if (query === byIdsQuery && ids) return okResponse(await source.byIds({ ids, query }));
    const type = typeByQuery.get(query);
    if (type) return okResponse(await source.collection({ type, query }));
    return new Response('unknown query', { status: 400 });
  };
}

describe('pipeline through the HTTP client (fake Sanity, no network)', () => {
  it('uses exactly the queries exported by the Studio, with the token, and matches the offline run', async () => {
    const log: { query: string; ids?: string[]; auth: string | null }[] = [];
    const docs = buildFixture();
    const viaHttp = await runPull(httpSource(createSanityClient(config(), { fetch: fakeSanity(docs, log) }), 'staging'));
    const offline = await pull(docs);
    expect(viaHttp.outputs).toEqual(offline.outputs);
    expect(viaHttp.manifest).toEqual({ ...offline.manifest, source: 'sanity', dataset: 'staging', apiVersion: SANITY_API_VERSION });
    const queries = new Set(log.map((l) => l.query));
    for (const q of [SITE_QUERIES.regions, SITE_QUERIES.guides, SITE_QUERIES.faqs, SITE_QUERIES.vacancies, SITE_QUERIES.legalPages, SITE_QUERIES.serviceCoverage, byIdsQuery]) expect(queries.has(q)).toBe(true);
    expect(queries.size).toBe(7);
    expect(log.every((l) => l.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(JSON.stringify(viaHttp.manifest)).not.toContain(TOKEN);
    expect(Object.values(viaHttp.files).join('')).not.toContain(TOKEN);
  });
  it('fetches referenced documents in chunks of at most REF_CHUNK_SIZE ids', async () => {
    const n = REF_CHUNK_SIZE + 5;
    const faqs = Array.from({ length: n }, (_, i) => approve(faq(`fx-many-${String(i).padStart(3, '0')}`)));
    const big = approve(region('fx-r-many', { faqs: faqs.map((f) => ({ _type: 'reference', _ref: f._id })) }));
    const log: { query: string; ids?: string[]; auth: string | null }[] = [];
    const r = await runPull(httpSource(createSanityClient(config(), { fetch: fakeSanity([...faqs, big], log) }), 'staging'));
    const idCalls = log.filter((l) => l.ids);
    expect(idCalls.length).toBe(2);
    expect(idCalls.every((l) => l.ids!.length <= REF_CHUNK_SIZE)).toBe(true);
    expect(idCalls.flatMap((l) => l.ids!).length).toBe(n);
    expect(r.outputs.region[0]!.faqs).toHaveLength(n);
  });
  it('fails the whole pull on a fetch error (so nothing is written) and the error stays clean', async () => {
    const e = await runPull(httpSource(createSanityClient(config(), { fetch: async () => new Response(TOKEN, { status: 500 }) }), 'staging')).catch((x: unknown) => x as Error);
    expect(e).toBeInstanceOf(SanityFetchError);
    expect((e as Error).message).not.toContain(TOKEN);
  });
  it('treats a malformed result as an error rather than guessing', async () => {
    await expect(runPull(httpSource(createSanityClient(config(), { fetch: async () => okResponse({ not: 'a list' }) }), 'staging'))).rejects.toThrow(PullError);
    await expect(runPull(httpSource(createSanityClient(config(), { fetch: async () => okResponse([{ no: 'id' }]) }), 'staging'))).rejects.toThrow(/malformed/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('output location', () => {
  it('defaults to src/content/cms and refuses anything outside apps/web, through symlinks too', () => {
    expect(resolveOutDir(web)).toBe(join(web.replace(/\/$/, ''), 'src', 'content', 'cms'));
    const dir = tmp();
    expect(resolveOutDir(web, dir)).toBe(dir);
    expect(resolveOutDir(web, join(dir, 'not', 'yet', 'created'))).toBe(join(dir, 'not', 'yet', 'created'));
    expect(() => resolveOutDir(web, '/tmp/ap-cms-outside')).toThrow(/inside apps\/web/);
    expect(() => resolveOutDir(web, '..')).toThrow(PullError);
    expect(() => resolveOutDir(web, '.')).toThrow(PullError);
    expect(() => resolveOutDir(web, join(web, '..', 'studio', 'x'))).toThrow(PullError);
    const outside = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'ap-cms-link-'));
    try {
      symlinkSync(outside, join(dir, 'escape'));
      expect(() => resolveOutDir(web, join(dir, 'escape', 'sub'))).toThrow(PullError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
const cleanEnv = () => {
  const env = { ...process.env };
  for (const k of ['SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_READ_TOKEN', 'CONTENT_SOURCE']) delete env[k];
  return env;
};
const cli = (args: string[], env: NodeJS.ProcessEnv = cleanEnv()) => spawnSync('pnpm', ['exec', 'tsx', 'scripts/cms-pull.ts', ...args], { cwd: web, encoding: 'utf8', env });
const fixturePath = join(web, 'tests', 'fixtures', 'cms', 'raw-documents.json');
const listFiles = (dir: string) => readdirSync(dir).sort();
const CLI_TIMEOUT = 90_000;

describe('cms:pull CLI (offline --fixture path, end to end)', () => {
  it('the committed fixture file is the output of the builder (regenerate with write-fixture.ts if the hash function changed on purpose)', () => {
    expect(JSON.parse(readFileSync(fixturePath, 'utf8'))).toEqual(JSON.parse(JSON.stringify(buildFixture())));
  });

  it('runs the whole pipeline into a temp dir, twice, with byte-identical files and no internal fields', { timeout: CLI_TIMEOUT }, async () => {
    const a = join(tmp(), 'out');
    const b = join(tmp(), 'out');
    const r1 = cli(['--fixture', fixturePath, '--out', a]);
    expect(r1.status, r1.stderr).toBe(0);
    const r2 = cli(['--fixture', fixturePath, '--out', b]);
    expect(r2.status, r2.stderr).toBe(0);
    expect(listFiles(a)).toEqual(['_manifest.json', 'faq.json', 'guide.json', 'legalPage.json', 'region.json', 'vacancy.json']);
    for (const f of listFiles(a)) expect(readFileSync(join(a, f), 'utf8'), f).toBe(readFileSync(join(b, f), 'utf8'));
    // the files on disk are what the in-process pipeline produces
    const inProcess = await pull(buildFixture());
    for (const [name, text] of Object.entries(inProcess.files)) expect(readFileSync(join(a, name), 'utf8')).toBe(text);
    // scan every written file for internal-only fields and values
    for (const f of listFiles(a)) {
      const text = readFileSync(join(a, f), 'utf8');
      for (const field of ['internalOwner', 'capacityNote', 'consentRef']) expect(text, `${f} mentions ${field}`).not.toContain(field);
      for (const marker of Object.values(INTERNAL_MARKERS)) expect(text, `${f} contains an internal value`).not.toContain(marker);
    }
    // stdout is the manifest
    expect(JSON.parse(r1.stdout)).toEqual(inProcess.manifest);
    // the generated documents satisfy the production gate for a listed approver
    const regions: Region[] = JSON.parse(readFileSync(join(a, 'region.json'), 'utf8'));
    expect(regions.map((x) => isShown(x, 'production', [FIXTURE_APPROVER]))).toEqual([true]);
    expect(statSync(join(a, 'region.json')).isFile()).toBe(true);
    expect(readdirSync(a).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('--dry-run prints the manifest and writes nothing', { timeout: CLI_TIMEOUT }, () => {
    const out = join(tmp(), 'never-created');
    const r = cli(['--fixture', fixturePath, '--out', out, '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).types.region.written).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses --out outside apps/web and writes nothing', { timeout: CLI_TIMEOUT }, () => {
    const outside = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'ap-cms-outside-'));
    try {
      const r = cli(['--fixture', fixturePath, '--out', join(outside, 'x')]);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/inside apps\/web/);
      expect(existsSync(join(outside, 'x'))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('without --fixture it needs the three env vars and says which are missing, before any network use', { timeout: CLI_TIMEOUT }, () => {
    const r = cli(['--dry-run']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/SANITY_PROJECT_ID, SANITY_DATASET, SANITY_READ_TOKEN/);
    const partial = cli(['--dry-run'], { ...cleanEnv(), SANITY_PROJECT_ID: 'abcd1234', SANITY_DATASET: 'staging' });
    expect(partial.status).toBe(1);
    expect(partial.stderr).toMatch(/SANITY_READ_TOKEN/);
    expect(partial.stderr).not.toMatch(/SANITY_PROJECT_ID|SANITY_DATASET/);
  });

  it('never prints the token, even when the configuration is rejected', { timeout: CLI_TIMEOUT }, () => {
    const r = cli(['--dry-run'], { ...cleanEnv(), SANITY_PROJECT_ID: 'Bad ID!', SANITY_DATASET: 'staging', SANITY_READ_TOKEN: TOKEN });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).not.toContain(TOKEN);
    expect(r.stderr).toMatch(/SANITY_PROJECT_ID looks invalid/);
  });

  it('reports usage errors with exit code 2 and a missing or invalid fixture with exit code 1', { timeout: CLI_TIMEOUT }, () => {
    expect(cli(['--wat']).status).toBe(2);
    expect(cli(['--fixture']).status).toBe(2);
    const missing = cli(['--fixture', join(tmp(), 'nope.json'), '--dry-run']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/not found/);
    const dir = tmp();
    writeFileSync(join(dir, 'bad.json'), '{not json');
    const bad = cli(['--fixture', join(dir, 'bad.json'), '--dry-run']);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not valid JSON/);
    writeFileSync(join(dir, 'obj.json'), '{"a":1}');
    expect(cli(['--fixture', join(dir, 'obj.json'), '--dry-run']).status).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('source.ts: cmsOr', () => {
  const local = [{ slug: 'local' }];
  const cms = [{ slug: 'cms' }];
  const files = { '../content/cms/region.json': cms, '../content/cms/_manifest.json': { source: 'x' }, '../content/cms/guide.json': 'not a list' };

  it('returns the local list unless CONTENT_SOURCE is exactly "sanity"', () => {
    for (const value of [undefined, '', 'local', 'Sanity', 'sanity ', 'true']) {
      expect(makeCmsOr(files, { getSource: () => value })('region', local)).toBe(local);
    }
  });
  it('returns the generated list when CONTENT_SOURCE=sanity and the file exists (even if it is empty)', () => {
    const f = makeCmsOr(files, { getSource: () => 'sanity' });
    expect(f('region', local)).toBe(cms);
    expect(makeCmsOr({ '../content/cms/vacancy.json': [] }, { getSource: () => 'sanity' })('vacancy', [{ slug: 'x' }])).toEqual([]);
  });
  it('falls back to local (with one warning per type) when the file is missing, is not a list, or is the manifest', () => {
    const warn = vi.fn();
    const f = makeCmsOr(files, { getSource: () => 'sanity', warn });
    expect(f('faq', local)).toBe(local);
    expect(f('faq', local)).toBe(local);
    expect(f('guide', local)).toBe(local);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toMatch(/no generated file for "faq"/);
  });
  it('the real cmsOr leaves the default build untouched when CONTENT_SOURCE is not set', () => {
    const before = process.env.CONTENT_SOURCE;
    delete process.env.CONTENT_SOURCE;
    try {
      expect(readContentSource()).toBeUndefined();
      expect(cmsOr('region', local)).toBe(local);
    } finally {
      if (before !== undefined) process.env.CONTENT_SOURCE = before;
    }
  });
  it('reads CONTENT_SOURCE from the process environment', () => {
    const before = process.env.CONTENT_SOURCE;
    process.env.CONTENT_SOURCE = 'sanity';
    try {
      expect(readContentSource()).toBe('sanity');
    } finally {
      if (before === undefined) delete process.env.CONTENT_SOURCE;
      else process.env.CONTENT_SOURCE = before;
    }
  });
});

describe('default build is untouched', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  it('nothing in src outside src/lib/cms imports the pull pipeline, the HTTP client or the mapper', () => {
    const offenders = walk(join(web, 'src'))
      .filter((f) => /\.(ts|astro|mjs|js)$/.test(f) && !f.includes(`${join('src', 'lib', 'cms')}/`))
      .filter((f) => /lib\/cms\/(pull|fetch|map)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
