import { randomUUID } from 'node:crypto';
import { enquirySchema, normalisePhoneAU, type Enquiry } from '@ablepoint/schemas';
import { sha256Hex } from './hash';
import { generateCaseRef } from './ids';
import type { SafeLogger } from './logging';
import type { AuditEvent, Clock, IdempotencyStore, RateLimiter, RateRule, ReplayCache, TurnstileVerifier } from './ports';
import type { EnquiryRecord, Repository } from './repository';

/**
 * Step-1 public enquiry handler (docs/05 §2, §6). Framework-agnostic: the adapter (Lambda, Vercel,
 * Node http…) maps its request to `IncomingRequest` and the response back. The adapter must supply
 * `ip` from a TRUSTED source (the platform's verified client IP, never a raw X-Forwarded-For).
 *
 * Order matters and is tested: origin → rate limit → content-type → size → JSON → envelope →
 * honeypot → schema → idempotency replay → per-contact throttle → Turnstile → persist.
 * Idempotency replay precedes Turnstile because a legitimate retry reuses the single-use token.
 */

export interface IncomingRequest {
  method: string;
  headers: Record<string, string | undefined>;
  body: string | Uint8Array | undefined;
  ip: string;
}

export type ErrorCode =
  | 'forbidden_origin'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'invalid_request'
  | 'validation_failed'
  | 'bot_check_failed'
  | 'idempotency_conflict'
  | 'service_unavailable'
  | 'internal_error';

export type HandlerBody =
  | { ok: true; caseRef: string }
  | { ok: false; code: ErrorCode; fields?: string[]; retryAfterSec?: number }
  | null;

export interface HandlerResponse {
  status: number;
  headers: Record<string, string>;
  body: HandlerBody;
}

export interface HandlerConfig {
  /** Exact origins, e.g. `https://ablepointaustralia.com.au`. No wildcards, no paths. */
  allowedOrigins: readonly string[];
  maxBodyBytes: number;
  /** Collection-notice versions the server will accept as the one the user saw. */
  acceptedNoticeVersions: readonly string[];
  requireTurnstile: boolean;
  turnstileReplayTtlMs: number;
  ipRateRule: RateRule;
  contactRateRule: RateRule;
  maxCaseRefAttempts: number;
}

export const DEFAULT_HANDLER_CONFIG: Omit<HandlerConfig, 'allowedOrigins' | 'acceptedNoticeVersions'> = {
  maxBodyBytes: 16 * 1024,
  requireTurnstile: true,
  turnstileReplayTtlMs: 5 * 60 * 1000,
  ipRateRule: { limit: 10, windowMs: 10 * 60 * 1000 },
  contactRateRule: { limit: 3, windowMs: 60 * 60 * 1000 },
  maxCaseRefAttempts: 3,
};

export interface HandlerDeps {
  config: HandlerConfig;
  turnstile: TurnstileVerifier;
  replayCache: ReplayCache;
  rateLimiter: RateLimiter;
  idempotency: IdempotencyStore;
  repository: Repository;
  logger: SafeLogger;
  clock: Clock;
  newCaseRef?: () => string;
  newId?: () => string;
}

const BASE_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'content-type': 'application/json; charset=utf-8',
};
const ENVELOPE_KEYS = new Set(['idempotencyKey', 'noticeVersion', 'turnstileToken', 'enquiry']);
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const ORIGIN_PATTERN = /^https?:\/\/[^/\s*]+$/;

export function assertSafeConfig(config: HandlerConfig): void {
  if (config.allowedOrigins.length === 0) throw new Error('allowedOrigins must not be empty');
  for (const o of config.allowedOrigins) {
    if (!ORIGIN_PATTERN.test(o)) throw new Error('allowedOrigins entries must be exact origins (no wildcard, no path)');
  }
  if (config.maxBodyBytes <= 0 || config.maxBodyBytes > 1024 * 1024) throw new Error('maxBodyBytes out of range');
  if (config.acceptedNoticeVersions.length === 0) throw new Error('acceptedNoticeVersions must not be empty');
}

function respond(status: number, body: HandlerBody, origin?: string, extra: Record<string, string> = {}): HandlerResponse {
  const headers: Record<string, string> = { ...BASE_HEADERS, ...extra };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  return { status, headers, body };
}

const fail = (status: number, code: ErrorCode, origin?: string, extra?: { fields?: string[]; retryAfterSec?: number }, headers?: Record<string, string>) =>
  respond(status, { ok: false, code, ...extra }, origin, headers);

function lowerHeaders(h: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (typeof v === 'string') out[k.toLowerCase()] = v;
  return out;
}

const bodyBytes = (b: string | Uint8Array): number => (typeof b === 'string' ? Buffer.byteLength(b, 'utf8') : b.byteLength);
const bodyText = (b: string | Uint8Array): string => (typeof b === 'string' ? b : Buffer.from(b).toString('utf8'));
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deterministic fingerprint of the normalised enquiry, used to detect key reuse with a different payload. */
export function enquiryFingerprint(e: Enquiry): string {
  return sha256Hex(
    JSON.stringify([e.name, normalisePhoneAU(e.phone ?? '') ?? '', e.email ?? '', e.referrerType, [...e.services].sort(), e.region, e.contactMethod, e.bestTime ?? '', e.consent]),
  );
}

export async function handleEnquirySubmission(req: IncomingRequest, deps: HandlerDeps): Promise<HandlerResponse> {
  const requestId = (deps.newId ?? randomUUID)();
  try {
    return await run(req, deps, requestId);
  } catch (err) {
    // Never log the message: it may contain submitted values (e.g. a DB constraint error echoing an email).
    deps.logger.log('error', 'unhandled_error', { requestId, errorName: err instanceof Error ? err.name : 'unknown' });
    return fail(500, 'internal_error');
  }
}

async function run(req: IncomingRequest, deps: HandlerDeps, requestId: string): Promise<HandlerResponse> {
  const { config, logger } = deps;
  assertSafeConfig(config);
  const headers = lowerHeaders(req.headers);
  const origin = headers['origin'];
  const originAllowed = !!origin && config.allowedOrigins.includes(origin);

  // 1. Method / CORS preflight
  if (req.method === 'OPTIONS') {
    if (!originAllowed) return fail(403, 'forbidden_origin');
    return respond(204, null, origin, {
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    });
  }
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', undefined, undefined, { allow: 'POST, OPTIONS' });

  // 2. Origin allow-list (exact match). A missing Origin is refused: this endpoint is browser-form only.
  if (!originAllowed) {
    logger.log('warn', 'origin_rejected', { requestId, reason: 'origin' });
    return fail(403, 'forbidden_origin');
  }
  if (headers['sec-fetch-site'] === 'none') {
    logger.log('warn', 'origin_rejected', { requestId, reason: 'fetch_site' });
    return fail(403, 'forbidden_origin');
  }

  // 3. Per-IP rate limit (before any parsing or external call).
  const ipDecision = await deps.rateLimiter.check(`ip:${sha256Hex(req.ip)}`, config.ipRateRule);
  if (!ipDecision.allowed) {
    logger.log('warn', 'rate_limited', { requestId, reason: 'ip' });
    return fail(429, 'rate_limited', origin, { retryAfterSec: ipDecision.retryAfterSec ?? 60 }, { 'retry-after': String(ipDecision.retryAfterSec ?? 60) });
  }

  // 4. Content type and size
  if (!/^application\/json\s*(;\s*charset=utf-8)?$/i.test(headers['content-type'] ?? '')) return fail(415, 'unsupported_media_type', origin);
  const declared = headers['content-length'] !== undefined ? Number(headers['content-length']) : undefined;
  if (declared !== undefined && (!Number.isFinite(declared) || declared < 0)) return fail(400, 'invalid_request', origin);
  if (declared !== undefined && declared > config.maxBodyBytes) return fail(413, 'payload_too_large', origin);
  if (req.body === undefined) return fail(400, 'invalid_request', origin);
  if (bodyBytes(req.body) > config.maxBodyBytes) return fail(413, 'payload_too_large', origin);

  // 5. JSON and envelope shape (strict: unknown top-level keys are refused)
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText(req.body));
  } catch {
    return fail(400, 'invalid_request', origin);
  }
  if (!isPlainObject(parsed) || Object.keys(parsed).some((k) => !ENVELOPE_KEYS.has(k))) return fail(400, 'invalid_request', origin);
  const { idempotencyKey, noticeVersion, turnstileToken, enquiry } = parsed;
  if (typeof idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) return fail(422, 'validation_failed', origin, { fields: ['idempotencyKey'] });
  if (typeof noticeVersion !== 'string' || !config.acceptedNoticeVersions.includes(noticeVersion)) return fail(422, 'validation_failed', origin, { fields: ['noticeVersion'] });
  if (turnstileToken !== undefined && (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > 2048)) return fail(422, 'validation_failed', origin, { fields: ['turnstileToken'] });
  if (!isPlainObject(enquiry)) return fail(422, 'validation_failed', origin, { fields: ['enquiry'] });

  // 6. Honeypot: pretend success, store nothing, tell the bot nothing.
  if (typeof enquiry['website'] === 'string' && enquiry['website'].length > 0) {
    logger.log('info', 'honeypot_tripped', { requestId });
    return respond(200, { ok: true, caseRef: generateCaseRef() }, origin);
  }

  // 7. Schema validation (shared contract with the browser form). Unknown fields such as an NDIS number are stripped.
  const result = enquirySchema.safeParse(enquiry);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? 'enquiry')))];
    logger.log('info', 'validation_failed', { requestId });
    return fail(422, 'validation_failed', origin, { fields });
  }
  const data = result.data;
  const phoneE164 = data.phone ? (normalisePhoneAU(data.phone) ?? undefined) : undefined;
  const fingerprint = enquiryFingerprint(data);
  const keyHash = sha256Hex(`idem:${idempotencyKey}`);

  // 8. Idempotent replay (before Turnstile: the retry carries the same single-use token).
  const existing = await deps.idempotency.get(keyHash);
  if (existing) return replayOrConflict(existing, fingerprint, origin, requestId, deps);

  // 9. Per-contact throttle (stops the form being used to spam one person via SMS/email).
  for (const contact of [phoneE164 ? `phone:${phoneE164}` : undefined, data.email ? `email:${data.email}` : undefined]) {
    if (!contact) continue;
    const d = await deps.rateLimiter.check(`contact:${sha256Hex(contact)}`, config.contactRateRule);
    if (!d.allowed) {
      logger.log('warn', 'rate_limited', { requestId, reason: 'contact' });
      return fail(429, 'rate_limited', origin, { retryAfterSec: d.retryAfterSec ?? 3600 }, { 'retry-after': String(d.retryAfterSec ?? 3600) });
    }
  }

  // 10. Turnstile, server-side, single-use token, fail closed.
  if (config.requireTurnstile) {
    if (typeof turnstileToken !== 'string') {
      logger.log('warn', 'bot_check_failed', { requestId, reason: 'missing_token' });
      return fail(403, 'bot_check_failed', origin);
    }
    const fresh = await deps.replayCache.markUsed(sha256Hex(`turnstile:${turnstileToken}`), config.turnstileReplayTtlMs);
    if (!fresh) {
      logger.log('warn', 'bot_check_failed', { requestId, reason: 'token_replay' });
      return fail(403, 'bot_check_failed', origin);
    }
    let verified: boolean;
    try {
      verified = (await deps.turnstile.verify(turnstileToken, req.ip)).success;
    } catch {
      logger.log('error', 'turnstile_unavailable', { requestId });
      return fail(503, 'service_unavailable', origin);
    }
    if (!verified) {
      logger.log('warn', 'bot_check_failed', { requestId, reason: 'verify_failed' });
      return fail(403, 'bot_check_failed', origin);
    }
  }

  // 11. Reserve idempotency key, persist record + audit event together, retry on case_ref collision.
  const nowMs = deps.clock();
  const at = new Date(nowMs).toISOString();
  for (let attempt = 1; attempt <= config.maxCaseRefAttempts; attempt++) {
    const caseRef = (deps.newCaseRef ?? generateCaseRef)();
    const reservation = await deps.idempotency.reserve(keyHash, { caseRef, fingerprint });
    if (!reservation.reserved) return replayOrConflict(reservation.existing, fingerprint, origin, requestId, deps);

    const record: EnquiryRecord = {
      caseRef,
      createdAt: at,
      status: 'new',
      enquirer: { name: data.name, ...(phoneE164 ? { phoneE164 } : {}), ...(data.email ? { email: data.email } : {}) },
      referrerType: data.referrerType,
      services: data.services,
      region: data.region,
      contactMethod: data.contactMethod,
      ...(data.bestTime ? { bestTime: data.bestTime } : {}),
      consent: { given: true, noticeVersion, at },
      idempotencyKeyHash: keyHash,
      assignedTo: [],
    };
    const audit: AuditEvent = {
      id: (deps.newId ?? randomUUID)(),
      at,
      type: 'enquiry.created',
      actor: { kind: 'public' },
      entity: { type: 'enquiry', id: caseRef },
      outcome: 'success',
      meta: { noticeVersion, serviceCount: data.services.length },
    };
    let created;
    try {
      created = await deps.repository.createEnquiry(record, audit);
    } catch (err) {
      await deps.idempotency.release(keyHash);
      throw err;
    }
    if (created.status === 'created') {
      logger.log('info', 'enquiry_created', { requestId, caseRef, status: 201 });
      return respond(201, { ok: true, caseRef }, origin);
    }
    await deps.idempotency.release(keyHash);
    logger.log('warn', 'case_ref_collision', { requestId, attempt });
  }
  logger.log('error', 'case_ref_exhausted', { requestId });
  return fail(500, 'internal_error', origin);
}

function replayOrConflict(existing: { caseRef: string; fingerprint: string }, fingerprint: string, origin: string, requestId: string, deps: HandlerDeps): HandlerResponse {
  if (existing.fingerprint !== fingerprint) {
    deps.logger.log('warn', 'idempotency_conflict', { requestId });
    return fail(409, 'idempotency_conflict', origin);
  }
  deps.logger.log('info', 'enquiry_replayed', { requestId, caseRef: existing.caseRef, replay: true });
  return respond(200, { ok: true, caseRef: existing.caseRef }, origin);
}
