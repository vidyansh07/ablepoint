/* eslint-disable @typescript-eslint/no-explicit-any */
import { approvalFields } from '@ablepoint/schemas';
import { afterEach, describe, expect, it } from 'vitest';
import { schemaTypes } from '../schemas';
import { DOCUMENT_TYPES, OBJECT_TYPES, REVIEW_STATES, SINGLETON_TYPES, VACANCY_STATUSES } from '../constants';
import { allFieldNames, findField, findType, runValidation } from './helpers';

const names = (schemaTypes as any[]).map((t) => t.name);
const docs = (schemaTypes as any[]).filter((t) => t.type === 'document');

describe('schema inventory (docs/06 §2)', () => {
  it('defines all 20 content types: 18 documents and 2 objects', () => {
    expect(docs.map((d) => d.name).sort()).toEqual([...DOCUMENT_TYPES].sort());
    for (const o of OBJECT_TYPES) expect(findType(o).type).toBe('object');
    expect(DOCUMENT_TYPES.length + OBJECT_TYPES.length).toBe(20);
  });
  it('has unique type names', () => expect(new Set(names).size).toBe(names.length));
  it('every reference points at a defined type', () => {
    const refs: string[] = [];
    const walk = (fields: any[] | undefined) => {
      for (const f of fields ?? []) {
        if (f.type === 'reference') refs.push(...f.to.map((t: any) => t.type));
        for (const m of f.of ?? []) {
          if (m.type === 'reference') refs.push(...m.to.map((t: any) => t.type));
          walk(m.fields);
        }
        walk(f.fields);
      }
    };
    for (const t of schemaTypes as any[]) walk(t.fields);
    for (const r of refs) expect(names).toContain(r);
  });
  it('every named custom field type is defined', () => {
    const used = new Set<string>();
    const walk = (fields: any[] | undefined) => {
      for (const f of fields ?? []) {
        used.add(f.type);
        for (const m of f.of ?? []) {
          used.add(m.type);
          walk(m.fields);
        }
        walk(f.fields);
      }
    };
    for (const t of schemaTypes as any[]) walk(t.fields);
    const builtin = new Set(['string', 'text', 'boolean', 'number', 'array', 'object', 'reference', 'slug', 'url', 'datetime', 'date', 'image', 'block']);
    for (const u of used) if (!builtin.has(u)) expect(names).toContain(u);
  });
  it('page blocks are all defined', () => {
    for (const b of ['heroBlock', 'richTextBlock', 'cardGridBlock', 'ctaBlock', 'faqBlock', 'processStepsBlock', 'trustStripBlock', 'mediaTextBlock']) expect(names).toContain(b);
    expect(findField('page', 'blocks').of.length).toBe(8);
  });
});

describe('review fields on every document type', () => {
  it.each(DOCUMENT_TYPES)('%s carries the review fields', (type) => {
    const fields = findType(type).fields.map((f: any) => f.name);
    for (const f of ['reviewState', 'approvedBy', 'approvedAt', 'reviewedAt', 'nextReviewDue', 'missingFacts']) expect(fields).toContain(f);
  });
  it.each(DOCUMENT_TYPES)('%s review fields are in the review group', (type) => {
    for (const n of ['reviewState', 'approvedBy', 'approvedAt']) expect(findField(type, n).group).toBe('review');
    expect(findType(type).groups.map((g: any) => g.name)).toContain('review');
  });
  it('reviewState defaults to draft and offers exactly the three states', () => {
    const f = findField('service', 'reviewState');
    expect(f.initialValue).toBe('draft');
    expect(f.options.list.map((o: any) => o.value)).toEqual([...REVIEW_STATES]);
  });
  it('singletons are the three global documents', () => {
    expect([...SINGLETON_TYPES]).toEqual(['siteSettings', 'navigation', 'footer']);
    for (const s of SINGLETON_TYPES) expect(names).toContain(s);
  });
});

describe('approval fields are a soft control tied to the reviewer allow-list', () => {
  const original = process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS;
  afterEach(() => {
    if (original === undefined) delete process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS;
    else process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = original;
  });
  it.each(['approvedBy', 'approvedAt'])('%s is readOnly unless the user is a listed reviewer', (name) => {
    const f = findField('guide', name);
    expect(typeof f.readOnly).toBe('function');
    process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = 'u-reviewer1, u-reviewer2';
    expect(f.readOnly({ currentUser: { id: 'u-reviewer2' } })).toBe(false);
    expect(f.readOnly({ currentUser: { id: 'u-editor' } })).toBe(true);
    expect(f.readOnly({ currentUser: null })).toBe(true);
  });
  it('is locked for everyone when no reviewer list is configured', () => {
    delete process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS;
    expect(findField('service', 'approvedBy').readOnly({ currentUser: { id: 'anyone' } })).toBe(true);
  });
  it('an editor cannot publish an "approved" document without the approval record', () => {
    process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = 'u-reviewer1';
    const f = findField('service', 'reviewState');
    const content = { _type: 'service', title: 'SIL', summary: 'Help at home.' };
    expect(runValidation(f, 'approved', { document: { ...content, reviewState: 'approved' } }).errors.length).toBeGreaterThan(0);
    const approved = { ...content, ...approvalFields(content, 'u-reviewer1', new Date()) };
    expect(runValidation(f, 'approved', { document: approved }).errors).toEqual([]);
    const byEditor = { ...content, ...approvalFields(content, 'u-editor', new Date()) };
    expect(runValidation(f, 'approved', { document: byEditor }).errors.join()).toMatch(/reviewer list/);
  });
  it('warns when content is edited after approval', () => {
    process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = 'u-reviewer1';
    const f = findField('service', 'reviewState');
    const content = { _type: 'service', title: 'SIL' };
    const edited = { ...content, ...approvalFields(content, 'u-reviewer1', new Date()), title: 'SIL changed' };
    expect(runValidation(f, 'approved', { document: edited }).warnings.join()).toMatch(/edited after it was approved/);
  });
});

describe('no street addresses or contact details (docs/06 §2, §5)', () => {
  const forbidden = /^(street|streetaddress|address|addressline\d?|address\d|postcode|unit|lot)$/i;
  it.each(['region', 'property', 'vacancy', 'siteSettings', 'serviceCoverage'])('%s has no address-like field', (t) => {
    for (const n of allFieldNames(findType(t))) expect(n).not.toMatch(forbidden);
  });
  it('phone, email and registration live only in siteSettings', () => {
    for (const d of docs) {
      if (d.name === 'siteSettings') continue;
      for (const n of allFieldNames(d)) expect(n).not.toMatch(/^(phone|phoneDisplay|phoneHref|telephone|mobile|email|abn|ndisRegistrationNumber)$/i);
    }
  });
  it('free-text fields on region/property/vacancy reject street addresses', () => {
    for (const [t, f] of [['region', 'summary'], ['property', 'title'], ['property', 'suburb'], ['vacancy', 'summary'], ['vacancy', 'title']] as const) {
      expect(runValidation(findField(t, f), 'Lovely home at 12 Mann Street').errors.join()).toMatch(/street address/i);
      expect(runValidation(findField(t, f), 'Lovely home in Gosford').errors).toEqual([]);
    }
  });
  it('public text rejects typed phone numbers and emails, and warns on banned phrases', () => {
    const f = findField('service', 'summary');
    expect(runValidation(f, 'Ring 1300 088 549').errors.length).toBe(1);
    expect(runValidation(f, 'Mail hello@ablepointaustralia.com.au').errors.length).toBe(1);
    const w = runValidation(f, 'We are the best NDIS provider');
    expect(w.errors).toEqual([]);
    expect(w.warnings.length).toBe(1);
  });
  it('rich text applies the same rules to Portable Text', () => {
    const f = findField('service', 'fundingNote');
    const block = (t: string) => [{ _type: 'block', children: [{ text: t }] }];
    expect(runValidation(f, block('Call 0412 345 678')).errors.length).toBe(1);
    expect(runValidation(f, block('An approved NDIS provider')).warnings.length).toBe(1);
    expect(runValidation(f, block('Plain text')).errors).toEqual([]);
  });
  it('rich text has no Heading 1 (the template owns the page H1)', () => {
    const styles = findField('service', 'fundingNote').of[0].styles.map((s: any) => s.value);
    expect(styles).not.toContain('h1');
    expect(styles).toContain('h2');
  });
});

describe('slugs', () => {
  const slugTypes = ['page', 'service', 'region', 'guide', 'legalPage', 'landingPage', 'property', 'vacancy', 'author', 'teamMember'];
  it.each(slugTypes)('%s has a controlled slug', (t) => {
    const f = findField(t, 'slug');
    expect(f.type).toBe('slug');
    expect(f.options.maxLength).toBe(96);
    expect(f.options.slugify('Short Term Accommodation & Respite')).toBe('short-term-accommodation-and-respite');
    expect(runValidation(f, { current: 'Bad Slug' }).errors.length).toBe(1);
    expect(runValidation(f, { current: 'good-slug' }).errors).toEqual([]);
  });
  it('top-level types block reserved route names', () => {
    for (const t of ['page', 'service', 'legalPage']) expect(runValidation(findField(t, 'slug'), { current: 'referral' }).errors.join()).toMatch(/reserved/);
    expect(runValidation(findField('guide', 'slug'), { current: 'referral' }).errors).toEqual([]);
  });
});

describe('media alt text, rights and consent', () => {
  it('alt text is required unless decorative', () => {
    const f = findField('mediaAsset', 'alt');
    expect(runValidation(f, '', { parent: { decorative: false } }).errors.length).toBe(1);
    expect(runValidation(f, '', { parent: { decorative: true } }).errors).toEqual([]);
    expect(runValidation(f, 'Support worker and participant cooking together', { parent: { decorative: false } }).errors).toEqual([]);
    expect(runValidation(f, 'x', { parent: { decorative: true } }).errors.length).toBe(1);
  });
  it('unknown image rights are an error; people need consent', () => {
    expect(runValidation(findField('mediaAsset', 'rightsStatus'), 'unknown').errors.length).toBe(1);
    expect(runValidation(findField('mediaAsset', 'rightsStatus'), 'own').errors).toEqual([]);
    const c = findField('mediaAsset', 'consentStatus');
    expect(runValidation(c, 'pending', { parent: { showsPeople: true } }).errors.length).toBe(1);
    expect(runValidation(c, 'obtained', { parent: { showsPeople: true } }).errors).toEqual([]);
    expect(runValidation(c, 'notApplicable', { parent: { showsPeople: false } }).errors).toEqual([]);
  });
  it('has no keywords field in SEO (meta keywords tag is not used)', () => {
    expect(allFieldNames(findType('seo'))).not.toContain('keywords');
  });
});

describe('testimonials and team (consent, G-04)', () => {
  it('testimonial requires a consent reference and a false outcome claim', () => {
    expect(runValidation(findField('testimonial', 'consentRef'), '').errors.length).toBeGreaterThan(0);
    expect(runValidation(findField('testimonial', 'consentRef'), 'CONSENT-001').errors).toEqual([]);
    const o = findField('testimonial', 'outcomeClaim');
    expect(o.initialValue).toBe(false);
    expect(runValidation(o, true).errors.length).toBe(1);
    expect(runValidation(o, false).errors).toEqual([]);
    expect(runValidation(o, undefined).errors.length).toBe(1);
  });
  it('testimonial attribution is first name or initials; quotes cannot imply outcomes', () => {
    expect(runValidation(findField('testimonial', 'attribution'), 'Sam Thompson').errors.length).toBe(1);
    expect(runValidation(findField('testimonial', 'attribution'), 'Sam T.').errors).toEqual([]);
    expect(runValidation(findField('testimonial', 'quote'), 'They got my funding approved').errors.length).toBeGreaterThan(0);
    expect(runValidation(findField('testimonial', 'quote'), 'Always on time and kind.').errors).toEqual([]);
  });
  it('team member requires consent and is hidden by default', () => {
    expect(runValidation(findField('teamMember', 'consentRef'), undefined).errors.length).toBeGreaterThan(0);
    expect(findField('teamMember', 'visible').initialValue).toBe(false);
  });
});

describe('vacancy lifecycle in the schema', () => {
  it('offers all six statuses and defaults to draft', () => {
    const f = findField('vacancy', 'status');
    expect(f.options.list.map((o: any) => o.value)).toEqual([...VACANCY_STATUSES]);
    expect(f.initialValue).toBe('draft');
  });
  it('cannot be available without a recent lastVerifiedAt', () => {
    const f = findField('vacancy', 'status');
    expect(runValidation(f, 'available', { document: { status: 'available' } }).errors.length).toBe(1);
    const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(runValidation(f, 'available', { document: { lastVerifiedAt: fresh } }).errors).toEqual([]);
    const stale = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(runValidation(f, 'available', { document: { lastVerifiedAt: stale } }).errors.length).toBe(1);
    expect(runValidation(f, 'filled', { document: {} }).errors).toEqual([]);
  });
  it('internal owner must be a role label', () => {
    expect(runValidation(findField('vacancy', 'internalOwner'), 'sam@example.com').errors.length).toBe(1);
    expect(runValidation(findField('vacancy', 'internalOwner'), 'Central Coast intake').errors).toEqual([]);
  });
});

describe('site settings and misc rules', () => {
  it('validates phone, tel link and email', () => {
    expect(runValidation(findField('siteSettings', 'phoneDisplay'), '1300 088 549').errors).toEqual([]);
    expect(runValidation(findField('siteSettings', 'phoneDisplay'), '621-254-2147').errors.length).toBe(1);
    expect(runValidation(findField('siteSettings', 'phoneHref'), 'tel:1300 088 549').errors.length).toBe(1);
    expect(runValidation(findField('siteSettings', 'email'), 'contact@support').errors.length).toBe(1);
    expect(runValidation(findField('siteSettings', 'email'), 'hello@ablepointaustralia.com.au').errors).toEqual([]);
  });
  it('registration number needs a source link; ABN checksum', () => {
    const f = findField('siteSettings', 'ndisRegistrationNumber');
    expect(runValidation(f, '4-ABCD-1234', { document: {} }).errors.length).toBe(1);
    expect(runValidation(f, '4-ABCD-1234', { document: { registrationSourceUrl: 'https://www.ndiscommission.gov.au/x' } }).errors).toEqual([]);
    expect(runValidation(findField('siteSettings', 'abn'), '51 824 753 557').errors.length).toBe(1);
  });
  it('redirect paths are validated', () => {
    expect(runValidation(findField('redirect', 'from'), '/Old').errors.length).toBe(1);
    expect(runValidation(findField('redirect', 'to'), '/old/', { document: { from: '/old/', status: 301 } }).errors.length).toBe(1);
    expect(runValidation(findField('redirect', 'to'), '/new/', { document: { from: '/old/', status: 301 } }).errors).toEqual([]);
  });
  it('guides need sources; answers are length-checked as a warning', () => {
    expect(findField('guide', 'sources').of[0].fields.map((f: any) => f.name)).toContain('url');
    expect(runValidation(findField('guide', 'answer'), 'too short').warnings.length).toBe(1);
    expect(runValidation(findField('guide', 'answer'), Array(50).fill('word').join(' ')).warnings).toEqual([]);
    expect(runValidation(findField('guide', 'sources').of[0].fields.find((f: any) => f.name === 'url'), 'http://insecure.example').errors.length).toBe(1);
  });
  it('CTA tracking ids and nav items', () => {
    expect(findField('cta', 'trackingId').validation).toBeTypeOf('function');
    expect(runValidation(findField('cta', 'target'), 'referral').errors.length).toBe(1);
    const navValidation = (findType('navItem') as any).validation;
    expect(navValidation).toBeTypeOf('function');
  });
  it('landing pages are hidden from search by default', () => {
    expect(findField('landingPage', 'noindex').initialValue).toBe(true);
  });
});
