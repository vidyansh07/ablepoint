import { describe, expect, it } from 'vitest';
import { planFollowUps, validateStageChange, type FollowUpState } from '../followup';
import { syd } from './helpers';

const allowed = { consentToContact: true, doNotContact: false, optedOut: false };
const changed = syd('2026-11-02T10:00'); // Monday 10:00
const state = (over: Partial<FollowUpState> = {}): FollowUpState => ({
  stage: 'contacted',
  stageChangedAt: changed,
  permission: allowed,
  contact: { phoneE164: '+61412345678', email: 'sam@example.test' },
  preferredChannel: 'sms',
  sent: [],
  ...over,
});
const at = (offsetMs: number) => new Date(changed.getTime() + offsetMs);
const H = 3_600_000;
const D = 24 * H;

describe('validateStageChange', () => {
  it.each([
    ['new', 'contacted'],
    ['contacted', 'intakeCall'],
    ['intakeCall', 'serviceAgreement'],
    ['serviceAgreement', 'active'],
  ] as const)('allows %s -> %s', (from, to) => expect(validateStageChange({ from, to })).toEqual({ ok: true }));
  it('rejects skipping a stage', () => expect(validateStageChange({ from: 'new', to: 'active' })).toEqual({ ok: false, reason: 'invalid_transition' }));
  it('rejects leaving active', () => expect(validateStageChange({ from: 'active', to: 'lost', lostReason: 'other' })).toEqual({ ok: false, reason: 'invalid_transition' }));
  it('requires a reason for lost', () => expect(validateStageChange({ from: 'contacted', to: 'lost' })).toEqual({ ok: false, reason: 'lost_reason_required' }));
  it('rejects an unknown lost reason', () => expect(validateStageChange({ from: 'contacted', to: 'lost', lostReason: 'whatever' })).toEqual({ ok: false, reason: 'unknown_lost_reason' }));
  it('accepts lost with a valid reason', () => expect(validateStageChange({ from: 'contacted', to: 'lost', lostReason: 'no_response' })).toEqual({ ok: true }));
  it('requires re-opening a lost enquiry to be logged', () => {
    expect(validateStageChange({ from: 'lost', to: 'new' })).toEqual({ ok: false, reason: 'reopen_must_be_logged' });
    expect(validateStageChange({ from: 'lost', to: 'new', reopenLogged: true })).toEqual({ ok: true });
  });
});

describe('planFollowUps: owner reminder', () => {
  it('is not due at 23h59m', () => expect(planFollowUps(state(), at(24 * H - 60_000)).actions).toEqual([]));
  it('is due at exactly 24h', () => expect(planFollowUps(state(), at(24 * H)).actions).toEqual([{ kind: 'owner_reminder_24h', audience: 'owner' }]));
  it('is sent once', () => expect(planFollowUps(state({ sent: ['owner_reminder_24h'] }), at(30 * H)).actions).toEqual([]));
  it.each(['active', 'lost'] as const)('is not sent for %s', (stage) => expect(planFollowUps(state({ stage }), at(30 * H)).actions).toEqual([]));
  it('is sent for a new enquiry too', () => expect(planFollowUps(state({ stage: 'new' }), at(25 * H)).actions).toEqual([{ kind: 'owner_reminder_24h', audience: 'owner' }]));
  it('is internal, so do-not-contact does not suppress it', () => {
    expect(planFollowUps(state({ permission: { ...allowed, doNotContact: true } }), at(25 * H)).actions).toEqual([{ kind: 'owner_reminder_24h', audience: 'owner' }]);
  });
});

describe('planFollowUps: courtesy messages', () => {
  const sentOwner = ['owner_reminder_24h'] as const;
  it('is not due at 71h', () => expect(planFollowUps(state({ sent: sentOwner }), at(71 * H)).actions).toEqual([]));
  it('sends the day-3 SMS at exactly 72h with an opt-out requirement', () => {
    expect(planFollowUps(state({ sent: sentOwner }), at(3 * D)).actions).toEqual([{ kind: 'courtesy_day3', audience: 'enquirer', channel: 'sms', mustIncludeOptOut: true }]);
  });
  it('sends the day-7 message at exactly 7 days', () => {
    expect(planFollowUps(state({ sent: [...sentOwner, 'courtesy_day3'] }), at(7 * D)).actions).toEqual([{ kind: 'courtesy_day7', audience: 'enquirer', channel: 'sms', mustIncludeOptOut: true }]);
  });
  it('sends only day 7 (never both) when both are due', () => {
    const plan = planFollowUps(state({ sent: sentOwner }), at(7 * D));
    expect(plan.actions).toEqual([{ kind: 'courtesy_day7', audience: 'enquirer', channel: 'sms', mustIncludeOptOut: true }]);
    expect(plan.superseded).toEqual(['courtesy_day3']);
  });
  it('uses email when email is the preferred channel', () => {
    expect(planFollowUps(state({ preferredChannel: 'email', sent: sentOwner }), at(3 * D)).actions[0]).toMatchObject({ channel: 'email' });
  });
  it('only messages while the enquiry is in "contacted"', () => {
    expect(planFollowUps(state({ stage: 'intakeCall', sent: sentOwner }), at(8 * D)).actions).toEqual([]);
  });
  it('measures from the latest stage change, so a stage change restarts the cadence', () => {
    const s = state({ stageChangedAt: at(3 * D - 3_600_000), sent: sentOwner });
    expect(planFollowUps(s, at(3 * D)).actions).toEqual([]);
  });
  it('is blocked without consent', () => {
    const p = planFollowUps(state({ permission: { ...allowed, consentToContact: false }, sent: sentOwner }), at(3 * D));
    expect(p.actions).toEqual([]);
    expect(p.blocked).toEqual([{ kind: 'courtesy_day3', reason: 'no_consent' }]);
  });
  it('is blocked after an opt-out', () => {
    expect(planFollowUps(state({ permission: { ...allowed, optedOut: true }, sent: sentOwner }), at(3 * D)).blocked[0]?.reason).toBe('opted_out');
  });
  it('do-not-contact overrides everything, including a reply and a good channel', () => {
    const p = planFollowUps(state({ permission: { ...allowed, doNotContact: true, optedOut: true }, enquirerRepliedAt: at(D), sent: sentOwner }), at(3 * D));
    expect(p.actions).toEqual([]);
    expect(p.blocked[0]?.reason).toBe('do_not_contact');
  });
  it('stops when the enquirer has replied since the stage changed', () => {
    const p = planFollowUps(state({ enquirerRepliedAt: at(D), sent: sentOwner }), at(3 * D));
    expect(p.blocked[0]?.reason).toBe('enquirer_replied');
  });
  it('ignores a reply from before the stage change', () => {
    const p = planFollowUps(state({ enquirerRepliedAt: at(-D), sent: sentOwner }), at(3 * D));
    expect(p.actions).toHaveLength(1);
  });
  it('is blocked when the preferred channel is a phone call', () => {
    expect(planFollowUps(state({ preferredChannel: 'phone', sent: sentOwner }), at(3 * D)).blocked[0]?.reason).toBe('no_messaging_channel');
  });
  it('is blocked for an SMS preference with a landline number', () => {
    expect(planFollowUps(state({ contact: { phoneE164: '+61243210000' }, sent: sentOwner }), at(3 * D)).blocked[0]?.reason).toBe('no_messaging_channel');
  });
  it('is blocked for an email preference without an email address', () => {
    expect(planFollowUps(state({ preferredChannel: 'email', contact: { phoneE164: '+61412345678' }, sent: sentOwner }), at(3 * D)).blocked[0]?.reason).toBe('no_messaging_channel');
  });
  it('defers to the end of quiet hours', () => {
    // Thursday 22:00 local is 3 days + 12h after Monday 10:00
    const now = syd('2026-11-05T22:00');
    const p = planFollowUps(state({ sent: sentOwner }), now);
    expect(p.actions).toEqual([]);
    expect(p.deferred).toEqual([{ kind: 'courtesy_day3', until: syd('2026-11-06T08:00'), reason: 'quiet_hours' }]);
  });
});
