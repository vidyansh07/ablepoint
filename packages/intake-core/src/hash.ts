import { createHash } from 'node:crypto';

/** SHA-256 hex of a UTF-8 string. Used to key replay caches, rate limits and idempotency without storing raw values. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
