import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Webhooks older or newer than this (seconds) are rejected. Boundary is inclusive: exactly 300 s is accepted. */
export const MAX_SKEW_SECONDS = 300;

export function signWebhook(secret: string, timestampSeconds: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
}

export type WebhookRejection =
  | 'missing_secret'
  | 'missing_signature'
  | 'invalid_timestamp'
  | 'timestamp_too_old'
  | 'timestamp_in_future'
  | 'bad_signature'
  | 'replayed';

export type WebhookVerdict = { ok: true; replayKey: string } | { ok: false; reason: WebhookRejection };

export interface WebhookInput {
  secret: string;
  body: string;
  /** Hex HMAC-SHA256, optionally prefixed "sha256=". */
  signature: string | undefined;
  /** Unix seconds, as sent by the caller. */
  timestamp: string | number | undefined;
  now: Date;
  maxSkewSeconds?: number;
}

/** HMAC over `${timestamp}.${body}`, constant-time comparison, symmetric skew window. Fails closed. */
export function verifyWebhook(input: WebhookInput): WebhookVerdict {
  if (!input.secret) return { ok: false, reason: 'missing_secret' };
  if (!input.signature) return { ok: false, reason: 'missing_signature' };

  const tsText = String(input.timestamp ?? '');
  if (!/^\d{1,12}$/.test(tsText)) return { ok: false, reason: 'invalid_timestamp' };
  const ts = Number(tsText);
  const maxMs = (input.maxSkewSeconds ?? MAX_SKEW_SECONDS) * 1000;
  const skewMs = input.now.getTime() - ts * 1000;
  if (skewMs > maxMs) return { ok: false, reason: 'timestamp_too_old' };
  if (skewMs < -maxMs) return { ok: false, reason: 'timestamp_in_future' };

  const sigHex = input.signature.replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sigHex)) return { ok: false, reason: 'bad_signature' };
  const expected = Buffer.from(signWebhook(input.secret, ts, input.body), 'hex');
  const provided = Buffer.from(sigHex, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad_signature' };

  return { ok: true, replayKey: replayKey(ts, sigHex) };
}

/** Stable key identifying one signed delivery, for replay detection. */
export function replayKey(timestampSeconds: number, signatureHex: string): string {
  return createHash('sha256').update(`${timestampSeconds}.${signatureHex.toLowerCase()}`).digest('hex');
}

/** In-memory replay store. Production would back this with a shared cache; the rule is the same. */
export class InMemoryReplayStore {
  private readonly seen = new Map<string, number>();

  /** Returns true the first time a key is seen within its TTL, false on replay. */
  checkAndRecord(key: string, now: Date, ttlSeconds = MAX_SKEW_SECONDS * 2): boolean {
    const nowMs = now.getTime();
    for (const [k, expiry] of this.seen) if (expiry <= nowMs) this.seen.delete(k);
    if (this.seen.has(key)) return false;
    this.seen.set(key, nowMs + ttlSeconds * 1000);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

/** Verify and reject replays in one step. */
export function acceptWebhook(input: WebhookInput, store: InMemoryReplayStore): WebhookVerdict {
  const verdict = verifyWebhook(input);
  if (!verdict.ok) return verdict;
  if (!store.checkAndRecord(verdict.replayKey, input.now)) return { ok: false, reason: 'replayed' };
  return verdict;
}
