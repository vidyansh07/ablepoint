import { describe, expect, it } from 'vitest';
import { DEFAULT_RETENTION_RULES, addMonthsUtc, evaluateRetention, type RetentionRule } from '../src/retention';

const NOW = new Date('2026-11-03T00:00:00.000Z');
const confirmed = (...ids: string[]) => ({ confirmedRuleIds: new Set(ids) });

describe('default rules are placeholders', () => {
  it('every rule is flagged adviserConfirmationRequired', () => {
    expect(DEFAULT_RETENTION_RULES.length).toBeGreaterThan(0);
    for (const r of DEFAULT_RETENTION_RULES) expect(r.adviserConfirmationRequired).toBe(true);
  });
  it('statutory-period rules carry no period (never invented)', () => {
    for (const id of ['active-participant-record', 'document-follows-case']) expect(DEFAULT_RETENTION_RULES.find((r) => r.id === id)!.months).toBeNull();
  });
});

describe('nothing is destructive until an adviser confirms the rule', () => {
  it('a due enquiry is reported as due but retained, blocked by adviserConfirmationRequired', () => {
    const d = evaluateRetention({ kind: 'unprogressedEnquiry', lastActivityAt: '2025-01-01T00:00:00.000Z' }, NOW);
    expect(d).toMatchObject({ ruleId: 'enquiry-not-proceeding', action: 'retain', due: true, blockedBy: 'adviserConfirmationRequired', adviserConfirmationRequired: true });
  });
  it('once the rule id is confirmed, the recommended action is returned', () => {
    const d = evaluateRetention({ kind: 'unprogressedEnquiry', lastActivityAt: '2025-01-01T00:00:00.000Z' }, NOW, confirmed('enquiry-not-proceeding'));
    expect(d).toMatchObject({ action: 'deidentify', due: true, reason: 'period_elapsed' });
    expect(d.blockedBy).toBeUndefined();
  });
  it('confirming one rule does not unblock another', () => {
    const d = evaluateRetention({ kind: 'marketingContact', lastActivityAt: '2020-01-01T00:00:00.000Z' }, NOW, confirmed('enquiry-not-proceeding'));
    expect(d.action).toBe('retain');
  });
});

describe('timing', () => {
  it('is not due before the period, and due exactly at it', () => {
    const subject = { kind: 'unprogressedEnquiry' as const, lastActivityAt: '2025-11-03T00:00:00.000Z' };
    expect(evaluateRetention(subject, new Date('2026-11-02T23:59:59.999Z'), confirmed('enquiry-not-proceeding'))).toMatchObject({ due: false, action: 'retain', reason: 'not_yet_due' });
    expect(evaluateRetention(subject, new Date('2026-11-03T00:00:00.000Z'), confirmed('enquiry-not-proceeding'))).toMatchObject({ due: true, action: 'deidentify' });
  });
  it('reports the due date', () => {
    expect(evaluateRetention({ kind: 'accessLog', lastActivityAt: '2025-11-03T00:00:00.000Z' }, NOW).dueAt).toBe('2026-11-03T00:00:00.000Z');
  });
  it('month arithmetic clamps to the last day of shorter months and handles leap years and year ends', () => {
    expect(addMonthsUtc('2026-01-31T00:00:00.000Z', 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonthsUtc('2028-01-31T00:00:00.000Z', 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonthsUtc('2026-11-15T00:00:00.000Z', 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
    expect(addMonthsUtc('2026-03-31T10:30:00.000Z', 12).toISOString()).toBe('2027-03-31T10:30:00.000Z');
  });
});

describe('guards', () => {
  it('records with no period set are never due, regardless of age', () => {
    for (const kind of ['activeParticipantRecord', 'document'] as const) {
      const d = evaluateRetention({ kind, lastActivityAt: '1990-01-01T00:00:00.000Z' }, NOW, { confirmedRuleIds: new Set(DEFAULT_RETENTION_RULES.map((r) => r.id)) });
      expect(d).toMatchObject({ action: 'retain', due: false, blockedBy: 'noPeriodSet', reason: 'no_period_set' });
    }
  });
  it('a legal hold always wins, even for confirmed, long-overdue rules', () => {
    const all = confirmed(...DEFAULT_RETENTION_RULES.map((r) => r.id));
    for (const kind of ['unprogressedEnquiry', 'marketingContact', 'accessLog'] as const) {
      expect(evaluateRetention({ kind, lastActivityAt: '2000-01-01T00:00:00.000Z', legalHold: true }, NOW, all)).toMatchObject({ action: 'retain', due: false, blockedBy: 'legalHold' });
    }
  });
  it('an enquiry that progressed is not an unprogressed enquiry', () => {
    expect(evaluateRetention({ kind: 'unprogressedEnquiry', lastActivityAt: '2000-01-01T00:00:00.000Z', progressed: true }, NOW, confirmed('enquiry-not-proceeding'))).toMatchObject({ action: 'retain', due: false, reason: 'enquiry_progressed' });
  });
  it('unknown subject kinds are retained', () => {
    const d = evaluateRetention({ kind: 'mystery' as never, lastActivityAt: '2000-01-01T00:00:00.000Z' }, NOW);
    expect(d).toMatchObject({ action: 'retain', ruleId: null, reason: 'no_rule' });
  });
  it('consent withdrawal makes a marketing contact due immediately (once the rule is confirmed)', () => {
    const subject = { kind: 'marketingContact' as const, lastActivityAt: '2026-10-01T00:00:00.000Z', consentWithdrawnAt: '2026-10-15T00:00:00.000Z' };
    expect(evaluateRetention(subject, NOW)).toMatchObject({ action: 'retain', due: true, blockedBy: 'adviserConfirmationRequired' });
    expect(evaluateRetention(subject, NOW, confirmed('marketing-contact'))).toMatchObject({ action: 'delete', due: true, reason: 'consent_withdrawn' });
  });
  it('custom rules can be supplied (and are still blocked unless confirmed)', () => {
    const rules: RetentionRule[] = [{ id: 'x', kind: 'accessLog', months: 1, action: 'archive', description: 't', adviserConfirmationRequired: true }];
    expect(evaluateRetention({ kind: 'accessLog', lastActivityAt: '2026-01-01T00:00:00.000Z' }, NOW, { rules })).toMatchObject({ action: 'retain', due: true });
    expect(evaluateRetention({ kind: 'accessLog', lastActivityAt: '2026-01-01T00:00:00.000Z' }, NOW, { rules, confirmedRuleIds: new Set(['x']) })).toMatchObject({ action: 'archive' });
  });
});
