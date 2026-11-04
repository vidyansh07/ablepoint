import { z } from 'zod';

/**
 * Shapes of the public API (apps/web/src/lib/api.ts). Parsing STRIPS unknown fields, so only fields named here can ever be
 * passed on to an agent. Everything that comes out of these schemas is still untrusted text.
 */

/** The API emits "1" today (API_VERSION in api.ts). "v1" is also accepted because the path is /api/v1/. Anything else is refused. */
export const SUPPORTED_API_VERSIONS = ['1', 'v1'] as const;
export const ENVIRONMENTS = ['production', 'staging', 'development'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const RESOURCE_NAMES = ['index', 'organisation', 'services', 'regions', 'guides', 'posts', 'vacancies', 'faqs', 'search-index'] as const;
export type ResourceName = (typeof RESOURCE_NAMES)[number];

const isHttpUrl = (s: string): boolean => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};
const url = z.string().max(2048).refine(isHttpUrl, 'must be an http(s) URL');
const text = z.string().max(100_000);
const short = z.string().max(500);
const slug = z.string().min(1).max(120);
const maybeDate = z.string().max(64).nullable().optional();
const MAX_ITEMS = 5000;

export const envelopeSchema = z.object({
  apiVersion: z.enum(SUPPORTED_API_VERSIONS),
  environment: z.enum(ENVIRONMENTS),
  generatedAt: z.string().max(64).refine((s) => !Number.isNaN(Date.parse(s)), 'must be a date-time'),
  publisher: short,
  data: z.unknown(),
});
export type Envelope = z.output<typeof envelopeSchema>;

const faqPair = z.object({ q: text, a: text });

export const organisationSchema = z.object({
  name: short,
  url,
  telephone: short.optional(),
  telephoneDisplay: short.optional(),
  email: short.optional(),
  headOffice: short.optional(),
  regionsServed: z.array(short).max(MAX_ITEMS).default([]),
  registration: z
    .object({ ndisRegistrationNumber: short, registeredGroups: z.array(short).max(MAX_ITEMS).default([]) })
    .nullable()
    .optional(),
  /** Not in the API today. If the site starts publishing a referral page address under this name it is passed through. */
  referralUrl: url.nullable().optional(),
  notes: text.optional(),
});
export type Organisation = z.output<typeof organisationSchema>;

export const serviceSchema = z.object({
  id: slug,
  name: short,
  url,
  summary: text,
  whoFor: text.optional(),
  provides: z.array(text).max(MAX_ITEMS).default([]),
  process: z.array(text).max(MAX_ITEMS).default([]),
  faqs: z.array(faqPair).max(MAX_ITEMS).default([]),
  regions: z.array(slug).max(MAX_ITEMS).default([]),
  related: z.array(slug).max(MAX_ITEMS).default([]),
  status: short.optional(),
  updatedAt: maybeDate,
});
export type Service = z.output<typeof serviceSchema>;

export const regionSchema = z.object({
  id: slug,
  name: short,
  url,
  summary: text,
  services: z.array(slug).max(MAX_ITEMS).default([]),
  headOfficeRegion: z.boolean().default(false),
  faqs: z.array(faqPair).max(MAX_ITEMS).default([]),
  status: short.optional(),
  updatedAt: maybeDate,
});
export type Region = z.output<typeof regionSchema>;

export const articleSchema = z.object({
  id: slug,
  type: z.enum(['guide', 'post']),
  title: short,
  url,
  answer: text,
  sections: z.array(z.object({ heading: short, text })).max(MAX_ITEMS).default([]),
  faqs: z.array(faqPair).max(MAX_ITEMS).default([]),
  sources: z.array(z.object({ label: short, url })).max(MAX_ITEMS).default([]),
  author: short.optional(),
  reviewer: short.nullable().optional(),
  reviewedAt: maybeDate,
  publishedAt: maybeDate,
  updatedAt: maybeDate,
  status: short.optional(),
  // Posts only.
  summary: text.optional(),
  category: short.optional(),
  tags: z.array(short).max(MAX_ITEMS).default([]),
  regions: z.array(slug).max(MAX_ITEMS).default([]),
  services: z.array(slug).max(MAX_ITEMS).default([]),
  aiAssisted: z.boolean().optional(),
});
export type Article = z.output<typeof articleSchema>;

export const AVAILABILITIES = ['available', 'unconfirmed', 'temporarilyUnavailable', 'noLongerAvailable'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const vacancySchema = z.object({
  id: slug,
  type: z.literal('vacancy').optional(),
  title: short,
  url,
  vacancyType: short.optional(),
  region: slug.optional(),
  suburb: short.optional(),
  summary: text.optional(),
  features: z.array(text).max(MAX_ITEMS).default([]),
  availability: z.enum(AVAILABILITIES),
  lastVerifiedAt: maybeDate,
});
export type Vacancy = z.output<typeof vacancySchema>;

export const faqSchema = z.object({ q: text, a: text, source: url.optional() });
export type Faq = z.output<typeof faqSchema>;

export const searchItemSchema = z.object({
  id: slug,
  type: short,
  title: short,
  url,
  summary: text.optional(),
  updatedAt: maybeDate,
});
export type SearchItem = z.output<typeof searchItemSchema>;

export const indexSchema = z.object({
  description: text.optional(),
  openapi: url.optional(),
  resources: z.array(z.object({ name: short, url })).max(MAX_ITEMS).default([]),
  counts: z.record(z.string().max(100), z.number()).default({}),
  usage: text.optional(),
});

export const resourceSchemas = {
  index: indexSchema,
  organisation: organisationSchema,
  services: z.array(serviceSchema).max(MAX_ITEMS),
  regions: z.array(regionSchema).max(MAX_ITEMS),
  guides: z.array(articleSchema).max(MAX_ITEMS),
  posts: z.array(articleSchema).max(MAX_ITEMS),
  vacancies: z.array(vacancySchema).max(MAX_ITEMS),
  faqs: z.array(faqSchema).max(MAX_ITEMS),
  'search-index': z.array(searchItemSchema).max(MAX_ITEMS),
} as const satisfies Record<ResourceName, z.ZodType>;

export type ResourceData = { [K in ResourceName]: z.output<(typeof resourceSchemas)[K]> };
