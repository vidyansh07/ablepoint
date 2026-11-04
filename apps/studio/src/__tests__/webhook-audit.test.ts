import { describe, expect, it } from 'vitest';
import { publishedId, toAuditRecord } from '../webhook-audit';

const received = new Date('2026-11-20T01:02:03Z');
const base = { _id: 'abc123', _type: 'service', _rev: 'rev-1', _updatedAt: '2026-11-19T10:00:00Z', reviewState: 'approved', actor: 'u12345' };

describe('toAuditRecord', () => {
  it('maps a publish payload to exactly the audit fields', () => {
    const r = toAuditRecord(base, received);
    expect(r).toEqual({
      ok: true,
      record: { docId: 'abc123', docType: 'service', revision: 'rev-1', actor: 'u12345', time: '2026-11-19T10:00:00.000Z', reviewState: 'approved' },
    });
  });
  it('never copies document body content', () => {
    const r = toAuditRecord(
      { ...base, title: 'Secret title', summary: 'Body text', body: [{ _type: 'block' }], consentRef: 'C-1', email: 'a@b.co', phone: '0412345678' },
      received,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.record).sort()).toEqual(['actor', 'docId', 'docType', 'reviewState', 'revision', 'time']);
      const json = JSON.stringify(r.record);
      for (const leak of ['Secret title', 'Body text', 'C-1', 'a@b.co', '0412345678']) expect(json).not.toContain(leak);
    }
  });
  it('strips drafts. and versions. prefixes', () => {
    expect(publishedId('drafts.abc')).toBe('abc');
    expect(publishedId('versions.rel1.abc')).toBe('abc');
    expect(publishedId('abc')).toBe('abc');
    const r = toAuditRecord({ ...base, _id: 'drafts.abc123' }, received);
    expect(r.ok && r.record.docId).toBe('abc123');
  });
  it('fails closed on a missing id or revision', () => {
    expect(toAuditRecord({ ...base, _id: undefined }, received).ok).toBe(false);
    expect(toAuditRecord({ ...base, _id: '  ' }, received).ok).toBe(false);
    expect(toAuditRecord({ ...base, _rev: undefined }, received).ok).toBe(false);
    expect(toAuditRecord(null as never, received).ok).toBe(false);
  });
  it('records an unknown actor rather than guessing', () => {
    const r = toAuditRecord({ ...base, actor: undefined }, received);
    expect(r.ok && r.record.actor).toBe('unknown');
  });
  it('does not accept free text as an actor', () => {
    const r = toAuditRecord({ ...base, actor: 'Robert; DROP TABLE users' }, received);
    expect(r.ok && r.record.actor).toBe('unknown');
    const r2 = toAuditRecord({ ...base, actor: 'x'.repeat(200) }, received);
    expect(r2.ok && r2.record.actor).toBe('unknown');
  });
  it('falls back to the receive time for a missing or invalid timestamp', () => {
    const missing = toAuditRecord({ ...base, _updatedAt: undefined }, received);
    expect(missing.ok && missing.record.time).toBe('2026-11-20T01:02:03.000Z');
    const bad = toAuditRecord({ ...base, _updatedAt: 'not a date' }, received);
    expect(bad.ok && bad.record.time).toBe('2026-11-20T01:02:03.000Z');
  });
  it('normalises the review state', () => {
    for (const s of ['draft', 'inReview', 'approved']) {
      const r = toAuditRecord({ ...base, reviewState: s }, received);
      expect(r.ok && r.record.reviewState).toBe(s);
    }
    const r = toAuditRecord({ ...base, reviewState: 'whatever' }, received);
    expect(r.ok && r.record.reviewState).toBe('unknown');
    const r2 = toAuditRecord({ ...base, reviewState: undefined }, received);
    expect(r2.ok && r2.record.reviewState).toBe('unknown');
  });
  it('tolerates a missing type', () => {
    const r = toAuditRecord({ ...base, _type: undefined }, received);
    expect(r.ok && r.record.docType).toBe('unknown');
  });
});
