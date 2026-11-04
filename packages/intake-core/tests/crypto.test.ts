import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoError, StaticKeyProvider, decryptField, encryptField, envelopeKeyId, needsRotation, parseEnvelope, rotateField } from '../src/crypto';

const key = () => new Uint8Array(randomBytes(32));
const ctx = { field: 'ndisNumberEnc', recordId: 'AP-7K3M-9Q2' };
const SECRET = 'CANARY-NDIS-430000000';

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ name: 'CryptoError', code });
}

describe('field-level AES-256-GCM', () => {
  const provider = () => new StaticKeyProvider({ k1: key() }, 'k1');

  it('round-trips and uses the v1.<keyId>.<iv>.<ct>.<tag> envelope', async () => {
    const p = provider();
    const env = await encryptField(SECRET, ctx, p);
    expect(env.split('.')).toHaveLength(5);
    expect(env.startsWith('v1.k1.')).toBe(true);
    expect(await decryptField(env, ctx, p)).toBe(SECRET);
  });
  it('does not contain the plaintext', async () => {
    const env = await encryptField(SECRET, ctx, provider());
    expect(env).not.toContain('430000000');
    expect(env).not.toContain('CANARY');
  });
  it('uses a fresh IV each time (same plaintext, different ciphertext)', async () => {
    const p = provider();
    const a = await encryptField(SECRET, ctx, p);
    const b = await encryptField(SECRET, ctx, p);
    expect(a).not.toBe(b);
    expect(parseEnvelope(a).iv.equals(parseEnvelope(b).iv)).toBe(false);
  });
  it('round-trips empty, unicode and long values', async () => {
    const p = provider();
    for (const v of ['', 'Zoë 🙂 日本語', 'x'.repeat(30_000)]) expect(await decryptField(await encryptField(v, ctx, p), ctx, p)).toBe(v);
  });
  it('detects ciphertext tampering', async () => {
    const p = provider();
    const [v, id, iv, ct, tag] = (await encryptField(SECRET, ctx, p)).split('.') as [string, string, string, string, string];
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    await expectCode(decryptField([v, id, iv, flipped.toString('base64url'), tag].join('.'), ctx, p), 'auth_failed');
  });
  it('detects tag and IV tampering', async () => {
    const p = provider();
    const [v, id, iv, ct, tag] = (await encryptField(SECRET, ctx, p)).split('.') as [string, string, string, string, string];
    const t = Buffer.from(tag, 'base64url');
    t[0] = (t[0] ?? 0) ^ 1;
    await expectCode(decryptField([v, id, iv, ct, t.toString('base64url')].join('.'), ctx, p), 'auth_failed');
    const i = Buffer.from(iv, 'base64url');
    i[0] = (i[0] ?? 0) ^ 1;
    await expectCode(decryptField([v, id, i.toString('base64url'), ct, tag].join('.'), ctx, p), 'auth_failed');
  });
  it('binds ciphertext to its record: moving it to another case fails', async () => {
    const p = provider();
    const env = await encryptField(SECRET, ctx, p);
    await expectCode(decryptField(env, { ...ctx, recordId: 'AP-AAAA-AAA' }, p), 'auth_failed');
  });
  it('binds ciphertext to its field: moving it to another column fails', async () => {
    const p = provider();
    const env = await encryptField(SECRET, ctx, p);
    await expectCode(decryptField(env, { ...ctx, field: 'dobEnc' }, p), 'auth_failed');
  });
  it('binds the key id: relabelling an envelope to another key fails', async () => {
    const p = new StaticKeyProvider({ k1: key(), k2: key() }, 'k1');
    const env = await encryptField(SECRET, ctx, p);
    await expectCode(decryptField(env.replace('v1.k1.', 'v1.k2.'), ctx, p), 'auth_failed');
  });
  it('fails with the wrong key', async () => {
    const env = await encryptField(SECRET, ctx, provider());
    await expectCode(decryptField(env, ctx, provider()), 'auth_failed');
  });
  it('rejects malformed envelopes', async () => {
    const p = provider();
    for (const bad of ['', 'garbage', 'v2.k1.a.b.c', 'v1.k1.a.b', 'v1.k1.AAAA.AAAA.AAAA', 'v1..a.b.c']) {
      await expect(decryptField(bad, ctx, p)).rejects.toBeInstanceOf(CryptoError);
    }
  });
  it('rejects oversized envelopes and plaintext', async () => {
    const p = provider();
    await expectCode(decryptField('v1.k1.' + 'A'.repeat(70_000), ctx, p), 'too_large');
    await expectCode(encryptField('x'.repeat(33 * 1024), ctx, p), 'too_large');
  });
  it('rejects empty context', async () => {
    const p = provider();
    await expectCode(encryptField('x', { field: '', recordId: 'r' }, p), 'bad_context');
    await expectCode(encryptField('x', { field: 'f', recordId: '' }, p), 'bad_context');
  });
  it('refuses keys of the wrong length', async () => {
    const p = new StaticKeyProvider({ short: new Uint8Array(16) }, 'short');
    await expectCode(encryptField('x', ctx, p), 'bad_key_length');
  });
  it('refuses unknown key ids and unsafe key ids', async () => {
    const p = provider();
    const env = await encryptField(SECRET, ctx, p);
    await expectCode(decryptField(env.replace('v1.k1.', 'v1.zz.'), ctx, p), 'unknown_key');
    await expectCode(encryptField('x', ctx, new StaticKeyProvider({ 'a.b': key() }, 'a.b')), 'bad_key_id');
  });
  it('error messages never contain plaintext or key material', async () => {
    const p = provider();
    const env = await encryptField(SECRET, ctx, p);
    try {
      await decryptField(env, { ...ctx, recordId: 'AP-AAAA-AAA' }, p);
    } catch (e) {
      expect(String(e)).not.toContain('CANARY');
      expect((e as Error).message).toBe('crypto error: auth_failed');
    }
  });
});

describe('key rotation', () => {
  it('re-encrypts under the new current key and old envelopes still decrypt until rotated', async () => {
    const p = new StaticKeyProvider({ k1: key(), k2: key() }, 'k1');
    const old = await encryptField(SECRET, ctx, p);
    p.setCurrent('k2');
    expect(await decryptField(old, ctx, p)).toBe(SECRET); // old key retained for reads
    expect(needsRotation(old, p)).toBe(true);
    const rotated = await rotateField(old, ctx, p);
    expect(envelopeKeyId(rotated)).toBe('k2');
    expect(needsRotation(rotated, p)).toBe(false);
    expect(await decryptField(rotated, ctx, p)).toBe(SECRET);
    expect(rotated).not.toBe(old);
  });
  it('is a no-op when already on the current key', async () => {
    const p = new StaticKeyProvider({ k1: key() }, 'k1');
    const env = await encryptField(SECRET, ctx, p);
    expect(await rotateField(env, ctx, p)).toBe(env);
  });
  it('after the old key is retired, old envelopes can no longer be read', async () => {
    const k1 = key();
    const before = new StaticKeyProvider({ k1 }, 'k1');
    const old = await encryptField(SECRET, ctx, before);
    const after = new StaticKeyProvider({ k2: key() }, 'k2');
    await expectCode(decryptField(old, ctx, after), 'unknown_key');
  });
  it('rotation preserves the context binding', async () => {
    const p = new StaticKeyProvider({ k1: key(), k2: key() }, 'k1');
    const old = await encryptField(SECRET, ctx, p);
    p.setCurrent('k2');
    await expectCode(rotateField(old, { ...ctx, recordId: 'AP-AAAA-AAA' }, p), 'auth_failed');
  });
});
