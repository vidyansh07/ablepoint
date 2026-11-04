import { normalisePhoneAU } from '@ablepoint/schemas';
import { DAY_MS } from './common';

/** A17 spam prevention and data hygiene. */

export const DEDUPE_WINDOW_DAYS = 90;

export interface DedupeContact {
  phone?: string;
  email?: string;
}

/** Normalised match keys, e.g. "phone:+61412345678", "email:a@b.com". */
export function dedupeKeys(c: DedupeContact): string[] {
  const keys: string[] = [];
  const phone = c.phone ? normalisePhoneAU(c.phone) : null;
  if (phone) keys.push(`phone:${phone}`);
  const email = c.email?.trim().toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) keys.push(`email:${email}`);
  return keys;
}

export interface ExistingContact extends DedupeContact {
  id: string;
  caseRef: string;
  createdAt: Date;
}

export type DuplicateDecision =
  | { action: 'create' }
  | { action: 'merge'; matchId: string }
  | { action: 'needs_staff_confirmation'; matchIds: string[]; reason: 'different_case_refs' | 'multiple_matches' };

/**
 * Match within 90 days (inclusive) on normalised phone OR email. Never auto-merge when the case references
 * differ, or when more than one record matches: staff decide.
 */
export function decideDuplicate(input: { incoming: DedupeContact & { caseRef?: string }; existing: readonly ExistingContact[]; now: Date; windowDays?: number }): DuplicateDecision {
  const keys = new Set(dedupeKeys(input.incoming));
  if (keys.size === 0) return { action: 'create' };
  const windowMs = (input.windowDays ?? DEDUPE_WINDOW_DAYS) * DAY_MS;
  const matches = input.existing.filter((e) => input.now.getTime() - e.createdAt.getTime() <= windowMs && dedupeKeys(e).some((k) => keys.has(k)));
  if (matches.length === 0) return { action: 'create' };
  if (matches.length > 1) return { action: 'needs_staff_confirmation', matchIds: matches.map((m) => m.id), reason: 'multiple_matches' };
  const only = matches[0] as ExistingContact;
  if (input.incoming.caseRef && input.incoming.caseRef !== only.caseRef) return { action: 'needs_staff_confirmation', matchIds: [only.id], reason: 'different_case_refs' };
  return { action: 'merge', matchId: only.id };
}

/**
 * FORMAT-only plausibility check for an NDIS participant number: nine digits after removing spaces and hyphens.
 * Returns a boolean and never echoes, logs or throws with the value. It is not a lookup and does not prove validity.
 * UNVERIFIED: the authoritative format rules were not checked against NDIA documentation; `requirePrefix43` is off by default
 * so the check cannot become an unnecessary barrier.
 */
export function isPlausibleNdisNumberFormat(value: string, opts: { requirePrefix43?: boolean } = {}): boolean {
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(digits)) return false;
  return opts.requirePrefix43 ? digits.startsWith('43') : true;
}

export interface SpamSignals {
  turnstileVerified: boolean;
  honeypotFilled: boolean;
  /** Milliseconds between form render and submit, if known. */
  submittedAfterMs?: number;
  ipRateLimitExceeded: boolean;
}

export const MIN_HUMAN_SUBMIT_MS = 2000;

export type SpamDecision = { decision: 'accept' | 'quarantine' | 'reject'; reasons: string[]; crmWriteAllowed: boolean };

/**
 * Fails closed: an unverified Turnstile token is rejected. Honeypot hits and impossibly fast submissions go to a
 * quarantine table and never reach the CRM.
 */
export function decideSpam(s: SpamSignals): SpamDecision {
  if (!s.turnstileVerified) return { decision: 'reject', reasons: ['turnstile_not_verified'], crmWriteAllowed: false };
  if (s.ipRateLimitExceeded) return { decision: 'reject', reasons: ['rate_limited'], crmWriteAllowed: false };
  const reasons: string[] = [];
  if (s.honeypotFilled) reasons.push('honeypot_filled');
  if (s.submittedAfterMs !== undefined && s.submittedAfterMs < MIN_HUMAN_SUBMIT_MS) reasons.push('submitted_too_fast');
  return reasons.length ? { decision: 'quarantine', reasons, crmWriteAllowed: false } : { decision: 'accept', reasons: [], crmWriteAllowed: true };
}
