import { approvalFields } from '@ablepoint/schemas';
import { describe, expect, it } from 'vitest';
import { evaluateGbpPost, type GbpPostInput } from '../gbp';
import { days, syd } from './helpers';

const now = syd('2026-11-20T10:00');
function approvedPost(text: string): GbpPostInput['content'] {
  const c = { text, updatedAt: '2026-11-18T00:00:00Z' };
  return { ...c, ...approvalFields(c, 'compliance-1', new Date('2026-11-19T00:00:00Z')) };
}
const base: GbpPostInput = {
  content: approvedPost('Our Gosford team is here to help.'),
  profile: { eligible: true, premisesOrServiceAreaVerified: true },
  apiAccessVerified: true,
  now,
};

describe('evaluateGbpPost (A7)', () => {
  it('publishes approved content to an eligible profile when API access is verified', () => expect(evaluateGbpPost(base)).toEqual({ action: 'publish_via_api' }));
  it('routes to the manual checklist while API access is unverified', () => expect(evaluateGbpPost({ ...base, apiAccessVerified: false })).toEqual({ action: 'manual_fallback', reason: 'api_access_unverified' }));
  it('skips content whose approval is stale', () => expect(evaluateGbpPost({ ...base, content: { ...base.content, text: 'Edited after approval.' } })).toEqual({ action: 'skip', reason: 'content_not_approved' }));
  it('skips draft content', () => expect(evaluateGbpPost({ ...base, content: { ...base.content, reviewState: 'draft' } })).toEqual({ action: 'skip', reason: 'content_not_approved' }));
  it('skips banned claims', () => expect(evaluateGbpPost({ ...base, content: approvedPost('We are an approved NDIS provider') })).toEqual({ action: 'skip', reason: 'banned_phrase' }));
  it('skips ineligible or unverified profiles', () => {
    expect(evaluateGbpPost({ ...base, profile: { eligible: false, premisesOrServiceAreaVerified: true } })).toEqual({ action: 'skip', reason: 'profile_not_eligible' });
    expect(evaluateGbpPost({ ...base, profile: { eligible: true, premisesOrServiceAreaVerified: false } })).toEqual({ action: 'skip', reason: 'profile_not_eligible' });
  });
  it('paces posts: 6 days exactly is allowed, a moment less is too soon', () => {
    expect(evaluateGbpPost({ ...base, lastPostAt: new Date(now.getTime() - days(6)) })).toEqual({ action: 'publish_via_api' });
    expect(evaluateGbpPost({ ...base, lastPostAt: new Date(now.getTime() - days(6) + 1) })).toEqual({ action: 'skip', reason: 'too_soon' });
  });
});
