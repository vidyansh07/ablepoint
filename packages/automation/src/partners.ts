import { vacancyDisplay, type VacancyStatus } from '@ablepoint/schemas';
import { DAY_MS } from './common';
import { lintOutboundMessage } from './messaging';

/** A12 referral-partner engine rules. Capacity emails use only VERIFIED, non-stale, available vacancies. */

export interface CapacityVacancy {
  id: string;
  regionSlug: string;
  type: 'SIL' | 'SDA' | 'STA';
  status: VacancyStatus;
  lastVerifiedAt?: string;
  verifiedBy?: string;
}

export type CapacityExclusion = 'not_available' | 'stale_or_unverified' | 'no_human_verifier';

export interface CapacitySummary {
  generatedAt: Date;
  total: number;
  byRegion: Record<string, { SIL: number; SDA: number; STA: number }>;
  includedIds: string[];
  excluded: Array<{ id: string; reason: CapacityExclusion }>;
  empty: boolean;
}

export function buildCapacitySummary(vacancies: readonly CapacityVacancy[], now: Date): CapacitySummary {
  const byRegion: CapacitySummary['byRegion'] = {};
  const includedIds: string[] = [];
  const excluded: CapacitySummary['excluded'] = [];
  for (const v of vacancies) {
    if (v.status !== 'available') {
      excluded.push({ id: v.id, reason: 'not_available' });
      continue;
    }
    if (vacancyDisplay(v.status, v.lastVerifiedAt, now) !== 'available') {
      excluded.push({ id: v.id, reason: 'stale_or_unverified' });
      continue;
    }
    if (!v.verifiedBy) {
      excluded.push({ id: v.id, reason: 'no_human_verifier' });
      continue;
    }
    const row = (byRegion[v.regionSlug] ??= { SIL: 0, SDA: 0, STA: 0 });
    row[v.type]++;
    includedIds.push(v.id);
  }
  return { generatedAt: now, total: includedIds.length, byRegion, includedIds, excluded, empty: includedIds.length === 0 };
}

export type OutreachKind = 'intro' | 'monthly_capacity' | 'meeting_request';

export interface OutreachInput {
  partner: { optedOut: boolean; doNotContact: boolean; lastContactedAt?: Date };
  kind: OutreachKind;
  message: string;
  orgName: string;
  now: Date;
  capacityEmpty?: boolean;
  minDaysBetween?: number;
}

export type OutreachVerdict = { allowed: true } | { allowed: false; reason: 'do_not_contact' | 'opted_out' | 'message_lint_failed' | 'too_soon' | 'no_verified_capacity'; problems?: string[] };

export function evaluateOutreach(i: OutreachInput): OutreachVerdict {
  if (i.partner.doNotContact) return { allowed: false, reason: 'do_not_contact' };
  if (i.partner.optedOut) return { allowed: false, reason: 'opted_out' };
  const lint = lintOutboundMessage(i.message, { orgName: i.orgName, channel: 'email' });
  if (!lint.ok) return { allowed: false, reason: 'message_lint_failed', problems: lint.problems };
  if (i.kind === 'monthly_capacity' && i.capacityEmpty) return { allowed: false, reason: 'no_verified_capacity' };
  if (i.partner.lastContactedAt && i.now.getTime() - i.partner.lastContactedAt.getTime() < (i.minDaysBetween ?? 14) * DAY_MS) return { allowed: false, reason: 'too_soon' };
  return { allowed: true };
}

/** Replies that ask to stop must trigger an opt-out; everything else becomes a CRM task. */
export function classifyPartnerReply(text: string): 'opt_out' | 'create_task' {
  return /\b(stop|unsubscribe|remove me|opt[- ]?out|do not contact|don'?t contact)\b/i.test(text) ? 'opt_out' : 'create_task';
}
