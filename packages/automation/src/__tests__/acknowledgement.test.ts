import { describe, expect, it } from 'vitest';
import { ackSlaMet, humanResponseSla, planAcknowledgement } from '../acknowledgement';
import { days, hours, minutes, syd } from './helpers';

const allowed = { consentToContact: true, doNotContact: false, optedOut: false };
const base = { permission: allowed, contact: { phoneE164: '+61412345678', email: 'sam@example.test' }, preferredChannel: 'sms' as const, alreadySent: false, now: syd('2026-11-03T11:00') };

describe('planAcknowledgement (A1)', () => {
  it('sends SMS when preferred and in the day', () => expect(planAcknowledgement(base)).toEqual({ action: 'send', channel: 'sms', automated: true }));
  it('sends email when preferred', () => expect(planAcknowledgement({ ...base, preferredChannel: 'email' })).toEqual({ action: 'send', channel: 'email', automated: true }));
  it('treats a phone-call preference as email-first', () => expect(planAcknowledgement({ ...base, preferredChannel: 'phone' })).toMatchObject({ action: 'send', channel: 'email' }));
  it('always labels the acknowledgement as automated', () => expect(planAcknowledgement(base)).toMatchObject({ automated: true }));
  it('does not send twice', () => expect(planAcknowledgement({ ...base, alreadySent: true })).toEqual({ action: 'skip', reason: 'already_sent' }));
  it('do-not-contact blocks everything', () => expect(planAcknowledgement({ ...base, permission: { ...allowed, doNotContact: true } })).toEqual({ action: 'skip', reason: 'do_not_contact' }));
  it('requires consent', () => expect(planAcknowledgement({ ...base, permission: { ...allowed, consentToContact: false } })).toEqual({ action: 'skip', reason: 'no_consent' }));
  it('switches an SMS in quiet hours to email when an address exists', () => {
    expect(planAcknowledgement({ ...base, now: syd('2026-11-03T22:00') })).toEqual({ action: 'send', channel: 'email', automated: true });
  });
  it('defers an SMS in quiet hours when there is no email', () => {
    const r = planAcknowledgement({ ...base, contact: { phoneE164: '+61412345678' }, now: syd('2026-11-03T22:00') });
    expect(r).toMatchObject({ action: 'defer', channel: 'sms' });
    if (r.action === 'defer') expect(r.sendAt.getTime()).toBe(syd('2026-11-04T08:00').getTime());
  });
  it('does not SMS a landline', () => {
    expect(planAcknowledgement({ ...base, contact: { phoneE164: '+61243210000' } })).toEqual({ action: 'skip', reason: 'no_channel_available' });
  });
  it('skips when there is no usable channel', () => expect(planAcknowledgement({ ...base, contact: {} })).toEqual({ action: 'skip', reason: 'no_channel_available' }));
});

describe('ackSlaMet', () => {
  const created = syd('2026-11-03T11:00');
  it('is met at exactly 120 seconds', () => expect(ackSlaMet(created, new Date(created.getTime() + 120_000))).toBe(true));
  it('is not met at 121 seconds', () => expect(ackSlaMet(created, new Date(created.getTime() + 121_000))).toBe(false));
  it('is not met when nothing was sent', () => expect(ackSlaMet(created, undefined)).toBe(false));
});

describe('humanResponseSla', () => {
  const created = syd('2026-11-03T10:00');
  it('is met under 15 business minutes', () => expect(humanResponseSla(created, new Date(created.getTime() + minutes(14)), syd('2026-11-03T12:00'))).toMatchObject({ met: true, basis: 'business_minutes_under_15' }));
  it('is not met at exactly 15 business minutes', () => expect(humanResponseSla(created, new Date(created.getTime() + minutes(15)), syd('2026-11-03T12:00')).met).toBe(false));
  it('is not met while still waiting', () => expect(humanResponseSla(created, undefined, syd('2026-11-03T10:05')).met).toBe(false));
  it('counts only business minutes when the response comes after close', () => {
    const late = syd('2026-11-03T16:50');
    expect(humanResponseSla(late, syd('2026-11-04T09:04'), syd('2026-11-04T10:00')).met).toBe(true); // 10 + 4 = 14
    expect(humanResponseSla(late, syd('2026-11-04T09:05'), syd('2026-11-04T10:00')).met).toBe(false); // 10 + 5 = 15
  });
  it('uses a 24 hour window for out-of-hours enquiries', () => {
    const sat = syd('2026-11-07T10:00');
    expect(humanResponseSla(sat, new Date(sat.getTime() + hours(24)), syd('2026-11-09T10:00'))).toMatchObject({ met: true, basis: 'within_24_hours' });
    expect(humanResponseSla(sat, new Date(sat.getTime() + hours(24) + 1), syd('2026-11-09T10:00')).met).toBe(false);
  });
  it('an automated acknowledgement is not a human response', () => {
    expect(humanResponseSla(created, undefined, new Date(created.getTime() + days(1))).met).toBe(false);
  });
});
