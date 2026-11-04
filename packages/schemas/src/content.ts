/**
 * Content governance rules (docs/06-cms-content-model.md).
 * Pure functions so they run identically in the CMS, the build, and CI.
 */

import { contentHash } from './approval';

export type ReviewState = 'draft' | 'inReview' | 'approved';
export type SiteEnv = 'production' | 'staging' | 'development';

export interface Reviewable {
  reviewState: ReviewState;
  /** ISO timestamp of compliance approval (informational; the hash is what gates). */
  approvedAt?: string;
  approvedBy?: string;
  /** Hash of the content at the moment of approval. See approval.ts. */
  approvedContentHash?: string;
  /** ISO timestamp of last content change (informational only). */
  updatedAt: string;
}

/**
 * AR-7: production renders only documents whose compliance approval still matches their content.
 * Requires reviewState "approved", a named approver, an approval time, and an approved hash equal to the hash of the
 * document as it stands now. Editing any content field after approval therefore withdraws the approval.
 */
export function isApprovalCurrent<T extends Reviewable>(doc: T): boolean {
  if (doc.reviewState !== 'approved' || !doc.approvedBy || !doc.approvedAt || !doc.approvedContentHash) return false;
  return doc.approvedContentHash === contentHash(doc as unknown as Record<string, unknown>);
}

export function isVisible<T extends Reviewable>(doc: T, env: SiteEnv): boolean {
  return env === 'production' ? isApprovalCurrent(doc) : true;
}

/** Non-production environments show unapproved content with a visible draft marker. */
export function isDraftMarked<T extends Reviewable>(doc: T, env: SiteEnv): boolean {
  return env !== 'production' && !isApprovalCurrent(doc);
}

export { findBannedPhrases, type BannedHit } from './banned';

// ---- Vacancy lifecycle (docs/06 §4) ----

export const VACANCY_STATUSES = [
  'draft',
  'readyForReview',
  'available',
  'temporarilyUnavailable',
  'filled',
  'archived',
] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export type StaffRole =
  | 'contentEditor'
  | 'marketingEditor'
  | 'complianceReviewer'
  | 'publisher'
  | 'vacancyOwner'
  | 'system'
  | 'administrator';

const TRANSITIONS: Record<VacancyStatus, Partial<Record<VacancyStatus, StaffRole[]>>> = {
  draft: { readyForReview: ['contentEditor', 'marketingEditor', 'vacancyOwner', 'administrator'] },
  readyForReview: {
    available: ['publisher', 'administrator'], // additionally requires current compliance approval, checked by caller
    draft: ['complianceReviewer', 'publisher', 'administrator'],
  },
  available: {
    temporarilyUnavailable: ['vacancyOwner', 'publisher', 'administrator'],
    filled: ['vacancyOwner', 'administrator'],
  },
  temporarilyUnavailable: {
    available: ['vacancyOwner', 'publisher', 'administrator'],
    filled: ['vacancyOwner', 'administrator'],
    archived: ['administrator'],
  },
  filled: { archived: ['system', 'administrator'] },
  archived: {},
};

export function canTransition(from: VacancyStatus, to: VacancyStatus, role: StaffRole): boolean {
  return TRANSITIONS[from][to]?.includes(role) ?? false;
}

/** Days after which a vacancy's availability is shown as unconfirmed (docs/06 §4 proposal). */
export const VACANCY_STALE_DAYS = 14;

export type VacancyDisplay = 'available' | 'unconfirmed' | 'temporarilyUnavailable' | 'noLongerAvailable' | 'hidden';

export function vacancyDisplay(
  status: VacancyStatus,
  lastVerifiedAt: string | undefined,
  now: Date,
): VacancyDisplay {
  switch (status) {
    case 'draft':
    case 'readyForReview':
      return 'hidden';
    case 'filled':
    case 'archived':
      return 'noLongerAvailable';
    case 'temporarilyUnavailable':
      return 'temporarilyUnavailable';
    case 'available': {
      if (!lastVerifiedAt) return 'unconfirmed';
      const ageDays = (now.getTime() - Date.parse(lastVerifiedAt)) / 86_400_000;
      return ageDays > VACANCY_STALE_DAYS ? 'unconfirmed' : 'available';
    }
  }
}
