import { findBannedPhrases, isApprovalCurrent, type Reviewable } from '@ablepoint/schemas';
import { containsNdisNumberLike } from './identifiers';

/**
 * A11 AI-assisted content gate (guardrail G-08: AI drafts, humans publish).
 * Automation can never publish AI-assisted content, and NDIS eligibility/funding topics can never auto-publish.
 */

const SENSITIVE_TOPICS: Array<[RegExp, string]> = [
  [/\beligib(le|ility)\b/i, 'eligibility'],
  [/\bfund(ing|ed|s)?\b/i, 'funding'],
  [/\b(plan budget|plan review|access request|reasonable and necessary|price limits?|pricing arrangements?)\b/i, 'plan_rules'],
];

export function detectSensitiveTopics(text: string): string[] {
  const out = new Set<string>();
  for (const [re, label] of SENSITIVE_TOPICS) if (re.test(text)) out.add(label);
  return [...out];
}

export interface DraftForPublish extends Reviewable {
  id: string;
  title: string;
  body: string;
  aiAssisted: boolean;
  /** AI involvement is labelled in the CMS (docs/09 A11). */
  aiLabelled: boolean;
  declaredTopics: readonly string[];
  factCheckedBy?: string;
  factCheckedAt?: string;
  reviewerNdisExperienced?: boolean;
}

export type PublishTrigger = 'automation' | 'human';

export interface PublishVerdict {
  allowed: boolean;
  blockers: string[];
  sensitiveTopics: string[];
}

const NON_HUMAN_ACTOR = /^(ai|llm|bot|system|automation|n8n|claude|chatgpt|gpt)\b/i;

export function evaluatePublishGate(d: DraftForPublish, trigger: PublishTrigger): PublishVerdict {
  const blockers: string[] = [];
  const sensitive = [...new Set([...d.declaredTopics.filter((t) => ['eligibility', 'funding', 'plan_rules'].includes(t)), ...detectSensitiveTopics(`${d.title}\n${d.body}`)])];

  if (trigger === 'automation' && d.aiAssisted) blockers.push('automation_cannot_publish_ai_content');
  if (trigger === 'automation' && sensitive.length) blockers.push('sensitive_topic_cannot_auto_publish');
  if (trigger === 'human' && sensitive.length && !d.reviewerNdisExperienced) blockers.push('ndis_expert_review_required');
  if (d.aiAssisted && !d.aiLabelled) blockers.push('ai_output_not_labelled');

  if (d.aiAssisted || sensitive.length) {
    const human = d.factCheckedBy && !NON_HUMAN_ACTOR.test(d.factCheckedBy.trim());
    if (!human) blockers.push('missing_human_fact_check');
    else if (!d.factCheckedAt || Number.isNaN(Date.parse(d.factCheckedAt)) || Date.parse(d.factCheckedAt) < Date.parse(d.updatedAt)) blockers.push('fact_check_predates_last_edit');
  }

  if (!isApprovalCurrent(d)) blockers.push('compliance_approval_not_current');
  for (const hit of findBannedPhrases(`${d.title}\n${d.body}`)) blockers.push(`banned_phrase:${hit.reason}`);

  return { allowed: blockers.length === 0, blockers, sensitiveTopics: sensitive };
}

/** Prompts sent to an LLM must carry no participant data (docs/09 A11). Returns problem labels only. */
export function checkPromptSafety(prompt: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(prompt)) problems.push('contains_email');
  if (/(?:\+?61|0)[\s-]?[2-478](?:[\s-]?\d){8}/.test(prompt)) problems.push('contains_phone');
  if (containsNdisNumberLike(prompt)) problems.push('contains_ndis_number_like');
  return { ok: problems.length === 0, problems };
}
