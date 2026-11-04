/**
 * GROQ used by the site build (apps/web). Run with `perspective: 'published'`.
 *
 * ---- Why these queries return RAW documents ----
 * The approval gate (`isApprovalCurrent` in @ablepoint/schemas) compares `approvedContentHash` with a hash of
 * the document's own fields. So the build must run the gate on EXACTLY the stored document:
 *   - no field projection (`{ ... }`) that drops, renames or rewrites fields,
 *   - no `->` reference expansion (references are hashed as the unresolved `{_type:"reference", _ref}` value),
 *   - no aliasing such as `faqs[]->{ "q": question }`.
 * Pipeline: (1) fetch raw -> (2) `isApprovalCurrent(doc)` -> (3) only then map to view models, strip internal-only
 * fields (`stripInternalFields`) and resolve references with `byIdsQuery` (each referenced document is fetched raw and
 * must pass the gate on its own: a hash does not cover documents it points at).
 *
 * Draft vs published: the hash excludes `_id`, `_rev`, `_createdAt`, `_updatedAt`, so a published document hashes
 * the same as the draft it was published from (tested). `drafts.` and `versions.` ids are excluded here and by perspective.
 *
 * GROQ pre-filters only on `reviewState == "approved"` to keep results small. It cannot decide whether the approval
 * is current: that needs the hash function, so it stays in code.
 *
 * Caveat: raw documents include internal-only fields (`internalOwner`, `capacityNote`, `consentRef`). They reach the
 * BUILD process, never the page. Strip them after the gate. On a public dataset they are readable by anyone;
 * use a private dataset and a read token.
 */

export const NOT_DRAFT_OR_VERSION = '!(_id in path("drafts.**")) && !(_id in path("versions.**"))';
export const APPROVED_PREFILTER = `reviewState == "approved" && ${NOT_DRAFT_OR_VERSION}`;

/** Collection of raw documents of one type. */
export const rawApprovedQuery = (type: string) => `*[_type == "${type}" && ${APPROVED_PREFILTER}]`;

/** A singleton (fixed document id equal to its type). */
export const rawSingletonQuery = (type: string) => `*[_type == "${type}" && _id == "${type}" && ${APPROVED_PREFILTER}][0]`;

/** Referenced documents, fetched raw by id AFTER the referrer passed the gate. Each must pass the gate itself. */
export const byIdsQuery = `*[_id in $ids && ${APPROVED_PREFILTER}]`;

export const siteSettingsQuery = rawSingletonQuery('siteSettings');
export const navigationQuery = rawSingletonQuery('navigation');
export const footerQuery = rawSingletonQuery('footer');
export const servicesQuery = rawApprovedQuery('service');
export const regionsQuery = rawApprovedQuery('region');
export const serviceCoverageQuery = rawApprovedQuery('serviceCoverage');
export const guidesQuery = rawApprovedQuery('guide');
export const faqsQuery = rawApprovedQuery('faq');
export const authorsQuery = rawApprovedQuery('author');
export const legalPagesQuery = rawApprovedQuery('legalPage');
export const redirectsQuery = rawApprovedQuery('redirect');
/** Selection by status is a filter, not a projection. Drafts and ready-for-review vacancies are never fetched. */
export const vacanciesQuery = `*[_type == "vacancy" && ${APPROVED_PREFILTER} && status in ["available", "temporarilyUnavailable", "filled"]]`;

export const SITE_QUERIES = {
  siteSettings: siteSettingsQuery,
  navigation: navigationQuery,
  footer: footerQuery,
  services: servicesQuery,
  regions: regionsQuery,
  serviceCoverage: serviceCoverageQuery,
  guides: guidesQuery,
  faqs: faqsQuery,
  authors: authorsQuery,
  vacancies: vacanciesQuery,
  legalPages: legalPagesQuery,
  redirects: redirectsQuery,
} as const;

/** Internal-only fields per document type. Remove with `stripInternalFields` after the gate has passed. */
export const INTERNAL_ONLY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  vacancy: ['internalOwner'],
  serviceCoverage: ['capacityNote'],
  testimonial: ['consentRef'],
  teamMember: ['consentRef'],
  author: ['consentRef'],
};

/** Never part of a view model: review bookkeeping and the approval record. */
export const REVIEW_ONLY_FIELDS = ['approvedContentHash', 'approvedBy', 'approvedAt', 'reviewedAt', 'nextReviewDue'] as const;

/** Call only AFTER `isApprovalCurrent` passed on the raw document. Returns a copy. */
export function stripInternalFields<T extends Record<string, unknown>>(doc: T): Partial<T> {
  const drop = new Set<string>([...(INTERNAL_ONLY_FIELDS[String(doc._type)] ?? []), ...REVIEW_ONLY_FIELDS]);
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !drop.has(k))) as Partial<T>;
}

/**
 * Ids of every document this one references (unresolved `_ref` values anywhere in the tree), de-duplicated.
 * Use after the gate to build the `$ids` parameter for `byIdsQuery`. Weak references are included.
 */
export function collectRefIds(value: unknown, out: Set<string> = new Set()): string[] {
  if (Array.isArray(value)) value.forEach((v) => collectRefIds(v, out));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o._ref === 'string') out.add(o._ref);
    for (const v of Object.values(o)) collectRefIds(v, out);
  }
  return [...out];
}

/** Fields that must never reach a rendered page. */
export const FORBIDDEN_PUBLIC_FIELDS = ['internalOwner', 'capacityNote', 'consentRef'] as const;
