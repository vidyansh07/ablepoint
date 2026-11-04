import { createHash } from 'node:crypto';

/** docs/09 §2: exponential backoff 1 m, 5 m, 30 m; max 3 retries then dead-letter. */
export const BACKOFF_MINUTES = [1, 5, 30] as const;
export const MAX_RETRIES = BACKOFF_MINUTES.length;

export type FailureClass = 'transient' | 'permanent';

/** HTTP status (or undefined for a network error/timeout) → retry class. */
export function classifyHttpFailure(status: number | undefined): FailureClass {
  if (status === undefined) return 'transient';
  if (status === 408 || status === 425 || status === 429) return 'transient';
  if (status >= 500 && status <= 599) return 'transient';
  return 'permanent';
}

export type RetryDecision =
  | { action: 'retry'; attempt: number; delayMinutes: number; retryAt: Date }
  | { action: 'dead-letter'; reason: 'permanent_failure' | 'retries_exhausted' };

/** `retriesSoFar` is how many retries have already been attempted (0 on first failure). */
export function decideRetry(input: { retriesSoFar: number; failedAt: Date; failure: FailureClass }): RetryDecision {
  const { retriesSoFar, failedAt, failure } = input;
  if (!Number.isInteger(retriesSoFar) || retriesSoFar < 0) throw new RangeError('retriesSoFar must be a non-negative integer');
  if (failure === 'permanent') return { action: 'dead-letter', reason: 'permanent_failure' };
  const delay = BACKOFF_MINUTES[retriesSoFar];
  if (delay === undefined) return { action: 'dead-letter', reason: 'retries_exhausted' };
  return { action: 'retry', attempt: retriesSoFar + 1, delayMinutes: delay, retryAt: new Date(failedAt.getTime() + delay * 60_000) };
}

/** Deterministic, unambiguous key from parts (JSON-encoded, so ["a","bc"] ≠ ["ab","c"]). */
export function idempotencyKey(...parts: string[]): string {
  if (parts.length === 0 || parts.some((p) => p.length === 0)) throw new RangeError('idempotencyKey needs non-empty parts');
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
