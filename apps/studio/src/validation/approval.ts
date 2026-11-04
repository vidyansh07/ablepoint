import { isApprovalCurrent, type Reviewable } from '@ablepoint/schemas';
import { REVIEW_STATES } from '../constants';

/**
 * SOFT control only. Studio readOnly flags can be bypassed with the API; the HARD control is the
 * site build gate (`isApprovalCurrent` in @ablepoint/schemas) — see README "How approval works".
 */
export function parseReviewerIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canEditApprovalFields(userId: string | undefined, allowList: readonly string[]): boolean {
  return !!userId && allowList.includes(userId);
}

/** The whole document as stored (all content fields included): the approval hash is computed over it. */
export type FullDoc = Record<string, unknown>;

/** `isApprovalCurrent` is typed for a view model; it hashes whatever object it is given, so pass the real document. */
export const asReviewable = (doc: FullDoc): Reviewable => doc as unknown as Reviewable;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const MINUTE = 60_000;

/**
 * An approved document must name the approver, the approval time and carry the approval hash (written only by the
 * Approve action). The approver must be on the reviewer allow-list when one is configured.
 */
export function validateApprovalFields(doc: FullDoc, allowList: readonly string[] = [], now: Date = new Date()): true | string {
  const state = str(doc.reviewState);
  if (state && !(REVIEW_STATES as readonly string[]).includes(state)) return 'Unknown review state';
  if (state !== 'approved') return true;
  const approvedBy = str(doc.approvedBy)?.trim();
  if (!approvedBy) return 'An approved document needs "Approved by". Use the "Approve for publication" action.';
  const approvedAt = str(doc.approvedAt);
  if (!approvedAt) return 'An approved document needs "Approved at". Use the "Approve for publication" action.';
  const t = Date.parse(approvedAt);
  if (Number.isNaN(t)) return '"Approved at" is not a valid date';
  if (t - now.getTime() > 5 * MINUTE) return '"Approved at" is in the future';
  if (!str(doc.approvedContentHash)) return 'This document has no approval record. Use the "Approve for publication" action; typing "Approved" is not enough.';
  if (allowList.length > 0 && !allowList.includes(approvedBy)) return '"Approved by" is not on the compliance reviewer list.';
  return true;
}

/**
 * Approved on paper but the approval no longer matches the content (edited since), or approval details are missing.
 * Uses the real gate on the full document.
 */
export function approvalIsStale(doc: FullDoc): boolean {
  return doc.reviewState === 'approved' && !isApprovalCurrent(asReviewable(doc));
}

export function validateNotStaleApproval(doc: FullDoc): true | string {
  return approvalIsStale(doc) ? 'This document was edited after it was approved (or its approval record is incomplete). It will not appear on the live site until it is approved again.' : true;
}

export function validateReviewDates(reviewedAt: string | undefined, nextReviewDue: string | undefined): true | string {
  if (!reviewedAt || !nextReviewDue) return true;
  return Date.parse(nextReviewDue) > Date.parse(reviewedAt) ? true : '"Next review due" must be after "Reviewed at"';
}

/** What the site gate would conclude for this stored document. Same function the build runs, same input shape. */
export function siteGateWouldShow(doc: FullDoc): boolean {
  return isApprovalCurrent(asReviewable(doc));
}
