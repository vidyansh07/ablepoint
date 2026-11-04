import { describe, expect, it } from 'vitest';
import {
  canEditApprovalFields,
  containsEmail,
  containsPhone,
  extractPortableText,
  parseReviewerIds,
  slugify,
  validateAbn,
  validateAlt,
  validateAnswerLength,
  validateApprovalFields,
  validateAttribution,
  validateConsentRef,
  validateEmail,
  validateHttpsUrl,
  validateImageConsent,
  validateInternalOwnerLabel,
  validateInternalPath,
  validateLastVerifiedNotFuture,
  validateNoBannedPhrases,
  validateNoContactDetails,
  validateNoStreetAddress,
  validateOutcomeClaim,
  validatePhoneDisplay,
  validatePhoneHref,
  validatePublicText,
  validateRedirectFrom,
  validateRedirectTo,
  validateRegistration,
  validateReviewDates,
  validateRights,
  validateSlug,
  validateTestimonialQuote,
  validateVacancyAvailability,
  wordCount,
} from '../validation';

const block = (text: string) => ({ _type: 'block', children: [{ _type: 'span', text }] });
const now = new Date('2026-11-20T00:00:00Z');

describe('slug', () => {
  it('accepts lowercase url-safe slugs', () => {
    for (const s of ['core-support', 'sda', 'a1-b2', 'x']) expect(validateSlug(s)).toBe(true);
  });
  it.each(['', undefined])('requires a slug (%s)', (s) => expect(validateSlug(s as string | undefined)).not.toBe(true));
  it.each(['Core-Support', 'core support', 'core_support', '-core', 'core-', 'core--support', 'café', 'a/b', 'a.b'])('rejects %s', (s) =>
    expect(validateSlug(s)).not.toBe(true),
  );
  it('rejects overlong slugs', () => expect(validateSlug('a'.repeat(97))).toMatch(/96/));
  it('blocks reserved top-level slugs only when topLevel', () => {
    expect(validateSlug('guides', { topLevel: true })).toMatch(/reserved/);
    expect(validateSlug('referral', { topLevel: true })).toMatch(/reserved/);
    expect(validateSlug('guides')).toBe(true);
  });
  it('slugify normalises text', () => {
    expect(slugify('Supported Independent Living (SIL)')).toBe('supported-independent-living-sil');
    expect(slugify('Café & Co  ')).toBe('cafe-and-co');
    expect(slugify('---Hello---')).toBe('hello');
    expect(validateSlug(slugify('Short Term Accommodation / Respite!'))).toBe(true);
  });
  it('slugify output is always valid or empty and within the limit', () => {
    const out = slugify('x'.repeat(200));
    expect(out.length).toBeLessThanOrEqual(96);
    expect(validateSlug(out)).toBe(true);
  });
});

describe('alt text and media', () => {
  it('requires alt unless decorative', () => {
    expect(validateAlt('', false)).not.toBe(true);
    expect(validateAlt(undefined, undefined)).not.toBe(true);
    expect(validateAlt('Two people planting seedlings in a community garden', false)).toBe(true);
  });
  it('decorative images must have no alt', () => {
    expect(validateAlt('', true)).toBe(true);
    expect(validateAlt('something', true)).not.toBe(true);
  });
  it('rejects "image of" prefixes and overlong alt', () => {
    expect(validateAlt('Image of a house', false)).not.toBe(true);
    expect(validateAlt('Photo of a house', false)).not.toBe(true);
    expect(validateAlt('a'.repeat(161), false)).not.toBe(true);
  });
  it('unknown rights are blocked', () => {
    expect(validateRights('unknown')).not.toBe(true);
    expect(validateRights(undefined)).not.toBe(true);
    expect(validateRights('own')).toBe(true);
    expect(validateRights('stock')).toBe(true);
    expect(validateRights('bogus')).not.toBe(true);
  });
  it('people in images need consent', () => {
    expect(validateImageConsent(true, 'pending')).not.toBe(true);
    expect(validateImageConsent(true, undefined)).not.toBe(true);
    expect(validateImageConsent(true, 'obtained')).toBe(true);
    expect(validateImageConsent(false, undefined)).toBe(true);
  });
});

describe('testimonials and people', () => {
  it('needs a consent reference', () => {
    expect(validateConsentRef('')).not.toBe(true);
    expect(validateConsentRef('  ')).not.toBe(true);
    expect(validateConsentRef('AB')).not.toBe(true);
    expect(validateConsentRef('CONSENT-2026-014')).toBe(true);
    expect(validateConsentRef('x'.repeat(121))).not.toBe(true);
  });
  it('outcomeClaim must be explicitly false', () => {
    expect(validateOutcomeClaim(false)).toBe(true);
    expect(validateOutcomeClaim(true)).not.toBe(true);
    expect(validateOutcomeClaim(undefined)).not.toBe(true);
  });
  it('attribution is a first name or initials only', () => {
    for (const ok of ['Sam', 'Sam T.', 'Sam T', 'S.']) expect(validateAttribution(ok)).toBe(true);
    for (const bad of ['', 'Sam Thompson', 'Sam Tee Jones', 'x'.repeat(31)]) expect(validateAttribution(bad)).not.toBe(true);
  });
  it('quotes implying funding or eligibility outcomes are errors', () => {
    expect(validateTestimonialQuote('They got my funding approved quickly')).not.toBe(true);
    expect(validateTestimonialQuote('We were approved for more hours')).not.toBe(true);
    expect(validateTestimonialQuote('My son was cured')).not.toBe(true);
    expect(validateTestimonialQuote('The staff are kind and always on time.')).toBe(true);
    expect(validateTestimonialQuote(undefined)).toBe(true);
  });
});

describe('vacancy availability', () => {
  it('only constrains the available status', () => {
    for (const status of ['draft', 'readyForReview', 'temporarilyUnavailable', 'filled', 'archived'])
      expect(validateVacancyAvailability({ status }, now)).toBe(true);
  });
  it('available requires a recent lastVerifiedAt', () => {
    expect(validateVacancyAvailability({ status: 'available' }, now)).not.toBe(true);
    expect(validateVacancyAvailability({ status: 'available', lastVerifiedAt: '2026-11-15T00:00:00Z' }, now)).toBe(true);
    expect(validateVacancyAvailability({ status: 'available', lastVerifiedAt: '2026-11-06T00:00:00Z' }, now)).toBe(true); // exactly 14 days
    expect(validateVacancyAvailability({ status: 'available', lastVerifiedAt: '2026-11-05T00:00:00Z' }, now)).toMatch(/15 days/);
  });
  it('rejects invalid and future dates', () => {
    expect(validateVacancyAvailability({ status: 'available', lastVerifiedAt: 'nope' }, now)).toMatch(/valid/);
    expect(validateVacancyAvailability({ status: 'available', lastVerifiedAt: '2026-12-25T00:00:00Z' }, now)).toMatch(/future/);
    expect(validateLastVerifiedNotFuture('2026-12-25T00:00:00Z', now)).not.toBe(true);
    expect(validateLastVerifiedNotFuture('2026-11-19T00:00:00Z', now)).toBe(true);
    expect(validateLastVerifiedNotFuture(undefined, now)).toBe(true);
  });
  it('internal owner is a role label, not a person contact', () => {
    expect(validateInternalOwnerLabel('Central Coast intake')).toBe(true);
    expect(validateInternalOwnerLabel('sam@example.com')).not.toBe(true);
    expect(validateInternalOwnerLabel('0412 345 678')).not.toBe(true);
    expect(validateInternalOwnerLabel(undefined)).toBe(true);
    expect(validateInternalOwnerLabel('x'.repeat(61))).not.toBe(true);
  });
});

describe('text rules', () => {
  it('extracts portable text', () => {
    expect(extractPortableText([block('Hello'), { _type: 'image' }, block('World')])).toBe('Hello\nWorld');
    expect(extractPortableText('plain')).toBe('plain');
    expect(extractPortableText(undefined)).toBe('');
    expect(extractPortableText([{ _type: 'block' }])).toBe('');
  });
  it('banned phrases (warning-level) are detected in strings and portable text', () => {
    expect(validateNoBannedPhrases('We are the best NDIS provider')).not.toBe(true);
    expect(validateNoBannedPhrases([block('An approved NDIS provider')])).toMatch(/approved/i);
    expect(validateNoBannedPhrases('AblePoint is a registered NDIS provider.')).toBe(true);
    expect(validateNoBannedPhrases('Ablepoint Austrialia')).not.toBe(true);
    expect(validateNoBannedPhrases(undefined)).toBe(true);
  });
  it('detects emails and AU phone numbers', () => {
    expect(containsEmail('write to hello@ablepointaustralia.com.au today')).toBe(true);
    expect(containsEmail('no contact here')).toBe(false);
    for (const p of ['call 1300 088 549', 'call 0412 345 678', 'call (02) 4321 0000'.replace(/[()]/g, ''), 'call +61 412 345 678', 'call 13 12 34']) expect(containsPhone(p)).toBe(true);
    for (const p of ['In 2026 we opened 12 homes', 'Plan number 430000001 is private'.replace(/\d{9}/, 'X'), 'Rooms 4 and 5']) expect(containsPhone(p)).toBe(false);
  });
  it('contact details are errors in public text', () => {
    expect(validateNoContactDetails('Email us at a@b.co')).not.toBe(true);
    expect(validateNoContactDetails([block('Ring 1300 088 549')])).not.toBe(true);
    expect(validateNoContactDetails('Use the contact page.')).toBe(true);
  });
  it('street addresses are errors; suburbs are fine', () => {
    for (const a of ['Located at 12 Mann Street', 'Unit 3/45 Beach Road, Terrigal', 'at 7A Pacific Highway', '221 Baker St']) expect(validateNoStreetAddress(a)).not.toBe(true);
    for (const ok of ['Near the shops in Terrigal', 'A three bedroom home in Gosford', 'Room 4 of 5 in a shared home']) expect(validateNoStreetAddress(ok)).toBe(true);
  });
  it('validatePublicText splits errors from warnings', () => {
    const r = validatePublicText('Call 1300 088 549 for the best NDIS provider');
    expect(r.errors.length).toBe(1);
    expect(r.warnings.length).toBe(1);
    expect(validatePublicText('Plain text')).toEqual({ errors: [], warnings: [] });
  });
  it('answer length guidance', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('one two  three')).toBe(3);
    expect(validateAnswerLength('')).toBe(true);
    expect(validateAnswerLength('too short')).not.toBe(true);
    expect(validateAnswerLength(Array(50).fill('word').join(' '))).toBe(true);
    expect(validateAnswerLength(Array(120).fill('word').join(' '))).not.toBe(true);
  });
});

describe('contact and settings', () => {
  it('phone display accepts AU formats', () => {
    for (const p of ['1300 088 549', '1800 123 456', '13 12 34', '0412 345 678', '(02) 4321 0000', '+61 2 4321 0000']) expect(validatePhoneDisplay(p)).toBe(true);
    for (const p of ['', '12345', '555-1234', '621-254-2147']) expect(validatePhoneDisplay(p)).not.toBe(true);
  });
  it('tel href is digits only', () => {
    expect(validatePhoneHref('tel:1300088549')).toBe(true);
    expect(validatePhoneHref('tel:+61243210000')).toBe(true);
    for (const h of ['', 'tel:1300 088 549', '1300088549', 'tel:abc']) expect(validatePhoneHref(h)).not.toBe(true);
  });
  it('email validation', () => {
    expect(validateEmail('hello@ablepointaustralia.com.au')).toBe(true);
    for (const e of ['', 'Hello@x.com', 'nope', 'a@b', 'contact@support']) expect(validateEmail(e)).not.toBe(true);
  });
  it('ABN checksum', () => {
    expect(validateAbn('51 824 753 556')).toBe(true);
    expect(validateAbn('53004085616')).toBe(true);
    expect(validateAbn('51 824 753 557')).not.toBe(true);
    expect(validateAbn('1234')).not.toBe(true);
    expect(validateAbn('')).toBe(true);
    expect(validateAbn(undefined)).toBe(true);
  });
  it('https urls', () => {
    expect(validateHttpsUrl('https://www.ndis.gov.au/participants')).toBe(true);
    expect(validateHttpsUrl('http://example.com')).not.toBe(true);
    expect(validateHttpsUrl('example.com')).not.toBe(true);
    expect(validateHttpsUrl(undefined)).toBe(true);
  });
  it('registration number needs a source link', () => {
    expect(validateRegistration('', undefined)).toBe(true);
    expect(validateRegistration('4-ABCD-1234', undefined)).not.toBe(true);
    expect(validateRegistration('4-ABCD-1234', 'https://www.ndiscommission.gov.au/x')).toBe(true);
  });
});

describe('approval fields (soft control and validation)', () => {
  const good = { reviewState: 'approved', approvedBy: 'a1', approvedAt: '2026-11-19T00:00:00Z', approvedContentHash: 'abc' };
  it('parses the reviewer allow-list', () => {
    expect(parseReviewerIds(' a1 , b2,,c3 ')).toEqual(['a1', 'b2', 'c3']);
    expect(parseReviewerIds('')).toEqual([]);
    expect(parseReviewerIds(undefined)).toEqual([]);
  });
  it('only listed users can edit approval fields; empty list means nobody', () => {
    expect(canEditApprovalFields('a1', ['a1', 'b2'])).toBe(true);
    expect(canEditApprovalFields('z9', ['a1'])).toBe(false);
    expect(canEditApprovalFields(undefined, ['a1'])).toBe(false);
    expect(canEditApprovalFields('a1', [])).toBe(false);
  });
  it('approved documents need approver, time and the approval record', () => {
    expect(validateApprovalFields({ reviewState: 'draft' }, [], now)).toBe(true);
    expect(validateApprovalFields({ reviewState: 'inReview' }, [], now)).toBe(true);
    expect(validateApprovalFields({ reviewState: 'approved' }, [], now)).not.toBe(true);
    expect(validateApprovalFields({ reviewState: 'approved', approvedBy: 'a1' }, [], now)).not.toBe(true);
    expect(validateApprovalFields({ reviewState: 'approved', approvedBy: 'a1', approvedAt: '2026-11-19T00:00:00Z' }, [], now)).toMatch(/no approval record/);
    expect(validateApprovalFields(good, [], now)).toBe(true);
  });
  it('typing "approved" by hand (no hash) is rejected', () => {
    expect(validateApprovalFields({ ...good, approvedContentHash: undefined }, ['a1'], now)).not.toBe(true);
    expect(validateApprovalFields({ ...good, approvedContentHash: '' }, ['a1'], now)).not.toBe(true);
  });
  it('approver must be on the allow-list when configured', () => {
    expect(validateApprovalFields({ ...good, approvedBy: 'z9' }, ['a1'], now)).toMatch(/not on the compliance reviewer list/);
    expect(validateApprovalFields(good, ['a1'], now)).toBe(true);
  });
  it('rejects invalid, future and unknown values', () => {
    expect(validateApprovalFields({ ...good, approvedAt: 'x' }, [], now)).toMatch(/valid/);
    expect(validateApprovalFields({ ...good, approvedAt: '2027-01-01T00:00:00Z' }, [], now)).toMatch(/future/);
    expect(validateApprovalFields({ reviewState: 'published' }, [], now)).toMatch(/Unknown/);
  });
  it('review dates must be ordered', () => {
    expect(validateReviewDates('2026-11-01T00:00:00Z', '2027-05-01T00:00:00Z')).toBe(true);
    expect(validateReviewDates('2026-11-01T00:00:00Z', '2026-10-01T00:00:00Z')).not.toBe(true);
    expect(validateReviewDates(undefined, '2026-10-01T00:00:00Z')).toBe(true);
  });
});

describe('redirects and paths', () => {
  it('from path', () => {
    expect(validateRedirectFrom('/short-term-accomodation/')).toBe(true);
    for (const f of ['', 'old/', '/Old/', '/old', '/old/?x=1', '/old/*']) expect(validateRedirectFrom(f)).not.toBe(true);
  });
  it('to path', () => {
    expect(validateRedirectTo('/new/', '/old/', 301)).toBe(true);
    expect(validateRedirectTo('/locations/dubbo/#sil', '/old/', 301)).toBe(true);
    expect(validateRedirectTo('/old/', '/old/', 301)).toMatch(/itself/);
    expect(validateRedirectTo('https://elsewhere.example/', '/old/', 301)).toMatch(/stay on this site/);
    expect(validateRedirectTo('/New', '/old/', 301)).not.toBe(true);
    expect(validateRedirectTo(undefined, '/old/', 301)).not.toBe(true);
    expect(validateRedirectTo(undefined, '/old/', 410)).toBe(true);
  });
  it('internal paths', () => {
    expect(validateInternalPath('/referral/')).toBe(true);
    expect(validateInternalPath(undefined)).toBe(true);
    for (const p of ['referral', '//evil.example', '/a b']) expect(validateInternalPath(p)).not.toBe(true);
  });
});
