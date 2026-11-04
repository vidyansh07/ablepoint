import { describe, expect, it } from 'vitest';
import { businessMinutesElapsed, contactBlock, DEFAULT_BUSINESS_HOURS, isBusinessHours, isQuietHours, localParts, maskEmail, maskPhone, nextQuietHoursEnd } from '../common';
import { syd, sydWinter } from './helpers';

describe('contactBlock', () => {
  const ok = { consentToContact: true, doNotContact: false, optedOut: false };
  it('allows contact with consent', () => expect(contactBlock(ok)).toBeNull());
  it('blocks without consent', () => expect(contactBlock({ ...ok, consentToContact: false })).toBe('no_consent'));
  it('blocks when opted out', () => expect(contactBlock({ ...ok, optedOut: true })).toBe('opted_out'));
  it('do-not-contact overrides consent and opt-out', () => {
    expect(contactBlock({ consentToContact: true, doNotContact: true, optedOut: false })).toBe('do_not_contact');
    expect(contactBlock({ consentToContact: true, doNotContact: true, optedOut: true })).toBe('do_not_contact');
  });
});

describe('localParts', () => {
  it('converts to Sydney local time with weekday', () => {
    expect(localParts(new Date('2026-11-03T00:00:00Z'), 'Australia/Sydney')).toEqual({ date: '2026-11-03', hour: 11, minute: 0, isoWeekday: 2 });
  });
  it('handles midnight as hour 0, not 24', () => {
    expect(localParts(syd('2026-11-04T00:05'), 'Australia/Sydney').hour).toBe(0);
  });
});

describe('quiet hours (21:00–08:00 Sydney)', () => {
  it.each([
    ['2026-11-03T20:59', false],
    ['2026-11-03T21:00', true],
    ['2026-11-04T03:00', true],
    ['2026-11-04T07:59', true],
    ['2026-11-04T08:00', false],
    ['2026-11-04T12:00', false],
  ])('%s -> quiet=%s', (t, quiet) => expect(isQuietHours(syd(t))).toBe(quiet));
  it('follows the winter offset (AEST)', () => {
    expect(isQuietHours(sydWinter('2026-07-01T07:59'))).toBe(true);
    expect(isQuietHours(sydWinter('2026-07-01T08:00'))).toBe(false);
  });
  it('defers an evening instant to 08:00 next day', () => {
    expect(nextQuietHoursEnd(syd('2026-11-03T22:30')).getTime()).toBe(syd('2026-11-04T08:00').getTime());
  });
  it('defers an early-morning instant to 08:00 same day', () => {
    expect(nextQuietHoursEnd(syd('2026-11-04T03:15')).getTime()).toBe(syd('2026-11-04T08:00').getTime());
  });
  it('returns the same instant outside quiet hours', () => {
    const t = syd('2026-11-04T12:00');
    expect(nextQuietHoursEnd(t)).toBe(t);
  });
});

describe('business hours (assumed Mon–Fri 09:00–17:00)', () => {
  it.each([
    ['2026-11-03T09:00', true],
    ['2026-11-03T08:59', false],
    ['2026-11-03T16:59', true],
    ['2026-11-03T17:00', false],
    ['2026-11-07T10:00', false], // Saturday
    ['2026-11-08T10:00', false], // Sunday
  ])('%s -> open=%s', (t, open) => expect(isBusinessHours(syd(t))).toBe(open));
  it('treats listed holidays as closed', () => {
    expect(isBusinessHours(syd('2026-11-03T10:00'), { ...DEFAULT_BUSINESS_HOURS, holidays: ['2026-11-03'] })).toBe(false);
  });
});

describe('businessMinutesElapsed', () => {
  it('counts only business minutes across a day boundary', () => {
    expect(businessMinutesElapsed(syd('2026-11-03T16:50'), syd('2026-11-04T09:10'))).toBe(20);
  });
  it('skips the weekend', () => {
    expect(businessMinutesElapsed(syd('2026-11-06T16:55'), syd('2026-11-09T09:05'))).toBe(10);
  });
  it('is zero for a Saturday-only range', () => {
    expect(businessMinutesElapsed(syd('2026-11-07T10:00'), syd('2026-11-07T12:00'))).toBe(0);
  });
  it('returns 0 when to <= from', () => {
    expect(businessMinutesElapsed(syd('2026-11-03T10:00'), syd('2026-11-03T09:00'))).toBe(0);
  });
  it('stops counting at the cap', () => {
    expect(businessMinutesElapsed(syd('2026-11-03T09:00'), syd('2026-11-05T09:00'), DEFAULT_BUSINESS_HOURS, 30)).toBe(30);
  });
});

describe('masking', () => {
  it('masks phone numbers but keeps the last three digits', () => {
    const m = maskPhone('+61412345678');
    expect(m).toBe('+61******678');
    expect(m).not.toContain('12345');
  });
  it('masks emails', () => expect(maskEmail('jo@example.com')).toBe('j***@example.com'));
  it('masks short or invalid input fully', () => {
    expect(maskPhone('12')).toBe('***');
    expect(maskEmail('nope')).toBe('***');
  });
});

describe('containsNdisNumberLike', () => {
  it.each([['430123456'], ['430 123 456'], ['430-123-456'], ['Resident 430 123 456 lives here']])('detects %s', async (t) => {
    const { containsNdisNumberLike } = await import('../identifiers');
    expect(containsNdisNumberLike(t)).toBe(true);
  });
  it.each([['1300 088 549'], ['0412 345 678'], ['12345678'], ['4301234567'], ['Call us today']])('ignores %s', async (t) => {
    const { containsNdisNumberLike } = await import('../identifiers');
    expect(containsNdisNumberLike(t)).toBe(false);
  });
});
