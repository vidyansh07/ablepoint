import { describe, expect, it } from 'vitest';
import { mayTrack, parseConsent, safePagePath, sanitiseEvent } from '../index';

describe('sanitiseEvent', () => {
  it('rejects unknown events', () => expect(sanitiseEvent('purchase')).toBeNull());
  it('keeps allow-listed params and drops unknown ones', () => {
    const e = sanitiseEvent('phone_click', { page_path: '/sda/', cta_location: 'header', secret: 'x', userId: '123' });
    expect(e).toEqual({ event: 'phone_click', params: { page_path: '/sda/', cta_location: 'header' } });
  });
  it('strips query strings and fragments from page_path', () => {
    expect(sanitiseEvent('vacancy_view', { page_path: '/vacancies/x/?name=Sam+Example&phone=0412345678#top' })?.params.page_path).toBe('/vacancies/x/');
  });
  it.each(['sam@example.com', '0412 345 678', '+61 412 345 678', '430123456', '430 123 456'])('drops the whole event when a value looks like personal data: %s', (v) => {
    expect(sanitiseEvent('referral_cta', { cta_location: v })).toBeNull();
  });
  it('ignores non-string params', () => expect(sanitiseEvent('gbp_click', { region: 5 })?.params).toEqual({}));
  it('truncates long values', () => expect(sanitiseEvent('referral_cta', { cta_location: 'a'.repeat(200) })?.params.cta_location).toHaveLength(64));
  it('page path without leading slash falls back to root', () => expect(safePagePath('evil')).toBe('/'));
});

describe('consent', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  it('is null when absent, malformed or wrong version', () => {
    expect(parseConsent(null, now)).toBeNull();
    expect(parseConsent('not json', now)).toBeNull();
    expect(parseConsent(JSON.stringify({ v: 2, analytics: true, ts: now.toISOString() }), now)).toBeNull();
  });
  it('expires after 180 days and rejects future timestamps', () => {
    expect(parseConsent(JSON.stringify({ v: 1, analytics: true, ts: '2026-01-01T00:00:00Z' }), now)).toBeNull();
    expect(parseConsent(JSON.stringify({ v: 1, analytics: true, ts: '2027-01-01T00:00:00Z' }), now)).toBeNull();
  });
  it('only tracks on an explicit yes', () => {
    expect(mayTrack(null)).toBe(false);
    expect(mayTrack(parseConsent(JSON.stringify({ v: 1, analytics: false, ts: now.toISOString() }), now))).toBe(false);
    expect(mayTrack(parseConsent(JSON.stringify({ v: 1, analytics: true, ts: now.toISOString() }), now))).toBe(true);
  });
});
