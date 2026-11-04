import { parseReviewerIds } from './validation/approval';

export interface StudioEnv {
  projectId: string;
  dataset: string;
  reviewerIds: string[];
}

/**
 * Reads Studio configuration from environment variables only. No IDs are hard-coded.
 * Throws a readable error so a mis-configured Studio never silently points somewhere unintended.
 */
export function readStudioEnv(env: Record<string, string | undefined>): StudioEnv {
  const projectId = env.SANITY_STUDIO_PROJECT_ID?.trim();
  const dataset = env.SANITY_STUDIO_DATASET?.trim();
  if (!projectId) throw new Error('SANITY_STUDIO_PROJECT_ID is not set. The Studio does not default to any project.');
  if (!/^[a-z0-9]{6,16}$/.test(projectId)) throw new Error('SANITY_STUDIO_PROJECT_ID looks invalid (expected lowercase letters and digits).');
  if (!dataset) throw new Error('SANITY_STUDIO_DATASET is not set (for example "staging").');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(dataset)) throw new Error('SANITY_STUDIO_DATASET looks invalid (lowercase letters, digits, "-" or "_").');
  return { projectId, dataset, reviewerIds: parseReviewerIds(env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS) };
}
