import { describe, expect, it } from 'vitest';
import { approvalFields, canonicalContent, contentHash, isApprovalCurrent, isVisible, sha256Hex } from '../index';

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('matches the FIPS 180-4 vector for %j', (input, hex) => expect(sha256Hex(input)).toBe(hex));
  it('hashes multi-block and non-ASCII input like the platform SHA-256 (Web Crypto)', async () => {
    for (const t of ['a'.repeat(1000), 'AblePoint – café \u{1F600}', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64)]) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(sha256Hex(t)).toBe(hex);
    }
  });
});

describe('contentHash', () => {
  const doc = { title: 'Core support', body: ['a', 'b'], nested: { z: 1, a: 2 } };
  it('is independent of key order', () => {
    expect(contentHash(doc)).toBe(contentHash({ nested: { a: 2, z: 1 }, body: ['a', 'b'], title: 'Core support' }));
  });
  it('changes when content changes, including array order', () => {
    expect(contentHash(doc)).not.toBe(contentHash({ ...doc, title: 'Core supports' }));
    expect(contentHash(doc)).not.toBe(contentHash({ ...doc, body: ['b', 'a'] }));
  });
  it('ignores review bookkeeping and Sanity system fields', () => {
    const noisy = { ...doc, reviewState: 'approved', approvedBy: 'jo', approvedAt: 'x', approvedContentHash: 'y', reviewedAt: 'z', nextReviewDue: 'n', missingFacts: ['m'], updatedAt: 't', _id: 'i', _rev: 'r', _createdAt: 'c', _updatedAt: 'u' };
    expect(contentHash(noisy)).toBe(contentHash(doc));
  });
  it('treats undefined as absent', () => expect(contentHash({ ...doc, extra: undefined })).toBe(contentHash(doc)));
  it('canonical form is stable JSON with sorted keys', () => expect(canonicalContent({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}'));
});

describe('approval lifecycle', () => {
  const draft = { reviewState: 'draft' as const, updatedAt: '2026-11-01T00:00:00Z', title: 'Core support', provides: ['x'] };
  it('approving makes the document current and visible in production', () => {
    const approved = { ...draft, ...approvalFields(draft, 'jo.reviewer', new Date('2026-11-02T00:00:00Z')) };
    expect(isApprovalCurrent(approved)).toBe(true);
    expect(isVisible(approved, 'production')).toBe(true);
  });
  it('saving the approval AFTER the content timestamp does not invalidate it (the flaw this replaces)', () => {
    const approved = { ...draft, ...approvalFields(draft, 'jo', new Date('2026-11-02T00:00:00Z')), updatedAt: '2026-11-02T00:00:05Z' };
    expect(isApprovalCurrent(approved)).toBe(true);
  });
  it('any content edit after approval withdraws it, even with a newer approval time', () => {
    const approved = { ...draft, ...approvalFields(draft, 'jo', new Date('2026-11-02T00:00:00Z')) };
    expect(isApprovalCurrent({ ...approved, title: 'Core support (edited)' })).toBe(false);
    expect(isApprovalCurrent({ ...approved, provides: ['x', 'y'] })).toBe(false);
    expect(isVisible({ ...approved, title: 'changed' }, 'production')).toBe(false);
  });
  it('re-approval after an edit restores visibility', () => {
    const edited = { ...draft, title: 'Core support (edited)' };
    expect(isApprovalCurrent({ ...edited, ...approvalFields(edited, 'jo', new Date()) })).toBe(true);
  });
  it('flipping reviewState back to draft hides the document', () => {
    const approved = { ...draft, ...approvalFields(draft, 'jo', new Date()) };
    expect(isApprovalCurrent({ ...approved, reviewState: 'draft' })).toBe(false);
  });
  it('copying a hash from another document does not approve this one', () => {
    const other = { ...draft, title: 'Other' };
    const stolen = approvalFields(other, 'jo', new Date());
    expect(isApprovalCurrent({ ...draft, ...stolen })).toBe(false);
  });
});
