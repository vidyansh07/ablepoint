import { normalisePhoneAU } from '@ablepoint/schemas';
import { contactBlock, DAY_MS, DEFAULT_QUIET_HOURS, HOUR_MS, isQuietHours, nextQuietHoursEnd, type ContactBlockReason, type ContactPermission, type QuietHours } from './common';

// ---------------------------------------------------------------------------
// Pipeline stages (docs/09 §1)
// ---------------------------------------------------------------------------

export type Stage = 'new' | 'contacted' | 'intakeCall' | 'serviceAgreement' | 'active' | 'lost';

export const STAGE_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  new: ['contacted', 'lost'],
  contacted: ['intakeCall', 'lost'],
  intakeCall: ['serviceAgreement', 'lost'],
  serviceAgreement: ['active', 'lost'],
  active: [],
  // Re-opening a lost enquiry is allowed but must be logged and restarts the pipeline.
  lost: ['new'],
};

export const LOST_REASONS = ['no_response', 'declined_by_enquirer', 'out_of_area', 'no_capacity', 'service_not_offered', 'duplicate', 'spam', 'other'] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export type StageChangeVerdict = { ok: true } | { ok: false; reason: 'invalid_transition' | 'lost_reason_required' | 'unknown_lost_reason' | 'reopen_must_be_logged' };

export function validateStageChange(input: { from: Stage; to: Stage; lostReason?: string; reopenLogged?: boolean }): StageChangeVerdict {
  if (!STAGE_TRANSITIONS[input.from].includes(input.to)) return { ok: false, reason: 'invalid_transition' };
  if (input.to === 'lost') {
    if (!input.lostReason) return { ok: false, reason: 'lost_reason_required' };
    if (!(LOST_REASONS as readonly string[]).includes(input.lostReason)) return { ok: false, reason: 'unknown_lost_reason' };
  }
  if (input.from === 'lost' && !input.reopenLogged) return { ok: false, reason: 'reopen_must_be_logged' };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// A5 follow-up cadence
// ---------------------------------------------------------------------------

export type FollowUpKind = 'owner_reminder_24h' | 'courtesy_day3' | 'courtesy_day7';

/** Stages where a staff reminder is due when nothing has changed for 24 h. */
export const UNRESOLVED_STAGES: readonly Stage[] = ['new', 'contacted', 'intakeCall', 'serviceAgreement'];

export const OWNER_REMINDER_AFTER_MS = 24 * HOUR_MS;
export const COURTESY_DAY3_AFTER_MS = 3 * DAY_MS;
export const COURTESY_DAY7_AFTER_MS = 7 * DAY_MS;

export interface FollowUpState {
  stage: Stage;
  stageChangedAt: Date;
  permission: ContactPermission;
  contact: { phoneE164?: string; email?: string };
  preferredChannel: 'phone' | 'email' | 'sms';
  enquirerRepliedAt?: Date;
  /** Follow-ups already sent since the stage last changed. */
  sent: readonly FollowUpKind[];
}

export type FollowUpAction =
  | { kind: 'owner_reminder_24h'; audience: 'owner' }
  | { kind: 'courtesy_day3' | 'courtesy_day7'; audience: 'enquirer'; channel: 'sms' | 'email'; mustIncludeOptOut: true };

export type CourtesyBlockReason = ContactBlockReason | 'enquirer_replied' | 'no_messaging_channel';

export interface FollowUpPlan {
  actions: FollowUpAction[];
  deferred: Array<{ kind: FollowUpKind; until: Date; reason: 'quiet_hours' }>;
  blocked: Array<{ kind: FollowUpKind; reason: CourtesyBlockReason }>;
  /** Earlier courtesy messages skipped because a later one is already due (never send both at once). */
  superseded: FollowUpKind[];
}

/**
 * Courtesy messages to the enquirer only while the enquiry is in "contacted"; they stop on reply,
 * on any stage change (timers are measured from stageChangedAt), and are blocked by consent,
 * do-not-contact and opt-out. Staff reminders are internal and not consent-gated.
 */
export function planFollowUps(state: FollowUpState, now: Date, quietHours: QuietHours = DEFAULT_QUIET_HOURS): FollowUpPlan {
  const plan: FollowUpPlan = { actions: [], deferred: [], blocked: [], superseded: [] };
  const age = now.getTime() - state.stageChangedAt.getTime();
  const sent = new Set(state.sent);

  if (UNRESOLVED_STAGES.includes(state.stage) && age >= OWNER_REMINDER_AFTER_MS && !sent.has('owner_reminder_24h')) {
    plan.actions.push({ kind: 'owner_reminder_24h', audience: 'owner' });
  }

  if (state.stage !== 'contacted') return plan;

  const due: FollowUpKind[] = [];
  if (age >= COURTESY_DAY3_AFTER_MS && !sent.has('courtesy_day3')) due.push('courtesy_day3');
  if (age >= COURTESY_DAY7_AFTER_MS && !sent.has('courtesy_day7')) due.push('courtesy_day7');
  if (due.length === 0) return plan;

  const latest = due[due.length - 1] as 'courtesy_day3' | 'courtesy_day7';
  plan.superseded = due.slice(0, -1);

  const block = contactBlock(state.permission);
  if (block) {
    plan.blocked.push({ kind: latest, reason: block });
    return plan;
  }
  if (state.enquirerRepliedAt && state.enquirerRepliedAt.getTime() >= state.stageChangedAt.getTime()) {
    plan.blocked.push({ kind: latest, reason: 'enquirer_replied' });
    return plan;
  }

  const phone = state.contact.phoneE164 ? normalisePhoneAU(state.contact.phoneE164) : null;
  const channel: 'sms' | 'email' | null =
    state.preferredChannel === 'sms' && phone?.startsWith('+614') ? 'sms' : state.preferredChannel === 'email' && state.contact.email ? 'email' : null;
  if (!channel) {
    plan.blocked.push({ kind: latest, reason: 'no_messaging_channel' });
    return plan;
  }

  if (isQuietHours(now, quietHours)) {
    plan.deferred.push({ kind: latest, until: nextQuietHoursEnd(now, quietHours), reason: 'quiet_hours' });
    return plan;
  }
  plan.actions.push({ kind: latest, audience: 'enquirer', channel, mustIncludeOptOut: true });
  return plan;
}
