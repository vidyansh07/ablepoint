import { describe, expect, it } from 'vitest';
import { BACKOFF_MINUTES, classifyHttpFailure, decideRetry, idempotencyKey, MAX_RETRIES } from '../retry';

const failedAt = new Date('2026-11-03T00:00:00Z');

describe('decideRetry', () => {
  it('follows the 1, 5, 30 minute schedule', () => {
    expect(BACKOFF_MINUTES).toEqual([1, 5, 30]);
    const delays = [0, 1, 2].map((n) => decideRetry({ retriesSoFar: n, failedAt, failure: 'transient' }));
    expect(delays.map((d) => d.action === 'retry' && d.delayMinutes)).toEqual([1, 5, 30]);
  });
  it('computes the retry time and attempt number', () => {
    const d = decideRetry({ retriesSoFar: 1, failedAt, failure: 'transient' });
    expect(d).toEqual({ action: 'retry', attempt: 2, delayMinutes: 5, retryAt: new Date('2026-11-03T00:05:00Z') });
  });
  it('dead-letters after the third retry', () => {
    expect(MAX_RETRIES).toBe(3);
    expect(decideRetry({ retriesSoFar: 3, failedAt, failure: 'transient' })).toEqual({ action: 'dead-letter', reason: 'retries_exhausted' });
  });
  it('dead-letters permanent failures immediately', () => {
    expect(decideRetry({ retriesSoFar: 0, failedAt, failure: 'permanent' })).toEqual({ action: 'dead-letter', reason: 'permanent_failure' });
  });
  it.each([-1, 1.5, Number.NaN])('rejects invalid retry count %s', (n) => {
    expect(() => decideRetry({ retriesSoFar: n, failedAt, failure: 'transient' })).toThrow(RangeError);
  });
});

describe('classifyHttpFailure', () => {
  it.each([
    [undefined, 'transient'],
    [408, 'transient'],
    [425, 'transient'],
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
    [599, 'transient'],
    [400, 'permanent'],
    [401, 'permanent'],
    [403, 'permanent'],
    [404, 'permanent'],
    [422, 'permanent'],
  ])('status %s -> %s', (status, cls) => expect(classifyHttpFailure(status as number | undefined)).toBe(cls));
});

describe('idempotencyKey', () => {
  it('is deterministic', () => expect(idempotencyKey('meta', 'lead_1')).toBe(idempotencyKey('meta', 'lead_1')));
  it('is order sensitive', () => expect(idempotencyKey('a', 'b')).not.toBe(idempotencyKey('b', 'a')));
  it('does not collide on concatenation ambiguity', () => expect(idempotencyKey('a', 'bc')).not.toBe(idempotencyKey('ab', 'c')));
  it('looks like a sha256 hex digest', () => expect(idempotencyKey('x')).toMatch(/^[0-9a-f]{64}$/));
  it('requires non-empty parts', () => {
    expect(() => idempotencyKey()).toThrow(RangeError);
    expect(() => idempotencyKey('a', '')).toThrow(RangeError);
  });
});
