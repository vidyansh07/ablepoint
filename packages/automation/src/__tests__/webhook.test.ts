import { describe, expect, it } from 'vitest';
import { acceptWebhook, InMemoryReplayStore, MAX_SKEW_SECONDS, replayKey, signWebhook, verifyWebhook } from '../webhook';

const secret = 'test-secret-synthetic';
const body = '{"event":"enquiry.created","id":"evt_1"}';
const now = new Date('2026-11-03T00:00:00Z');
const nowSec = now.getTime() / 1000;
const mk = (ts: number, over: Partial<Parameters<typeof verifyWebhook>[0]> = {}) => ({
  secret,
  body,
  signature: signWebhook(secret, ts, body),
  timestamp: ts,
  now,
  ...over,
});

describe('verifyWebhook', () => {
  it('accepts a correctly signed, fresh request', () => expect(verifyWebhook(mk(nowSec)).ok).toBe(true));
  it('accepts exactly 300 s old (inclusive boundary)', () => expect(verifyWebhook(mk(nowSec - MAX_SKEW_SECONDS)).ok).toBe(true));
  it('rejects 301 s old', () => expect(verifyWebhook(mk(nowSec - 301))).toEqual({ ok: false, reason: 'timestamp_too_old' }));
  it('accepts exactly 300 s in the future', () => expect(verifyWebhook(mk(nowSec + 300)).ok).toBe(true));
  it('rejects 301 s in the future', () => expect(verifyWebhook(mk(nowSec + 301))).toEqual({ ok: false, reason: 'timestamp_in_future' }));
  it('honours a custom skew window', () => expect(verifyWebhook(mk(nowSec - 61, { maxSkewSeconds: 60 }))).toEqual({ ok: false, reason: 'timestamp_too_old' }));
  it('rejects a wrong secret', () => expect(verifyWebhook(mk(nowSec, { secret: 'other' }))).toEqual({ ok: false, reason: 'bad_signature' }));
  it('rejects a tampered body', () => expect(verifyWebhook(mk(nowSec, { body: body + ' ' }))).toEqual({ ok: false, reason: 'bad_signature' }));
  it('binds the timestamp into the signature', () => {
    const sig = signWebhook(secret, nowSec - 10, body);
    expect(verifyWebhook({ ...mk(nowSec), signature: sig })).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('fails closed with no secret configured', () => expect(verifyWebhook(mk(nowSec, { secret: '' }))).toEqual({ ok: false, reason: 'missing_secret' }));
  it('rejects a missing signature', () => expect(verifyWebhook(mk(nowSec, { signature: undefined }))).toEqual({ ok: false, reason: 'missing_signature' }));
  it.each([['abc'], ['12.5'], ['-5'], [''], [undefined]])('rejects invalid timestamp %s', (t) => {
    expect(verifyWebhook(mk(nowSec, { timestamp: t as string | undefined }))).toEqual({ ok: false, reason: 'invalid_timestamp' });
  });
  it('accepts the sha256= prefix and uppercase hex', () => {
    const sig = signWebhook(secret, nowSec, body);
    expect(verifyWebhook(mk(nowSec, { signature: `sha256=${sig.toUpperCase()}` })).ok).toBe(true);
  });
  it.each([['zz'], ['abcd'], ['g'.repeat(64)]])('rejects malformed signature %s without throwing', (s) => {
    expect(verifyWebhook(mk(nowSec, { signature: s }))).toEqual({ ok: false, reason: 'bad_signature' });
  });
  it('accepts a timestamp supplied as a string', () => expect(verifyWebhook(mk(nowSec, { timestamp: String(nowSec) })).ok).toBe(true));
});

describe('replay protection', () => {
  it('derives different keys for different timestamps', () => {
    const sig = signWebhook(secret, 1, body);
    expect(replayKey(1, sig)).not.toBe(replayKey(2, sig));
  });
  it('rejects the same delivery the second time', () => {
    const store = new InMemoryReplayStore();
    const req = mk(nowSec);
    expect(acceptWebhook(req, store).ok).toBe(true);
    expect(acceptWebhook(req, store)).toEqual({ ok: false, reason: 'replayed' });
  });
  it('allows the key again after the TTL has expired', () => {
    const store = new InMemoryReplayStore();
    expect(store.checkAndRecord('k', now, 10)).toBe(true);
    expect(store.checkAndRecord('k', new Date(now.getTime() + 9_000), 10)).toBe(false);
    expect(store.checkAndRecord('k', new Date(now.getTime() + 10_000), 10)).toBe(true);
  });
  it('purges expired keys so the store cannot grow without bound', () => {
    const store = new InMemoryReplayStore();
    store.checkAndRecord('a', now, 1);
    store.checkAndRecord('b', new Date(now.getTime() + 5_000), 1);
    expect(store.size).toBe(1);
  });
  it('does not record invalid requests', () => {
    const store = new InMemoryReplayStore();
    acceptWebhook(mk(nowSec, { secret: 'wrong' }), store);
    expect(store.size).toBe(0);
  });
});
