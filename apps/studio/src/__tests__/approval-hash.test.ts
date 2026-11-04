import { approvalFields, contentHash, isApprovalCurrent, isVisible, type Reviewable } from '@ablepoint/schemas';
import { describe, expect, it } from 'vitest';
import { approveAvailability, buildApprovalPatch, type ApproveContext } from '../approve-logic';
import { approvalIsStale, asReviewable, siteGateWouldShow, validateNotStaleApproval } from '../validation';
import { findField, runValidation } from './helpers';

const REVIEWER = 'u-reviewer1';
const T0 = new Date('2026-11-01T00:00:00Z');

/** A realistic raw Sanity document as the build fetches it (all fields, references unresolved). */
const rawDraft = () => ({
  _id: 'drafts.service-sil',
  _type: 'service',
  _rev: 'rev-draft-1',
  _createdAt: '2026-10-01T00:00:00Z',
  _updatedAt: '2026-10-30T00:00:00Z',
  title: 'Supported independent living',
  slug: { _type: 'slug', current: 'supported-independent-living' },
  summary: 'Help with day-to-day tasks at home.',
  provides: ['Personal care', 'Meals'],
  fundingNote: [{ _type: 'block', _key: 'k1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'Ask us about funding.', marks: [] }] }],
  faqs: [{ _type: 'reference', _key: 'f1', _ref: 'faq-1' }],
  reviewState: 'inReview',
  missingFacts: ['Regions with SIL homes'],
});

const approve = (doc: Record<string, unknown>, by = REVIEWER, at = T0) => ({ ...doc, ...approvalFields(doc, by, at) });
const gate = (doc: Record<string, unknown>) => isApprovalCurrent(asReviewable(doc));

describe('approval by content hash (replaces the timestamp logic)', () => {
  it('a document approved via approvalFields is shown by the real gate', () => {
    const doc = approve(rawDraft());
    expect(gate(doc)).toBe(true);
    expect(siteGateWouldShow(doc)).toBe(true);
    expect(isVisible(asReviewable(doc), 'production')).toBe(true);
    expect(approvalIsStale(doc)).toBe(false);
    expect(validateNotStaleApproval(doc)).toBe(true);
  });

  it('saving and publishing afterwards (new _rev, later _updatedAt) does not hide it', () => {
    const approved = approve(rawDraft());
    const afterPublish = { ...approved, _id: 'service-sil', _rev: 'rev-published-9', _updatedAt: '2026-11-01T00:00:07Z' };
    expect(gate(afterPublish)).toBe(true);
    const muchLater = { ...approved, _rev: 'rev-x', _updatedAt: '2027-05-01T00:00:00Z' };
    expect(gate(muchLater)).toBe(true);
  });

  it('a published copy hashes identically to the draft it came from (_id drafts.x vs x)', () => {
    const draft = rawDraft();
    const published = { ...draft, _id: 'service-sil', _rev: 'other', _updatedAt: '2026-11-02T00:00:00Z' };
    expect(contentHash(draft)).toBe(contentHash(published));
    expect(gate({ ...published, ...approvalFields(draft, REVIEWER, T0) })).toBe(true);
  });

  it('review bookkeeping changes do not withdraw approval', () => {
    const approved = approve(rawDraft());
    expect(gate({ ...approved, reviewedAt: '2026-11-05T00:00:00Z', nextReviewDue: '2027-05-05', missingFacts: [] })).toBe(true);
  });

  describe('editing any content field hides it', () => {
    const approved = approve(rawDraft());
    const edits: Array<[string, (d: Record<string, unknown>) => Record<string, unknown>]> = [
      ['title', (d) => ({ ...d, title: 'Supported independent living (SIL)' })],
      ['slug', (d) => ({ ...d, slug: { _type: 'slug', current: 'sil' } })],
      ['summary, one character', (d) => ({ ...d, summary: `${d.summary as string}.` })],
      ['array item', (d) => ({ ...d, provides: ['Personal care', 'Meals', 'Transport'] })],
      ['array item removed', (d) => ({ ...d, provides: ['Personal care'] })],
      ['rich text', (d) => ({ ...d, fundingNote: [{ _type: 'block', _key: 'k1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'We can fund this.', marks: [] }] }] })],
      ['reference target', (d) => ({ ...d, faqs: [{ _type: 'reference', _key: 'f1', _ref: 'faq-2' }] })],
      ['new field', (d) => ({ ...d, whoFor: 'Anyone' })],
      ['removed field', (d) => { const { summary: _s, ...rest } = d; return rest; }],
      ['document type', (d) => ({ ...d, _type: 'page' })],
    ];
    it.each(edits)('%s', (_name, edit) => {
      const edited = edit(approved);
      expect(gate(edited)).toBe(false);
      expect(siteGateWouldShow(edited)).toBe(false);
      expect(isVisible(asReviewable(edited), 'production')).toBe(false);
      expect(isVisible(asReviewable(edited), 'staging')).toBe(true);
      expect(approvalIsStale(edited)).toBe(true);
      expect(validateNotStaleApproval(edited)).toMatch(/edited after it was approved/);
    });
  });

  it('references are hashed unresolved: changing the referenced document does not change this hash', () => {
    const doc = approve(rawDraft());
    // The referenced FAQ's own content is not part of this document, so this stays approved here.
    expect(gate({ ...doc })).toBe(true);
    // A different reference target does.
    expect(gate({ ...doc, faqs: [{ _type: 'reference', _key: 'f1', _ref: 'faq-9' }] })).toBe(false);
  });

  it('a hash copied from another document does not approve this one', () => {
    const other = approve({ ...rawDraft(), _id: 'drafts.other', title: 'Short term accommodation' });
    const forged = { ...rawDraft(), reviewState: 'approved', approvedBy: REVIEWER, approvedAt: T0.toISOString(), approvedContentHash: other.approvedContentHash };
    expect(gate(forged)).toBe(false);
    expect(approvalIsStale(forged)).toBe(true);
  });

  it('approval details without the hash, or with a missing approver, never show', () => {
    const approved = approve(rawDraft());
    expect(gate({ ...approved, approvedContentHash: undefined })).toBe(false);
    expect(gate({ ...approved, approvedBy: undefined })).toBe(false);
    expect(gate({ ...approved, approvedAt: undefined })).toBe(false);
    expect(gate({ ...approved, reviewState: 'inReview' })).toBe(false);
  });

  it('siteGateWouldShow hashes the real document, so a hand-built Reviewable is not enough', () => {
    const approved = approve(rawDraft());
    const handBuilt: Reviewable = { reviewState: 'approved', approvedBy: REVIEWER, approvedAt: T0.toISOString(), approvedContentHash: approved.approvedContentHash, updatedAt: '2026-11-01T00:00:00Z' };
    expect(isApprovalCurrent(handBuilt)).toBe(false); // hash of the 6-field view model differs from the real document's
    expect(siteGateWouldShow(approved)).toBe(true);
  });

  it('the hash is stable across key order and ignores undefined', () => {
    const a = rawDraft();
    const shuffled = Object.fromEntries(Object.entries(a).reverse());
    expect(contentHash(shuffled)).toBe(contentHash(a));
    expect(contentHash({ ...a, extra: undefined })).toBe(contentHash(a));
  });
});

describe('Studio validation reflects the hash gate', () => {
  const reviewState = findField('service', 'reviewState');
  const env = process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS;

  it('approved without an approval record is an error; with the action it is accepted', () => {
    process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = REVIEWER;
    try {
      const raw = rawDraft();
      expect(runValidation(reviewState, 'approved', { document: { ...raw, reviewState: 'approved' } }).errors.length).toBeGreaterThan(0);
      const ok = approve(raw);
      expect(runValidation(reviewState, 'approved', { document: ok }).errors).toEqual([]);
      expect(runValidation(reviewState, 'approved', { document: ok }).warnings).toEqual([]);
    } finally {
      if (env === undefined) delete process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS;
      else process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = env;
    }
  });
  it('warns when content changed after approval', () => {
    process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = REVIEWER;
    try {
      const edited = { ...approve(rawDraft()), title: 'Changed after approval' };
      const r = runValidation(reviewState, 'approved', { document: edited });
      expect(r.warnings.join()).toMatch(/edited after it was approved/);
      expect(r.errors).toEqual([]);
    } finally {
      if (env === undefined) delete process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS;
      else process.env.SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS = env;
    }
  });
  it('the approval record field is hidden and read-only on every document type', () => {
    for (const t of ['service', 'region', 'guide', 'vacancy', 'siteSettings', 'redirect']) {
      const f = findField(t, 'approvedContentHash');
      expect(f.readOnly).toBe(true);
      expect(f.hidden).toBe(true);
      expect(f.type).toBe('string');
    }
  });
});

describe('Approve for publication: availability (pure logic)', () => {
  const inReview = rawDraft();
  const ctx = (over: Partial<ApproveContext> = {}): ApproveContext => ({ userId: REVIEWER, allowList: [REVIEWER, 'u-reviewer2'], doc: inReview, isVersion: false, ...over });

  it('is enabled for a listed reviewer on a document in review', () => {
    const a = approveAvailability(ctx());
    expect(a.enabled).toBe(true);
  });
  it('is disabled with a clear reason when the allow-list is empty', () => {
    const a = approveAvailability(ctx({ allowList: [] }));
    expect(a).toMatchObject({ enabled: false });
    expect(a.enabled === false && a.reason).toMatch(/SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS is empty/);
  });
  it('is disabled for unlisted and signed-out users', () => {
    const a = approveAvailability(ctx({ userId: 'u-editor' }));
    expect(a.enabled === false && a.reason).toMatch(/Only a listed compliance reviewer/);
    const b = approveAvailability(ctx({ userId: undefined }));
    expect(b.enabled === false && b.reason).toMatch(/Sign in/);
  });
  it('checks the allow-list before anything else, so an unlisted user learns nothing about the document', () => {
    const a = approveAvailability(ctx({ userId: 'u-editor', doc: null }));
    expect(a.enabled === false && a.reason).toMatch(/Only a listed compliance reviewer/);
  });
  it('requires editorial review first', () => {
    const a = approveAvailability(ctx({ doc: { ...inReview, reviewState: 'draft' } }));
    expect(a.enabled === false && a.reason).toMatch(/In review/);
  });
  it('is disabled when already approved and unchanged; enabled again after an edit', () => {
    const approved = approve(rawDraft());
    const same = approveAvailability(ctx({ doc: approved }));
    expect(same.enabled === false && same.reason).toMatch(/Already approved/);
    const edited = approveAvailability(ctx({ doc: { ...approved, title: 'Edited' } }));
    expect(edited.enabled).toBe(true);
    expect(edited.enabled && edited.title).toMatch(/Approve it again/);
  });
  it('is disabled for release versions, missing documents and when saving is blocked', () => {
    expect(approveAvailability(ctx({ isVersion: true })).enabled).toBe(false);
    expect(approveAvailability(ctx({ doc: null })).enabled).toBe(false);
    const busy = approveAvailability(ctx({ patchDisabled: 'NOT_READY' }));
    expect(busy.enabled === false && busy.reason).toMatch(/loading/);
    const blocked = approveAvailability(ctx({ patchDisabled: 'LIVE_EDIT_ENABLED' }));
    expect(blocked.enabled === false && blocked.reason).toMatch(/LIVE_EDIT_ENABLED/);
    expect(approveAvailability(ctx({ patchDisabled: false })).enabled).toBe(true);
  });
  it('writes exactly the four approval fields, hashed over the whole document', () => {
    const patch = buildApprovalPatch(inReview, REVIEWER, T0);
    expect(Object.keys(patch).sort()).toEqual(['approvedAt', 'approvedBy', 'approvedContentHash', 'reviewState']);
    expect(patch).toEqual({ reviewState: 'approved', approvedBy: REVIEWER, approvedAt: '2026-11-01T00:00:00.000Z', approvedContentHash: contentHash(inReview) });
    expect(gate({ ...inReview, ...patch })).toBe(true);
  });
  it('the approval patch itself does not change the hash', () => {
    const patch = buildApprovalPatch(inReview, REVIEWER, T0);
    expect(contentHash({ ...inReview, ...patch })).toBe(contentHash(inReview));
  });
  it('re-approval after an edit replaces the hash', () => {
    const first = approve(rawDraft());
    const edited = { ...first, title: 'Edited' };
    const second = { ...edited, ...buildApprovalPatch(edited, REVIEWER, new Date('2026-11-02T00:00:00Z')) };
    expect(second.approvedContentHash).not.toBe(first.approvedContentHash);
    expect(gate(second)).toBe(true);
  });
});
