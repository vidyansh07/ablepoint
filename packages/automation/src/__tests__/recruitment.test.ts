import { describe, expect, it } from 'vitest';
import { canViewApplicant, prioritiseScreening, validateRecruitmentTransition, type RecruitmentStage } from '../recruitment';

const human = { kind: 'human' as const, id: 'recruiter-1' };
const system = { kind: 'system' as const };

describe('validateRecruitmentTransition (A16)', () => {
  it('lets the system screen and queue applications for human review', () => {
    expect(validateRecruitmentTransition({ from: 'applied', to: 'screened', actor: system })).toEqual({ ok: true });
    expect(validateRecruitmentTransition({ from: 'screened', to: 'humanReview', actor: system })).toEqual({ ok: true });
  });
  it('forbids automated rejection from every stage', () => {
    for (const from of ['humanReview', 'interviewed'] as RecruitmentStage[]) {
      expect(validateRecruitmentTransition({ from, to: 'rejected', actor: system, reason: 'score too low' })).toEqual({ ok: false, reason: 'automated_rejection_forbidden' });
    }
  });
  it('allows a human to reject, with a reason', () => expect(validateRecruitmentTransition({ from: 'humanReview', to: 'rejected', actor: human, reason: 'Does not meet role requirements' })).toEqual({ ok: true }));
  it('requires a reason and a real human id for a rejection', () => {
    expect(validateRecruitmentTransition({ from: 'humanReview', to: 'rejected', actor: human })).toEqual({ ok: false, reason: 'rejection_reason_required' });
    expect(validateRecruitmentTransition({ from: 'humanReview', to: 'rejected', actor: { kind: 'human', id: '  ' }, reason: 'x' })).toEqual({ ok: false, reason: 'human_actor_required' });
  });
  it('requires a human to schedule interviews and authorise onboarding', () => {
    expect(validateRecruitmentTransition({ from: 'humanReview', to: 'interviewScheduled', actor: system })).toEqual({ ok: false, reason: 'human_actor_required' });
    expect(validateRecruitmentTransition({ from: 'interviewed', to: 'onboarding', actor: system })).toEqual({ ok: false, reason: 'human_actor_required' });
    expect(validateRecruitmentTransition({ from: 'interviewed', to: 'onboarding', actor: human })).toEqual({ ok: true });
  });
  it('rejects skipped stages and moves out of terminal stages', () => {
    expect(validateRecruitmentTransition({ from: 'applied', to: 'interviewScheduled', actor: human })).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(validateRecruitmentTransition({ from: 'rejected', to: 'humanReview', actor: human })).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(validateRecruitmentTransition({ from: 'withdrawn', to: 'applied', actor: human })).toEqual({ ok: false, reason: 'invalid_transition' });
  });
  it('lets an applicant withdraw at any live stage', () => {
    for (const from of ['applied', 'screened', 'humanReview', 'interviewScheduled', 'interviewed', 'onboarding'] as RecruitmentStage[]) {
      expect(validateRecruitmentTransition({ from, to: 'withdrawn', actor: system })).toEqual({ ok: true });
    }
  });
});

describe('prioritiseScreening', () => {
  const required = ['availability', 'transport'];
  it('always recommends human review, never a decision', () => {
    for (const answers of [{ availability: true, transport: true }, { availability: false, transport: false }, { availability: null, transport: null }]) {
      expect(prioritiseScreening(answers, required).recommendation).toBe('human_review');
    }
  });
  it('raises priority only when every required answer is yes', () => {
    expect(prioritiseScreening({ availability: true, transport: true }, required).priority).toBe('high');
    expect(prioritiseScreening({ availability: true, transport: false }, required).priority).toBe('normal');
  });
  it('lists unanswered questions', () => expect(prioritiseScreening({ availability: true, transport: null }, required).unanswered).toEqual(['transport']));
});

describe('canViewApplicant', () => {
  it.each([['recruitmentManager', true], ['administrator', true], ['marketing', false], ['intakeStaff', false], ['regionalStaff', false]] as const)('%s -> %s', (role, ok) => expect(canViewApplicant(role)).toBe(ok));
});
