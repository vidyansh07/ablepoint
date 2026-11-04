/** A10 rank/GBP position alerts and A13 uptime + Core Web Vitals evaluation. */

/** Alert when a position worsens by MORE than this many places (a drop of exactly 3 does not alert). */
export const RANK_DROP_THRESHOLD = 3;

export interface RankChangeInput {
  keyword: string;
  region: string;
  /** 1 = top. null = not ranking. */
  previous: number | null;
  current: number | null;
}

export type RankAlert = { alert: false; kind: 'none'; drop: number | null } | { alert: true; kind: 'dropped' | 'lost_ranking'; drop: number | null };

export function evaluateRankChange(i: RankChangeInput): RankAlert {
  for (const p of [i.previous, i.current]) if (p !== null && (!Number.isInteger(p) || p < 1)) throw new RangeError('position must be a positive integer or null');
  if (i.previous === null) return { alert: false, kind: 'none', drop: null };
  if (i.current === null) return { alert: true, kind: 'lost_ranking', drop: null };
  const drop = i.current - i.previous;
  return drop > RANK_DROP_THRESHOLD ? { alert: true, kind: 'dropped', drop } : { alert: false, kind: 'none', drop };
}

/** Engineering targets from the brief: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (equal to the limit is passing). */
export const VITALS_THRESHOLDS = { lcpMs: 2500, inpMs: 200, cls: 0.1 } as const;

export interface VitalsBreach {
  metric: 'lcp' | 'inp' | 'cls' | 'http_5xx';
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
}

export function evaluateVitals(i: { lcpMs?: number; inpMs?: number; cls?: number; statusCodes?: readonly number[] }): { healthy: boolean; breaches: VitalsBreach[] } {
  const breaches: VitalsBreach[] = [];
  if (i.lcpMs !== undefined && i.lcpMs > VITALS_THRESHOLDS.lcpMs) breaches.push({ metric: 'lcp', value: i.lcpMs, threshold: VITALS_THRESHOLDS.lcpMs, severity: 'warning' });
  if (i.inpMs !== undefined && i.inpMs > VITALS_THRESHOLDS.inpMs) breaches.push({ metric: 'inp', value: i.inpMs, threshold: VITALS_THRESHOLDS.inpMs, severity: 'warning' });
  if (i.cls !== undefined && i.cls > VITALS_THRESHOLDS.cls) breaches.push({ metric: 'cls', value: i.cls, threshold: VITALS_THRESHOLDS.cls, severity: 'warning' });
  const five = (i.statusCodes ?? []).filter((c) => c >= 500 && c <= 599);
  if (five.length) breaches.push({ metric: 'http_5xx', value: five.length, threshold: 0, severity: 'critical' });
  return { healthy: breaches.length === 0, breaches };
}

export interface UptimeCheck {
  at: Date;
  /** HTTP status, or null for a timeout/network failure. */
  status: number | null;
}

/** A check fails on timeout or any status ≥ 400 (a 404 on the monitored page is an outage). Alert after N consecutive failures to avoid flapping. */
export function evaluateUptime(checks: readonly UptimeCheck[], minConsecutive = 2): { alert: boolean; consecutiveFailures: number } {
  const sorted = [...checks].sort((a, b) => a.at.getTime() - b.at.getTime());
  let run = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const s = (sorted[i] as UptimeCheck).status;
    if (s === null || s >= 400) run++;
    else break;
  }
  return { alert: run >= minConsecutive, consecutiveFailures: run };
}

/** Suppress repeat notifications for the same alert during a cooldown (boundary inclusive: at exactly the cooldown, notify again). */
export function shouldNotify(input: { lastNotifiedAt?: Date; now: Date; cooldownMinutes?: number }): boolean {
  if (!input.lastNotifiedAt) return true;
  return input.now.getTime() - input.lastNotifiedAt.getTime() >= (input.cooldownMinutes ?? 60) * 60_000;
}
