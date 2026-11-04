import type { Region } from './types';
import { assertRegionFacts } from '../lib/region-facts';

const base = { reviewState: 'draft' as const, updatedAt: '2026-11-03T00:00:00Z', services: [] as string[], faqs: [] };
const needs = (extra: string[] = []) => [
  'Named local contact or team (with consent)',
  'Suburbs and towns served',
  'Services actually available here, with capacity statement from operations',
  'Local accommodation (via approved vacancies)',
  'Whether there is a staffed premises (affects Google Business Profile and LocalBusiness schema)',
  ...extra,
];

export const regions: Region[] = [
  { ...base, slug: 'central-coast', name: 'Central Coast', isHeadOfficeRegion: true, summary: 'Our head office is in Gosford, on the Central Coast of New South Wales.', missingFacts: needs() },
  { ...base, slug: 'newcastle', name: 'Newcastle', summary: 'We support participants in Newcastle, NSW.', missingFacts: needs() },
  { ...base, slug: 'dubbo', name: 'Dubbo', summary: 'We support participants in Dubbo, NSW.', missingFacts: needs() },
  { ...base, slug: 'orange', name: 'Orange', summary: 'We support participants in Orange, NSW.', missingFacts: needs() },
  { ...base, slug: 'tamworth', name: 'Tamworth', summary: 'We support participants in Tamworth, NSW.', missingFacts: needs(['Confirm AblePoint operates here (new region; no existing web page)']) },
  { ...base, slug: 'gunnedah', name: 'Gunnedah', summary: 'We support participants in Gunnedah, NSW.', missingFacts: needs(['Confirm AblePoint operates here (new region; no existing web page)']) },
];

// Fails the build if a fact sheet contains a street address, banned wording or an unverified partner.
assertRegionFacts(regions);

export const getRegion = (slug: string) => regions.find((r) => r.slug === slug);
