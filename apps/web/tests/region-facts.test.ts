import { describe, expect, it } from 'vitest';
import { assertRegionFacts, checkRegionFacts, factSections, lastChecked } from '../src/lib/region-facts';
import { regions } from '../src/data/regions';
import type { Region, RegionFacts } from '../src/data/types';

const good: RegionFacts = {
  towns: ['Exampletown', 'Sampleville'],
  about: ['This is an obviously fake test paragraph about local services in the example area, written for the unit test.'],
  gettingAround: 'This is an obviously fake test note about how people travel around the example area for the unit test.',
  partners: [{ name: 'Example Community Group', kind: 'community-organisation', url: 'https://example.invalid/', permissionRef: 'TEST-REF-1' }],
  verifiedBy: 'Test Reviewer',
  verifiedAt: '2026-11-03',
};

describe('region fact sheets', () => {
  it('ship with no facts invented: every region has none until operations supply them', () => {
    for (const r of regions) expect(r.facts, r.slug).toBeUndefined();
    expect(() => assertRegionFacts(regions)).not.toThrow();
  });
  it('accept a complete, verified fact sheet', () => {
    expect(checkRegionFacts('test', good)).toEqual([]);
  });
  it('reject street addresses, contact details and banned wording', () => {
    expect(checkRegionFacts('t', { ...good, about: ['Visit us at 12 Example Street for more detail about the local supports we offer here.'] }).join()).toMatch(/street address/);
    expect(checkRegionFacts('t', { ...good, gettingAround: 'Call 02 1234 5678 to ask about transport options available around the example area today.' }).join()).toMatch(/phone number|identifier/);
    expect(checkRegionFacts('t', { ...good, about: ['We are the best provider in the example area and we offer supports to many local people here.'] }).join()).toMatch(/banned phrase/);
  });
  it('require a named human verifier and an ISO date', () => {
    expect(checkRegionFacts('t', { ...good, verifiedBy: 'ChatGPT' }).join()).toMatch(/named person/);
    expect(checkRegionFacts('t', { ...good, verifiedAt: '3/11/2026' }).join()).toMatch(/ISO date/);
  });
  it('list partners only with a permission reference and https links', () => {
    expect(checkRegionFacts('t', { ...good, partners: [{ name: 'X Group', kind: 'other', permissionRef: ' ' }] }).join()).toMatch(/permissionRef/);
    expect(checkRegionFacts('t', { ...good, partners: [{ name: 'X Group', kind: 'other', url: 'http://x.invalid', permissionRef: 'R' }] }).join()).toMatch(/https/);
  });
  it('reject empty or duplicate towns', () => {
    expect(checkRegionFacts('t', { ...good, towns: [] }).join()).toMatch(/empty/);
    expect(checkRegionFacts('t', { ...good, towns: ['A Town', 'a town'] }).join()).toMatch(/duplicate/);
  });
  it('assertRegionFacts throws with the region slug', () => {
    const r = { slug: 'x', name: 'X', facts: { ...good, towns: [] } } as unknown as Region;
    expect(() => assertRegionFacts([r])).toThrow(/x: towns is empty/);
  });
  it('show only the sections that have content', () => {
    expect(factSections({ name: 'X', facts: undefined })).toEqual([]);
    expect(factSections({ name: 'X', facts: { ...good, about: undefined, partners: undefined, gettingAround: undefined } }).map((s) => s.id)).toEqual(['towns']);
    expect(factSections({ name: 'X', facts: good }).map((s) => s.id)).toEqual(['towns', 'about', 'partners', 'getting-around']);
  });
  it('formats the last-checked date for Australian readers without timezone drift', () => {
    expect(lastChecked(good)).toBe('3 November 2026');
    expect(lastChecked(undefined)).toBeNull();
  });
});
