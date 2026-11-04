import { describe, expect, it } from 'vitest';
import { VACANCY_STATUSES, vacancyDisplay } from '@ablepoint/schemas';
import { effectiveDisplay, planVacancySync, vacancySyncSchema } from '../vacancy';
import { days, hours, syd } from './helpers';

const now = syd('2026-11-20T10:00');
const iso = (d: Date) => d.toISOString();
const record = (over: Record<string, unknown> = {}) => ({
  id: 'vac-001',
  regionSlug: 'central-coast',
  suburb: 'Gosford',
  type: 'SIL',
  status: 'available',
  summary: 'Room in a shared home with accessible bathroom.',
  features: ['Wheelchair accessible'],
  lastVerifiedAt: iso(new Date(now.getTime() - days(2))),
  verifiedBy: 'staff-7',
  ownerId: 'staff-7',
  updatedByRole: 'vacancyOwner',
  ...over,
});

describe('vacancySyncSchema', () => {
  it('accepts a valid record', () => expect(vacancySyncSchema.safeParse(record()).success).toBe(true));
  it.each([
    ['street address in summary', { summary: 'Lovely home at 12 Smith Street near shops' }],
    ['street address in suburb', { suburb: '45 Beach Road' }],
    ['street address in a feature', { features: ['Next to 7 Station Avenue'] }],
    ['participant identifier', { summary: 'Resident 430 123 456 lives here' }],
    ['unknown region', { regionSlug: 'sydney' }],
    ['unknown type', { type: 'XYZ' }],
    ['unknown status', { status: 'open' }],
    ['unknown updater role', { updatedByRole: 'intern' }],
    ['verified date without a human verifier', { verifiedBy: undefined }],
    ['bad id', { id: 'Vac 001' }],
  ])('rejects %s', (_label, over) => expect(vacancySyncSchema.safeParse(record(over)).success).toBe(false));
});

describe('planVacancySync (A6)', () => {
  it('rejects without echoing the offending value', () => {
    const plan = planVacancySync(undefined, record({ summary: 'At 12 Smith Street' }), now);
    expect(plan.action).toBe('reject');
    expect(JSON.stringify(plan)).not.toContain('Smith');
    expect(plan).toMatchObject({ problems: ['summary:street_address_not_allowed'] });
  });
  it('creates only a draft for a new vacancy, even if the source says "available"', () => {
    const plan = planVacancySync(undefined, record({ status: 'available' }), now);
    expect(plan).toMatchObject({ action: 'create-draft', displayAfter: 'hidden' });
    if (plan.action === 'create-draft') expect(plan.record.status).toBe('draft');
  });
  it('closing a live vacancy as the owner takes it off the board', () => {
    const plan = planVacancySync({ status: 'available', lastVerifiedAt: iso(now) }, record({ status: 'filled' }), now);
    expect(plan).toMatchObject({ action: 'apply', status: 'filled', displayAfter: 'noLongerAvailable' });
  });
  it('fails safe: a closing change by a role that may not make it suspends the vacancy for review', () => {
    const plan = planVacancySync({ status: 'available', lastVerifiedAt: iso(now) }, record({ status: 'filled', updatedByRole: 'contentEditor' }), now);
    expect(plan).toMatchObject({ action: 'fail-safe-suspend', status: 'temporarilyUnavailable', needsHumanReview: true, displayAfter: 'temporarilyUnavailable' });
  });
  it('never makes a vacancy available from review: that is a human publish', () => {
    const plan = planVacancySync({ status: 'readyForReview' }, record({ status: 'available', updatedByRole: 'publisher' }), now);
    expect(plan).toMatchObject({ action: 'hold-for-human-publish', displayAfter: 'hidden' });
  });
  it('rejects an impossible transition', () => {
    expect(planVacancySync({ status: 'draft' }, record({ status: 'available', updatedByRole: 'administrator' }), now)).toEqual({ action: 'reject', problems: ['status:transition_not_permitted'] });
  });
  it('is a no-op when nothing changed', () => {
    const v = record();
    expect(planVacancySync({ status: 'available', lastVerifiedAt: v.lastVerifiedAt as string }, v, now)).toMatchObject({ action: 'noop', displayAfter: 'available' });
  });
  it('applies a fresh verification date', () => {
    const plan = planVacancySync({ status: 'available', lastVerifiedAt: iso(new Date(now.getTime() - days(20))) }, record(), now);
    expect(plan).toMatchObject({ action: 'apply', status: 'available', displayAfter: 'available' });
  });
  it('re-opening with a stale verification shows "unconfirmed", not "available"', () => {
    const stale = iso(new Date(now.getTime() - days(30)));
    const plan = planVacancySync({ status: 'temporarilyUnavailable' }, record({ status: 'available', lastVerifiedAt: stale }), now);
    expect(plan).toMatchObject({ action: 'apply', displayAfter: 'unconfirmed' });
  });
});

describe('closed vacancies never display as available', () => {
  const ages = [0, 1, 13, 14, 15, 365].map((d) => iso(new Date(now.getTime() - days(d))));
  for (const status of VACANCY_STATUSES.filter((s) => s !== 'available')) {
    it(`${status} is never "available" at any verification age`, () => {
      for (const verified of [...ages, undefined]) expect(vacancyDisplay(status, verified, now)).not.toBe('available');
    });
  }
  it('staleness boundary: exactly 14 days is still available, just over is unconfirmed', () => {
    expect(vacancyDisplay('available', iso(new Date(now.getTime() - days(14))), now)).toBe('available');
    expect(vacancyDisplay('available', iso(new Date(now.getTime() - days(14) - 1000)), now)).toBe('unconfirmed');
  });
});

describe('effectiveDisplay (sync health)', () => {
  const v = { status: 'available' as const, lastVerifiedAt: iso(now) };
  it('stays available when the last successful sync is within 24 hours', () => expect(effectiveDisplay(v, now, new Date(now.getTime() - hours(24)))).toBe('available'));
  it('becomes unconfirmed once the last sync is older than 24 hours', () => expect(effectiveDisplay(v, now, new Date(now.getTime() - hours(24) - 1))).toBe('unconfirmed'));
  it('is unconfirmed when no sync has ever succeeded', () => expect(effectiveDisplay(v, now, undefined)).toBe('unconfirmed'));
  it('does not change non-available displays', () => expect(effectiveDisplay({ status: 'filled' }, now, undefined)).toBe('noLongerAvailable'));
});
