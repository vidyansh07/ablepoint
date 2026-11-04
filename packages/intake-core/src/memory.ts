import { assertSafeAuditMeta } from './memory-guards';
import type { AuditEvent, AuditSink, Clock, IdempotencyRecord, IdempotencyStore, RateDecision, RateLimiter, RateRule, ReplayCache } from './ports';

/**
 * In-memory implementations of the ports.
 * They are correct for a SINGLE process only. Behind a load balancer or serverless fan-out each
 * instance would have its own counters and caches, so rate limits and replay protection would be
 * per-instance. Production needs shared stores (e.g. a database table or a managed cache). Not built.
 */

/** Fixed-window limiter: simple and predictable, but allows up to 2× the limit across a window boundary. */
export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number; windowMs: number }>();
  constructor(private readonly clock: Clock = Date.now) {}

  async check(key: string, rule: RateRule): Promise<RateDecision> {
    const now = this.clock();
    if (this.windows.size > 10_000) this.prune(now);
    let w = this.windows.get(key);
    if (!w || now - w.start >= rule.windowMs) {
      w = { start: now, count: 0, windowMs: rule.windowMs };
      this.windows.set(key, w);
    }
    w.count += 1;
    if (w.count <= rule.limit) return { allowed: true };
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.start + rule.windowMs - now) / 1000)) };
  }

  private prune(now: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= w.windowMs) this.windows.delete(k);
  }
}

export class InMemoryReplayCache implements ReplayCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly clock: Clock = Date.now) {}

  async markUsed(valueHash: string, ttlMs: number): Promise<boolean> {
    const now = this.clock();
    const expires = this.seen.get(valueHash);
    if (expires !== undefined && expires > now) return false;
    this.seen.set(valueHash, now + ttlMs);
    if (this.seen.size > 10_000) for (const [k, e] of this.seen) if (e <= now) this.seen.delete(k);
    return true;
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(keyHash: string): Promise<IdempotencyRecord | undefined> {
    const r = this.records.get(keyHash);
    return r ? { ...r } : undefined;
  }

  async reserve(keyHash: string, record: IdempotencyRecord) {
    const existing = this.records.get(keyHash);
    if (existing) return { reserved: false as const, existing: { ...existing } };
    this.records.set(keyHash, { ...record });
    return { reserved: true as const };
  }

  async release(keyHash: string): Promise<void> {
    this.records.delete(keyHash);
  }
}

/** Append-only sink double. Events are frozen copies; there is no way to modify or remove one. */
export class InMemoryAuditSink implements AuditSink {
  private readonly log: AuditEvent[] = [];
  async append(event: AuditEvent): Promise<void> {
    assertSafeAuditMeta(event);
    this.log.push(Object.freeze(structuredClone(event)));
  }
  get events(): readonly AuditEvent[] {
    return this.log.map((e) => structuredClone(e));
  }
}
