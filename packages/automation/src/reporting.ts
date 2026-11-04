import { DAY_MS, PolicyError } from './common';

/** A9: weekly aggregate report with small-number suppression and a PII guard. */
export const SMALL_NUMBER_THRESHOLD = 5;
export const FIRST_RESPONSE_TARGET_MINUTES = 15;
/** Below this many qualified enquiries, cost-per-enquiry is flagged low confidence (docs/10 §1). */
export const LOW_CONFIDENCE_BELOW = 15;

export interface ReportRow {
  source: string;
  region: string;
  qualified: boolean;
  agreementSigned?: boolean;
  firstResponseMinutes?: number;
  spendCents?: number;
}

export class PiiLeakError extends PolicyError {
  constructor(public readonly offendingKeys: string[]) {
    super(`Report input contains PII-like fields: ${offendingKeys.join(', ')}`);
    this.name = 'PiiLeakError';
  }
}

const FORBIDDEN_KEY = /(name|phone|mobile|email|ndis|address|dob|birth|case_?ref|contact_?id|participant)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LONG_DIGITS = /\d[\d\s-]{7,}\d/;

/** Throws PiiLeakError (naming offending KEYS only, never values) if any row looks like it carries personal data. */
export function assertNoPii(rows: readonly object[]): void {
  const bad = new Set<string>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (FORBIDDEN_KEY.test(k)) bad.add(k);
      else if (typeof v === 'string' && (EMAIL.test(v) || LONG_DIGITS.test(v))) bad.add(`${k} (value looks like personal data)`);
    }
  }
  if (bad.size) throw new PiiLeakError([...bad]);
}

export interface BreakdownRow {
  key: string;
  count: number | null;
  suppressed: boolean;
}

/**
 * Cells under `min` are merged into "Other". If the merged cell is still under `min`, the smallest
 * visible cell is folded in too (complementary suppression) so a hidden value cannot be recovered
 * by subtracting from the total. If nothing is large enough, "Other" is suppressed.
 */
export function suppressBreakdown(counts: Record<string, number>, min = SMALL_NUMBER_THRESHOLD): BreakdownRow[] {
  const entries = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rows: BreakdownRow[] = entries.filter(([, n]) => n >= min).map(([key, count]) => ({ key, count, suppressed: false }));
  const small = entries.filter(([, n]) => n < min);
  if (small.length === 0) return rows;
  let other = small.reduce((s, [, n]) => s + n, 0);
  if (other < min) {
    const folded = rows.pop();
    if (!folded) return [{ key: 'Other', count: null, suppressed: true }];
    other += folded.count ?? 0;
  }
  rows.push({ key: 'Other', count: other, suppressed: false });
  return rows;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export interface WeeklyReport {
  window: { from: Date; to: Date };
  totals: { enquiries: number; qualified: number; agreements: number; spendCents: number };
  qualifiedBySource: BreakdownRow[];
  qualifiedByRegion: BreakdownRow[];
  firstResponse: { n: number; medianMinutes: number | null; withinTargetCount: number | null; suppressed: boolean };
  costPerQualifiedCents: number | null;
  confidence: 'low' | 'ok';
  notes: string[];
}

export function buildWeeklyReport(rows: readonly ReportRow[], runAt: Date): WeeklyReport {
  assertNoPii(rows);
  const qualified = rows.filter((r) => r.qualified);
  const tally = (key: 'source' | 'region') => {
    const out: Record<string, number> = {};
    for (const r of qualified) out[r[key]] = (out[r[key]] ?? 0) + 1;
    return out;
  };
  const times = qualified.map((r) => r.firstResponseMinutes).filter((m): m is number => typeof m === 'number' && m >= 0);
  const spend = rows.reduce((s, r) => s + (r.spendCents ?? 0), 0);
  const small = times.length < SMALL_NUMBER_THRESHOLD;
  const notes: string[] = [];
  if (qualified.length < LOW_CONFIDENCE_BELOW) notes.push(`Fewer than ${LOW_CONFIDENCE_BELOW} qualified enquiries: cost per qualified enquiry is low confidence.`);
  if (small && times.length > 0) notes.push(`Response-time figures suppressed: fewer than ${SMALL_NUMBER_THRESHOLD} responses.`);

  return {
    window: { from: new Date(runAt.getTime() - 7 * DAY_MS), to: runAt },
    totals: { enquiries: rows.length, qualified: qualified.length, agreements: rows.filter((r) => r.agreementSigned).length, spendCents: spend },
    qualifiedBySource: suppressBreakdown(tally('source')),
    qualifiedByRegion: suppressBreakdown(tally('region')),
    firstResponse: {
      n: times.length,
      medianMinutes: small ? null : median(times),
      withinTargetCount: small ? null : times.filter((m) => m < FIRST_RESPONSE_TARGET_MINUTES).length,
      suppressed: small && times.length > 0,
    },
    costPerQualifiedCents: qualified.length > 0 && spend > 0 ? Math.round(spend / qualified.length) : null,
    confidence: qualified.length < LOW_CONFIDENCE_BELOW ? 'low' : 'ok',
    notes,
  };
}
