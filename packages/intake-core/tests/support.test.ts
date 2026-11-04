import { describe, expect, it } from 'vitest';
import { createSafeLogger, LOG_FIELD_ALLOW_LIST, nullLogger, type LogLine } from '../src/logging';
import { FixedWindowRateLimiter, InMemoryAuditSink, InMemoryIdempotencyStore, InMemoryReplayCache } from '../src/memory';
import type { AuditEvent } from '../src/ports';
import { InMemoryRepository, type DocumentRecord, type EnquiryRecord } from '../src/repository';

const ev = (over: Partial<AuditEvent> = {}): AuditEvent => ({ id: 'e1', at: '2026-11-03T00:00:00.000Z', type: 'test', actor: { kind: 'system' }, outcome: 'success', ...over });

describe('safe logger', () => {
  const capture = () => {
    const lines: LogLine[] = [];
    return { lines, log: createSafeLogger((l) => lines.push(l)) };
  };
  it('keeps only allow-listed fields', () => {
    const { lines, log } = capture();
    log.log('info', 'evt', { requestId: 'r-1', name: 'Sam Example', email: 'a@b.invalid', body: '{"x":1}', phone: '0412', status: 201 });
    expect(Object.keys(lines[0]!.fields).sort()).toEqual(['requestId', 'status']);
  });
  it('redacts allow-listed values that look like free text, addresses or markup', () => {
    const { lines, log } = capture();
    for (const v of ['Sam Example', 'a@b.invalid', '<script>', 'x'.repeat(65), 'line\nbreak', '']) log.log('warn', 'evt', { reason: v });
    expect(lines.slice(0, 5).map((l) => l.fields['reason'])).toEqual(['[redacted]', '[redacted]', '[redacted]', '[redacted]', '[redacted]']);
    expect(lines[5]!.fields['reason']).toBe(''); // empty string is a safe value
  });
  it('passes identifiers, numbers and booleans; drops objects, arrays, null and NaN', () => {
    const { lines, log } = capture();
    log.log('info', 'evt', { caseRef: 'AP-7K3M-9Q2', attempt: 2, replay: true, code: { nested: 1 }, status: NaN, errorName: null, requestId: ['a'] });
    expect(lines[0]!.fields).toEqual({ caseRef: 'AP-7K3M-9Q2', attempt: 2, replay: true });
  });
  it('replaces unsafe event names', () => {
    const { lines, log } = capture();
    log.log('info', 'user Sam Example logged in', {});
    expect(lines[0]!.event).toBe('invalid_event_name');
  });
  it('allow-list contains no field that could hold personal data', () => {
    // 'errorName' is the JS constructor name of an error (e.g. TypeError), never user data; error messages are never logged.
    for (const f of LOG_FIELD_ALLOW_LIST.filter((x) => x !== 'errorName')) expect(f).not.toMatch(/name|email|phone|body|token|key|ndis|address|message|stack/i);
  });
  it('nullLogger discards', () => expect(() => nullLogger.log('error', 'x', { a: 1 })).not.toThrow());
});

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit then blocks with a retry hint, per key', async () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    const rule = { limit: 2, windowMs: 10_000 };
    expect((await rl.check('a', rule)).allowed).toBe(true);
    expect((await rl.check('a', rule)).allowed).toBe(true);
    now = 4_000;
    expect(await rl.check('a', rule)).toEqual({ allowed: false, retryAfterSec: 6 });
    expect((await rl.check('b', rule)).allowed).toBe(true);
  });
  it('resets after the window and keeps counting blocked attempts within it', async () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    const rule = { limit: 1, windowMs: 1_000 };
    await rl.check('a', rule);
    expect((await rl.check('a', rule)).allowed).toBe(false);
    now = 1_000;
    expect((await rl.check('a', rule)).allowed).toBe(true);
  });
  it('retryAfterSec is at least 1', async () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    await rl.check('a', { limit: 1, windowMs: 1_000 });
    now = 999;
    expect((await rl.check('a', { limit: 1, windowMs: 1_000 })).retryAfterSec).toBe(1);
  });
  it('prunes expired windows when it grows large', async () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(() => now);
    for (let i = 0; i < 10_001; i++) await rl.check(`k${i}`, { limit: 1, windowMs: 1_000 });
    now = 5_000;
    await rl.check('fresh', { limit: 1, windowMs: 1_000 });
    expect((rl as unknown as { windows: Map<string, unknown> }).windows.size).toBeLessThan(10);
  });
});

describe('InMemoryReplayCache', () => {
  it('first use wins, second is refused until the TTL passes', async () => {
    let now = 0;
    const c = new InMemoryReplayCache(() => now);
    expect(await c.markUsed('h', 1000)).toBe(true);
    expect(await c.markUsed('h', 1000)).toBe(false);
    expect(await c.markUsed('other', 1000)).toBe(true);
    now = 1000;
    expect(await c.markUsed('h', 1000)).toBe(true);
  });
});

describe('InMemoryIdempotencyStore', () => {
  it('reserve is atomic: second reserve returns the existing record; release frees the key', async () => {
    const s = new InMemoryIdempotencyStore();
    expect(await s.reserve('k', { caseRef: 'AP-AAAA-AA1', fingerprint: 'f1' })).toEqual({ reserved: true });
    expect(await s.reserve('k', { caseRef: 'AP-AAAA-AA2', fingerprint: 'f2' })).toEqual({ reserved: false, existing: { caseRef: 'AP-AAAA-AA1', fingerprint: 'f1' } });
    expect(await s.get('k')).toEqual({ caseRef: 'AP-AAAA-AA1', fingerprint: 'f1' });
    await s.release('k');
    expect(await s.get('k')).toBeUndefined();
    expect(await s.reserve('k', { caseRef: 'AP-AAAA-AA3', fingerprint: 'f3' })).toEqual({ reserved: true });
  });
  it('returns copies (callers cannot mutate stored state)', async () => {
    const s = new InMemoryIdempotencyStore();
    await s.reserve('k', { caseRef: 'AP-AAAA-AA1', fingerprint: 'f' });
    const got = (await s.get('k'))!;
    got.caseRef = 'tampered';
    expect((await s.get('k'))!.caseRef).toBe('AP-AAAA-AA1');
  });
});

describe('InMemoryAuditSink (append-only)', () => {
  it('stores events and exposes no way to modify or remove them', async () => {
    const sink = new InMemoryAuditSink();
    await sink.append(ev());
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(sink)).sort()).toEqual(['append', 'constructor', 'events']);
    const copy = sink.events as AuditEvent[];
    copy.length = 0;
    (copy as unknown as AuditEvent[]).push(ev({ id: 'forged' }));
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.id).toBe('e1');
  });
  it('stored events are not affected by later mutation of the original object', async () => {
    const sink = new InMemoryAuditSink();
    const e = ev({ meta: { a: 'b' } });
    await sink.append(e);
    (e.meta as Record<string, string>)['a'] = 'changed';
    expect(sink.events[0]!.meta).toEqual({ a: 'b' });
  });
  it('refuses personal-looking metadata at the sink', async () => {
    const sink = new InMemoryAuditSink();
    await expect(sink.append(ev({ meta: { name: 'Sam Example' } }))).rejects.toThrow('unsafe audit meta value');
    await expect(sink.append(ev({ meta: { email: 'a@b.invalid' } }))).rejects.toThrow('unsafe audit meta value');
    await expect(sink.append(ev({ meta: { 'bad key': 'x' } }))).rejects.toThrow('unsafe audit meta key');
    await expect(sink.append(ev({ meta: { note: 'x'.repeat(65) } }))).rejects.toThrow();
    await expect(sink.append(ev({ meta: { count: 3, ok: true, id: 'abc-123' } }))).resolves.toBeUndefined();
  });
});

const record = (over: Partial<EnquiryRecord> = {}): EnquiryRecord => ({
  caseRef: 'AP-7K3M-9Q2',
  createdAt: '2026-11-03T00:00:00.000Z',
  status: 'new',
  enquirer: { name: 'Synthetic Person', phoneE164: '+61400000000' },
  referrerType: 'self',
  services: ['sil'],
  region: 'orange',
  contactMethod: 'phone',
  consent: { given: true, noticeVersion: 'draft-0', at: '2026-11-03T00:00:00.000Z' },
  idempotencyKeyHash: 'h',
  assignedTo: [],
  ...over,
});
const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({ id: 'd1', caseRef: 'AP-7K3M-9Q2', objectKey: 'quarantine/AP-7K3M-9Q2/x', originalFilename: 'a.pdf', mime: 'application/pdf', sizeBytes: 10, state: 'awaitingUpload', uploadedBy: 's1', createdAt: '2026-11-03T00:00:00.000Z', ...over });

describe('InMemoryRepository (test double)', () => {
  it('creates, reads and detects case_ref collisions without overwriting', async () => {
    const repo = new InMemoryRepository();
    expect(await repo.createEnquiry(record(), ev())).toEqual({ status: 'created' });
    expect(await repo.createEnquiry(record({ enquirer: { name: 'Overwriter' } }), ev({ id: 'e2' }))).toEqual({ status: 'caseRefCollision' });
    expect((await repo.getEnquiry('AP-7K3M-9Q2'))!.enquirer.name).toBe('Synthetic Person');
    expect(repo.auditEvents).toHaveLength(1); // the collision wrote no audit event
    expect(await repo.getEnquiry('AP-NOPE-000')).toBeUndefined();
  });
  it('returns copies: mutating a result does not change stored data', async () => {
    const repo = new InMemoryRepository();
    await repo.createEnquiry(record(), ev());
    const got = (await repo.getEnquiry('AP-7K3M-9Q2'))!;
    got.enquirer.name = 'tampered';
    got.assignedTo.push('x');
    expect((await repo.getEnquiry('AP-7K3M-9Q2'))!.enquirer.name).toBe('Synthetic Person');
    expect((await repo.getEnquiry('AP-7K3M-9Q2'))!.assignedTo).toEqual([]);
  });
  it('stores a copy of its input too', async () => {
    const repo = new InMemoryRepository();
    const r = record();
    await repo.createEnquiry(r, ev());
    r.enquirer.name = 'tampered later';
    expect((await repo.getEnquiry('AP-7K3M-9Q2'))!.enquirer.name).toBe('Synthetic Person');
  });
  it('assigns staff idempotently and audits each assignment', async () => {
    const repo = new InMemoryRepository();
    await repo.createEnquiry(record(), ev());
    expect(await repo.assignEnquiry('AP-7K3M-9Q2', 'staff-1', ev({ id: 'a1', type: 'enquiry.assigned' }))).toBe(true);
    expect(await repo.assignEnquiry('AP-7K3M-9Q2', 'staff-1', ev({ id: 'a2', type: 'enquiry.assigned' }))).toBe(true);
    expect((await repo.getEnquiry('AP-7K3M-9Q2'))!.assignedTo).toEqual(['staff-1']);
    expect(await repo.assignEnquiry('AP-MISS-000', 'staff-1', ev({ id: 'a3' }))).toBe(false);
    expect(repo.auditEvents.map((e) => e.id)).toEqual(['e1', 'a1', 'a2']);
  });
  it('audit events are append-only and frozen copies', async () => {
    const repo = new InMemoryRepository();
    await repo.createEnquiry(record(), ev({ meta: { a: 'b' } }));
    const snapshot = repo.auditEvents as AuditEvent[];
    snapshot.pop();
    expect(repo.auditEvents).toHaveLength(1);
  });
  it('rejects audit events whose metadata looks like personal information, and then writes nothing', async () => {
    const repo = new InMemoryRepository();
    await expect(repo.createEnquiry(record(), ev({ meta: { email: 'a@b.invalid' } }))).rejects.toThrow();
    expect(repo.enquiryCount).toBe(0);
    expect(repo.auditEvents).toHaveLength(0);
  });
  it('manages document records and state with audit', async () => {
    const repo = new InMemoryRepository();
    await repo.addDocument(doc(), ev({ id: 'd-a' }));
    await expect(repo.addDocument(doc(), ev({ id: 'd-b' }))).rejects.toThrow('duplicate document id');
    expect(await repo.setDocumentState('d1', 'quarantined', ev({ id: 'd-c' }))).toBe(true);
    expect((await repo.getDocument('d1'))!.state).toBe('quarantined');
    expect(await repo.setDocumentState('nope', 'released', ev({ id: 'd-d' }))).toBe(false);
    expect(repo.auditEvents.map((e) => e.id)).toEqual(['d-a', 'd-c']);
  });
});
