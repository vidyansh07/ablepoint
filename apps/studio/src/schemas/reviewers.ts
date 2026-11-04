import { parseReviewerIds } from '../validation/approval';

/**
 * Reviewer allow-list for Studio field locks. Sanity replaces only explicit `process.env.SANITY_STUDIO_*`
 * references at build time, so the variable is named literally here (no `process.env` spreading).
 */
export function readStudioEnvLoose(): { reviewerIds: string[] } {
  const raw = typeof process !== 'undefined' ? process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS : undefined;
  return { reviewerIds: parseReviewerIds(raw) };
}
