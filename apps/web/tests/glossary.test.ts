import { describe, expect, it } from 'vitest';
import { findBannedPhrases } from '@ablepoint/schemas';
import { glossary } from '../src/data/glossary';
import { helpFaqs } from '../src/data/faqs';
import { buildSitemapEntries } from '../src/lib/seo';
import { apiInputs } from '../src/lib/api-inputs';

describe('glossary (draft)', () => {
  it('ships as draft, with every term flagged for comparison with the official wording', () => {
    expect(glossary.length).toBeGreaterThanOrEqual(10);
    for (const t of glossary) {
      expect(t.reviewState, t.slug).toBe('draft');
      expect(t.missingFacts?.join(' '), t.slug).toMatch(/official/i);
    }
  });
  it('has unique slugs and short plain definitions', () => {
    expect(new Set(glossary.map((t) => t.slug)).size).toBe(glossary.length);
    for (const t of glossary) {
      expect(t.definition.length, t.slug).toBeGreaterThan(20);
      expect(t.definition.length, t.slug).toBeLessThan(400);
    }
  });
  it('contains no banned wording and makes no eligibility, price or approval claims', () => {
    for (const t of glossary) {
      expect(findBannedPhrases(t.definition), t.slug).toEqual([]);
      expect(t.definition, t.slug).not.toMatch(/\$\s?\d|\bguarantee|\balways eligible|\bwill be funded/i);
    }
  });
  it('official links, when added, must be https on an NDIS government domain', () => {
    for (const t of glossary) if (t.sourceUrl) expect(t.sourceUrl).toMatch(/^https:\/\/(www\.)?(ndis|ndiscommission)\.gov\.au\//);
  });
});

describe('sitemap includes the help pages only when they are visible', () => {
  it('omits /faq/ and /glossary/ in production while everything is draft', () => {
    const prod = buildSitemapEntries({ ...apiInputs('https://example.invalid'), env: 'production', reviewers: [] }).map((e) => new URL(e.loc).pathname);
    expect(prod).not.toContain('/faq/');
    expect(prod).not.toContain('/glossary/');
  });
  it('includes them on staging', () => {
    const stg = buildSitemapEntries({ ...apiInputs('https://example.invalid'), env: 'staging', reviewers: [] }).map((e) => new URL(e.loc).pathname);
    expect(helpFaqs.length).toBeGreaterThan(0);
    expect(stg).toContain('/faq/');
    expect(stg).toContain('/glossary/');
  });
});
