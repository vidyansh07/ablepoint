import { approvalFields } from '@ablepoint/schemas';
import { describe, expect, it } from 'vitest';
import { checkPromptSafety, detectSensitiveTopics, evaluatePublishGate, type DraftForPublish } from '../content';

const base = {
  id: 'guide-1',
  title: 'What a support coordinator does',
  body: 'A support coordinator helps you connect with providers and put supports in place.',
  aiAssisted: false,
  aiLabelled: false,
  declaredTopics: [] as string[],
  updatedAt: '2026-11-09T00:00:00Z',
};
// Approval is bound to the content hash, so fixtures are approved AFTER their content is final.
const approved = <T extends Record<string, unknown>>(content: T) => ({ ...content, ...approvalFields(content, 'compliance-1', new Date('2026-11-10T00:00:00Z')) });
const REVIEW_KEYS = ['reviewState', 'approvedBy', 'approvedAt', 'approvedContentHash'];
// Content overrides are part of what the reviewer approved; review-field overrides are applied afterwards to simulate bad approvals.
const build = (content: Record<string, unknown>, over: Record<string, unknown>): DraftForPublish => {
  const contentOver = Object.fromEntries(Object.entries(over).filter(([k]) => !REVIEW_KEYS.includes(k)));
  const reviewOver = Object.fromEntries(Object.entries(over).filter(([k]) => REVIEW_KEYS.includes(k)));
  return { ...approved({ ...content, ...contentOver }), ...reviewOver } as unknown as DraftForPublish;
};
const draft = (over: Partial<DraftForPublish> = {}): DraftForPublish => build(base, over);
const ai = (over: Partial<DraftForPublish> = {}): DraftForPublish =>
  build({ ...base, aiAssisted: true, aiLabelled: true, factCheckedBy: 'Jo Reviewer', factCheckedAt: '2026-11-10T00:00:00Z' }, over);
// A document edited AFTER it was approved.
const editedAfterApproval = (body: string): DraftForPublish => ({ ...approved(base), body }) as unknown as DraftForPublish;

describe('evaluatePublishGate (A11)', () => {
  it('allows approved human-written content to be published by a human', () => expect(evaluatePublishGate(draft(), 'human')).toEqual({ allowed: true, blockers: [], sensitiveTopics: [] }));
  it('allows already-approved non-AI content on an automated schedule', () => expect(evaluatePublishGate(draft(), 'automation').allowed).toBe(true));
  it('never lets automation publish AI-assisted content', () => expect(evaluatePublishGate(ai(), 'automation').blockers).toContain('automation_cannot_publish_ai_content'));
  it('lets a human publish fact-checked, labelled, approved AI-assisted content', () => expect(evaluatePublishGate(ai(), 'human').allowed).toBe(true));
  it('requires AI involvement to be labelled', () => expect(evaluatePublishGate(ai({ aiLabelled: false }), 'human').blockers).toContain('ai_output_not_labelled'));
  it('requires a human fact-check', () => {
    expect(evaluatePublishGate(ai({ factCheckedBy: undefined }), 'human').blockers).toContain('missing_human_fact_check');
    for (const who of ['AI', 'ai-reviewer', 'system', 'automation', 'n8n', 'Claude', 'ChatGPT']) {
      expect(evaluatePublishGate(ai({ factCheckedBy: who }), 'human').blockers).toContain('missing_human_fact_check');
    }
  });
  it('rejects a fact-check that predates the last edit', () => {
    expect(evaluatePublishGate(ai({ factCheckedAt: '2026-11-08T00:00:00Z' }), 'human').blockers).toContain('fact_check_predates_last_edit');
    expect(evaluatePublishGate(ai({ factCheckedAt: undefined }), 'human').blockers).toContain('fact_check_predates_last_edit');
  });
  it('requires current compliance approval', () => {
    expect(evaluatePublishGate(draft({ reviewState: 'draft' }), 'human').blockers).toContain('compliance_approval_not_current');
    expect(evaluatePublishGate(editedAfterApproval('Edited after the compliance reviewer approved it.'), 'human').blockers).toContain('compliance_approval_not_current');
    expect(evaluatePublishGate(draft({ approvedBy: undefined }), 'human').blockers).toContain('compliance_approval_not_current');
  });
  it('blocks banned claims', () => expect(evaluatePublishGate(draft({ body: 'We are an approved NDIS provider.' }), 'human').blockers.join()).toMatch(/banned_phrase/));
});

describe('NDIS eligibility and funding topics', () => {
  const funding = { body: 'Your SIL funding depends on your plan and eligibility.' };
  it('detects sensitive topics from text', () => expect(detectSensitiveTopics(funding.body)).toEqual(expect.arrayContaining(['funding', 'eligibility'])));
  it('detects plan-rule language', () => expect(detectSensitiveTopics('Understand reasonable and necessary supports')).toEqual(['plan_rules']));
  it('never auto-publishes, even with approval and a fact-check', () => {
    const v = evaluatePublishGate(ai({ ...funding, reviewerNdisExperienced: true }), 'automation');
    expect(v.allowed).toBe(false);
    expect(v.blockers).toContain('sensitive_topic_cannot_auto_publish');
  });
  it('also blocks human-written funding content from automation', () => expect(evaluatePublishGate(draft({ ...funding, factCheckedBy: 'Jo', factCheckedAt: '2026-11-10T00:00:00Z', reviewerNdisExperienced: true }), 'automation').allowed).toBe(false));
  it('needs an NDIS-experienced reviewer even for a human publish', () => expect(evaluatePublishGate(ai(funding), 'human').blockers).toContain('ndis_expert_review_required'));
  it('allows a human publish with the expert reviewer, fact-check and approval', () => expect(evaluatePublishGate(ai({ ...funding, reviewerNdisExperienced: true }), 'human').allowed).toBe(true));
  it('requires a fact-check for sensitive topics even when not AI-assisted', () => {
    expect(evaluatePublishGate(draft({ ...funding, reviewerNdisExperienced: true }), 'human').blockers).toContain('missing_human_fact_check');
  });
  it('honours declared topics that the text does not reveal', () => expect(evaluatePublishGate(draft({ declaredTopics: ['eligibility'] }), 'automation').blockers).toContain('sensitive_topic_cannot_auto_publish'));
});

describe('checkPromptSafety', () => {
  it('flags emails, phone numbers and NDIS-number-like digits without echoing them', () => {
    const r = checkPromptSafety('Write about sam@example.test, call 0412 345 678, participant 430 123 456');
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual(['contains_email', 'contains_phone', 'contains_ndis_number_like']);
    expect(JSON.stringify(r)).not.toContain('sam@');
  });
  it('accepts a generic content brief', () => expect(checkPromptSafety('Draft a guide explaining short term accommodation in plain English.')).toEqual({ ok: true, problems: [] }));
});
