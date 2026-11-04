import { describe, expect, it } from 'vitest';
import { lintOutboundMessage } from '../messaging';

const org = 'AblePoint Australia';
const good = `${org}: Thanks for your enquiry. We will be in touch. Reply STOP to opt out.`;

describe('lintOutboundMessage', () => {
  it('accepts a compliant message', () => expect(lintOutboundMessage(good, { orgName: org, channel: 'sms' })).toEqual({ ok: true, problems: [] }));
  it('requires sender identification', () => expect(lintOutboundMessage('Thanks. Reply STOP to opt out.', { orgName: org, channel: 'sms' }).problems).toContain('missing_sender_identification'));
  it('requires an opt-out', () => expect(lintOutboundMessage(`${org}: Thanks.`, { orgName: org, channel: 'email' }).problems).toContain('missing_opt_out'));
  it('rejects inducements and banned claims', () => {
    const p = lintOutboundMessage(`${org}: We are an approved NDIS provider, enjoy a free gift. Reply STOP to opt out.`, { orgName: org, channel: 'sms' }).problems;
    expect(p).toEqual(expect.arrayContaining(['inducement:gift', 'inducement:free']));
    expect(p.some((x) => x.startsWith('banned_phrase'))).toBe(true);
  });
  it('rejects NDIS-number-like digits but not a phone number', () => {
    expect(lintOutboundMessage(`${org}: Your number 430 123 456. Reply STOP.`, { orgName: org, channel: 'sms' }).problems).toContain('contains_ndis_number_like_digits');
    expect(lintOutboundMessage(`${org}: Call 1300 088 549. Reply STOP.`, { orgName: org, channel: 'sms' }).ok).toBe(true);
  });
  it('rejects health detail in a message', () => expect(lintOutboundMessage(`${org}: About your diagnosis. Reply STOP.`, { orgName: org, channel: 'sms' }).problems).toContain('contains_health_detail'));
  it('limits SMS length but not email length', () => {
    const long = `${org}: ${'a '.repeat(300)} Reply STOP.`;
    expect(lintOutboundMessage(long, { orgName: org, channel: 'sms' }).problems).toContain('sms_too_long');
    expect(lintOutboundMessage(long, { orgName: org, channel: 'email' }).problems).not.toContain('sms_too_long');
  });
});
