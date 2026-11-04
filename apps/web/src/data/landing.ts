import type { DraftMeta } from './types';

/**
 * Campaign landing pages (docs/10 §1). Always noindex. Built only from existing service + region data, so they add no new claims.
 * D-08 (first ad region) and D-17 (analytics on pages that contain the enquiry link) are still open: these are DRAFT templates, not a launched campaign.
 */
export interface LandingPage extends DraftMeta {
  slug: string;
  campaign: string;
  serviceSlug: string;
  regionSlug: string;
}

export const landingPages: LandingPage[] = [
  {
    slug: 'sil-central-coast',
    campaign: 'pilot-central-coast-sil',
    serviceSlug: 'supported-independent-living',
    regionSlug: 'central-coast',
    reviewState: 'draft',
    updatedAt: '2026-11-03T00:00:00Z',
    missingFacts: ['Owner decision on first ad region (D-08)', 'Operations capacity confirmation for SIL on the Central Coast', 'Compliance review of ad copy and page', 'Decision D-17: analytics on landing pages'],
  },
];
