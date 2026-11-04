import { describe, expect, it } from 'vitest';
import { planCallLog, type CallEvent } from '../calllog';

const call = (over: Partial<CallEvent> = {}): CallEvent => ({
  callId: 'call_001',
  direction: 'inbound',
  answered: true,
  durationSeconds: 120,
  callerNumber: '0412 345 678',
  recordingConsent: 'given',
  hasRecording: true,
  source: 'google-ads',
  ...over,
});

describe('planCallLog (A3)', () => {
  it('logs an answered inbound call over 60 s', () => expect(planCallLog(call())).toMatchObject({ log: true, source: 'google-ads', createEnquiry: true }));
  it('logs at exactly 60 seconds (inclusive)', () => expect(planCallLog(call({ durationSeconds: 60 })).log).toBe(true));
  it('does not log at 59 seconds', () => expect(planCallLog(call({ durationSeconds: 59 }))).toEqual({ log: false, reason: 'too_short' }));
  it('does not log unanswered or outbound calls', () => {
    expect(planCallLog(call({ answered: false }))).toEqual({ log: false, reason: 'not_answered' });
    expect(planCallLog(call({ direction: 'outbound' }))).toEqual({ log: false, reason: 'outbound_call' });
  });
  it('does not log a call from an invalid number', () => expect(planCallLog(call({ callerNumber: '000' }))).toEqual({ log: false, reason: 'invalid_number' }));
  it('creates an enquiry only for an unknown number', () => {
    expect(planCallLog(call({ knownContactId: 'c_1' }))).toMatchObject({ createEnquiry: false });
    expect(planCallLog(call())).toMatchObject({ createEnquiry: true });
  });
  it('stores the recording link only with consent', () => expect(planCallLog(call())).toMatchObject({ recording: 'link', needsConsentReview: false }));
  it('requests deletion when consent was refused', () => expect(planCallLog(call({ recordingConsent: 'not_given' }))).toMatchObject({ recording: 'delete' }));
  it('omits the recording and flags review when consent is unknown', () => expect(planCallLog(call({ recordingConsent: 'unknown' }))).toMatchObject({ recording: 'omit', needsConsentReview: true }));
  it('does not flag review when there is no recording', () => expect(planCallLog(call({ hasRecording: false, recordingConsent: 'unknown' }))).toMatchObject({ recording: 'omit', needsConsentReview: false }));
  it('keeps attribution and defaults a missing source to "unknown"', () => {
    expect(planCallLog(call({ source: undefined }))).toMatchObject({ source: 'unknown' });
    expect(planCallLog(call({ source: '  gbp ' }))).toMatchObject({ source: 'gbp' });
  });
  it('never exposes the caller number in the plan', () => {
    const plan = planCallLog(call());
    expect(JSON.stringify(plan)).not.toContain('412345678');
    expect(plan).toMatchObject({ callerMasked: '+61******678', idempotencyParts: ['call', 'call_001'] });
  });
});
