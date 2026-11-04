import { normalisePhoneAU } from '@ablepoint/schemas';
import { contactBlock, DAY_MS, DEFAULT_QUIET_HOURS, isQuietHours, maskPhone, nextQuietHoursEnd, type ContactBlockReason, type ContactPermission, type QuietHours } from './common';

/** A2: missed-call text-back eligibility. At most one SMS per number per 24 h. */
export const MISSED_CALL_SMS_COOLDOWN_MS = DAY_MS;

export interface MissedCallInput {
  callerNumber: string;
  /** Permission recorded for this number in the CRM; undefined for an unknown caller. */
  knownPermission?: ContactPermission;
  lastSmsSentAt?: Date;
  now: Date;
  quietHours?: QuietHours;
  /**
   * Whether an inbound call alone is treated as a basis to reply by SMS to an unknown caller.
   * Defaults to false: the consent basis is awaiting adviser sign-off (docs/09 A2).
   */
  allowInboundCallInferredConsent?: boolean;
}

export type SmsDecision =
  | { action: 'send' }
  | { action: 'defer'; sendAt: Date }
  | { action: 'skip'; reason: ContactBlockReason | 'invalid_number' | 'not_mobile' | 'no_consent_basis' | 'rate_limited' };

export interface MissedCallPlan {
  sms: SmsDecision;
  /** A staff callback task is always created; do-not-contact only changes the instruction on it. */
  staffTask: { create: true; doNotCallBack: boolean; callerMasked: string };
}

export function planMissedCall(i: MissedCallInput): MissedCallPlan {
  const e164 = normalisePhoneAU(i.callerNumber);
  const doNotCallBack = i.knownPermission?.doNotContact === true;
  const staffTask = { create: true as const, doNotCallBack, callerMasked: e164 ? maskPhone(e164) : '***' };
  const skip = (reason: Extract<SmsDecision, { action: 'skip' }>['reason']): MissedCallPlan => ({ sms: { action: 'skip', reason }, staffTask });

  // Do-not-contact is evaluated before anything else, including number validity.
  if (i.knownPermission) {
    const block = contactBlock(i.knownPermission);
    if (block) return skip(block);
  }
  if (!e164) return skip('invalid_number');
  if (!i.knownPermission && !i.allowInboundCallInferredConsent) return skip('no_consent_basis');
  if (!e164.startsWith('+614')) return skip('not_mobile');
  if (i.lastSmsSentAt && i.now.getTime() - i.lastSmsSentAt.getTime() < MISSED_CALL_SMS_COOLDOWN_MS) return skip('rate_limited');

  const q = i.quietHours ?? DEFAULT_QUIET_HOURS;
  if (isQuietHours(i.now, q)) return { sms: { action: 'defer', sendAt: nextQuietHoursEnd(i.now, q) }, staffTask };
  return { sms: { action: 'send' }, staffTask };
}

/** Message body that identifies the sender, offers an opt-out and carries no health detail. */
export function buildMissedCallSms(opts: { orgName: string; phoneDisplay: string }): string {
  return `${opts.orgName}: Sorry we missed your call. Reply with a good time for us to call you back, or call ${opts.phoneDisplay}. Reply STOP to opt out.`;
}
