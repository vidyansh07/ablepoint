import { describe, expect, it } from 'vitest';
import { readStudioEnv } from '../env';
import { APPROVED_PREFILTER, FORBIDDEN_PUBLIC_FIELDS, INTERNAL_ONLY_FIELDS, SITE_QUERIES, byIdsQuery, collectRefIds, rawApprovedQuery, rawSingletonQuery, stripInternalFields } from '../queries';

describe('readStudioEnv', () => {
  const ok = { SANITY_STUDIO_PROJECT_ID: 'abc123xy', SANITY_STUDIO_DATASET: 'staging' };
  it('reads project, dataset and reviewer ids', () => {
    expect(readStudioEnv({ ...ok, SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS: 'u1, u2' })).toEqual({ projectId: 'abc123xy', dataset: 'staging', reviewerIds: ['u1', 'u2'] });
  });
  it('has no default project or dataset', () => {
    expect(() => readStudioEnv({})).toThrow(/PROJECT_ID is not set/);
    expect(() => readStudioEnv({ SANITY_STUDIO_PROJECT_ID: 'abc123xy' })).toThrow(/DATASET is not set/);
  });
  it('rejects malformed values', () => {
    expect(() => readStudioEnv({ ...ok, SANITY_STUDIO_PROJECT_ID: 'Bad ID!' })).toThrow(/invalid/);
    expect(() => readStudioEnv({ ...ok, SANITY_STUDIO_DATASET: 'Prod Data' })).toThrow(/invalid/);
  });
  it('empty reviewer list means nobody can edit approval fields', () => {
    expect(readStudioEnv(ok).reviewerIds).toEqual([]);
  });
});

describe('site GROQ queries return raw documents (the approval hash covers the whole document)', () => {
  const entries = Object.entries(SITE_QUERIES);
  it.each(entries)('%s has no projection, no reference expansion, no aliasing', (_name, q) => {
    expect(q).not.toMatch(/[{}]/); // a projection would drop or rewrite fields
    expect(q).not.toContain('->'); // references are hashed unresolved
    expect(q).not.toMatch(/"\w+"\s*:/); // no aliasing such as "q": question
    expect(q).not.toContain('|'); // no pipes into order()/projection
  });
  it.each(entries)('%s requires reviewState approved and excludes drafts and versions', (_name, q) => {
    expect(q).toContain('reviewState == "approved"');
    expect(q).toContain('!(_id in path("drafts.**"))');
    expect(q).toContain('!(_id in path("versions.**"))');
  });
  it.each(entries)('%s has balanced brackets', (_name, q) => {
    for (const [open, close] of [['[', ']'], ['(', ')']] as const) expect(q.split(open).length).toBe(q.split(close).length);
  });
  it('builds collection and singleton queries', () => {
    expect(rawApprovedQuery('service')).toBe(`*[_type == "service" && ${APPROVED_PREFILTER}]`);
    expect(rawSingletonQuery('footer')).toContain('_id == "footer"');
    expect(rawSingletonQuery('footer')).toMatch(/\[0\]$/);
  });
  it('vacancy query never fetches draft or ready-for-review vacancies', () => {
    expect(SITE_QUERIES.vacancies).toContain('status in ["available", "temporarilyUnavailable", "filled"]');
    expect(SITE_QUERIES.vacancies).not.toMatch(/"draft"|"readyForReview"/);
  });
  it('referenced documents are fetched raw by id and still require approval', () => {
    expect(byIdsQuery).toContain('_id in $ids');
    expect(byIdsQuery).toContain('reviewState == "approved"');
    expect(byIdsQuery).not.toMatch(/[{}]|->/);
  });
});

describe('after the gate: references and internal fields', () => {
  it('collects unresolved _ref values anywhere in the tree, de-duplicated', () => {
    const doc = {
      _type: 'region',
      faqs: [{ _type: 'reference', _ref: 'faq-1', _key: 'a' }, { _type: 'reference', _ref: 'faq-2' }],
      seo: { ogImage: { image: { asset: { _ref: 'image-abc' } } } },
      related: [{ _ref: 'faq-1' }],
    };
    expect(collectRefIds(doc).sort()).toEqual(['faq-1', 'faq-2', 'image-abc']);
    expect(collectRefIds(null)).toEqual([]);
    expect(collectRefIds({ title: 'no refs' })).toEqual([]);
  });
  it('strips internal-only and review-only fields from a copy', () => {
    const doc = { _type: 'vacancy', title: 'Home', internalOwner: 'Central Coast intake', approvedContentHash: 'x', approvedBy: 'u', approvedAt: 't', reviewedAt: 'r', nextReviewDue: 'n', status: 'available' };
    const out = stripInternalFields(doc);
    expect(out).toEqual({ _type: 'vacancy', title: 'Home', status: 'available' });
    expect(doc.internalOwner).toBe('Central Coast intake'); // original untouched
    expect(stripInternalFields({ _type: 'serviceCoverage', capacityNote: 'secret', available: true })).toEqual({ _type: 'serviceCoverage', available: true });
    expect(stripInternalFields({ _type: 'testimonial', consentRef: 'C-1', quote: 'Kind staff' })).toEqual({ _type: 'testimonial', quote: 'Kind staff' });
  });
  it('every forbidden public field is covered by the internal-only map', () => {
    const covered = new Set(Object.values(INTERNAL_ONLY_FIELDS).flat());
    for (const f of FORBIDDEN_PUBLIC_FIELDS) expect(covered.has(f)).toBe(true);
  });
});
