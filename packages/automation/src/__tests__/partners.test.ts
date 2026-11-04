import { describe, expect, it } from 'vitest';
import { buildCapacitySummary, classifyPartnerReply, evaluateOutreach, type CapacityVacancy, type OutreachInput } from '../partners';
import { days, syd } from './helpers';

const now = syd('2026-11-20T10:00');
const iso = (agoDays: number) => new Date(now.getTime() - days(agoDays)).toISOString();
const vac = (over: Partial<CapacityVacancy> = {}): CapacityVacancy => ({ id: 'v1', regionSlug: 'central-coast', type: 'SIL', status: 'available', lastVerifiedAt: iso(2), verifiedBy: 'staff-1', ...over });

describe('buildCapacitySummary (A12)', () => {
  it('includes verified, fresh, available vacancies and counts by region and type', () => {
    const s = buildCapacitySummary([vac(), vac({ id: 'v2', type: 'SDA' }), vac({ id: 'v3', regionSlug: 'dubbo' })], now);
    expect(s.total).toBe(3);
    expect(s.includedIds).toEqual(['v1', 'v2', 'v3']);
    expect(s.byRegion).toEqual({ 'central-coast': { SIL: 1, SDA: 1, STA: 0 }, dubbo: { SIL: 1, SDA: 0, STA: 0 } });
    expect(s.empty).toBe(false);
  });
  it('excludes anything not available', () => {
    for (const status of ['draft', 'readyForReview', 'temporarilyUnavailable', 'filled', 'archived'] as const) {
      expect(buildCapacitySummary([vac({ status })], now).excluded).toEqual([{ id: 'v1', reason: 'not_available' }]);
    }
  });
  it('includes a vacancy verified exactly 14 days ago and excludes one verified over 14 days ago', () => {
    expect(buildCapacitySummary([vac({ lastVerifiedAt: iso(14) })], now).total).toBe(1);
    expect(buildCapacitySummary([vac({ lastVerifiedAt: new Date(now.getTime() - days(14) - 1000).toISOString() })], now).excluded).toEqual([{ id: 'v1', reason: 'stale_or_unverified' }]);
  });
  it('excludes an available vacancy with no verification date', () => expect(buildCapacitySummary([vac({ lastVerifiedAt: undefined })], now).excluded[0]?.reason).toBe('stale_or_unverified'));
  it('excludes a vacancy without a named human verifier', () => expect(buildCapacitySummary([vac({ verifiedBy: undefined })], now).excluded).toEqual([{ id: 'v1', reason: 'no_human_verifier' }]));
  it('reports an empty summary rather than inventing capacity', () => expect(buildCapacitySummary([], now)).toMatchObject({ empty: true, total: 0, byRegion: {} }));
  it('exposes no address or free-text fields', () => expect(Object.keys(buildCapacitySummary([vac()], now)).sort()).toEqual(['byRegion', 'empty', 'excluded', 'generatedAt', 'includedIds', 'total']));
});

describe('evaluateOutreach (A12)', () => {
  const message = 'AblePoint Australia: here is our monthly capacity update. To stop these emails, reply unsubscribe.';
  const base: OutreachInput = { partner: { optedOut: false, doNotContact: false }, kind: 'monthly_capacity', message, orgName: 'AblePoint Australia', now, capacityEmpty: false };
  it('allows a compliant message to a contactable partner', () => expect(evaluateOutreach(base)).toEqual({ allowed: true }));
  it('do-not-contact overrides everything', () => expect(evaluateOutreach({ ...base, partner: { optedOut: true, doNotContact: true }, message: 'bad' })).toEqual({ allowed: false, reason: 'do_not_contact' }));
  it('respects an opt-out', () => expect(evaluateOutreach({ ...base, partner: { optedOut: true, doNotContact: false } })).toEqual({ allowed: false, reason: 'opted_out' }));
  it('rejects a message without an unsubscribe', () => expect(evaluateOutreach({ ...base, message: 'AblePoint Australia: capacity update.' })).toMatchObject({ allowed: false, reason: 'message_lint_failed', problems: ['missing_opt_out'] }));
  it('rejects inducements to refer', () => expect(evaluateOutreach({ ...base, message: message + ' Refer a friend and receive a gift card.' })).toMatchObject({ allowed: false, reason: 'message_lint_failed' }));
  it('does not send an empty capacity email', () => expect(evaluateOutreach({ ...base, capacityEmpty: true })).toEqual({ allowed: false, reason: 'no_verified_capacity' }));
  it('limits frequency: exactly 14 days is allowed, less is too soon', () => {
    expect(evaluateOutreach({ ...base, partner: { ...base.partner, lastContactedAt: new Date(now.getTime() - days(14)) } })).toEqual({ allowed: true });
    expect(evaluateOutreach({ ...base, partner: { ...base.partner, lastContactedAt: new Date(now.getTime() - days(14) + 1) } })).toEqual({ allowed: false, reason: 'too_soon' });
  });
});

describe('classifyPartnerReply', () => {
  it.each([['Please unsubscribe me'], ['STOP'], ['remove me from this list'], ["don't contact us again"], ['Opt out']])('treats "%s" as an opt-out', (t) => expect(classifyPartnerReply(t)).toBe('opt_out'));
  it.each([['Can we meet next Tuesday?'], ['Thanks, we have a participant who may suit']])('treats "%s" as a task', (t) => expect(classifyPartnerReply(t)).toBe('create_task'));
});
