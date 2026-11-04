import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Field-level AES-256-GCM encryption for C3 data (NDIS number, support needs, DOB) — docs/05 §3.
 * This is *in addition to* storage encryption. Keys come from an injected KeyProvider; a real KMS
 * adapter does not exist yet (see README).
 *
 * Envelope: `v1.<keyId>.<iv>.<ciphertext>.<tag>` (base64url segments).
 * AAD binds version, key id, field name and record id, so a ciphertext cannot be moved to another
 * field or another record without failing authentication.
 *
 * IV: 96-bit random per encryption. Random 96-bit IVs are safe up to ~2^32 encryptions per key;
 * rotate keys long before that (a participant-intake workload is orders of magnitude below it).
 */

export const ENVELOPE_VERSION = 'v1';
export const KEY_LENGTH_BYTES = 32;
export const IV_LENGTH_BYTES = 12;
export const MAX_PLAINTEXT_BYTES = 32 * 1024;
export const MAX_ENVELOPE_CHARS = 64 * 1024;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface KeyProvider {
  currentKeyId(): string;
  /** Raw 32-byte key. Throw (or reject) if the key id is unknown or revoked. */
  getKey(keyId: string): Promise<Uint8Array> | Uint8Array;
}

export interface FieldContext {
  field: string;
  recordId: string;
}

export type CryptoErrorCode = 'bad_envelope' | 'bad_key_id' | 'unknown_key' | 'bad_key_length' | 'auth_failed' | 'bad_context' | 'too_large';

/** Never carries plaintext, ciphertext or key material in its message. */
export class CryptoError extends Error {
  constructor(readonly code: CryptoErrorCode) {
    super(`crypto error: ${code}`);
    this.name = 'CryptoError';
  }
}

const b64u = (buf: Uint8Array): string => Buffer.from(buf).toString('base64url');
const fromB64u = (s: string): Buffer => Buffer.from(s, 'base64url');

function aad(keyId: string, ctx: FieldContext): Buffer {
  return Buffer.from(JSON.stringify([ENVELOPE_VERSION, keyId, ctx.field, ctx.recordId]), 'utf8');
}

function checkContext(ctx: FieldContext): void {
  if (!ctx.field || !ctx.recordId) throw new CryptoError('bad_context');
}

async function loadKey(provider: KeyProvider, keyId: string): Promise<Uint8Array> {
  if (!KEY_ID_PATTERN.test(keyId)) throw new CryptoError('bad_key_id');
  let key: Uint8Array;
  try {
    key = await provider.getKey(keyId);
  } catch {
    throw new CryptoError('unknown_key');
  }
  if (key.length !== KEY_LENGTH_BYTES) throw new CryptoError('bad_key_length');
  return key;
}

export async function encryptField(plaintext: string, ctx: FieldContext, provider: KeyProvider): Promise<string> {
  checkContext(ctx);
  const data = Buffer.from(plaintext, 'utf8');
  if (data.length > MAX_PLAINTEXT_BYTES) throw new CryptoError('too_large');
  const keyId = provider.currentKeyId();
  const key = await loadKey(provider, keyId);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(keyId, ctx));
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, keyId, b64u(iv), b64u(ct), b64u(tag)].join('.');
}

interface ParsedEnvelope {
  keyId: string;
  iv: Buffer;
  ct: Buffer;
  tag: Buffer;
}

export function parseEnvelope(envelope: string): ParsedEnvelope {
  if (envelope.length > MAX_ENVELOPE_CHARS) throw new CryptoError('too_large');
  const parts = envelope.split('.');
  if (parts.length !== 5 || parts[0] !== ENVELOPE_VERSION) throw new CryptoError('bad_envelope');
  const [, keyId, ivS, ctS, tagS] = parts as [string, string, string, string, string];
  if (!KEY_ID_PATTERN.test(keyId)) throw new CryptoError('bad_key_id');
  const iv = fromB64u(ivS);
  const tag = fromB64u(tagS);
  if (iv.length !== IV_LENGTH_BYTES || tag.length !== 16) throw new CryptoError('bad_envelope');
  return { keyId, iv, ct: fromB64u(ctS), tag };
}

export function envelopeKeyId(envelope: string): string {
  return parseEnvelope(envelope).keyId;
}

export async function decryptField(envelope: string, ctx: FieldContext, provider: KeyProvider): Promise<string> {
  checkContext(ctx);
  const { keyId, iv, ct, tag } = parseEnvelope(envelope);
  const key = await loadKey(provider, keyId);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(keyId, ctx));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, wrong context, or tampering: indistinguishable on purpose.
    throw new CryptoError('auth_failed');
  }
}

export function needsRotation(envelope: string, provider: KeyProvider): boolean {
  return envelopeKeyId(envelope) !== provider.currentKeyId();
}

/** Re-encrypt under the current key. Returns the input unchanged if it is already current. */
export async function rotateField(envelope: string, ctx: FieldContext, provider: KeyProvider): Promise<string> {
  if (!needsRotation(envelope, provider)) return envelope;
  const plain = await decryptField(envelope, ctx, provider);
  return encryptField(plain, ctx, provider);
}

/**
 * TEST DOUBLE. Holds raw keys in memory. A production KeyProvider must wrap a KMS/HSM and never
 * expose raw key bytes to application memory for longer than a request (not built yet).
 */
export class StaticKeyProvider implements KeyProvider {
  constructor(
    private readonly keys: Record<string, Uint8Array>,
    private current: string,
  ) {}
  currentKeyId(): string {
    return this.current;
  }
  setCurrent(keyId: string): void {
    this.current = keyId;
  }
  getKey(keyId: string): Uint8Array {
    const key = this.keys[keyId];
    if (!key) throw new Error('unknown key');
    return key;
  }
}
