import { describe, expect, it } from 'vitest';
import { buildMissedCallSms, planMissedCall } from '../missedcall';
import { lintOutboundMessage } from '../messaging';
import { hours, minutes, syd } from './helpers';

const allowed = { consentToContact: true, doNotContact: false, optedOut: false };
const base = { callerNumber: '0412 345 678', knownPermission: allowed, now: syd('2026-11-03T11:00') };

describe('planMissedCall (A2)', () => {
  it('sends an SMS to a consenting known mobile in the day', () => expect(planMissedCall(base).sms).toEqual({ action: 'send' }));
  it('do-not-contact overrides everything, even for an invalid or landline number', () => {
    for (const callerNumber of ['0412 345 678', '02 4321 0000', 'garbage']) {
      expect(planMissedCall({ ...base, callerNumber, knownPermission: { ...allowed, doNotContact: true, optedOut: true } }).sms).toEqual({ action: 'skip', reason: 'do_not_contact' });
    }
  });
  it('skips opted-out and non-consenting contacts', () => {
    expect(planMissedCall({ ...base, knownPermission: { ...allowed, optedOut: true } }).sms).toEqual({ action: 'skip', reason: 'opted_out' });
    expect(planMissedCall({ ...base, knownPermission: { ...allowed, consentToContact: false } }).sms).toEqual({ action: 'skip', reason: 'no_consent' });
  });
  it('does not text an unknown caller by default (consent basis undecided)', () => {
    expect(planMissedCall({ ...base, knownPermission: undefined }).sms).toEqual({ action: 'skip', reason: 'no_consent_basis' });
  });
  it('can text an unknown caller only when policy allows it', () => {
    expect(planMissedCall({ ...base, knownPermission: undefined, allowInboundCallInferredConsent: true }).sms).toEqual({ action: 'send' });
  });
  it('skips landlines and invalid numbers', () => {
    expect(planMissedCall({ ...base, callerNumber: '02 4321 0000' }).sms).toEqual({ action: 'skip', reason: 'not_mobile' });
    expect(planMissedCall({ ...base, callerNumber: '12345' }).sms).toEqual({ action: 'skip', reason: 'invalid_number' });
  });
  it('rate limits to one SMS per number per 24 hours', () => {
    const lastSmsSentAt = (ago: number) => new Date(base.now.getTime() - ago);
    expect(planMissedCall({ ...base, lastSmsSentAt: lastSmsSentAt(hours(24) - minutes(1)) }).sms).toEqual({ action: 'skip', reason: 'rate_limited' });
    expect(planMissedCall({ ...base, lastSmsSentAt: lastSmsSentAt(hours(24)) }).sms).toEqual({ action: 'send' });
  });
  it('defers during quiet hours until 08:00', () => {
    expect(planMissedCall({ ...base, now: syd('2026-11-03T22:15') }).sms).toEqual({ action: 'defer', sendAt: syd('2026-11-04T08:00') });
  });
  it('always creates a staff task, and tells staff not to call back a do-not-contact number', () => {
    expect(planMissedCall(base).staffTask).toMatchObject({ create: true, doNotCallBack: false });
    expect(planMissedCall({ ...base, knownPermission: { ...allowed, doNotContact: true } }).staffTask).toMatchObject({ create: true, doNotCallBack: true });
    expect(planMissedCall({ ...base, callerNumber: 'garbage' }).staffTask.create).toBe(true);
  });
  it('masks the number on the staff task', () => {
    const task = planMissedCall(base).staffTask;
    expect(task.callerMasked).toBe('+61******678');
    expect(JSON.stringify(task)).not.toContain('412345678');
  });
});

describe('buildMissedCallSms', () => {
  const body = buildMissedCallSms({ orgName: 'AblePoint Australia', phoneDisplay: '1300 088 549' });
  it('identifies the sender, offers an opt-out and passes the outbound lint', () => {
    expect(body).toContain('AblePoint Australia');
    expect(body).toMatch(/STOP/);
    expect(lintOutboundMessage(body, { orgName: 'AblePoint Australia', channel: 'sms' })).toEqual({ ok: true, problems: [] });
  });
});
