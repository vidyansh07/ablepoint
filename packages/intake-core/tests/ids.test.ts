import { describe, expect, it } from 'vitest';
import { CASE_REF_ALPHABET, CASE_REF_PATTERN, generateCaseRef, isCaseRef, parseCaseRef } from '../src/ids';

describe('case_ref generation', () => {
  it('matches the AP-XXXX-XXX format', () => {
    for (let i = 0; i < 200; i++) expect(generateCaseRef()).toMatch(CASE_REF_PATTERN);
  });
  it('never uses ambiguous characters I, L, O or U', () => {
    expect(CASE_REF_ALPHABET).not.toMatch(/[ILOU]/);
    for (let i = 0; i < 500; i++) expect(generateCaseRef().slice(3)).not.toMatch(/[ILOU]/);
  });
  it('alphabet is exactly 32 symbols (so byte & 31 is unbiased)', () => expect(CASE_REF_ALPHABET).toHaveLength(32));
  it('is non-sequential and effectively unique across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateCaseRef());
    expect(seen.size).toBeGreaterThan(4990); // 35 bits: birthday collisions in 5000 draws are very unlikely
  });
  it('uses the injected random source deterministically', () => {
    const fixed = (n: number) => new Uint8Array(n).fill(0);
    expect(generateCaseRef(fixed)).toBe('AP-0000-000');
    const seq = () => Uint8Array.from([7, 19, 3, 20, 9, 23, 2]);
    expect(generateCaseRef(seq)).toBe('AP-7K3M-9Q2'); // index 19=K, 20=M, 23=Q in the Crockford alphabet
  });
  it('masks high bits (bytes above 31 still map into the alphabet)', () => {
    const high = () => new Uint8Array(7).fill(0xff);
    expect(generateCaseRef(high)).toBe('AP-ZZZZ-ZZZ');
  });
  it('rejects a random source that returns too few bytes', () => {
    expect(() => generateCaseRef(() => new Uint8Array(3))).toThrow();
  });
});

describe('case_ref parsing', () => {
  it('accepts canonical references', () => expect(isCaseRef('AP-7K3M-9Q2')).toBe(true));
  it('rejects wrong shape, case and excluded letters', () => {
    for (const bad of ['ap-7k3m-9q2', 'AP-7K3M9Q2', 'AP-7K3M-9Q', 'AP-7K3M-9Q22', 'XX-7K3M-9Q2', 'AP-7I3M-9Q2', 'AP-7K3M-9U2', '']) expect(isCaseRef(bad)).toBe(false);
  });
  it('parses phone-dictated input with Crockford corrections', () => {
    expect(parseCaseRef('  ap-7k3m-9q2 ')).toBe('AP-7K3M-9Q2');
    expect(parseCaseRef('AP-OOOO-OOO')).toBe('AP-0000-000');
    expect(parseCaseRef('AP-I1L1-1IL')).toBe('AP-1111-111');
  });
  it('returns null for unparseable input (including U)', () => {
    expect(parseCaseRef('AP-7U3M-9Q2')).toBeNull();
    expect(parseCaseRef('hello')).toBeNull();
  });
});
