import { describe, expect, it } from 'vitest';
import { escalationDecision, routeEnquiry, validateRoutingTable, type RoutingTable } from '../routing';
import { syd } from './helpers';

const table: RoutingTable = {
  version: '2026-11-01.1',
  fallbackOwnerId: 'intake-queue',
  managerId: 'manager-1',
  rules: [
    { service: '*', region: '*', ownerId: 'catch-all' },
    { service: 'sil', region: '*', ownerId: 'sil-lead' },
    { service: '*', region: 'dubbo', ownerId: 'dubbo-lead' },
    { service: 'sil', region: 'dubbo', ownerId: 'dubbo-sil' },
  ],
};

describe('routeEnquiry (A4)', () => {
  it('prefers the exact service+region rule', () => expect(routeEnquiry(table, { services: ['sil'], region: 'dubbo' })).toMatchObject({ ownerId: 'dubbo-sil', matchKind: 'exact' }));
  it('prefers a region rule over a service-only rule', () => expect(routeEnquiry(table, { services: ['core-support'], region: 'dubbo' })).toMatchObject({ ownerId: 'dubbo-lead', matchKind: 'region' }));
  it('uses a service-only rule when the region has no rule', () => expect(routeEnquiry(table, { services: ['sil'], region: 'orange' })).toMatchObject({ ownerId: 'sil-lead', matchKind: 'service' }));
  it('falls back to the catch-all rule', () => expect(routeEnquiry(table, { services: ['sda'], region: 'orange' })).toMatchObject({ ownerId: 'catch-all', matchKind: 'catch-all' }));
  it('falls back to the fallback owner when nothing matches', () => {
    expect(routeEnquiry({ ...table, rules: [] }, { services: ['sil'], region: 'orange' })).toMatchObject({ ownerId: 'intake-queue', matchKind: 'fallback' });
  });
  it('picks the most specific match across several services', () => {
    expect(routeEnquiry(table, { services: ['sda', 'sil'], region: 'dubbo' })).toMatchObject({ ownerId: 'dubbo-sil', matchKind: 'exact' });
  });
  it('breaks ties by input service order, then table order', () => {
    const t: RoutingTable = { ...table, rules: [{ service: 'sda', region: 'orange', ownerId: 'a' }, { service: 'sil', region: 'orange', ownerId: 'b' }] };
    expect(routeEnquiry(t, { services: ['sil', 'sda'], region: 'orange' }).ownerId).toBe('b');
    expect(routeEnquiry(t, { services: ['sda', 'sil'], region: 'orange' }).ownerId).toBe('a');
  });
  it('ignores region-specific rules when the region is "not-sure"', () => {
    expect(routeEnquiry(table, { services: ['core-support'], region: 'not-sure' })).toMatchObject({ ownerId: 'catch-all', matchKind: 'catch-all' });
  });
  it('treats an empty service list as "not-sure"', () => expect(routeEnquiry(table, { services: [], region: 'dubbo' }).ownerId).toBe('dubbo-lead'));
  it('records which table version made the decision', () => expect(routeEnquiry(table, { services: ['sil'], region: 'dubbo' }).tableVersion).toBe('2026-11-01.1'));
  it('is deterministic', () => {
    const e = { services: ['sil', 'sda'] as const, region: 'dubbo' as const };
    expect(routeEnquiry(table, e)).toEqual(routeEnquiry(table, e));
  });
});

describe('validateRoutingTable', () => {
  it('accepts a valid table', () => expect(validateRoutingTable(table)).toEqual([]));
  it('flags a missing version, fallback and manager', () => {
    expect(validateRoutingTable({ ...table, version: ' ', fallbackOwnerId: '', managerId: '' })).toEqual(['missing_version', 'missing_fallback_owner', 'missing_manager']);
  });
  it('flags duplicate rules and empty owners', () => {
    const problems = validateRoutingTable({ ...table, rules: [{ service: 'sil', region: '*', ownerId: 'a' }, { service: 'sil', region: '*', ownerId: '' }] });
    expect(problems).toContain('duplicate_rule:sil|*');
    expect(problems).toContain('empty_owner:sil/*');
  });
});

describe('escalationDecision (30 business minutes)', () => {
  const created = syd('2026-11-03T10:00');
  it('does not escalate an acknowledged enquiry', () => expect(escalationDecision({ createdAt: created, ownerAcknowledgedAt: syd('2026-11-03T10:05'), now: syd('2026-11-03T16:00') })).toMatchObject({ escalate: false, reason: 'acknowledged' }));
  it('does not escalate at 29 minutes', () => expect(escalationDecision({ createdAt: created, now: syd('2026-11-03T10:29') })).toMatchObject({ escalate: false, businessMinutesElapsed: 29 }));
  it('escalates at exactly 30 minutes (inclusive)', () => expect(escalationDecision({ createdAt: created, now: syd('2026-11-03T10:30') })).toMatchObject({ escalate: true, reason: 'threshold_reached' }));
  it('pauses the clock outside business hours', () => {
    const late = syd('2026-11-06T16:45'); // Friday
    expect(escalationDecision({ createdAt: late, now: syd('2026-11-06T17:15') }).escalate).toBe(false); // 15 business min
    expect(escalationDecision({ createdAt: late, now: syd('2026-11-09T09:14') }).escalate).toBe(false); // 15 + 14
    expect(escalationDecision({ createdAt: late, now: syd('2026-11-09T09:15') }).escalate).toBe(true); // 15 + 15
  });
  it('does not run the clock for an enquiry created on a Saturday', () => {
    expect(escalationDecision({ createdAt: syd('2026-11-07T10:00'), now: syd('2026-11-08T23:00') })).toMatchObject({ escalate: false, businessMinutesElapsed: 0 });
  });
  it('supports a custom threshold', () => expect(escalationDecision({ createdAt: created, now: syd('2026-11-03T10:10'), thresholdMinutes: 10 }).escalate).toBe(true));
});
