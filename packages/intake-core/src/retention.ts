/**
 * Retention rule evaluator (docs/05 §7).
 *
 * EVERY period below is a PLACEHOLDER (`adviserConfirmationRequired: true`) pending a qualified
 * adviser. Until a rule id is explicitly confirmed, the evaluator never recommends a destructive
 * action: it reports `due` but returns action `retain` with `blockedBy`. Legal holds always win.
 * This module only *decides*; it performs no deletion.
 */

export type RetentionSubjectKind = 'unprogressedEnquiry' | 'activeParticipantRecord' | 'document' | 'accessLog' | 'marketingContact';
export type RetentionAction = 'retain' | 'delete' | 'deidentify' | 'archive';

export interface RetentionRule {
  id: string;
  kind: RetentionSubjectKind;
  /** null = no period set (statutory period to be supplied by the adviser). Never deletes while null. */
  months: number | null;
  /** Inactivity-based unless noted. */
  action: Exclude<RetentionAction, 'retain'>;
  description: string;
  adviserConfirmationRequired: true;
}

export const DEFAULT_RETENTION_RULES: readonly RetentionRule[] = [
  { id: 'enquiry-not-proceeding', kind: 'unprogressedEnquiry', months: 12, action: 'deidentify', description: 'Step-1 enquiry that did not proceed: delete or de-identify after 12 months (placeholder).', adviserConfirmationRequired: true },
  { id: 'active-participant-record', kind: 'activeParticipantRecord', months: null, action: 'delete', description: 'Participant records follow NDIS Commission / state record requirements. Statutory period NOT VERIFIED; adviser to supply.', adviserConfirmationRequired: true },
  { id: 'document-follows-case', kind: 'document', months: null, action: 'delete', description: 'Documents follow the retention of their case.', adviserConfirmationRequired: true },
  { id: 'access-log', kind: 'accessLog', months: 12, action: 'archive', description: 'Access/security logs: 12 months hot then archive (placeholder).', adviserConfirmationRequired: true },
  { id: 'marketing-contact', kind: 'marketingContact', months: 24, action: 'delete', description: 'Marketing CRM contact: consent withdrawal or 24 months inactive (placeholder).', adviserConfirmationRequired: true },
];

export interface RetentionSubject {
  kind: RetentionSubjectKind;
  /** Last meaningful activity (or case closure for records with a closed state). */
  lastActivityAt: string;
  /** Set when the case progressed past the initial enquiry; such an enquiry is not an "unprogressed enquiry". */
  progressed?: boolean;
  consentWithdrawnAt?: string;
  legalHold?: boolean;
}

export interface RetentionDecision {
  ruleId: string | null;
  action: RetentionAction;
  due: boolean;
  dueAt?: string;
  reason: string;
  adviserConfirmationRequired: boolean;
  blockedBy?: 'legalHold' | 'adviserConfirmationRequired' | 'noPeriodSet';
}

export function addMonthsUtc(iso: string, months: number): Date {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export interface EvaluateOptions {
  rules?: readonly RetentionRule[];
  /** Rule ids an adviser has signed off. Empty by default: nothing is executable. */
  confirmedRuleIds?: ReadonlySet<string>;
}

export function evaluateRetention(subject: RetentionSubject, now: Date, opts: EvaluateOptions = {}): RetentionDecision {
  const rules = opts.rules ?? DEFAULT_RETENTION_RULES;
  const confirmed = opts.confirmedRuleIds ?? new Set<string>();
  const rule = rules.find((r) => r.kind === subject.kind);
  if (!rule) return { ruleId: null, action: 'retain', due: false, reason: 'no_rule', adviserConfirmationRequired: true, blockedBy: 'noPeriodSet' };
  if (subject.legalHold) return { ruleId: rule.id, action: 'retain', due: false, reason: 'legal_hold', adviserConfirmationRequired: rule.adviserConfirmationRequired, blockedBy: 'legalHold' };
  if (subject.kind === 'unprogressedEnquiry' && subject.progressed) {
    return { ruleId: rule.id, action: 'retain', due: false, reason: 'enquiry_progressed', adviserConfirmationRequired: rule.adviserConfirmationRequired };
  }

  // Consent withdrawal makes a marketing contact due immediately, regardless of age.
  const withdrawn = subject.kind === 'marketingContact' && !!subject.consentWithdrawnAt;
  if (rule.months === null && !withdrawn) {
    return { ruleId: rule.id, action: 'retain', due: false, reason: 'no_period_set', adviserConfirmationRequired: rule.adviserConfirmationRequired, blockedBy: 'noPeriodSet' };
  }
  const dueAtDate = withdrawn ? new Date(subject.consentWithdrawnAt as string) : addMonthsUtc(subject.lastActivityAt, rule.months as number);
  const due = now.getTime() >= dueAtDate.getTime();
  const dueAt = dueAtDate.toISOString();
  if (!due) return { ruleId: rule.id, action: 'retain', due: false, dueAt, reason: 'not_yet_due', adviserConfirmationRequired: rule.adviserConfirmationRequired };
  if (rule.adviserConfirmationRequired && !confirmed.has(rule.id)) {
    return { ruleId: rule.id, action: 'retain', due: true, dueAt, reason: 'due_but_unconfirmed', adviserConfirmationRequired: true, blockedBy: 'adviserConfirmationRequired' };
  }
  return { ruleId: rule.id, action: rule.action, due: true, dueAt, reason: withdrawn ? 'consent_withdrawn' : 'period_elapsed', adviserConfirmationRequired: rule.adviserConfirmationRequired };
}
