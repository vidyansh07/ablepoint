/**
 * Ports: everything the core needs from the outside world. The core never imports a vendor SDK.
 * Production adapters (Postgres, KMS, Turnstile, object storage, malware scanner, IdP) are NOT built yet.
 */

export interface RateRule {
  limit: number;
  windowMs: number;
}

export interface RateDecision {
  allowed: boolean;
  retryAfterSec?: number;
}

export interface RateLimiter {
  check(key: string, rule: RateRule): Promise<RateDecision>;
}

export interface ReplayCache {
  /** Atomically record a value; true if this is the first use inside the TTL, false if already used. */
  markUsed(valueHash: string, ttlMs: number): Promise<boolean>;
}

export interface TurnstileVerifier {
  verify(token: string, ip: string): Promise<{ success: boolean }>;
}

export interface IdempotencyRecord {
  caseRef: string;
  fingerprint: string;
}

export interface IdempotencyStore {
  get(keyHash: string): Promise<IdempotencyRecord | undefined>;
  /** Atomic: reserved=true if the key was free, otherwise the existing record is returned. */
  reserve(keyHash: string, record: IdempotencyRecord): Promise<{ reserved: true } | { reserved: false; existing: IdempotencyRecord }>;
  release(keyHash: string): Promise<void>;
}

export type AuditMetaValue = string | number | boolean;

/** Append-only audit event. `meta` must never carry personal information (enforced by sinks). */
export interface AuditEvent {
  id: string;
  at: string;
  type: string;
  actor: { kind: 'public' | 'staff' | 'system'; id?: string; role?: string };
  entity?: { type: string; id?: string };
  outcome: 'success' | 'denied' | 'error';
  breakGlass?: boolean;
  meta?: Record<string, AuditMetaValue>;
}

/** Append-only by construction: there is deliberately no update or delete method. */
export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}

export interface Clock {
  (): number;
}

/** Values that may appear in audit metadata or logs: short, no whitespace, no free text. */
export const SAFE_VALUE_PATTERN = /^[A-Za-z0-9_.:-]{0,64}$/;
