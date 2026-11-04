import { describe, expect, it } from 'vitest';
import { assertNoPii, buildWeeklyReport, PiiLeakError, suppressBreakdown, type ReportRow } from '../reporting';
import { syd } from './helpers';

const runAt = syd('2026-11-06T07:00');
const row = (over: Partial<ReportRow> = {}): ReportRow => ({ source: 'google-ads', region: 'central-coast', qualified: true, ...over });
const many = (n: number, over: Partial<ReportRow> = {}) => Array.from({ length: n }, () => row(over));

describe('assertNoPii', () => {
  it.each([['name'], ['participantName'], ['phone'], ['mobile'], ['email'], ['ndisNumber'], ['address'], ['dob'], ['caseRef'], ['contactId']])('throws for a "%s" field', (key) => {
    expect(() => assertNoPii([{ ...row(), [key]: 'x' }])).toThrow(PiiLeakError);
  });
  it('throws when a value looks like an email or a phone number', () => {
    expect(() => assertNoPii([{ ...row(), source: 'sam@example.test' }])).toThrow(PiiLeakError);
    expect(() => assertNoPii([{ ...row(), source: '0412 345 678' }])).toThrow(PiiLeakError);
  });
  it('names the offending keys but never the values', () => {
    try {
      assertNoPii([{ ...row(), email: 'secret@example.test' }]);
      expect.unreachable();
    } catch (e) {
      expect((e as PiiLeakError).offendingKeys).toEqual(['email']);
      expect((e as Error).message).not.toContain('secret@example.test');
    }
  });
  it('accepts coded aggregate rows', () => expect(() => assertNoPii(many(3))).not.toThrow());
  it('buildWeeklyReport refuses PII input', () => expect(() => buildWeeklyReport([{ ...row(), name: 'x' } as ReportRow], runAt)).toThrow(PiiLeakError));
});

describe('suppressBreakdown (cells under 5)', () => {
  it('leaves cells of 5 or more alone', () => expect(suppressBreakdown({ a: 9, b: 5 })).toEqual([{ key: 'a', count: 9, suppressed: false }, { key: 'b', count: 5, suppressed: false }]));
  it('treats exactly 5 as visible and 4 as small', () => {
    expect(suppressBreakdown({ a: 5 })).toEqual([{ key: 'a', count: 5, suppressed: false }]);
    expect(suppressBreakdown({ a: 4 })).toEqual([{ key: 'Other', count: null, suppressed: true }]);
  });
  it('merges several small cells into a visible "Other" when they total 5 or more', () => {
    expect(suppressBreakdown({ a: 8, b: 3, c: 2 })).toEqual([{ key: 'a', count: 8, suppressed: false }, { key: 'Other', count: 5, suppressed: false }]);
  });
  it('folds in the smallest visible cell when one lone small cell would be derivable from the total', () => {
    const rows = suppressBreakdown({ a: 10, b: 6, c: 2 });
    expect(rows).toEqual([{ key: 'a', count: 10, suppressed: false }, { key: 'Other', count: 8, suppressed: false }]);
    expect(rows.some((r) => r.key === 'c')).toBe(false);
  });
  it('suppresses everything when no cell is large enough', () => expect(suppressBreakdown({ a: 2, b: 2 })).toEqual([{ key: 'Other', count: null, suppressed: true }]));
  it('ignores zero counts and orders deterministically', () => {
    expect(suppressBreakdown({ b: 6, a: 6, z: 0 }).map((r) => r.key)).toEqual(['a', 'b']);
  });
});

describe('buildWeeklyReport (A9)', () => {
  it('covers the seven days before the run time', () => {
    const r = buildWeeklyReport(many(1), runAt);
    expect(r.window.to).toEqual(runAt);
    expect(r.window.to.getTime() - r.window.from.getTime()).toBe(7 * 86_400_000);
  });
  it('totals enquiries, qualified enquiries, agreements and spend', () => {
    const r = buildWeeklyReport([row({ spendCents: 5000 }), row({ qualified: false }), row({ agreementSigned: true })], runAt);
    expect(r.totals).toEqual({ enquiries: 3, qualified: 2, agreements: 1, spendCents: 5000 });
  });
  it('suppresses small breakdown cells', () => {
    const r = buildWeeklyReport([...many(6, { source: 'organic' }), ...many(2, { source: 'meta' })], runAt);
    expect(r.qualifiedBySource.find((c) => c.key === 'meta')).toBeUndefined();
    expect(r.qualifiedBySource.every((c) => c.suppressed || (c.count ?? 0) >= 5)).toBe(true);
  });
  it('suppresses response-time figures for fewer than 5 responses', () => {
    const r = buildWeeklyReport(Array.from({ length: 4 }, () => row({ firstResponseMinutes: 3 })), runAt);
    expect(r.firstResponse).toEqual({ n: 4, medianMinutes: null, withinTargetCount: null, suppressed: true });
  });
  it('reports the median and the strict under-15-minute count from 5 responses', () => {
    const minutes = [3, 5, 10, 14, 15, 40];
    const r = buildWeeklyReport(minutes.map((m) => row({ firstResponseMinutes: m })), runAt);
    expect(r.firstResponse).toEqual({ n: 6, medianMinutes: 12, withinTargetCount: 4, suppressed: false });
  });
  it('flags low confidence under 15 qualified enquiries', () => {
    const r = buildWeeklyReport(many(14, { spendCents: 100 }), runAt);
    expect(r.confidence).toBe('low');
    expect(r.notes.join(' ')).toMatch(/low confidence/);
  });
  it('is ok at exactly 15 qualified enquiries', () => expect(buildWeeklyReport(many(15), runAt).confidence).toBe('ok'));
  it('computes cost per qualified enquiry, and null when there is none', () => {
    expect(buildWeeklyReport([row({ spendCents: 9000 }), row({ spendCents: 9000 })], runAt).costPerQualifiedCents).toBe(9000);
    expect(buildWeeklyReport([row({ qualified: false, spendCents: 9000 })], runAt).costPerQualifiedCents).toBeNull();
  });
  it('is deterministic', () => {
    const rows = [...many(7, { source: 'a' }), ...many(5, { source: 'b' })];
    expect(buildWeeklyReport(rows, runAt)).toEqual(buildWeeklyReport(rows, runAt));
  });
  it('handles an empty week', () => {
    const r = buildWeeklyReport([], runAt);
    expect(r.totals.enquiries).toBe(0);
    expect(r.qualifiedBySource).toEqual([]);
    expect(r.firstResponse.medianMinutes).toBeNull();
  });
});
