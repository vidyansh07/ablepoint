import type { Reviewable } from '@ablepoint/schemas';

export interface Faq {
  q: string;
  a: string;
}

/** Facts an editor must supply/verify before this content can be approved. Rendered in draft banners. */
export interface DraftMeta extends Reviewable {
  missingFacts?: string[];
}

export interface Service extends DraftMeta {
  slug: string;
  icon: string;
  tint: 'blue' | 'plum' | 'orange' | 'green';
  title: string;
  /** Short plain-English definition; also used as meta description seed. */
  summary: string;
  whoFor: string;
  provides: string[];
  process: string[];
  faqs: Faq[];
  related: string[];
}

/**
 * Verified local facts for one region (docs/25 §5.2). All optional until operations supply them: nothing is invented.
 * `verifiedBy` stays internal (never rendered, never in the API). Street addresses are not allowed here:
 * whether a premises may be published is owner decision C-1/C-2.
 */
export interface RegionFacts {
  /** Towns and suburbs AblePoint actually supports from this region. */
  towns: string[];
  /** One to three short, original paragraphs of local context. */
  about?: string[];
  /** Organisations that agreed to be listed. `permissionRef` points to a record held outside the repo. */
  partners?: { name: string; kind: 'hospital' | 'council' | 'health-district' | 'community-organisation' | 'other'; url?: string; permissionRef: string }[];
  /** Transport and community-access notes for the area. */
  gettingAround?: string;
  /** Named person at AblePoint who checked these facts (internal). */
  verifiedBy: string;
  /** ISO date of the check. Shown publicly as "last checked". */
  verifiedAt: string;
}

export interface Region extends DraftMeta {
  slug: string;
  name: string;
  summary: string;
  isHeadOfficeRegion?: boolean;
  /** Service slugs verified as available here. Empty until operations confirm. */
  services: string[];
  faqs: Faq[];
  facts?: RegionFacts;
}

export interface GuideSection {
  heading: string;
  body: string[];
}

export interface Guide extends DraftMeta {
  slug: string;
  title: string;
  /** Answer-first summary, 40–60 words. */
  answer: string;
  sections: GuideSection[];
  sources: { label: string; url: string }[];
  faqs: Faq[];
  author: string;
  reviewer?: string;
  reviewedAt?: string;
  publishedAt?: string;
}

export interface Post extends DraftMeta {
  slug: string;
  kind: 'post' | 'guide';
  title: string;
  summary: string;
  answer: string;
  category: import('@ablepoint/schemas').PostCategory;
  tags: string[];
  regions: string[];
  services: string[];
  sections: GuideSection[];
  faqs: Faq[];
  sources: { label: string; url: string }[];
  author: string;
  aiAssisted: boolean;
  aiNotes?: string;
  reviewer?: string;
  reviewedAt?: string;
  publishedAt?: string;
}

export interface Vacancy extends DraftMeta {
  slug: string;
  title: string;
  regionSlug: string;
  suburb: string;
  type: 'SIL' | 'SDA' | 'STA';
  status: import('@ablepoint/schemas').VacancyStatus;
  summary: string;
  features: string[];
  lastVerifiedAt?: string;
}

export interface LegalPage extends DraftMeta {
  slug: string;
  /** When present the page renders as Easy Read blocks instead of prose sections. */
  easyRead?: { icon: string; tint?: 'blue' | 'plum' | 'orange' | 'green'; title: string; lines: string[] }[];
  title: string;
  description: string;
  sections: GuideSection[];
}
