/** A16 recruitment pipeline. No automated employment decisions: rejection always needs a named human. */

export type RecruitmentStage = 'applied' | 'screened' | 'humanReview' | 'interviewScheduled' | 'interviewed' | 'onboarding' | 'rejected' | 'withdrawn';

export type Actor = { kind: 'human'; id: string } | { kind: 'system' };

export const RECRUITMENT_TRANSITIONS: Record<RecruitmentStage, readonly RecruitmentStage[]> = {
  applied: ['screened', 'withdrawn'],
  screened: ['humanReview', 'withdrawn'],
  humanReview: ['interviewScheduled', 'rejected', 'withdrawn'],
  interviewScheduled: ['interviewed', 'withdrawn'],
  interviewed: ['onboarding', 'rejected', 'withdrawn'],
  onboarding: ['withdrawn'],
  rejected: [],
  withdrawn: [],
};

/** Stages the system may enter on its own. Everything from human review onward is a human decision. */
const SYSTEM_ALLOWED: readonly RecruitmentStage[] = ['screened', 'humanReview'];

export type TransitionVerdict = { ok: true } | { ok: false; reason: 'invalid_transition' | 'automated_rejection_forbidden' | 'human_actor_required' | 'rejection_reason_required' };

export function validateRecruitmentTransition(input: { from: RecruitmentStage; to: RecruitmentStage; actor: Actor; reason?: string }): TransitionVerdict {
  const { from, to, actor } = input;
  if (!RECRUITMENT_TRANSITIONS[from].includes(to)) return { ok: false, reason: 'invalid_transition' };
  if (to === 'rejected') {
    if (actor.kind !== 'human') return { ok: false, reason: 'automated_rejection_forbidden' };
    if (!actor.id.trim()) return { ok: false, reason: 'human_actor_required' };
    if (!input.reason?.trim()) return { ok: false, reason: 'rejection_reason_required' };
    return { ok: true };
  }
  if (!SYSTEM_ALLOWED.includes(to) && to !== 'withdrawn') {
    if (actor.kind !== 'human' || !actor.id.trim()) return { ok: false, reason: 'human_actor_required' };
  }
  return { ok: true };
}

/**
 * Screening only prioritises the queue for a human; it never advances or rejects on its own.
 * Required questions are plain yes/no (e.g. availability); null means unanswered.
 */
export function prioritiseScreening(answers: Record<string, boolean | null>, requiredQuestions: readonly string[]): { recommendation: 'human_review'; priority: 'high' | 'normal'; unanswered: string[] } {
  const unanswered = requiredQuestions.filter((q) => answers[q] === null || answers[q] === undefined);
  const yes = requiredQuestions.filter((q) => answers[q] === true).length;
  return { recommendation: 'human_review', priority: unanswered.length === 0 && yes === requiredQuestions.length ? 'high' : 'normal', unanswered };
}

export type RecruitmentViewerRole = 'recruitmentManager' | 'administrator' | 'marketing' | 'intakeStaff' | 'regionalStaff';

/** Applicant personal information is restricted (docs/09 A16). Marketing and intake roles never see it. */
export function canViewApplicant(role: RecruitmentViewerRole): boolean {
  return role === 'recruitmentManager' || role === 'administrator';
}
