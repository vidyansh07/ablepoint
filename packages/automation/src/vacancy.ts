import { z } from 'zod';
import { canTransition, vacancyDisplay, VACANCY_STATUSES, type StaffRole, type VacancyDisplay, type VacancyStatus } from '@ablepoint/schemas';
import { HOUR_MS } from './common';
import { containsNdisNumberLike } from './identifiers';

/**
 * The 14-day staleness limit is defined once, in @ablepoint/schemas (vacancyDisplay uses it). Re-exported here so automation
 * code (and the n8n export tests) have one place to import it from. Nothing is duplicated.
 */
export { VACANCY_STALE_DAYS } from '@ablepoint/schemas';

/**
 * A6 vacancy board sync rules (docs/06 §4, docs/09 A6).
 * Lifecycle and display rules come from @ablepoint/schemas (canTransition, vacancyDisplay); nothing is duplicated here.
 * The sync never makes a vacancy available on its own: availability goes live through a human publish.
 */

const REGIONS = ['central-coast', 'newcastle', 'dubbo', 'orange', 'tamworth', 'gunnedah'] as const;
const ROLES = ['contentEditor', 'marketingEditor', 'complianceReviewer', 'publisher', 'vacancyOwner', 'system', 'administrator'] as const satisfies readonly StaffRole[];

/** Heuristic for a street address (never published: docs/06 §5). Deliberately conservative; may false-positive. */
const STREET_ADDRESS = /\b\d{1,5}[a-z]?\s+(?:[a-z']+\s+){1,3}(?:street|st|road|rd|avenue|ave|drive|dr|court|ct|place|pl|crescent|cres|highway|hwy|lane|ln|parade|pde|terrace|tce|close|way)\b/i;

export const vacancySyncSchema = z
  .object({
    id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
    regionSlug: z.enum(REGIONS),
    suburb: z.string().trim().min(2).max(60),
    type: z.enum(['SIL', 'SDA', 'STA']),
    status: z.enum(VACANCY_STATUSES),
    summary: z.string().trim().min(1).max(500),
    features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    lastVerifiedAt: z.iso.datetime({ offset: true }).optional(),
    verifiedBy: z.string().min(1).optional(),
    ownerId: z.string().min(1),
    /** Role of the human who changed the source record. */
    updatedByRole: z.enum(ROLES),
  })
  .superRefine((v, ctx) => {
    for (const [path, text] of [['suburb', v.suburb], ['summary', v.summary], ...v.features.map((f, i) => [`features.${i}`, f] as const)] as const) {
      if (STREET_ADDRESS.test(text)) ctx.addIssue({ code: 'custom', path: path.split('.'), message: 'street_address_not_allowed' });
      if (containsNdisNumberLike(text)) ctx.addIssue({ code: 'custom', path: path.split('.'), message: 'participant_identifier_not_allowed' });
    }
    if (v.lastVerifiedAt && !v.verifiedBy) ctx.addIssue({ code: 'custom', path: ['verifiedBy'], message: 'verification_requires_human' });
  });

export type VacancySync = z.output<typeof vacancySyncSchema>;

export interface ExistingVacancy {
  status: VacancyStatus;
  lastVerifiedAt?: string;
}

export type VacancyPlan =
  | { action: 'reject'; problems: string[] }
  | { action: 'create-draft'; record: VacancySync & { status: 'draft' }; displayAfter: 'hidden' }
  | { action: 'apply'; status: VacancyStatus; lastVerifiedAt?: string; displayAfter: VacancyDisplay }
  | { action: 'hold-for-human-publish'; displayAfter: VacancyDisplay }
  | { action: 'fail-safe-suspend'; status: 'temporarilyUnavailable'; needsHumanReview: true; displayAfter: VacancyDisplay }
  | { action: 'noop'; displayAfter: VacancyDisplay };

const CLOSING: readonly VacancyStatus[] = ['temporarilyUnavailable', 'filled', 'archived'];

export function planVacancySync(existing: ExistingVacancy | undefined, incomingRaw: unknown, now: Date): VacancyPlan {
  const parsed = vacancySyncSchema.safeParse(incomingRaw);
  if (!parsed.success) {
    // Issue codes and paths only: never echo submitted values.
    return { action: 'reject', problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'record'}:${i.message === 'street_address_not_allowed' || i.message === 'participant_identifier_not_allowed' || i.message === 'verification_requires_human' ? i.message : i.code}`) };
  }
  const incoming = parsed.data;

  if (!existing) {
    // The sync can create a draft only. It can never create an "available" vacancy.
    return { action: 'create-draft', record: { ...incoming, status: 'draft' }, displayAfter: 'hidden' };
  }

  const verifiedAt = incoming.lastVerifiedAt ?? existing.lastVerifiedAt;

  if (incoming.status === existing.status) {
    const refreshed = incoming.lastVerifiedAt !== undefined && incoming.lastVerifiedAt !== existing.lastVerifiedAt;
    const displayAfter = vacancyDisplay(existing.status, verifiedAt, now);
    return refreshed ? { action: 'apply', status: existing.status, lastVerifiedAt: incoming.lastVerifiedAt, displayAfter } : { action: 'noop', displayAfter };
  }

  // Going live from review is a human publish with compliance approval. Never automated.
  if (existing.status === 'readyForReview' && incoming.status === 'available') {
    return { action: 'hold-for-human-publish', displayAfter: vacancyDisplay(existing.status, verifiedAt, now) };
  }

  if (canTransition(existing.status, incoming.status, incoming.updatedByRole)) {
    return { action: 'apply', status: incoming.status, lastVerifiedAt: verifiedAt, displayAfter: vacancyDisplay(incoming.status, verifiedAt, now) };
  }

  // Fail safe: if the source says a live vacancy is closing but the role may not make that exact change,
  // stop advertising it and ask a human, rather than keep showing availability.
  if (existing.status === 'available' && CLOSING.includes(incoming.status)) {
    return { action: 'fail-safe-suspend', status: 'temporarilyUnavailable', needsHumanReview: true, displayAfter: 'temporarilyUnavailable' };
  }

  return { action: 'reject', problems: ['status:transition_not_permitted'] };
}

/** Sync health guard: if the last successful sync is older than 24 h (inclusive limit), "available" is shown as unconfirmed. */
export const SYNC_STALE_AFTER_MS = 24 * HOUR_MS;

export function effectiveDisplay(v: ExistingVacancy, now: Date, lastSuccessfulSyncAt: Date | undefined): VacancyDisplay {
  const base = vacancyDisplay(v.status, v.lastVerifiedAt, now);
  if (base !== 'available') return base;
  if (!lastSuccessfulSyncAt || now.getTime() - lastSuccessfulSyncAt.getTime() > SYNC_STALE_AFTER_MS) return 'unconfirmed';
  return base;
}
