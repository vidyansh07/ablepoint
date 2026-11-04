import { describe, expect, it } from 'vitest';
import { buildReviewRequestMessage, evaluateReviewRequest, findInducements, REVIEW_REQUEST_MIN_ACTIVE_DAYS, validateReviewMessage, type ReviewRequestInput } from '../reviews';
import { days, syd } from './helpers';

const now = syd('2026-11-20T11:00');
const base: ReviewRequestInput = {
  stage: 'active',
  activeSince: new Date(now.getTime() - days(31)),
  now,
  permission: { consentToContact: true, doNotContact: false, optedOut: false },
  consentToReviewRequests: true,
  nominatedContact: { kind: 'family', channel: 'sms', reachable: true },
  alreadyRequested: false,
  openComplaint: false,
  workflowActivated: true,
};

describe('evaluateReviewRequest (A8)', () => {
  it('sends to the nominated contact when every condition is met', () => expect(evaluateReviewRequest(base)).toEqual({ action: 'send', channel: 'sms' }));
  it('requires 30 days active, inclusive', () => {
    expect(REVIEW_REQUEST_MIN_ACTIVE_DAYS).toBe(30);
    expect(evaluateReviewRequest({ ...base, activeSince: new Date(now.getTime() - days(30)) })).toEqual({ action: 'send', channel: 'sms' });
    expect(evaluateReviewRequest({ ...base, activeSince: new Date(now.getTime() - days(30) + 1) })).toEqual({ action: 'skip', reason: 'too_early' });
  });
  it('stays off until the workflow is activated', () => expect(evaluateReviewRequest({ ...base, workflowActivated: false })).toEqual({ action: 'skip', reason: 'not_activated' }));
  it('do-not-contact wins over everything, including an inactive workflow', () => {
    expect(evaluateReviewRequest({ ...base, workflowActivated: false, permission: { ...base.permission, doNotContact: true } })).toEqual({ action: 'skip', reason: 'do_not_contact' });
  });
  it('respects opt-out and missing consent', () => {
    expect(evaluateReviewRequest({ ...base, permission: { ...base.permission, optedOut: true } })).toEqual({ action: 'skip', reason: 'opted_out' });
    expect(evaluateReviewRequest({ ...base, permission: { ...base.permission, consentToContact: false } })).toEqual({ action: 'skip', reason: 'no_consent' });
  });
  it('needs separate consent to be asked for a review', () => expect(evaluateReviewRequest({ ...base, consentToReviewRequests: false })).toEqual({ action: 'skip', reason: 'no_review_consent' }));
  it('needs a reachable nominated contact', () => {
    expect(evaluateReviewRequest({ ...base, nominatedContact: undefined })).toEqual({ action: 'skip', reason: 'no_nominated_contact' });
    expect(evaluateReviewRequest({ ...base, nominatedContact: { kind: 'family', channel: 'sms', reachable: false } })).toEqual({ action: 'skip', reason: 'no_nominated_contact' });
  });
  it('only applies to active participants', () => {
    expect(evaluateReviewRequest({ ...base, stage: 'lost' })).toEqual({ action: 'skip', reason: 'not_active' });
    expect(evaluateReviewRequest({ ...base, activeSince: undefined })).toEqual({ action: 'skip', reason: 'not_active' });
  });
  it('does not ask while a complaint is open or after a previous request', () => {
    expect(evaluateReviewRequest({ ...base, openComplaint: true })).toEqual({ action: 'skip', reason: 'open_complaint' });
    expect(evaluateReviewRequest({ ...base, alreadyRequested: true })).toEqual({ action: 'skip', reason: 'already_requested' });
  });
  it('defers during quiet hours', () => {
    expect(evaluateReviewRequest({ ...base, now: syd('2026-11-20T21:30') })).toEqual({ action: 'defer', sendAt: syd('2026-11-21T08:00') });
  });
});

describe('inducement lint', () => {
  it.each([
    ['Leave a review and get a free gift', ['gift', 'free']],
    ['Win a $50 voucher for your feedback', ['voucher', 'dollar_amount']],
    ['Enjoy 10% off your next month', ['percent_off']],
    ['We will give you a reward', ['reward']],
    ['Please leave us a 5 star review', ['rating_steering']],
    ['Share a positive review', ['rating_steering']],
    ['Cashback for every review', ['cash']],
    ['In exchange for your time', ['quid_pro_quo']],
  ])('rejects: %s', (text, labels) => {
    const found = findInducements(text);
    for (const l of labels) expect(found).toContain(l);
  });
  it.each([['Feel free to call us on 1300 088 549'], ['You are free to choose any provider'], ['Share your feedback if you wish']])('allows: %s', (t) => expect(findInducements(t)).toEqual([]));
});

describe('validateReviewMessage', () => {
  it('accepts the standard message', () => {
    const msg = buildReviewRequestMessage({ orgName: 'AblePoint Australia', reviewUrl: 'https://example.test/review' });
    expect(validateReviewMessage(msg, 'AblePoint Australia', 'sms')).toEqual({ ok: true, inducements: [], problems: [] });
  });
  it('rejects a message with a reward, naming labels but not echoing text', () => {
    const v = validateReviewMessage('AblePoint Australia: review us for a $20 voucher. Reply STOP to opt out.', 'AblePoint Australia', 'sms');
    expect(v.ok).toBe(false);
    expect(v.inducements).toEqual(expect.arrayContaining(['voucher', 'dollar_amount']));
    expect(JSON.stringify(v)).not.toContain('$20');
  });
  it('rejects a message with no opt-out or sender', () => {
    const v = validateReviewMessage('Please share your feedback.', 'AblePoint Australia', 'sms');
    expect(v.problems).toEqual(expect.arrayContaining(['missing_sender_identification', 'missing_opt_out']));
  });
});
