import { describe, expect, it } from 'vitest';
import { evaluateRankChange, evaluateUptime, evaluateVitals, shouldNotify } from '../monitoring';

const t = (min: number) => new Date(Date.UTC(2026, 10, 3, 0, min));

describe('evaluateRankChange (A10)', () => {
  const r = (previous: number | null, current: number | null) => evaluateRankChange({ keyword: 'sil central coast', region: 'central-coast', previous, current });
  it('does not alert on a drop of exactly 3 places', () => expect(r(4, 7)).toEqual({ alert: false, kind: 'none', drop: 3 }));
  it('alerts on a drop of 4 places', () => expect(r(4, 8)).toEqual({ alert: true, kind: 'dropped', drop: 4 }));
  it('does not alert on an improvement', () => expect(r(8, 2)).toEqual({ alert: false, kind: 'none', drop: -6 }));
  it('alerts when a ranking disappears', () => expect(r(3, null)).toEqual({ alert: true, kind: 'lost_ranking', drop: null }));
  it('does not alert when there was no previous ranking', () => expect(r(null, 12)).toEqual({ alert: false, kind: 'none', drop: null }));
  it.each([[0, 3], [3, 0], [1.5, 3]])('rejects invalid positions %s/%s', (a, b) => expect(() => r(a, b)).toThrow(RangeError));
});

describe('evaluateVitals (A13)', () => {
  it('is healthy exactly at the thresholds', () => expect(evaluateVitals({ lcpMs: 2500, inpMs: 200, cls: 0.1, statusCodes: [200, 301] })).toEqual({ healthy: true, breaches: [] }));
  it('breaches LCP above 2.5 s', () => expect(evaluateVitals({ lcpMs: 2501 }).breaches).toEqual([{ metric: 'lcp', value: 2501, threshold: 2500, severity: 'warning' }]));
  it('breaches INP above 200 ms', () => expect(evaluateVitals({ inpMs: 201 }).breaches[0]).toMatchObject({ metric: 'inp' }));
  it('breaches CLS above 0.1', () => expect(evaluateVitals({ cls: 0.11 }).breaches[0]).toMatchObject({ metric: 'cls' }));
  it('treats any 5xx as critical', () => expect(evaluateVitals({ statusCodes: [200, 503] }).breaches).toEqual([{ metric: 'http_5xx', value: 1, threshold: 0, severity: 'critical' }]));
  it('does not treat a 404 as a 5xx', () => expect(evaluateVitals({ statusCodes: [404] }).healthy).toBe(true));
  it('reports every breach together', () => expect(evaluateVitals({ lcpMs: 4000, inpMs: 500, cls: 0.3, statusCodes: [500, 502] }).breaches).toHaveLength(4));
  it('ignores metrics that were not measured', () => expect(evaluateVitals({})).toEqual({ healthy: true, breaches: [] }));
});

describe('evaluateUptime', () => {
  it('does not alert on a single failure (avoids flapping)', () => expect(evaluateUptime([{ at: t(0), status: 200 }, { at: t(5), status: 503 }])).toEqual({ alert: false, consecutiveFailures: 1 }));
  it('alerts after two consecutive failures', () => expect(evaluateUptime([{ at: t(0), status: 200 }, { at: t(5), status: 503 }, { at: t(10), status: null }])).toEqual({ alert: true, consecutiveFailures: 2 }));
  it('resets after a recovery', () => expect(evaluateUptime([{ at: t(0), status: 500 }, { at: t(5), status: 500 }, { at: t(10), status: 200 }]).consecutiveFailures).toBe(0));
  it('treats a 404 on the monitored page as a failure', () => expect(evaluateUptime([{ at: t(0), status: 404 }, { at: t(5), status: 404 }]).alert).toBe(true));
  it('sorts unordered checks by time', () => expect(evaluateUptime([{ at: t(10), status: 500 }, { at: t(0), status: 200 }, { at: t(5), status: 500 }]).consecutiveFailures).toBe(2));
  it('supports a custom threshold and an empty history', () => {
    expect(evaluateUptime([{ at: t(0), status: 500 }], 1).alert).toBe(true);
    expect(evaluateUptime([])).toEqual({ alert: false, consecutiveFailures: 0 });
  });
});

describe('shouldNotify', () => {
  it('notifies the first time', () => expect(shouldNotify({ now: t(0) })).toBe(true));
  it('suppresses inside the cooldown and re-notifies at exactly the cooldown', () => {
    expect(shouldNotify({ lastNotifiedAt: t(0), now: t(59) })).toBe(false);
    expect(shouldNotify({ lastNotifiedAt: t(0), now: t(60) })).toBe(true);
  });
});
