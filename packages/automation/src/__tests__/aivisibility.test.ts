import { describe, expect, it } from 'vitest';
import { AI_VISIBILITY_LIMITATIONS, aiVisibilityRecordSchema, summariseRuns, type AiVisibilityRecord } from '../aivisibility';

const rec = (over: Record<string, unknown> = {}) => ({
  engine: 'perplexity',
  runAt: '2026-11-03T01:00:00Z',
  locationSetting: 'Gosford NSW',
  promptId: 1,
  prompt: 'NDIS provider Central Coast NSW',
  mentioned: true,
  nature: 'listed',
  sources: ['https://example.test/a'],
  accuracy: 'accurate',
  geographicRelevance: 'correct-region',
  ...over,
});
const parsed = (over: Record<string, unknown> = {}) => aiVisibilityRecordSchema.parse(rec(over)) as AiVisibilityRecord;
const notMentioned = { mentioned: false, nature: 'not-mentioned', accuracy: 'not-applicable', geographicRelevance: 'not-applicable', sources: [] };

describe('aiVisibilityRecordSchema (A14)', () => {
  it('accepts a mentioned record and a not-mentioned record', () => {
    expect(aiVisibilityRecordSchema.safeParse(rec()).success).toBe(true);
    expect(aiVisibilityRecordSchema.safeParse(rec(notMentioned)).success).toBe(true);
  });
  it.each([
    ['not mentioned but nature says listed', { mentioned: false }],
    ['mentioned but nature says not-mentioned', { nature: 'not-mentioned' }],
    ['not mentioned but accuracy was assessed', { ...notMentioned, accuracy: 'accurate' }],
    ['mentioned but accuracy not assessed', { accuracy: 'not-applicable' }],
    ['prompt id 0', { promptId: 0 }],
    ['prompt id 13', { promptId: 13 }],
    ['unknown engine', { engine: 'bing' }],
    ['non-ISO date', { runAt: 'yesterday' }],
    ['invalid source URL', { sources: ['not a url'] }],
    ['missing location setting', { locationSetting: '' }],
  ])('rejects %s', (_l, over) => expect(aiVisibilityRecordSchema.safeParse(rec(over)).success).toBe(false));
});

describe('summariseRuns', () => {
  const full = (engine: string, mentionedIds: number[]) =>
    Array.from({ length: 12 }, (_, i) => parsed({ engine, promptId: i + 1, ...(mentionedIds.includes(i + 1) ? {} : notMentioned) }));

  it('counts mentions out of prompts run per engine', () => {
    const s = summariseRuns([...full('perplexity', [1, 2, 3]), ...full('gemini', [])]);
    expect(s.byEngine).toEqual([
      { engine: 'gemini', promptsRun: 12, mentioned: 0, accuracy: { accurate: 0, partial: 0, inaccurate: 0 } },
      { engine: 'perplexity', promptsRun: 12, mentioned: 3, accuracy: { accurate: 3, partial: 0, inaccurate: 0 } },
    ]);
    expect(s.incomplete).toBe(false);
  });
  it('uses only the latest run per engine and prompt', () => {
    const older = parsed({ runAt: '2026-10-01T00:00:00Z' });
    const newer = parsed({ runAt: '2026-11-01T00:00:00Z', ...notMentioned });
    expect(summariseRuns([newer, older]).byEngine[0]).toMatchObject({ promptsRun: 1, mentioned: 0 });
    expect(summariseRuns([older, newer]).byEngine[0]).toMatchObject({ promptsRun: 1, mentioned: 0 });
  });
  it('tallies accuracy only for mentions', () => {
    const s = summariseRuns([parsed({ promptId: 1, accuracy: 'partial' }), parsed({ promptId: 2, accuracy: 'inaccurate' }), parsed({ promptId: 3, ...notMentioned })]);
    expect(s.byEngine[0]?.accuracy).toEqual({ accurate: 0, partial: 1, inaccurate: 1 });
  });
  it('is incomplete when fewer than the expected 12 prompts were run, or nothing was run', () => {
    expect(summariseRuns([parsed()]).incomplete).toBe(true);
    expect(summariseRuns([]).incomplete).toBe(true);
  });
  it('always carries the limitations and a note', () => {
    const s = summariseRuns([parsed()]);
    expect(s.limitations).toBe(AI_VISIBILITY_LIMITATIONS);
    expect(s.limitations.join(' ')).toMatch(/Directional/);
    expect(s.note).toMatch(/Not a score/);
  });
  it('never invents a score', () => {
    const json = JSON.stringify(summariseRuns([...full('perplexity', [1, 2, 3, 4])]));
    expect(json).not.toMatch(/"(score|rating|rank|index)"/i);
  });
});
