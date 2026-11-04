import { findBannedPhrases, isApprovalCurrent, type Reviewable } from '@ablepoint/schemas';
import { DAY_MS } from './common';

/**
 * A7 Google Business Profile publishing rules. API access for posts is NOT verified (docs/13), so even a fully
 * eligible post is routed to a manual checklist until `apiAccessVerified` is set by a human who has proved access.
 */
export interface GbpPostInput {
  content: Reviewable & { text: string };
  profile: { eligible: boolean; premisesOrServiceAreaVerified: boolean };
  apiAccessVerified: boolean;
  lastPostAt?: Date;
  now: Date;
  minDaysBetweenPosts?: number;
}

export type GbpDecision =
  | { action: 'publish_via_api' }
  | { action: 'manual_fallback'; reason: 'api_access_unverified' }
  | { action: 'skip'; reason: 'content_not_approved' | 'banned_phrase' | 'profile_not_eligible' | 'too_soon' };

export function evaluateGbpPost(i: GbpPostInput): GbpDecision {
  if (!isApprovalCurrent(i.content)) return { action: 'skip', reason: 'content_not_approved' };
  if (findBannedPhrases(i.content.text).length) return { action: 'skip', reason: 'banned_phrase' };
  if (!i.profile.eligible || !i.profile.premisesOrServiceAreaVerified) return { action: 'skip', reason: 'profile_not_eligible' };
  const minMs = (i.minDaysBetweenPosts ?? 6) * DAY_MS;
  if (i.lastPostAt && i.now.getTime() - i.lastPostAt.getTime() < minMs) return { action: 'skip', reason: 'too_soon' };
  return i.apiAccessVerified ? { action: 'publish_via_api' } : { action: 'manual_fallback', reason: 'api_access_unverified' };
}
