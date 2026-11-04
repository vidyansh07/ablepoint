import type { ImageMetadata } from 'astro';
import generated from './photos.generated.json';
import registry from './photos.registry.json';
import type { SiteEnv } from '@ablepoint/schemas';

/**
 * Photo register (docs/19-creative-sourcing.md §3). Every photo on the site must be listed here with its creator,
 * licence and source. Metadata in photos.generated.json is written by scripts/fetch-commons-photos.mjs from Wikimedia
 * Commons' licence API. These are LICENSED PLACEHOLDERS (landscapes, no identifiable people) chosen on 3 Nov 2026 at the
 * owner's direction to use online-available photos; they are to be replaced by AblePoint's own consented photography.
 */
export interface SitePhoto {
  id: string;
  src: ImageMetadata;
  alt: string;
  title: string;
  creator: string;
  licence: string;
  licenceUrl: string;
  sourcePage: string;
  source: string;
  shareAlike: boolean;
  checked: string;
  status: 'licensed-placeholder';
  /** Free-text note shown on the credits page when the licence is share-alike. */
  note?: string;
  /** Recognisable people in the image. */
  people: boolean;
  /** Model release status; Pixabay and similar libraries do not supply releases. */
  release: 'none' | 'provided' | 'not-applicable';
  riskAcceptedBy: string | null;
  riskAcceptedAt: string | null;
}

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/photos/*.jpg', { eager: true });
const images: Record<string, ImageMetadata> = Object.fromEntries(Object.entries(files).map(([p, m]) => [p.split('/').pop()!.replace(/\.jpg$/, ''), m.default]));
const alts: Record<string, string> = {
  'central-coast': 'Rocky coastline and sea cliffs at Terrigal on the Central Coast, with waves and a blue sky.',
  newcastle: 'Nobbys Lighthouse on its headland above a long surf beach in Newcastle.',
  dubbo: 'Aerial view of the Macquarie River winding through autumn trees and parkland in Dubbo.',
  orange: 'The red and cream bandstand in Cook Park, Orange, among large trees.',
  tamworth: 'View over Tamworth and the surrounding plains and ranges from the lookout.',
  gunnedah: 'Tree roots on the bank of the Namoi River at Gunnedah.',
};

type Raw = { id: string; title: string; source: string; page: string; creator: string; licence: string; licenceUrl: string; shareAlike: boolean; checked: string; alt?: string; people?: boolean; release?: SitePhoto['release']; riskAcceptedBy?: string | null; riskAcceptedAt?: string | null };
const raw = { ...(generated as Record<string, Raw>), ...(registry as Record<string, Raw>) };
const fixLicenceUrl = (u: string) => (u.startsWith('//') ? `https:${u}` : u.replace(/^http:/, 'https:'));

export const photos: SitePhoto[] = Object.values(raw).map((g) => ({
  id: g.id,
  src: images[g.id]!,
  alt: g.alt ?? alts[g.id]!,
  title: g.title,
  creator: g.creator,
  licence: g.licence,
  licenceUrl: fixLicenceUrl(g.licenceUrl),
  sourcePage: g.page,
  source: g.source,
  shareAlike: g.shareAlike,
  checked: g.checked,
  status: 'licensed-placeholder' as const,
  note: g.shareAlike ? 'Resized and cropped for the web. This adapted copy is shared under the same Creative Commons licence as the original.' : undefined,
  people: g.people ?? false,
  release: g.release ?? 'not-applicable',
  riskAcceptedBy: g.riskAcceptedBy ?? null,
  riskAcceptedAt: g.riskAcceptedAt ?? null,
}));

/** Production shows a photo of recognisable people only if it has a release, or a named person has accepted the risk (docs/19 §3). */
export function photoAllowed(p: Pick<SitePhoto, 'people' | 'release' | 'riskAcceptedBy'>, env: SiteEnv): boolean {
  if (env !== 'production') return true;
  return !p.people || p.release === 'provided' || Boolean(p.riskAcceptedBy);
}
export const photoFor = (id: string, env?: SiteEnv) => {
  const p = photos.find((x) => x.id === id);
  return p && (!env || photoAllowed(p, env)) ? p : undefined;
};
