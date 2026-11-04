import { VACANCY_STATUSES } from '@ablepoint/schemas';

export { VACANCY_STATUSES };

export const REVIEW_STATES = ['draft', 'inReview', 'approved'] as const;

/** Singleton documents: one per dataset, fixed document id equal to the type name. */
export const SINGLETON_TYPES = ['siteSettings', 'navigation', 'footer'] as const;

/** Every document type (docs/06 §2) that carries review fields. `mediaAsset` and `seo` are object types. */
export const DOCUMENT_TYPES = [
  'siteSettings',
  'navigation',
  'footer',
  'page',
  'service',
  'region',
  'serviceCoverage',
  'property',
  'vacancy',
  'guide',
  'faq',
  'teamMember',
  'author',
  'testimonial',
  'landingPage',
  'cta',
  'legalPage',
  'redirect',
] as const;

export const OBJECT_TYPES = ['seo', 'mediaAsset'] as const;

export const VACANCY_STATUS_TITLES: Record<(typeof VACANCY_STATUSES)[number], string> = {
  draft: 'Draft',
  readyForReview: 'Ready for review',
  available: 'Available',
  temporarilyUnavailable: 'Temporarily unavailable',
  filled: 'Filled',
  archived: 'Archived',
};

/** Slugs that would collide with fixed routes in apps/web (top-level dynamic route `[slug]`). */
export const RESERVED_SLUGS = [
  'services',
  'locations',
  'vacancies',
  'guides',
  'referral',
  'contact-us',
  'thank-you',
  '404',
  'robots-txt',
  'robots.txt',
  'sitemap',
  'api',
  'admin',
  'studio',
  '_astro',
] as const;
