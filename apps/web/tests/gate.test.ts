import { describe, expect, it } from 'vitest';
import { approvalFields } from '@ablepoint/schemas';
import { COMPLIANCE_REVIEWERS, isShown } from '../src/lib/gate';
import { services } from '../src/data/services';

const svc = services[0]!;
const approvedBy = (name: string) => ({ ...svc, ...approvalFields(svc as unknown as Record<string, unknown>, name, new Date('2026-11-02T00:00:00Z')) });

describe('production gate with reviewer allow-list', () => {
  it('ships with an EMPTY allow-list: nothing can be published until a human owner names a reviewer', () => expect(COMPLIANCE_REVIEWERS).toEqual([]));
  it('a valid hash alone does not publish: the approver must be on the list', () => {
    expect(isShown(approvedBy('Rogue Script'), 'production')).toBe(false);
    expect(isShown(approvedBy('Rogue Script'), 'production', ['Jo Reviewer'])).toBe(false);
    expect(isShown(approvedBy('Jo Reviewer'), 'production', ['Jo Reviewer'])).toBe(true);
  });
  it('editing after approval still withdraws it even for a listed reviewer', () => {
    expect(isShown({ ...approvedBy('Jo Reviewer'), summary: 'changed' }, 'production', ['Jo Reviewer'])).toBe(false);
  });
  it('non-production always shows drafts', () => expect(isShown(svc, 'staging', [])).toBe(true));
});
