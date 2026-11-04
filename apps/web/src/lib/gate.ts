import { isApprovalCurrent, type Reviewable, type SiteEnv } from '@ablepoint/schemas';
import reviewers from '../data/reviewers.json';

/**
 * The single production gate for ALL content types (AR-7 plus the reviewer allow-list, docs/21).
 * In production a document is shown only if (1) its approval hash matches its current content and (2) the approver is a named
 * person on the compliance reviewer list. An agent or script that computes a valid hash still cannot publish unless a human
 * owner has put the approver's name on the list.
 */
export const COMPLIANCE_REVIEWERS: readonly string[] = reviewers.complianceReviewers;

export function isShown<T extends Reviewable>(doc: T, env: SiteEnv, allow: readonly string[] = COMPLIANCE_REVIEWERS): boolean {
  if (env !== 'production') return true;
  return isApprovalCurrent(doc) && allow.includes((doc.approvedBy ?? '').trim());
}
