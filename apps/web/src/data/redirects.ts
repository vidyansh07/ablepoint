import type { RedirectRecord } from '@ablepoint/schemas';

const r = (from: string, to: string, reason: string): RedirectRecord => ({ from, to, status: 301, reason, approved: false });

/**
 * Draft legacy→new map (docs/07 §3). NOT activated on the production domain until owner approval.
 * `approved:false` records are emitted for staging verification only.
 */
export const redirects: RedirectRecord[] = [
  r('/short-term-accomodation/', '/short-term-accommodation/', 'spelling'),
  r('/short-term-accomodation-newcastle/', '/locations/newcastle/', 'consolidate into region page (D-13)'),
  r('/ndis-support-service-providers-newcastle/', '/locations/newcastle/', 'structure'),
  r('/ndis-support-service-providers-dubbo/', '/locations/dubbo/', 'structure'),
  r('/ndis-support-service-providers-central-coast/', '/locations/central-coast/', 'structure'),
  r('/ndis-support-service-providers-orange/', '/locations/orange/', 'structure'),
  r('/core-support-central-coast/', '/locations/central-coast/', 'consolidate (D-13)'),
  r('/core-support-newcastle/', '/locations/newcastle/', 'consolidate (D-13)'),
  r('/core-support-dubbo/', '/locations/dubbo/', 'consolidate (D-13)'),
  r('/core-support-orange/', '/locations/orange/', 'consolidate (D-13)'),
  r('/support-coordinator-central-coast/', '/locations/central-coast/', 'consolidate (D-13)'),
  r('/support-coordinator-dubbo/', '/locations/dubbo/', 'consolidate (D-13)'),
  r('/support-coordinator-orange/', '/locations/orange/', 'consolidate (D-13)'),
  r('/supported-independent-living-central-coast/', '/locations/central-coast/', 'consolidate (D-13)'),
  r('/supported-independent-living-dubbo/', '/locations/dubbo/', 'consolidate (D-13)'),
  r('/supported-independent-living-orange/', '/locations/orange/', 'consolidate (D-13)'),
  r('/news/', '/guides/', 'structure'),
  r('/2017/02/01/ndis-core-vs-capacity-building/', '/guides/', 'clean slug pending migrated guide (needs owner decision on content + true publication date)'),
  r('/2017/02/01/how-to-choose-ndis-provider-in-sydney/', '/guides/', 'clean slug pending migrated guide (Sydney framing needs verification)'),
];

/**
 * Legacy URLs with no new equivalent yet. Each needs an owner decision before cutover (docs/07, docs/13).
 * The parity script reports these as warnings, never as silent passes.
 */
export const pendingLegacy: { from: string; reason: string }[] = [
  { from: '/youth-services/', reason: 'Not in the approved service inventory; page carries an "approved NDIS" claim and has no H1. Owner to confirm whether this service exists, then migrate or redirect.' },
];
