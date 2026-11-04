import { normalisePhoneAU } from '@ablepoint/schemas';
import { businessMinutesElapsed, contactBlock, DAY_MS, DEFAULT_BUSINESS_HOURS, DEFAULT_QUIET_HOURS, isBusinessHours, isQuietHours, nextQuietHoursEnd, type BusinessHours, type ContactBlockReason, type ContactPermission, type QuietHours } from './common';

/** A1: automated acknowledgement within two minutes (inclusive). */
export const ACK_TARGET_SECONDS = 120;
/** First HUMAN response target in business hours: under 15 minutes (strict). */
export const HUMAN_RESPONSE_BUSINESS_MINUTES = 15;

export type AckChannel = 'sms' | 'email';

export type AckPlan =
  | { action: 'send'; channel: AckChannel; automated: true }
  | { action: 'defer'; channel: AckChannel; sendAt: Date; automated: true }
  | { action: 'skip'; reason: ContactBlockReason | 'already_sent' | 'no_channel_available' };

export interface AckInput {
  permission: ContactPermission;
  contact: { phoneE164?: string; email?: string };
  preferredChannel: 'phone' | 'email' | 'sms';
  alreadySent: boolean;
  now: Date;
  quietHours?: QuietHours;
}

/**
 * Pick the acknowledgement channel. It is always labelled automated (never presented as a human reply).
 * ASSUMPTION: SMS respects quiet hours; if an email address exists we send email immediately instead of deferring.
 */
export function planAcknowledgement(i: AckInput): AckPlan {
  if (i.alreadySent) return { action: 'skip', reason: 'already_sent' };
  const block = contactBlock(i.permission);
  if (block) return { action: 'skip', reason: block };
  const q = i.quietHours ?? DEFAULT_QUIET_HOURS;
  const phone = i.contact.phoneE164 ? normalisePhoneAU(i.contact.phoneE164) : null;
  const canSms = phone !== null && phone.startsWith('+614');
  const canEmail = Boolean(i.contact.email);

  const order: AckChannel[] = i.preferredChannel === 'sms' ? ['sms', 'email'] : ['email', 'sms'];
  for (const channel of order) {
    if (channel === 'email' && canEmail) return { action: 'send', channel, automated: true };
    if (channel === 'sms' && canSms) {
      if (!isQuietHours(i.now, q)) return { action: 'send', channel, automated: true };
      if (canEmail) return { action: 'send', channel: 'email', automated: true };
      return { action: 'defer', channel, sendAt: nextQuietHoursEnd(i.now, q), automated: true };
    }
  }
  return { action: 'skip', reason: 'no_channel_available' };
}

/** Automated acknowledgement SLA: sent no later than 120 s after submission. */
export function ackSlaMet(createdAt: Date, ackSentAt: Date | undefined): boolean {
  if (!ackSentAt) return false;
  return ackSentAt.getTime() - createdAt.getTime() <= ACK_TARGET_SECONDS * 1000;
}

export interface HumanResponseSla {
  met: boolean;
  basis: 'business_minutes_under_15' | 'within_24_hours';
  businessMinutes: number | null;
}

/**
 * First human response SLA (docs/09 pipeline: under 15 minutes in business hours, otherwise within 24 hours).
 * An automated acknowledgement does not count: pass only a human response time.
 */
export function humanResponseSla(createdAt: Date, firstHumanResponseAt: Date | undefined, now: Date, hours: BusinessHours = DEFAULT_BUSINESS_HOURS): HumanResponseSla {
  if (isBusinessHours(createdAt, hours)) {
    const end = firstHumanResponseAt ?? now;
    const minutes = businessMinutesElapsed(createdAt, end, hours, HUMAN_RESPONSE_BUSINESS_MINUTES);
    return { met: firstHumanResponseAt !== undefined && minutes < HUMAN_RESPONSE_BUSINESS_MINUTES, basis: 'business_minutes_under_15', businessMinutes: minutes };
  }
  const end = firstHumanResponseAt ?? now;
  return { met: firstHumanResponseAt !== undefined && end.getTime() - createdAt.getTime() <= DAY_MS, basis: 'within_24_hours', businessMinutes: null };
}
