import { z } from 'zod';

/**
 * A14 AI visibility log (docs/08 §4). Records what was observed; computes counts only.
 * There is intentionally NO score: results are directional and vary by model, date, account and location.
 */

export const AI_ENGINES = ['chatgpt', 'perplexity', 'gemini', 'google-ai-mode', 'claude', 'other'] as const;

export const aiVisibilityRecordSchema = z
  .object({
    engine: z.enum(AI_ENGINES),
    runAt: z.iso.datetime({ offset: true }),
    locationSetting: z.string().min(1).max(80),
    accountType: z.string().min(1).max(40).optional(),
    promptId: z.number().int().min(1).max(12),
    prompt: z.string().min(3).max(300),
    mentioned: z.boolean(),
    nature: z.enum(['cited', 'listed', 'described', 'not-mentioned']),
    sources: z.array(z.url()).max(30),
    accuracy: z.enum(['accurate', 'partial', 'inaccurate', 'not-applicable']),
    geographicRelevance: z.enum(['correct-region', 'wrong-region', 'not-applicable']),
    notes: z.string().max(500).optional(),
  })
  .superRefine((r, ctx) => {
    if (!r.mentioned && r.nature !== 'not-mentioned') ctx.addIssue({ code: 'custom', path: ['nature'], message: 'not_mentioned_requires_nature_not-mentioned' });
    if (r.mentioned && r.nature === 'not-mentioned') ctx.addIssue({ code: 'custom', path: ['nature'], message: 'mentioned_requires_a_nature' });
    if (!r.mentioned && r.accuracy !== 'not-applicable') ctx.addIssue({ code: 'custom', path: ['accuracy'], message: 'accuracy_not_applicable_when_not_mentioned' });
    if (r.mentioned && r.accuracy === 'not-applicable') ctx.addIssue({ code: 'custom', path: ['accuracy'], message: 'accuracy_must_be_assessed_when_mentioned' });
  });

export type AiVisibilityRecord = z.output<typeof aiVisibilityRecordSchema>;

export const AI_VISIBILITY_LIMITATIONS = [
  'Directional only: results vary by model version, date, account, location and prompt wording.',
  'Single runs are not repeatable measurements; do not treat differences between months as trends without repeated runs.',
  'There is no visibility score. Counts are mentions out of prompts run.',
] as const;

export interface EngineSummary {
  engine: string;
  promptsRun: number;
  mentioned: number;
  accuracy: { accurate: number; partial: number; inaccurate: number };
}

export interface AiVisibilitySummary {
  expectedPrompts: number;
  byEngine: EngineSummary[];
  incomplete: boolean;
  limitations: readonly string[];
  note: string;
}

/** Uses the LATEST run per (engine, prompt). `expectedPrompts` defaults to the 12-prompt baseline. */
export function summariseRuns(records: readonly AiVisibilityRecord[], expectedPrompts = 12): AiVisibilitySummary {
  const latest = new Map<string, AiVisibilityRecord>();
  for (const r of records) {
    const key = `${r.engine}#${r.promptId}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(r.runAt) > Date.parse(prev.runAt)) latest.set(key, r);
  }
  const engines = new Map<string, EngineSummary>();
  for (const r of latest.values()) {
    const e = engines.get(r.engine) ?? { engine: r.engine, promptsRun: 0, mentioned: 0, accuracy: { accurate: 0, partial: 0, inaccurate: 0 } };
    e.promptsRun++;
    if (r.mentioned) {
      e.mentioned++;
      if (r.accuracy !== 'not-applicable') e.accuracy[r.accuracy]++;
    }
    engines.set(r.engine, e);
  }
  const byEngine = [...engines.values()].sort((a, b) => a.engine.localeCompare(b.engine));
  return {
    expectedPrompts,
    byEngine,
    incomplete: byEngine.length === 0 || byEngine.some((e) => e.promptsRun < expectedPrompts),
    limitations: AI_VISIBILITY_LIMITATIONS,
    note: `Mentions out of prompts run, per engine, using each engine's latest run per prompt. Not a score.`,
  };
}
