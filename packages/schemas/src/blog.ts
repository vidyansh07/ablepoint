import { z } from 'zod';
import { findBannedPhrases } from './banned';

/**
 * Blog / guide draft contract and quality gates (docs/21-agent-api-and-content-pipeline.md).
 * Agents (n8n, scripts, LLM tools) may only CREATE DRAFTS in this shape. Publication needs a named human reviewer and
 * compliance approval (guardrail G-08, content approval gate AR-7). The gates below exist so that automation cannot
 * produce thin, duplicated, keyword-stuffed or unsourced pages (Google's "scaled content abuse" policy, and NDIS advertising rules).
 */

export const POST_CATEGORIES = ['for-coordinators', 'housing', 'funding-explained', 'working-with-us', 'regional', 'news'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, numbers and hyphens only').max(80);

export const blogDraftSchema = z.object({
  slug,
  kind: z.enum(['post', 'guide']).default('post'),
  title: z.string().trim().min(20, 'title too short').max(70, 'title over 70 characters'),
  summary: z.string().trim().min(80, 'summary under 80 characters').max(170, 'summary over 170 characters'),
  /** Answer-first paragraph shown at the top and used as the AEO snippet (about 40 to 90 words). */
  answer: z.string().trim().min(180, 'answer under ~30 words').max(560, 'answer over ~90 words'),
  category: z.enum(POST_CATEGORIES),
  tags: z.array(slug).max(6).default([]),
  regions: z.array(z.enum(['central-coast', 'newcastle', 'dubbo', 'orange', 'tamworth', 'gunnedah'])).max(6).default([]),
  services: z.array(z.enum(['core-support', 'supported-independent-living', 'sda', 'short-term-accommodation', 'support-coordinator', 'community-access'])).max(6).default([]),
  sections: z
    .array(z.object({ heading: z.string().trim().min(8).max(90), body: z.array(z.string().trim().min(40).max(1400)).min(1).max(8) }))
    .min(3, 'at least 3 sections')
    .max(12),
  faqs: z.array(z.object({ q: z.string().trim().min(10).max(160), a: z.string().trim().min(40).max(700) })).max(8).default([]),
  sources: z.array(z.object({ label: z.string().trim().min(5).max(140), url: z.string().url().startsWith('https://') })).min(2, 'at least 2 sources').max(12),
  /** Human author. A person or role, never "AI". */
  author: z.string().trim().min(3).max(80),
  aiAssisted: z.boolean(),
  aiNotes: z.string().trim().max(500).optional(),
  publishedAt: z.iso.date().optional(),
});
export type BlogDraft = z.infer<typeof blogDraftSchema>;

// ---------- quality gates ----------

export const AUTHORITATIVE_DOMAINS = [
  'ndis.gov.au', 'ndiscommission.gov.au', 'dss.gov.au', 'health.gov.au', 'aihw.gov.au', 'legislation.gov.au', 'accc.gov.au',
  'oaic.gov.au', 'servicesaustralia.gov.au', 'abs.gov.au', 'nsw.gov.au', 'ombo.nsw.gov.au', 'nds.org.au', 'pwd.org.au', 'stylemanual.gov.au',
] as const;

const STOP = new Set('a an and are as at be but by for from has have he her his how i if in into is it its more not of on or our she so than that the their them then there these they this to was we were what when which who will with you your can may also about all any been being do does each other some such these those up out new one two'.split(' '));

export interface DraftMetrics {
  words: number;
  sentences: number;
  fleschKincaidGrade: number;
  topTerm: { term: string; densityPct: number };
  authoritativeSources: number;
}
export interface DraftAssessment {
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: DraftMetrics;
  nearestExisting?: { slug: string; similarity: number };
}
export interface ExistingContent {
  slug: string;
  text: string;
}

export function draftText(d: BlogDraft): string {
  return [d.title, d.summary, d.answer, ...d.sections.flatMap((s) => [s.heading, ...s.body]), ...d.faqs.flatMap((f) => [f.q, f.a])].join('\n');
}

const tokens = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m?.length ?? 1);
}

/** Flesch-Kincaid grade level (approximate; English heuristic). */
export function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = tokens(text);
  if (words.length === 0) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

function shingles(text: string, n = 5): Set<string> {
  const w = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
export function similarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

const CLAIM_PATTERNS: Array<[RegExp, string]> = [
  [/\bwe (guarantee|promise)\b/i, 'outcome guarantee'],
  [/\b(100%|always|never) (approved|successful|funded)\b/i, 'absolute funding/eligibility claim'],
  [/\byou (will|are) (definitely|certainly) (get|receive|be eligible)\b/i, 'eligibility certainty'],
  [/\b(cure|miracle|breakthrough)\b/i, 'medical-style claim'],
];

export function assessDraft(d: BlogDraft, existing: ExistingContent[] = [], opts: { minWords?: number } = {}): DraftAssessment {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = draftText(d);
  const w = tokens(text);
  const words = w.length;
  const minWords = opts.minWords ?? (d.kind === 'guide' ? 450 : 600);
  if (words < minWords) errors.push(`too thin: ${words} words (minimum ${minWords}). Thin pages are not published.`);
  if (words > 3500) warnings.push(`very long (${words} words): consider splitting`);

  const grade = fleschKincaidGrade(text);
  if (grade > 13) errors.push(`reading level too high (grade ${grade.toFixed(1)}; aim for 8 to 10, hard limit 13)`);
  else if (grade > 10.5) warnings.push(`reading level grade ${grade.toFixed(1)}: simplify (target 8 to 10)`);

  const counts = new Map<string, number>();
  for (const t of w) if (t.length > 3 && !STOP.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const densityPct = words ? (top[1] / words) * 100 : 0;
  if (densityPct > 4.5) errors.push(`keyword stuffing: "${top[0]}" is ${densityPct.toFixed(1)}% of words (limit 4.5%)`);
  else if (densityPct > 3) warnings.push(`"${top[0]}" is ${densityPct.toFixed(1)}% of words: vary the language`);

  for (const hit of findBannedPhrases(text)) errors.push(`banned phrase "${hit.match}": ${hit.reason}`);
  for (const [re, why] of CLAIM_PATTERNS) if (re.test(text)) errors.push(`claim not allowed: ${why}`);

  const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
  const authoritative = d.sources.filter((s) => AUTHORITATIVE_DOMAINS.some((a) => host(s.url) === a || host(s.url).endsWith('.' + a))).length;
  if (authoritative < 2) errors.push(`needs at least 2 sources from authoritative domains (found ${authoritative}); allowed: ${AUTHORITATIVE_DOMAINS.join(', ')}`);

  if (/\bai\b|artificial intelligence|chatgpt|claude|gpt/i.test(d.author)) errors.push('author must be a human or a named role, never an AI');
  if (d.aiAssisted && !d.aiNotes) warnings.push('aiAssisted is true: record what the AI did in aiNotes');
  if (new Set(d.sections.map((s) => s.heading.toLowerCase())).size !== d.sections.length) errors.push('duplicate section headings');
  if (d.answer.length > 0 && !/[.!?]$/.test(d.answer.trim())) warnings.push('answer should end as a complete sentence');
  if (d.summary.toLowerCase() === d.answer.slice(0, d.summary.length).toLowerCase()) warnings.push('summary repeats the start of the answer');

  let nearest: { slug: string; similarity: number } | undefined;
  for (const e of existing) {
    if (e.slug === d.slug) continue;
    const s = similarity(text, e.text);
    if (!nearest || s > nearest.similarity) nearest = { slug: e.slug, similarity: s };
  }
  if (nearest && nearest.similarity > 0.3) errors.push(`too similar to existing "${nearest.slug}" (${(nearest.similarity * 100).toFixed(0)}% shared phrasing; limit 30%)`);
  else if (nearest && nearest.similarity > 0.15) warnings.push(`overlaps with "${nearest.slug}" (${(nearest.similarity * 100).toFixed(0)}%): make sure it adds something new`);

  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    nearestExisting: nearest,
    metrics: { words, sentences, fleschKincaidGrade: Number(grade.toFixed(1)), topTerm: { term: top[0], densityPct: Number(densityPct.toFixed(1)) }, authoritativeSources: authoritative },
  };
}
