import { contactBlock, DAY_MS, DEFAULT_QUIET_HOURS, isQuietHours, nextQuietHoursEnd, type ContactBlockReason, type ContactPermission, type QuietHours } from './common';
import { findInducements } from './inducements';
import { lintOutboundMessage } from './messaging';
import type { Stage } from './followup';

export { findInducements } from './inducements';

/** A8: compliant review request. Active at least 30 days (inclusive), consent, nominated contact, no inducement, ever. */
export const REVIEW_REQUEST_MIN_ACTIVE_DAYS = 30;

export interface ReviewRequestInput {
  stage: Stage;
  activeSince?: Date;
  now: Date;
  permission: ContactPermission;
  /** Separate consent to be asked for a review. */
  consentToReviewRequests: boolean;
  nominatedContact?: { kind: 'participant' | 'family' | 'nominated'; channel: 'sms' | 'email'; reachable: boolean };
  alreadyRequested: boolean;
  openComplaint: boolean;
  /** Workflow switch. Stays false until business and compliance approve activation (docs/09 A8). */
  workflowActivated: boolean;
  quietHours?: QuietHours;
}

export type ReviewRequestDecision =
  | { action: 'send'; channel: 'sms' | 'email' }
  | { action: 'defer'; sendAt: Date }
  | { action: 'skip'; reason: ContactBlockReason | 'not_activated' | 'not_active' | 'too_early' | 'no_review_consent' | 'no_nominated_contact' | 'open_complaint' | 'already_requested' };

export function evaluateReviewRequest(i: ReviewRequestInput): ReviewRequestDecision {
  const block = contactBlock(i.permission);
  if (block === 'do_not_contact') return { action: 'skip', reason: block };
  if (!i.workflowActivated) return { action: 'skip', reason: 'not_activated' };
  if (block) return { action: 'skip', reason: block };
  if (i.stage !== 'active' || !i.activeSince) return { action: 'skip', reason: 'not_active' };
  if (i.now.getTime() - i.activeSince.getTime() < REVIEW_REQUEST_MIN_ACTIVE_DAYS * DAY_MS) return { action: 'skip', reason: 'too_early' };
  if (!i.consentToReviewRequests) return { action: 'skip', reason: 'no_review_consent' };
  if (!i.nominatedContact || !i.nominatedContact.reachable) return { action: 'skip', reason: 'no_nominated_contact' };
  if (i.openComplaint) return { action: 'skip', reason: 'open_complaint' };
  if (i.alreadyRequested) return { action: 'skip', reason: 'already_requested' };
  const q = i.quietHours ?? DEFAULT_QUIET_HOURS;
  if (isQuietHours(i.now, q)) return { action: 'defer', sendAt: nextQuietHoursEnd(i.now, q) };
  return { action: 'send', channel: i.nominatedContact.channel };
}

export interface ReviewMessageVerdict {
  ok: boolean;
  /** Inducement/steering labels only (never message text). */
  inducements: string[];
  problems: string[];
}

/** Rejects any reward, gift, discount or rating-steering language, and checks sender ID and opt-out. */
export function validateReviewMessage(text: string, orgName: string, channel: 'sms' | 'email'): ReviewMessageVerdict {
  const lint = lintOutboundMessage(text, { orgName, channel });
  return { ok: lint.ok, inducements: findInducements(text), problems: lint.problems };
}

export function buildReviewRequestMessage(opts: { orgName: string; reviewUrl: string }): string {
  return `${opts.orgName}: If you are happy to, you can share your feedback about our service here: ${opts.reviewUrl}. This is optional and does not affect your supports. Reply STOP to opt out.`;
}
