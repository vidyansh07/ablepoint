import { describe, expect, it } from 'vitest';
import { scoreItems, tokenise, type SearchItem } from '../src';

const item = (over: Partial<SearchItem> & { id: string }): SearchItem => ({ type: 'service', title: 'Untitled', url: 'https://example.invalid/x', summary: '', updatedAt: null, ...over });
const order = (items: SearchItem[], q: string) => scoreItems(items, q).map((s) => s.item.id);

describe('tokenise', () => {
  it('lower-cases, splits on punctuation, drops stop words and handles plurals', () => {
    expect(tokenise('What are the Services, for Disability?')).toEqual(['service', 'disability']);
    expect(tokenise('Policies; ACCESS')).toEqual(['policy', 'access']); // "ies" -> "y"; "ss" is kept
    expect(tokenise('')).toEqual([]);
    expect(tokenise('the and of')).toEqual([]);
  });

  it('folds accents', () => {
    expect(tokenise('Café')).toEqual(['cafe']);
  });
});

describe('scoreItems', () => {
  it('ranks a title match above a summary-only match', () => {
    const a = item({ id: 'summary-only', title: 'Something else', summary: 'This text mentions alpha once.' });
    const b = item({ id: 'in-title', title: 'Alpha overview', summary: 'Nothing relevant.' });
    expect(order([a, b], 'alpha')).toEqual(['in-title', 'summary-only']);
  });

  it('ranks an item matching every word above one matching a single word', () => {
    const one = item({ id: 'one', title: 'Alpha only', summary: '' });
    const both = item({ id: 'both', title: 'Alpha beta', summary: '' });
    expect(order([one, both], 'alpha beta')).toEqual(['both', 'one']);
  });

  it('gives the whole phrase in a title a bonus over the same words scattered', () => {
    const scattered = item({ id: 'scattered', title: 'Aaa term then short', summary: '' });
    const phrase = item({ id: 'phrase', title: 'Short term stays', summary: '' });
    expect(order([scattered, phrase], 'short term')).toEqual(['phrase', 'scattered']);
  });

  it('puts a title that is exactly the query above a longer title that contains it, even if the longer one is newer', () => {
    const longer = item({ id: 'longer', title: 'How alpha beta works', summary: 'Alpha beta explained.', updatedAt: '2026-09-01T00:00:00Z' });
    const exact = item({ id: 'exact', title: 'Alpha beta', summary: '', updatedAt: '2026-01-01T00:00:00Z' });
    expect(order([longer, exact], 'alpha beta')).toEqual(['exact', 'longer']);
  });

  it('matches the slug, the content type and plurals', () => {
    const bySlug = item({ id: 'zebra-crossing', title: 'Different', summary: '' });
    const byType = item({ id: 'g1', type: 'guide', title: 'Different', summary: '' });
    expect(order([bySlug], 'zebra')).toEqual(['zebra-crossing']);
    expect(order([byType], 'guides')).toEqual(['g1']);
    expect(order([item({ id: 'x', title: 'Service list', summary: '' })], 'services')).toEqual(['x']);
  });

  it('excludes items with no match and returns nothing for an empty or stop-word query', () => {
    const items = [item({ id: 'a', title: 'Alpha' }), item({ id: 'b', title: 'Beta' })];
    expect(order(items, 'alpha')).toEqual(['a']);
    expect(order(items, 'zzz')).toEqual([]);
    expect(order(items, '   ')).toEqual([]);
    expect(order(items, 'the of')).toEqual([]);
  });

  it('is deterministic: ties go to the newest updatedAt, then to the title', () => {
    const items = [
      item({ id: 'old', title: 'Alpha', updatedAt: '2026-01-01T00:00:00Z' }),
      item({ id: 'new', title: 'Alpha', updatedAt: '2026-06-01T00:00:00Z' }),
      item({ id: 'none', title: 'Alpha', updatedAt: null }),
      item({ id: 'b-title', title: 'Alpha', updatedAt: null }),
    ];
    expect(order(items, 'alpha')).toEqual(['new', 'old', 'none', 'b-title']);
  });

  it('counts a repeated query word once', () => {
    const items = [item({ id: 'a', title: 'Alpha' })];
    expect(scoreItems(items, 'alpha')[0]?.score).toBe(scoreItems(items, 'alpha alpha alpha')[0]?.score);
  });
});
