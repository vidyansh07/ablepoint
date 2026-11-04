import { approvalFields, isApprovalCurrent } from '@ablepoint/schemas';
import { asReviewable, canEditApprovalFields, type FullDoc } from './validation/approval';

/**
 * Pure decision logic for the "Approve for publication" Studio action (no Sanity or React imports, so it is
 * unit-testable). The action component in approve-action.ts only wires this to Studio hooks.
 */
export interface ApproveContext {
  userId: string | undefined;
  /** From SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS. Empty means nobody may approve. */
  allowList: readonly string[];
  /** The draft if there is one, otherwise the published document. */
  doc: FullDoc | null;
  /** True when editing a release version (not supported). */
  isVersion: boolean;
  /** Reason from Sanity's patch operation if it cannot run right now. */
  patchDisabled?: string | false;
}

export type ApproveAvailability = { enabled: true; title: string } | { enabled: false; reason: string };

export function approveAvailability(ctx: ApproveContext): ApproveAvailability {
  if (ctx.allowList.length === 0) return { enabled: false, reason: 'No compliance reviewers are configured (SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS is empty), so nobody can approve.' };
  if (!ctx.userId) return { enabled: false, reason: 'Sign in to approve.' };
  if (!canEditApprovalFields(ctx.userId, ctx.allowList)) return { enabled: false, reason: 'Only a listed compliance reviewer can approve.' };
  if (ctx.isVersion) return { enabled: false, reason: 'Approval is not supported for release versions. Approve the draft instead.' };
  if (!ctx.doc) return { enabled: false, reason: 'There is no document to approve.' };
  if (ctx.patchDisabled) return { enabled: false, reason: ctx.patchDisabled === 'NOT_READY' ? 'The document is still loading.' : `Cannot save changes right now (${ctx.patchDisabled}).` };

  const state = ctx.doc.reviewState;
  const current = isApprovalCurrent(asReviewable(ctx.doc));
  if (state === 'approved' && current) return { enabled: false, reason: 'Already approved. Nothing has changed since.' };
  if (state !== 'inReview' && state !== 'approved') return { enabled: false, reason: 'Set the review state to "In review" first. Approval follows editorial review.' };
  return {
    enabled: true,
    title: state === 'approved' ? 'Content changed since the last approval. Approve it again.' : 'Record your approval of this exact content. Any later edit withdraws it.',
  };
}

/** The four fields the action writes. The hash covers every content field of `doc` as it is right now. */
export function buildApprovalPatch(doc: FullDoc, userId: string, now: Date = new Date()) {
  return approvalFields(doc, userId, now);
}
