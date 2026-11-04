/**
 * FAKE raw Sanity documents for the CMS pull tests. Every name, id, URL and sentence here is made up for testing. Nothing
 * describes the real organisation. Approved documents are signed with the real `approvalFields` from @ablepoint/schemas, so
 * they pass or fail the real gate for the real reasons.
 *
 * `raw-documents.json` in this folder is the output of `buildFixture()`. A test checks they match.
 * Regenerate it with:  pnpm --filter @ablepoint/web exec tsx tests/fixtures/cms/write-fixture.ts
 */
import { approvalFields } from '@ablepoint/schemas';

export type Doc = Record<string, unknown>;

export const FIXTURE_APPROVER = 'fixture-reviewer-1';
export const FIXTURE_APPROVED_AT = '2026-01-15T00:00:00.000Z';

/** Values that must never appear in any generated file. */
export const INTERNAL_MARKERS = {
  internalOwner: 'FAKE-INTERNAL-OWNER-ROLE',
  capacityNote: 'FAKE-CAPACITY-NOTE-DO-NOT-PUBLISH',
  consentRef: 'FAKE-CONSENT-REF-001',
} as const;

const ref = (id: string, key = `k-${id}`) => ({ _type: 'reference', _ref: id, _key: key });
const slug = (current: string) => ({ _type: 'slug', current });
const sys = (id: string, type: string, n = 1): Doc => ({
  _id: id,
  _type: type,
  _rev: `rev-${id}`,
  _createdAt: `2026-01-0${n}T00:00:00.000Z`,
  _updatedAt: `2026-01-1${n}T00:00:00.000Z`,
});

/** A plain Portable Text block with one unmarked span. */
export const block = (text: string, extra: Doc = {}, spanExtra: Doc = {}): Doc => ({
  _type: 'block',
  _key: `b-${text.length}-${text.slice(0, 3)}`,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: 's1', text, marks: [], ...spanExtra }],
  ...extra,
});
export const pt = (...paragraphs: string[]) => paragraphs.map((p) => block(p));
const section = (heading: string, body: unknown, key = `sec-${heading.length}`) => ({ _type: 'guideSection', _key: key, heading, body });

/** Signs a document the way the Studio Approve action does. */
export const approve = (doc: Doc, by: string = FIXTURE_APPROVER): Doc => ({ ...doc, ...approvalFields(doc, by, new Date(FIXTURE_APPROVED_AT)) });
export const asDraft = (doc: Doc): Doc => ({ ...doc, reviewState: 'draft' });
export const asInReview = (doc: Doc): Doc => ({ ...doc, reviewState: 'inReview' });
/** Approved, then edited afterwards: the stored hash no longer matches. */
export const editedAfterApproval = (doc: Doc, field: string, value: unknown): Doc => ({ ...approve(doc), [field]: value });

export function buildFixture(): Doc[] {
  const asset1 = 'image-fakeasset0001-200x200-png';
  const asset2 = 'image-fakeasset0002-300x300-jpg';

  const faqs: Doc[] = [
    approve({ ...sys('fx-faq-referrals', 'faq'), question: 'Fake question about referrals?', shortAnswer: 'Fake short answer about referrals.', longAnswer: pt('Fake long answer, not carried to the site.'), topics: ['Referrals'] }),
    approve({ ...sys('fx-faq-housing', 'faq', 2), question: 'Fake question about housing?', shortAnswer: 'Fake short answer about housing.', topics: ['Housing'] }),
    approve({ ...sys('fx-faq-othertopic', 'faq', 3), question: 'Fake question with an unknown topic?', shortAnswer: 'Fake short answer.', topics: ['Not a site topic'] }),
    asDraft({ ...sys('fx-faq-draft', 'faq', 4), question: 'Fake draft question?', shortAnswer: 'Fake draft answer.', topics: ['Housing'] }),
  ];

  const authors: Doc[] = [
    approve({ ...sys('fx-author-1', 'author'), name: 'Fixture Author One', slug: slug('fixture-author-one'), credentials: 'Fake role', consentRef: INTERNAL_MARKERS.consentRef }),
    approve({ ...sys('fx-author-2', 'author', 2), name: 'Fixture Reviewer Two', slug: slug('fixture-reviewer-two'), consentRef: INTERNAL_MARKERS.consentRef }),
    asDraft({ ...sys('fx-author-draft', 'author', 3), name: 'Fixture Draft Author', slug: slug('fixture-draft-author'), consentRef: INTERNAL_MARKERS.consentRef }),
  ];

  const services: Doc[] = [
    approve({ ...sys('fx-service-alpha', 'service'), title: 'Fake service alpha', slug: slug('fake-service-alpha'), summary: 'Fake summary.', whoFor: 'Fake audience.', provides: ['Fake item'], process: ['Fake step one', 'Fake step two'], faqs: [] }),
    asDraft({ ...sys('fx-service-draft', 'service', 2), title: 'Fake service draft', slug: slug('fake-service-draft'), summary: 'Fake summary.', whoFor: 'Fake audience.', provides: ['Fake item'], process: ['One', 'Two'] }),
  ];

  const regionBase = (id: string, n: number, name: string, slugValue: string, extra: Doc = {}): Doc => ({
    ...sys(id, 'region', n),
    name,
    slug: slug(slugValue),
    summary: `Fake summary for ${name}.`,
    officeType: 'serviceArea',
    suburbs: ['Fake Suburb One'],
    narrative: pt('Fake local information, not carried to the site.'),
    localContactLabel: 'Fake intake role',
    seo: { _type: 'seo', title: 'Fake SEO title', ogImage: { _type: 'mediaAsset', image: { _type: 'image', asset: ref(asset1) }, alt: 'Fake alt' } },
    ...extra,
  });
  const regions: Doc[] = [
    approve(regionBase('fx-region-alpha', 1, 'Alphaville Fixture', 'alphaville-fixture', { isHeadOfficeRegion: true, faqs: [ref('fx-faq-referrals'), ref('fx-faq-housing')] })),
    asDraft(regionBase('fx-region-draft', 2, 'Draftville Fixture', 'draftville-fixture')),
    asInReview(regionBase('fx-region-inreview', 3, 'Reviewton Fixture', 'reviewton-fixture')),
    editedAfterApproval(regionBase('fx-region-edited', 4, 'Editedburg Fixture', 'editedburg-fixture'), 'summary', 'Fake summary changed after approval.'),
    approve(regionBase('fx-region-badref', 5, 'Badrefton Fixture', 'badrefton-fixture', { faqs: [ref('fx-faq-draft')] })),
    (() => {
      const { approvedBy: _drop, ...rest } = approve(regionBase('fx-region-noapprover', 6, 'Noapprover Fixture', 'noapprover-fixture'));
      return rest;
    })(),
    // An approved copy under a drafts. id: never published, must be ignored.
    approve({ ...regionBase('drafts.fx-region-alpha', 1, 'Alphaville Fixture', 'alphaville-fixture'), summary: 'Fake unpublished draft copy.' }),
  ];

  const coverage: Doc[] = [
    approve({ ...sys('fx-cov-1', 'serviceCoverage'), service: ref('fx-service-alpha'), region: ref('fx-region-alpha'), available: true, publicBlurb: 'Fake blurb.', capacityNote: INTERNAL_MARKERS.capacityNote }),
    approve({ ...sys('fx-cov-2', 'serviceCoverage', 2), service: ref('fx-service-alpha'), region: ref('fx-region-edited'), available: false, capacityNote: INTERNAL_MARKERS.capacityNote }),
    approve({ ...sys('fx-cov-3', 'serviceCoverage', 3), service: ref('fx-service-draft'), region: ref('fx-region-alpha'), available: true }),
    editedAfterApproval({ ...sys('fx-cov-4', 'serviceCoverage', 4), service: ref('fx-service-alpha'), region: ref('fx-region-alpha'), available: true }, 'publicBlurb', 'Fake blurb edited after approval.'),
  ];

  const guideBase = (id: string, n: number, slugValue: string, extra: Doc = {}): Doc => ({
    ...sys(id, 'guide', n),
    title: `Fake guide ${slugValue}`,
    slug: slug(slugValue),
    answer: 'Fake answer-first summary for tests only.',
    sections: [section('Fake heading one', pt('Fake paragraph one.', 'Fake paragraph two.'), 'sec-a'), section('Fake heading two', pt('Fake paragraph three.'), 'sec-b')],
    sources: [{ _type: 'source', _key: 'src-a', label: 'Fake source', url: 'https://example.com/fake-source' }],
    faqs: [ref('fx-faq-referrals')],
    author: ref('fx-author-1'),
    ...extra,
  });
  const guides: Doc[] = [
    approve(guideBase('fx-guide-ok', 1, 'fake-guide-ok', { reviewer: ref('fx-author-2'), publishedAt: '2026-01-05T00:00:00.000Z', reviewedAt: '2026-01-12T00:00:00.000Z' })),
    approve(guideBase('fx-guide-list', 2, 'fake-guide-list', { sections: [section('Fake heading', [block('Fake list item', { listItem: 'bullet', level: 1 })], 'sec-l')] })),
    approve(guideBase('fx-guide-bold', 3, 'fake-guide-bold', { sections: [section('Fake heading', [block('Fake bold text', {}, { marks: ['strong'] })], 'sec-b')] })),
    approve(guideBase('fx-guide-heading', 4, 'fake-guide-heading', { sections: [section('Fake heading', [block('Fake sub heading', { style: 'h3' })], 'sec-h')] })),
    approve(guideBase('fx-guide-authordraft', 5, 'fake-guide-authordraft', { author: ref('fx-author-draft') })),
    approve(guideBase('fx-guide-nosources', 6, 'fake-guide-nosources', { sources: [] })),
    approve(guideBase('fx-guide-badurl', 7, 'fake-guide-badurl', { sources: [{ _type: 'source', _key: 'src-x', label: 'Fake link', url: 'javascript:alert(1)' }] })),
    approve(guideBase('fx-guide-dup-a', 8, 'fake-guide-dup')),
    approve(guideBase('fx-guide-dup-b', 9, 'fake-guide-dup')),
    asDraft(guideBase('fx-guide-draft', 1, 'fake-guide-draft')),
  ];

  const property = approve({ ...sys('fx-property-1', 'property'), title: 'Fake property', slug: slug('fake-property'), region: ref('fx-region-alpha'), suburb: 'Fake Suburb', classification: 'SIL', features: ['Fake feature'] });
  const propertyDraft = asDraft({ ...sys('fx-property-draft', 'property', 2), title: 'Fake draft property', slug: slug('fake-draft-property'), region: ref('fx-region-alpha'), suburb: 'Fake Suburb', classification: 'SIL' });
  const vacancyBase = (id: string, n: number, slugValue: string, extra: Doc = {}): Doc => ({
    ...sys(id, 'vacancy', n),
    title: `Fake vacancy ${slugValue}`,
    slug: slug(slugValue),
    property: ref('fx-property-1'),
    region: ref('fx-region-alpha'),
    suburb: 'Fake Suburb',
    type: 'SIL',
    status: 'available',
    summary: 'Fake availability summary.',
    features: ['Fake feature'],
    accessibilityFeatures: ['Fake accessibility feature, not carried to the site'],
    photos: [{ _type: 'mediaAsset', _key: 'p1', image: { _type: 'image', asset: ref(asset2) }, alt: 'Fake alt text', rightsStatus: 'owned' }],
    lastVerifiedAt: '2026-11-01T00:00:00.000Z',
    internalOwner: INTERNAL_MARKERS.internalOwner,
    ...extra,
  });
  const vacancies: Doc[] = [
    approve(vacancyBase('fx-vacancy-ok', 1, 'fake-vacancy-ok')),
    approve(vacancyBase('fx-vacancy-draftstatus', 2, 'fake-vacancy-draftstatus', { status: 'draft' })),
    approve(vacancyBase('fx-vacancy-badproperty', 3, 'fake-vacancy-badproperty', { property: ref('fx-property-draft') })),
    editedAfterApproval(vacancyBase('fx-vacancy-edited', 4, 'fake-vacancy-edited'), 'status', 'filled'),
  ];

  const legalBase = (id: string, n: number, slugValue: string, extra: Doc = {}): Doc => ({
    ...sys(id, 'legalPage', n),
    title: `Fake policy ${slugValue}`,
    slug: slug(slugValue),
    description: 'Fake description for tests only.',
    version: '1.0',
    effectiveDate: '2026-01-01',
    sections: [{ _type: 'legalSection', _key: 'ls-a', heading: 'Fake section heading', body: pt('Fake policy paragraph.') }],
    ...extra,
  });
  const legalPages: Doc[] = [
    approve(legalBase('fx-legal-ok', 1, 'fake-policy-ok')),
    approve(legalBase('fx-legal-bold', 2, 'fake-policy-bold', { sections: [{ _type: 'legalSection', _key: 'ls-b', heading: 'Fake section', body: [block('Fake bold text', {}, { marks: ['strong'] })] }] })),
    approve(legalBase('fx-legal-nosections', 3, 'fake-policy-nosections', { sections: undefined })),
  ];

  return [...faqs, ...authors, ...services, ...regions, ...coverage, ...guides, property, propertyDraft, ...vacancies, ...legalPages];
}
