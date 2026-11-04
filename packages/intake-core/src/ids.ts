import { randomBytes } from 'node:crypto';

/** Crockford base32: digits + letters without I, L, O, U (no look-alikes, no accidental words from U). */
export const CASE_REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CASE_REF_PATTERN = /^AP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/;

export type RandomBytesFn = (size: number) => Uint8Array;

/**
 * Non-sequential, non-guessable case reference such as `AP-7K3M-9Q2` (7 symbols = 35 bits).
 * 32 symbols divide 256 evenly, so `byte & 31` is unbiased (no modulo bias).
 *
 * 35 bits is a *reference*, not a secret: it must never be the only thing protecting access to a case.
 * Uniqueness is enforced by the database (UNIQUE) and callers retry on collision.
 */
export function generateCaseRef(rand: RandomBytesFn = randomBytes): string {
  const bytes = rand(7);
  if (bytes.length < 7) throw new Error('random source returned too few bytes');
  const symbols: string[] = [];
  for (let i = 0; i < 7; i++) symbols.push(CASE_REF_ALPHABET.charAt((bytes[i] ?? 0) & 31));
  return `AP-${symbols.slice(0, 4).join('')}-${symbols.slice(4).join('')}`;
}

export function isCaseRef(value: string): boolean {
  return CASE_REF_PATTERN.test(value);
}

/**
 * Parse user-typed input (e.g. read over the phone). Crockford decoding rules: case-insensitive,
 * O→0, I/L→1. Returns the canonical reference or null. U is not in the alphabet and is rejected.
 */
export function parseCaseRef(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  return isCaseRef(cleaned) ? cleaned : null;
}
