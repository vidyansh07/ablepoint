import { describe, expect, it } from 'vitest';
import {
  canTransition,
  enquirySchema,
  findBannedPhrases,
  isApprovalCurrent,
  isVisible,
  normalisePath,
  normalisePhoneAU,
  validateRedirects,
  vacancyDisplay,
} from '../index';

const valid = {
  name: 'Sam Example',
  phone: '0412 345 678',
  referrerType: 'family',
  services: ['sil'],
  region: 'central-coast',
  contactMethod: 'phone',
  consent: true,
} as const;

describe('normalisePhoneAU', () => {
  it.each([
    ['0412 345 678', '+61412345678'],
    ['+61 412 345 678', '+61412345678'],
    ['(02) 4321 0000', '+61243210000'],
    ['61412345678', '+61412345678'],
  ])('%s -> %s', (i, o) => expect(normalisePhoneAU(i)).toBe(o));
  it.each(['12345', 'abc', '0112345678', '+1 415 555 0100'])('rejects %s', (i) => expect(normalisePhoneAU(i)).toBeNull());
});

describe('enquirySchema', () => {
  it('accepts a minimal valid enquiry', () => expect(enquirySchema.safeParse(valid).success).toBe(true));
  it('requires consent', () => expect(enquirySchema.safeParse({ ...valid, consent: false }).success).toBe(false));
  it('requires phone or email', () => {
    const r = enquirySchema.safeParse({ ...valid, phone: undefined, contactMethod: 'phone' });
    expect(r.success).toBe(false);
  });
  it('contact method email needs email', () => {
    const r = enquirySchema.safeParse({ ...valid, contactMethod: 'email' });
    expect(r.success).toBe(false);
  });
  it('accepts email only with email contact', () => {
    const r = enquirySchema.safeParse({ ...valid, phone: undefined, email: 'A@Example.com', contactMethod: 'email' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('a@example.com');
  });
  it('rejects invalid phone', () => expect(enquirySchema.safeParse({ ...valid, phone: '123' }).success).toBe(false));
  it('rejects honeypot content', () => expect(enquirySchema.safeParse({ ...valid, website: 'spam' }).success).toBe(false));
  it('requires at least one service', () => expect(enquirySchema.safeParse({ ...valid, services: [] }).success).toBe(false));
  it('strips unknown fields such as an NDIS number', () => {
    const r = enquirySchema.safeParse({ ...valid, ndisNumber: '430000000' });
    expect(r.success).toBe(true);
    if (r.success) expect(Object.keys(r.data)).not.toContain('ndisNumber');
  });
});

describe('content gate (AR-7)', () => {
  const base = { updatedAt: '2026-11-01T00:00:00Z' };
  it('draft is hidden in production, visible in staging', () => {
    expect(isVisible({ ...base, reviewState: 'draft' }, 'production')).toBe(false);
    expect(isVisible({ ...base, reviewState: 'draft' }, 'staging')).toBe(true);
  });
  it('approved without approver, time or hash is not current', () => {
    expect(isApprovalCurrent({ ...base, reviewState: 'approved', approvedAt: '2026-11-02T00:00:00Z' })).toBe(false);
    expect(isApprovalCurrent({ ...base, reviewState: 'approved', approvedBy: 'jo', approvedAt: '2026-11-02T00:00:00Z' })).toBe(false);
  });
  it('a wrong hash is not current', () => {
    expect(isApprovalCurrent({ ...base, title: 'x', reviewState: 'approved', approvedBy: 'jo', approvedAt: '2026-11-02T00:00:00Z', approvedContentHash: 'abc' })).toBe(false);
  });
});

describe('banned phrases', () => {
  it('flags NDIS approval and superlatives', () => {
    const hits = findBannedPhrases('We are an approved NDIS provider and the best provider in town');
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
  it('passes plain compliant wording', () => {
    expect(findBannedPhrases('AblePoint Australia is a registered NDIS provider.')).toEqual([]);
  });
  it('flags known misspellings', () => {
    expect(findBannedPhrases('Ablepoint Austrialia short term accomodation').length).toBe(2);
  });
});

describe('vacancy lifecycle', () => {
  it('enforces transitions and roles', () => {
    expect(canTransition('draft', 'readyForReview', 'contentEditor')).toBe(true);
    expect(canTransition('draft', 'available', 'administrator')).toBe(false);
    expect(canTransition('readyForReview', 'available', 'contentEditor')).toBe(false);
    expect(canTransition('available', 'filled', 'vacancyOwner')).toBe(true);
    expect(canTransition('filled', 'available', 'administrator')).toBe(false);
  });
  const now = new Date('2026-11-20T00:00:00Z');
  it('shows stale availability as unconfirmed', () => {
    expect(vacancyDisplay('available', '2026-11-15T00:00:00Z', now)).toBe('available');
    expect(vacancyDisplay('available', '2026-10-01T00:00:00Z', now)).toBe('unconfirmed');
    expect(vacancyDisplay('available', undefined, now)).toBe('unconfirmed');
  });
  it('never shows filled/archived as available; hides drafts', () => {
    expect(vacancyDisplay('filled', '2026-11-19T00:00:00Z', now)).toBe('noLongerAvailable');
    expect(vacancyDisplay('archived', undefined, now)).toBe('noLongerAvailable');
    expect(vacancyDisplay('draft', undefined, now)).toBe('hidden');
  });
});

describe('redirect validation', () => {
  const r = (from: string, to: string) => ({ from, to, status: 301 as const, reason: 't', approved: false });
  it('normalises paths', () => expect(normalisePath('/Abc')).toBe('/abc/'));
  it('detects chains, duplicates and self-redirects', () => {
    const problems = validateRedirects([r('/a/', '/b/'), r('/b/', '/c/'), r('/a/', '/d/'), r('/e/', '/e/')]);
    const text = problems.map((p) => p.problem).join('|');
    expect(text).toMatch(/chain/);
    expect(text).toMatch(/duplicate/);
    expect(text).toMatch(/itself/);
  });
  it('accepts a clean map', () => expect(validateRedirects([r('/old/', '/new/')])).toEqual([]));
});
