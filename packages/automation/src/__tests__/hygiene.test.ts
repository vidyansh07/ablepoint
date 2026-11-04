import { describe, expect, it, vi } from 'vitest';
import { decideDuplicate, decideSpam, dedupeKeys, isPlausibleNdisNumberFormat, type ExistingContact } from '../hygiene';
import { days, syd } from './helpers';

const now = syd('2026-11-20T10:00');
const existing = (over: Partial<ExistingContact> = {}): ExistingContact => ({ id: 'c1', caseRef: 'AP-AAA-111', phone: '0412 345 678', email: 'sam@example.test', createdAt: new Date(now.getTime() - days(10)), ...over });

describe('dedupeKeys', () => {
  it('normalises phone variants to one key', () => {
    for (const p of ['0412 345 678', '+61 412 345 678', '0412345678', '61412345678']) expect(dedupeKeys({ phone: p })).toEqual(['phone:+61412345678']);
  });
  it('lower-cases and trims email', () => expect(dedupeKeys({ email: '  Sam@Example.TEST ' })).toEqual(['email:sam@example.test']));
  it('ignores invalid values', () => expect(dedupeKeys({ phone: '123', email: 'nope' })).toEqual([]));
});

describe('decideDuplicate (A17)', () => {
  it('creates when nothing matches', () => expect(decideDuplicate({ incoming: { phone: '0499 111 222' }, existing: [existing()], now })).toEqual({ action: 'create' }));
  it('creates when the incoming contact has no usable key', () => expect(decideDuplicate({ incoming: { phone: 'x' }, existing: [existing()], now })).toEqual({ action: 'create' }));
  it('merges on a matching normalised phone', () => expect(decideDuplicate({ incoming: { phone: '+61412345678' }, existing: [existing()], now })).toEqual({ action: 'merge', matchId: 'c1' }));
  it('merges on a matching email alone', () => expect(decideDuplicate({ incoming: { email: 'SAM@example.test' }, existing: [existing({ phone: undefined })], now })).toEqual({ action: 'merge', matchId: 'c1' }));
  it('merges when the case reference is the same', () => expect(decideDuplicate({ incoming: { phone: '0412345678', caseRef: 'AP-AAA-111' }, existing: [existing()], now })).toEqual({ action: 'merge', matchId: 'c1' }));
  it('never auto-merges different case references', () => expect(decideDuplicate({ incoming: { phone: '0412345678', caseRef: 'AP-BBB-222' }, existing: [existing()], now })).toEqual({ action: 'needs_staff_confirmation', matchIds: ['c1'], reason: 'different_case_refs' }));
  it('asks staff when several records match', () => {
    const d = decideDuplicate({ incoming: { phone: '0412345678' }, existing: [existing(), existing({ id: 'c2', caseRef: 'AP-CCC-333' })], now });
    expect(d).toEqual({ action: 'needs_staff_confirmation', matchIds: ['c1', 'c2'], reason: 'multiple_matches' });
  });
  it('matches within exactly 90 days but not beyond', () => {
    expect(decideDuplicate({ incoming: { phone: '0412345678' }, existing: [existing({ createdAt: new Date(now.getTime() - days(90)) })], now })).toEqual({ action: 'merge', matchId: 'c1' });
    expect(decideDuplicate({ incoming: { phone: '0412345678' }, existing: [existing({ createdAt: new Date(now.getTime() - days(90) - 1) })], now })).toEqual({ action: 'create' });
  });
});

describe('isPlausibleNdisNumberFormat (format only)', () => {
  it.each([['430123456'], ['430 123 456'], ['430-123-456'], [' 430123456 ']])('accepts %s', (v) => expect(isPlausibleNdisNumberFormat(v)).toBe(true));
  it.each([['43012345'], ['4301234567'], ['43012345a'], [''], ['abcdefghi']])('rejects %s', (v) => expect(isPlausibleNdisNumberFormat(v)).toBe(false));
  it('only enforces a 43 prefix when asked, so it is not a barrier by default', () => {
    expect(isPlausibleNdisNumberFormat('123456789')).toBe(true);
    expect(isPlausibleNdisNumberFormat('123456789', { requirePrefix43: true })).toBe(false);
    expect(isPlausibleNdisNumberFormat('430123456', { requirePrefix43: true })).toBe(true);
  });
  it('returns only a boolean and never logs the value', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const out = isPlausibleNdisNumberFormat('430123456');
    expect(typeof out).toBe('boolean');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});

describe('decideSpam', () => {
  const ok = { turnstileVerified: true, honeypotFilled: false, submittedAfterMs: 15_000, ipRateLimitExceeded: false };
  it('accepts a clean submission and allows the CRM write', () => expect(decideSpam(ok)).toEqual({ decision: 'accept', reasons: [], crmWriteAllowed: true }));
  it('fails closed when Turnstile is not verified', () => expect(decideSpam({ ...ok, turnstileVerified: false })).toEqual({ decision: 'reject', reasons: ['turnstile_not_verified'], crmWriteAllowed: false }));
  it('rejects when the IP rate limit is exceeded', () => expect(decideSpam({ ...ok, ipRateLimitExceeded: true })).toMatchObject({ decision: 'reject', crmWriteAllowed: false }));
  it('quarantines a filled honeypot without reaching the CRM', () => expect(decideSpam({ ...ok, honeypotFilled: true })).toEqual({ decision: 'quarantine', reasons: ['honeypot_filled'], crmWriteAllowed: false }));
  it('quarantines impossibly fast submissions: 1999 ms yes, 2000 ms no', () => {
    expect(decideSpam({ ...ok, submittedAfterMs: 1999 }).decision).toBe('quarantine');
    expect(decideSpam({ ...ok, submittedAfterMs: 2000 }).decision).toBe('accept');
  });
  it('treats unknown timing as acceptable', () => expect(decideSpam({ ...ok, submittedAfterMs: undefined }).decision).toBe('accept'));
  it('collects every quarantine reason', () => expect(decideSpam({ ...ok, honeypotFilled: true, submittedAfterMs: 100 }).reasons).toEqual(['honeypot_filled', 'submitted_too_fast']));
});
