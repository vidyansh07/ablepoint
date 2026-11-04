import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_HANDLER_CONFIG, assertSafeConfig, enquiryFingerprint, handleEnquirySubmission, type HandlerConfig, type HandlerDeps, type HandlerResponse, type IncomingRequest } from '../src/handler';
import { CASE_REF_PATTERN } from '../src/ids';
import { createSafeLogger, type LogLine } from '../src/logging';
import { FixedWindowRateLimiter, InMemoryIdempotencyStore, InMemoryReplayCache } from '../src/memory';
import type { AuditEvent } from '../src/ports';
import { InMemoryRepository, type CreateEnquiryResult, type EnquiryRecord } from '../src/repository';

const ORIGIN = 'https://ablepointaustralia.com.au';
const NOTICE = 'draft-0';

// Synthetic canaries: none of these may ever appear in logs, error bodies or audit events.
const CANARY = {
  name: 'CANARY-NAME-Zq81',
  email: 'canary.zq81@example.invalid',
  phoneDigits: '0412999081',
  phoneSpaced: '0412 999 081',
  e164: '+61412999081',
  key: 'CANARYKEY-0123456789abcdef',
  token: 'CANARY-TOKEN-turnstile-xyz',
  bestTime: 'CANARY-bestTime-weekdays',
  ndis: 'CANARY-NDIS-430000000',
};

const baseEnquiry = {
  name: CANARY.name,
  phone: CANARY.phoneSpaced,
  email: CANARY.email,
  referrerType: 'family',
  services: ['sil', 'core-support'],
  region: 'central-coast',
  contactMethod: 'phone',
  bestTime: CANARY.bestTime,
  consent: true,
};

interface Harness {
  deps: HandlerDeps;
  repo: InMemoryRepository;
  logs: LogLine[];
  turnstileCalls: string[];
  setNow(ms: number): void;
  setVerify(fn: (token: string) => boolean | Promise<boolean>): void;
  idempotency: InMemoryIdempotencyStore;
}

function harness(over: { config?: Partial<HandlerConfig>; repository?: InMemoryRepository; repositoryWrap?: (r: InMemoryRepository) => HandlerDeps['repository'] } = {}): Harness {
  let now = Date.parse('2026-11-03T10:00:00.000Z');
  const clock = () => now;
  const logs: LogLine[] = [];
  const turnstileCalls: string[] = [];
  let verifyFn: (t: string) => boolean | Promise<boolean> = () => true;
  const repo = over.repository ?? new InMemoryRepository();
  const idempotency = new InMemoryIdempotencyStore();
  let idCounter = 0;
  const deps: HandlerDeps = {
    config: { ...DEFAULT_HANDLER_CONFIG, allowedOrigins: [ORIGIN], acceptedNoticeVersions: [NOTICE], ...over.config },
    turnstile: { verify: async (token) => (turnstileCalls.push(token), { success: await verifyFn(token) }) },
    replayCache: new InMemoryReplayCache(clock),
    rateLimiter: new FixedWindowRateLimiter(clock),
    idempotency,
    repository: over.repositoryWrap ? over.repositoryWrap(repo) : repo,
    logger: createSafeLogger((l) => logs.push(l)),
    clock,
    newId: () => `id-${++idCounter}`,
  };
  return { deps, repo, logs, turnstileCalls, setNow: (ms) => (now = ms), setVerify: (fn) => (verifyFn = fn), idempotency };
}

function request(over: { body?: unknown; rawBody?: string | Uint8Array; headers?: Record<string, string | undefined>; ip?: string; method?: string; enquiry?: Record<string, unknown>; key?: string; token?: string | null } = {}): IncomingRequest {
  const envelope: Record<string, unknown> = {
    idempotencyKey: over.key ?? CANARY.key,
    noticeVersion: NOTICE,
    enquiry: { ...baseEnquiry, ...over.enquiry },
  };
  if (over.token !== null) envelope['turnstileToken'] = over.token ?? CANARY.token;
  return {
    method: over.method ?? 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...over.headers },
    body: over.rawBody ?? JSON.stringify(over.body ?? envelope),
    ip: over.ip ?? '203.0.113.10',
  };
}

const bodyOf = (r: HandlerResponse) => r.body as Record<string, unknown>;
const everything = (...parts: unknown[]) => JSON.stringify(parts);

describe('happy path', () => {
  it('creates an enquiry: 201, case_ref, normalised record, audit event, safe headers', async () => {
    const h = harness();
    const res = await handleEnquirySubmission(request(), h.deps);
    expect(res.status).toBe(201);
    const caseRef = bodyOf(res)['caseRef'] as string;
    expect(caseRef).toMatch(CASE_REF_PATTERN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['vary']).toBe('Origin');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    const rec = (await h.repo.getEnquiry(caseRef)) as EnquiryRecord;
    expect(rec).toMatchObject({ status: 'new', referrerType: 'family', region: 'central-coast', contactMethod: 'phone', assignedTo: [] });
    expect(rec.enquirer).toEqual({ name: CANARY.name, phoneE164: CANARY.e164, email: CANARY.email });
    expect(rec.services).toEqual(['sil', 'core-support']);
    expect(rec.consent).toEqual({ given: true, noticeVersion: NOTICE, at: '2026-11-03T10:00:00.000Z' });
    expect(rec.createdAt).toBe('2026-11-03T10:00:00.000Z');
    expect(rec.idempotencyKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.idempotencyKeyHash).not.toContain(CANARY.key);
  });
  it('appends exactly one audit event with no personal information', async () => {
    const h = harness();
    const res = await handleEnquirySubmission(request(), h.deps);
    const events = h.repo.auditEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'enquiry.created', actor: { kind: 'public' }, outcome: 'success', entity: { type: 'enquiry', id: bodyOf(res)['caseRef'] }, meta: { noticeVersion: NOTICE, serviceCount: 2 } });
    for (const c of Object.values(CANARY)) expect(JSON.stringify(events)).not.toContain(c);
  });
  it('accepts application/json with a utf-8 charset and header names in any case', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ headers: { 'content-type': 'application/json; charset=utf-8', origin: ORIGIN, Origin: undefined, 'Content-Type': undefined } }), h.deps);
    expect(r.status).toBe(201);
  });
  it('works without email or bestTime', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ enquiry: { email: undefined, bestTime: undefined } }), h.deps);
    expect(r.status).toBe(201);
    const rec = (await h.repo.getEnquiry(bodyOf(r)['caseRef'] as string)) as EnquiryRecord;
    expect(rec.enquirer.email).toBeUndefined();
    expect(rec.bestTime).toBeUndefined();
  });
  it('strips unknown enquiry fields such as an NDIS number: it is never stored', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ enquiry: { ndisNumber: CANARY.ndis, supportNeeds: 'x' } }), h.deps);
    expect(r.status).toBe(201);
    expect(JSON.stringify(h.repo.allEnquiries())).not.toContain(CANARY.ndis);
    expect(JSON.stringify(h.repo.allEnquiries())).not.toContain('supportNeeds');
  });
});

describe('origin, method and CORS', () => {
  it('answers preflight for an allowed origin only', async () => {
    const h = harness();
    const ok = await handleEnquirySubmission({ method: 'OPTIONS', headers: { origin: ORIGIN }, body: undefined, ip: '1.1.1.1' }, h.deps);
    expect(ok.status).toBe(204);
    expect(ok.body).toBeNull();
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect(ok.headers['access-control-allow-headers']).toBe('content-type');
    const bad = await handleEnquirySubmission({ method: 'OPTIONS', headers: { origin: 'https://evil.example' }, body: undefined, ip: '1.1.1.1' }, h.deps);
    expect(bad.status).toBe(403);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
  it.each([
    ['missing origin', undefined],
    ['null origin', 'null'],
    ['other site', 'https://evil.example'],
    ['suffix attack', `${ORIGIN}.evil.example`],
    ['prefix attack', `https://evil.${ORIGIN.slice(8)}`],
    ['wrong scheme', 'http://ablepointaustralia.com.au'],
    ['trailing slash', `${ORIGIN}/`],
    ['different case', ORIGIN.toUpperCase()],
  ])('refuses %s with no CORS headers and stores nothing', async (_n, origin) => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ headers: { Origin: origin } }), h.deps);
    expect(r.status).toBe(403);
    expect(bodyOf(r)['code']).toBe('forbidden_origin');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(h.repo.enquiryCount).toBe(0);
    expect(h.turnstileCalls).toEqual([]);
  });
  it('refuses direct navigations (Sec-Fetch-Site: none) but allows cross-site/same-site fetches', async () => {
    const h = harness();
    expect((await handleEnquirySubmission(request({ headers: { 'Sec-Fetch-Site': 'none' } }), h.deps)).status).toBe(403);
    expect((await handleEnquirySubmission(request({ headers: { 'Sec-Fetch-Site': 'same-site' }, key: 'KEYKEYKEYKEYKEYKEY1', token: 't1' }), h.deps)).status).toBe(201);
  });
  it('rejects methods other than POST/OPTIONS with an Allow header', async () => {
    const h = harness();
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD']) {
      const r = await handleEnquirySubmission(request({ method }), h.deps);
      expect(r.status).toBe(405);
      expect(r.headers['allow']).toBe('POST, OPTIONS');
    }
  });
});

describe('request shape limits', () => {
  it('rejects non-JSON content types', async () => {
    const h = harness();
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonp', 'application/json; charset=latin1', undefined]) {
      const r = await handleEnquirySubmission(request({ headers: { 'Content-Type': ct } }), h.deps);
      expect(r.status).toBe(415);
    }
    expect(h.repo.enquiryCount).toBe(0);
  });
  it('rejects by Content-Length before looking at the body', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ headers: { 'Content-Length': String(16 * 1024 + 1) }, rawBody: '{}' }), h.deps);
    expect(r.status).toBe(413);
  });
  it('rejects oversize bodies when Content-Length is absent or lies', async () => {
    const h = harness();
    expect((await handleEnquirySubmission(request({ rawBody: ' '.repeat(16 * 1024 + 1) }), h.deps)).status).toBe(413);
    expect((await handleEnquirySubmission(request({ headers: { 'Content-Length': '10' }, rawBody: ' '.repeat(20_000) }), h.deps)).status).toBe(413);
  });
  it('measures bytes, not characters', async () => {
    const h = harness();
    const twoByteChars = 'é'.repeat(9000); // 9,000 chars but 18,000 bytes
    expect((await handleEnquirySubmission(request({ rawBody: `"${twoByteChars}"` }), h.deps)).status).toBe(413);
  });
  it('accepts a body of exactly the limit and refuses one byte more', async () => {
    const h = harness();
    const json = JSON.stringify({ idempotencyKey: CANARY.key, noticeVersion: NOTICE, turnstileToken: CANARY.token, enquiry: baseEnquiry });
    const exact = json + ' '.repeat(16 * 1024 - Buffer.byteLength(json));
    expect(Buffer.byteLength(exact)).toBe(16 * 1024);
    expect((await handleEnquirySubmission(request({ rawBody: exact }), h.deps)).status).toBe(201);
    expect((await handleEnquirySubmission(request({ rawBody: exact + ' ', key: 'ANOTHERKEYANOTHERKEY' }), h.deps)).status).toBe(413);
  });
  it('accepts a Uint8Array body', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ rawBody: new TextEncoder().encode(JSON.stringify({ idempotencyKey: CANARY.key, noticeVersion: NOTICE, turnstileToken: CANARY.token, enquiry: baseEnquiry })) }), h.deps);
    expect(r.status).toBe(201);
  });
  it('rejects missing body, invalid JSON, non-object JSON, unknown envelope keys and bad Content-Length', async () => {
    const h = harness();
    const cases: IncomingRequest[] = [
      { ...request(), body: undefined },
      request({ rawBody: '{not json' }),
      request({ rawBody: '[]' }),
      request({ rawBody: 'null' }),
      request({ rawBody: '"string"' }),
      request({ body: { idempotencyKey: CANARY.key, noticeVersion: NOTICE, enquiry: baseEnquiry, extra: 1 } }),
      request({ headers: { 'Content-Length': 'abc' } }),
      request({ headers: { 'Content-Length': '-5' } }),
    ];
    for (const c of cases) expect((await handleEnquirySubmission(c, h.deps)).status).toBe(400);
    expect(h.repo.enquiryCount).toBe(0);
  });
  it('validates envelope fields', async () => {
    const h = harness();
    const fieldsOf = async (r: IncomingRequest) => bodyOf(await handleEnquirySubmission(r, h.deps))['fields'];
    expect(await fieldsOf(request({ key: 'short' }))).toEqual(['idempotencyKey']);
    expect(await fieldsOf(request({ key: 'has spaces in the key!!' }))).toEqual(['idempotencyKey']);
    expect(await fieldsOf(request({ body: { idempotencyKey: CANARY.key, noticeVersion: 'unknown-version', enquiry: baseEnquiry } }))).toEqual(['noticeVersion']);
    expect(await fieldsOf(request({ body: { idempotencyKey: CANARY.key, noticeVersion: NOTICE, turnstileToken: 42, enquiry: baseEnquiry } }))).toEqual(['turnstileToken']);
    expect(await fieldsOf(request({ body: { idempotencyKey: CANARY.key, noticeVersion: NOTICE, turnstileToken: 'x'.repeat(2049), enquiry: baseEnquiry } }))).toEqual(['turnstileToken']);
    expect(await fieldsOf(request({ body: { idempotencyKey: CANARY.key, noticeVersion: NOTICE, enquiry: 'nope' } }))).toEqual(['enquiry']);
  });
});

describe('enquiry validation', () => {
  it('returns 422 with field names only (no echoed input) and stores nothing', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ enquiry: { consent: false, services: [] } }), h.deps);
    expect(r.status).toBe(422);
    expect(bodyOf(r)['code']).toBe('validation_failed');
    expect(bodyOf(r)['fields']).toEqual(expect.arrayContaining(['consent', 'services']));
    for (const c of Object.values(CANARY)) expect(JSON.stringify(r)).not.toContain(c);
    expect(h.repo.enquiryCount).toBe(0);
    expect(h.turnstileCalls).toEqual([]); // cheap checks first: no external call for invalid input
  });
  it.each([
    ['no consent', { consent: undefined }, 'consent'],
    ['no contact details', { phone: undefined, email: undefined }, 'phone'],
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['bad phone', { phone: '123' }, 'phone'],
    ['bad region', { region: 'sydney' }, 'region'],
    ['bad referrer', { referrerType: 'robot' }, 'referrerType'],
    ['email contact without email', { contactMethod: 'email', email: undefined }, 'email'],
    ['too-long bestTime', { bestTime: 'x'.repeat(81) }, 'bestTime'],
  ])('rejects %s', async (_n, enquiry, field) => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ enquiry }), h.deps);
    expect(r.status).toBe(422);
    expect(bodyOf(r)['fields']).toContain(field);
  });
  it('trims and normalises (email lower-cased, phone to E.164)', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ enquiry: { name: '  Sam Example  ', email: 'Sam@Example.INVALID', phone: '+61 (4) 12 999 081' } }), h.deps);
    // "+61 (4) 12 999 081" → digits 61412999081 → valid mobile
    expect(r.status).toBe(201);
    const rec = (await h.repo.getEnquiry(bodyOf(r)['caseRef'] as string)) as EnquiryRecord;
    expect(rec.enquirer).toEqual({ name: 'Sam Example', phoneE164: CANARY.e164, email: 'sam@example.invalid' });
  });
});

describe('honeypot', () => {
  it('pretends success, stores nothing, calls nobody, reserves nothing', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ enquiry: { website: 'http://spam.example' } }), h.deps);
    expect(r.status).toBe(200);
    expect(bodyOf(r)['ok']).toBe(true);
    expect(bodyOf(r)['caseRef']).toMatch(CASE_REF_PATTERN);
    expect(h.repo.enquiryCount).toBe(0);
    expect(h.repo.auditEvents).toHaveLength(0);
    expect(h.turnstileCalls).toEqual([]);
    expect(await h.idempotency.get('anything')).toBeUndefined();
  });
  it('an empty honeypot is fine', async () => {
    const h = harness();
    expect((await handleEnquirySubmission(request({ enquiry: { website: '' } }), h.deps)).status).toBe(201);
  });
});

describe('Turnstile', () => {
  it('requires a token when enforced', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ token: null }), h.deps);
    expect(r.status).toBe(403);
    expect(bodyOf(r)['code']).toBe('bot_check_failed');
    expect(h.repo.enquiryCount).toBe(0);
  });
  it('rejects a token that fails verification', async () => {
    const h = harness();
    h.setVerify(() => false);
    const r = await handleEnquirySubmission(request(), h.deps);
    expect(r.status).toBe(403);
    expect(h.repo.enquiryCount).toBe(0);
  });
  it('fails closed (503) when the verifier is unavailable, and stores nothing', async () => {
    const h = harness();
    h.setVerify(() => {
      throw new Error(`upstream said ${CANARY.email}`);
    });
    const r = await handleEnquirySubmission(request(), h.deps);
    expect(r.status).toBe(503);
    expect(bodyOf(r)['code']).toBe('service_unavailable');
    expect(h.repo.enquiryCount).toBe(0);
    expect(everything(h.logs)).not.toContain(CANARY.email);
  });
  it('token is single-use: replay with a different idempotency key is refused without calling the verifier again', async () => {
    const h = harness();
    expect((await handleEnquirySubmission(request(), h.deps)).status).toBe(201);
    const second = await handleEnquirySubmission(request({ key: 'DIFFERENTKEY-0123456789', enquiry: { phone: '0412 111 222', email: 'other@example.invalid' } }), h.deps);
    expect(second.status).toBe(403);
    expect(h.turnstileCalls).toHaveLength(1);
    expect(h.repo.enquiryCount).toBe(1);
  });
  it('a replayed token is also refused after verification failed (burned)', async () => {
    const h = harness();
    h.setVerify(() => false);
    await handleEnquirySubmission(request(), h.deps);
    h.setVerify(() => true);
    expect((await handleEnquirySubmission(request(), h.deps)).status).toBe(403);
    expect(h.turnstileCalls).toHaveLength(1);
  });
  it('forwards the client IP to the verifier', async () => {
    const h = harness();
    const seen: string[] = [];
    h.deps.turnstile = { verify: async (_t, ip) => (seen.push(ip), { success: true }) };
    await handleEnquirySubmission(request({ ip: '198.51.100.7' }), h.deps);
    expect(seen).toEqual(['198.51.100.7']);
  });
  it('can be disabled by configuration (e.g. local development) and then needs no token', async () => {
    const h = harness({ config: { requireTurnstile: false } });
    expect((await handleEnquirySubmission(request({ token: null }), h.deps)).status).toBe(201);
    expect(h.turnstileCalls).toEqual([]);
  });
});

describe('idempotency', () => {
  it('a retry with the same key and payload returns the original case_ref: one record, one audit event, verifier called once', async () => {
    const h = harness();
    const first = await handleEnquirySubmission(request(), h.deps);
    const retry = await handleEnquirySubmission(request(), h.deps); // same single-use token: replay is answered before Turnstile
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(bodyOf(retry)['caseRef']).toBe(bodyOf(first)['caseRef']);
    expect(h.repo.enquiryCount).toBe(1);
    expect(h.repo.auditEvents).toHaveLength(1);
    expect(h.turnstileCalls).toHaveLength(1);
  });
  it('the same key with a different payload is a conflict (409), not a replay', async () => {
    const h = harness();
    await handleEnquirySubmission(request(), h.deps);
    const r = await handleEnquirySubmission(request({ enquiry: { name: 'Someone Else' } }), h.deps);
    expect(r.status).toBe(409);
    expect(bodyOf(r)['code']).toBe('idempotency_conflict');
    expect(h.repo.enquiryCount).toBe(1);
  });
  it('treats formatting differences of the same data as the same payload', async () => {
    const h = harness();
    const a = await handleEnquirySubmission(request(), h.deps);
    const b = await handleEnquirySubmission(request({ enquiry: { phone: CANARY.e164, services: ['core-support', 'sil'] } }), h.deps);
    expect(b.status).toBe(200);
    expect(bodyOf(b)['caseRef']).toBe(bodyOf(a)['caseRef']);
  });
  it('concurrent duplicate submissions create exactly one record', async () => {
    const h = harness();
    const [a, b] = await Promise.all([handleEnquirySubmission(request({ token: 'TOKEN-A-aaaaaaaa' }), h.deps), handleEnquirySubmission(request({ token: 'TOKEN-B-bbbbbbbb' }), h.deps)]);
    expect(h.repo.enquiryCount).toBe(1);
    expect(bodyOf(a)['caseRef']).toBe(bodyOf(b)['caseRef']);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
  });
  it('KNOWN LIMITATION: two racing requests that share one single-use token create one record; the loser is refused (403), not replayed', async () => {
    const h = harness();
    const [a, b] = await Promise.all([handleEnquirySubmission(request(), h.deps), handleEnquirySubmission(request(), h.deps)]);
    expect([a.status, b.status].sort()).toEqual([201, 403]);
    expect(h.repo.enquiryCount).toBe(1);
  });
  it('fingerprint ignores services order but not content', () => {
    const e = { name: 'A B', phone: '0412 345 678', referrerType: 'self', services: ['sil', 'sda'], region: 'orange', contactMethod: 'phone', consent: true } as const;
    expect(enquiryFingerprint({ ...e, services: ['sda', 'sil'] } as never)).toBe(enquiryFingerprint(e as never));
    expect(enquiryFingerprint({ ...e, region: 'dubbo' } as never)).not.toBe(enquiryFingerprint(e as never));
  });
});

describe('rate limiting', () => {
  it('limits per IP, returns 429 with Retry-After, and recovers when the window passes', async () => {
    const h = harness({ config: { ipRateRule: { limit: 3, windowMs: 60_000 }, contactRateRule: { limit: 1000, windowMs: 60_000 } } });
    for (let i = 0; i < 3; i++) expect((await handleEnquirySubmission(request({ key: `KEYKEYKEYKEYKEY${i}000`, token: `tok${i}`, enquiry: { phone: `041200000${i}`, email: `u${i}@example.invalid` } }), h.deps)).status).toBe(201);
    const limited = await handleEnquirySubmission(request({ key: 'KEYKEYKEYKEYKEY9999', token: 'tok9' }), h.deps);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(bodyOf(limited)).toMatchObject({ ok: false, code: 'rate_limited', retryAfterSec: 60 });
    expect((await handleEnquirySubmission(request({ ip: '203.0.113.99', key: 'KEYKEYKEYKEYKEY8888', token: 'tok8', enquiry: { phone: '0412000008', email: 'u8@example.invalid' } }), h.deps)).status).toBe(201);
    h.setNow(Date.parse('2026-11-03T10:01:01.000Z'));
    expect((await handleEnquirySubmission(request({ key: 'KEYKEYKEYKEYKEY7777', token: 'tok7', enquiry: { phone: '0412000007', email: 'u7@example.invalid' } }), h.deps)).status).toBe(201);
  });
  it('rate limits before parsing: a limited IP sending garbage gets 429, not 400', async () => {
    const h = harness({ config: { ipRateRule: { limit: 1, windowMs: 60_000 } } });
    await handleEnquirySubmission(request(), h.deps);
    expect((await handleEnquirySubmission(request({ rawBody: '{garbage' }), h.deps)).status).toBe(429);
  });
  it('throttles repeated submissions for the same phone number (SMS-bombing protection) even across IPs', async () => {
    const h = harness();
    const send = (i: number) => handleEnquirySubmission(request({ ip: `198.51.100.${i}`, key: `PHONEKEYPHONEKEY${i}00`, token: `ptok${i}`, enquiry: { email: `p${i}@example.invalid` } }), h.deps);
    for (let i = 1; i <= 3; i++) expect((await send(i)).status).toBe(201);
    const fourth = await send(4);
    expect(fourth.status).toBe(429);
    expect(h.repo.enquiryCount).toBe(3);
  });
  it('throttles repeated submissions for the same email even when the phone changes', async () => {
    const h = harness();
    const send = (i: number) => handleEnquirySubmission(request({ ip: `198.51.100.${i}`, key: `EMAILKEYEMAILKEY${i}00`, token: `etok${i}`, enquiry: { phone: `04129990${i}0` } }), h.deps);
    for (let i = 1; i <= 3; i++) expect((await send(i)).status).toBe(201);
    expect((await send(4)).status).toBe(429);
  });
  it('the contact throttle is not applied to invalid submissions (they never reach it)', async () => {
    const h = harness();
    for (let i = 0; i < 6; i++) expect((await handleEnquirySubmission(request({ ip: `198.51.100.${i + 1}`, enquiry: { consent: false } }), h.deps)).status).toBe(422);
    expect((await handleEnquirySubmission(request({ ip: '198.51.100.50' }), h.deps)).status).toBe(201);
  });
});

describe('failure handling', () => {
  class FlakyRepo extends InMemoryRepository {
    failures = 0;
    collisions = 0;
    override async createEnquiry(record: EnquiryRecord, audit: AuditEvent): Promise<CreateEnquiryResult> {
      if (this.failures > 0) {
        this.failures--;
        throw new Error(`duplicate key value violates unique constraint (email)=(${CANARY.email}) name=${CANARY.name}`);
      }
      if (this.collisions > 0) {
        this.collisions--;
        return { status: 'caseRefCollision' };
      }
      return super.createEnquiry(record, audit);
    }
  }

  it('a repository error becomes a generic 500 with no detail, no stack, and nothing sensitive logged', async () => {
    const repo = new FlakyRepo();
    repo.failures = 1;
    const h = harness({ repository: repo });
    const r = await handleEnquirySubmission(request(), h.deps);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ ok: false, code: 'internal_error' });
    expect(everything(r)).not.toMatch(/duplicate key|Error:|at \w/);
    for (const c of Object.values(CANARY)) expect(everything(h.logs)).not.toContain(c);
    expect(h.logs.find((l) => l.event === 'unhandled_error')?.fields).toMatchObject({ errorName: 'Error' });
  });
  it('releases the idempotency reservation on failure so the client can retry the same submission', async () => {
    const repo = new FlakyRepo();
    repo.failures = 1;
    const h = harness({ repository: repo });
    expect((await handleEnquirySubmission(request(), h.deps)).status).toBe(500);
    h.setVerify(() => true);
    const retry = await handleEnquirySubmission(request({ token: 'FRESH-TOKEN-0123456' }), h.deps);
    expect(retry.status).toBe(201);
    expect(repo.enquiryCount).toBe(1);
  });
  it('retries with a new case_ref on collision', async () => {
    const repo = new FlakyRepo();
    repo.collisions = 2;
    const h = harness({ repository: repo });
    let n = 0;
    h.deps.newCaseRef = () => ['AP-AAAA-AA1', 'AP-AAAA-AA2', 'AP-AAAA-AA3'][n++] as string;
    const r = await handleEnquirySubmission(request(), h.deps);
    expect(r.status).toBe(201);
    expect(bodyOf(r)['caseRef']).toBe('AP-AAAA-AA3');
    expect(h.logs.filter((l) => l.event === 'case_ref_collision')).toHaveLength(2);
  });
  it('gives up with a generic 500 after repeated collisions, and releases the reservation', async () => {
    const repo = new FlakyRepo();
    repo.collisions = 99;
    const h = harness({ repository: repo });
    const r = await handleEnquirySubmission(request(), h.deps);
    expect(r.status).toBe(500);
    expect(repo.enquiryCount).toBe(0);
    repo.collisions = 0;
    expect((await handleEnquirySubmission(request({ token: 'FRESH-TOKEN-7654321' }), h.deps)).status).toBe(201);
  });
  it('misconfiguration (wildcard origin) is a 500, never an open endpoint', async () => {
    const h = harness({ config: { allowedOrigins: ['*'] } });
    const r = await handleEnquirySubmission(request({ headers: { Origin: '*' } }), h.deps);
    expect(r.status).toBe(500);
    expect(h.repo.enquiryCount).toBe(0);
  });
});

describe('config validation', () => {
  const ok: HandlerConfig = { ...DEFAULT_HANDLER_CONFIG, allowedOrigins: [ORIGIN, 'http://localhost:4321'], acceptedNoticeVersions: [NOTICE] };
  it('accepts exact origins', () => expect(() => assertSafeConfig(ok)).not.toThrow());
  it.each([
    ['wildcard', { allowedOrigins: ['*'] }],
    ['wildcard subdomain', { allowedOrigins: ['https://*.example.com'] }],
    ['empty list', { allowedOrigins: [] }],
    ['path', { allowedOrigins: ['https://example.com/form'] }],
    ['trailing slash', { allowedOrigins: ['https://example.com/'] }],
    ['no scheme', { allowedOrigins: ['example.com'] }],
    ['body limit zero', { maxBodyBytes: 0 }],
    ['body limit huge', { maxBodyBytes: 10 * 1024 * 1024 }],
    ['no notice versions', { acceptedNoticeVersions: [] }],
  ])('rejects %s', (_n, over) => expect(() => assertSafeConfig({ ...ok, ...over })).toThrow());
});

describe('privacy: no personal information in logs, bodies or audit events', () => {
  it('canary values never appear anywhere across success, replay, validation, bot, rate-limit, size, type and failure paths', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    class Boom extends InMemoryRepository {
      override async createEnquiry(): Promise<CreateEnquiryResult> {
        throw new Error(`insert failed for ${CANARY.name} <${CANARY.email}> ${CANARY.phoneDigits} ${CANARY.ndis}`);
      }
    }
    const responses: HandlerResponse[] = [];
    const main = harness({ config: { ipRateRule: { limit: 8, windowMs: 60_000 } } });
    const hostile = (over: Parameters<typeof request>[0]) => request({ enquiry: { ndisNumber: CANARY.ndis }, ...over });
    responses.push(await handleEnquirySubmission(hostile({}), main.deps)); // success
    responses.push(await handleEnquirySubmission(hostile({}), main.deps)); // idempotent replay
    responses.push(await handleEnquirySubmission(hostile({ enquiry: { name: 'Different' } }), main.deps)); // conflict
    responses.push(await handleEnquirySubmission(hostile({ enquiry: { consent: false } }), main.deps)); // validation
    responses.push(await handleEnquirySubmission(hostile({ enquiry: { website: CANARY.name } }), main.deps)); // honeypot
    main.setVerify(() => false);
    responses.push(await handleEnquirySubmission(hostile({ key: 'OTHERKEYOTHERKEY-123', token: 'bad-token-0123456789', enquiry: { phone: '0412000001', email: 'x@example.invalid' } }), main.deps)); // bot
    responses.push(await handleEnquirySubmission(hostile({ headers: { Origin: `https://evil.example/${CANARY.name}` } }), main.deps)); // origin
    responses.push(await handleEnquirySubmission(hostile({ headers: { 'Content-Type': 'text/plain' } }), main.deps)); // type
    responses.push(await handleEnquirySubmission(hostile({ rawBody: ` ${CANARY.email}`.padEnd(20_000, ' ') }), main.deps)); // size
    responses.push(await handleEnquirySubmission(hostile({ rawBody: `{"x": "${CANARY.name}"` }), main.deps)); // bad json
    responses.push(await handleEnquirySubmission(hostile({ ip: '203.0.113.200', headers: {} }), main.deps));
    const boom = harness({ repository: new Boom() });
    responses.push(await handleEnquirySubmission(hostile({ key: 'BOOMKEYBOOMKEY-12345' }), boom.deps)); // repository failure with PII in message
    const limited = harness({ config: { ipRateRule: { limit: 1, windowMs: 60_000 } } });
    await handleEnquirySubmission(hostile({ key: 'LIMITKEYLIMITKEY-111' }), limited.deps);
    responses.push(await handleEnquirySubmission(hostile({ key: 'LIMITKEYLIMITKEY-222' }), limited.deps)); // rate limit

    const logs = [...main.logs, ...boom.logs, ...limited.logs];
    expect(logs.length).toBeGreaterThan(8);
    const audit = [...main.repo.auditEvents, ...limited.repo.auditEvents];
    for (const c of Object.values(CANARY)) {
      expect(JSON.stringify(logs), `log leaked ${c}`).not.toContain(c);
      expect(JSON.stringify(responses), `response leaked ${c}`).not.toContain(c);
      expect(JSON.stringify(audit), `audit leaked ${c}`).not.toContain(c);
    }
    expect(JSON.stringify(logs)).not.toContain('999081');
    for (const line of logs) for (const k of Object.keys(line.fields)) expect(['requestId', 'status', 'code', 'caseRef', 'replay', 'reason', 'errorName', 'attempt']).toContain(k);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    consoleSpies.forEach((s) => s.mockRestore());
  });
  it('responses on every error path have a fixed, generic shape', async () => {
    const h = harness();
    const r = await handleEnquirySubmission(request({ rawBody: '{broken' }), h.deps);
    expect(r.body).toEqual({ ok: false, code: 'invalid_request' });
  });
});
