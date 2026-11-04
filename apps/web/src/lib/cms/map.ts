/**
 * Pure mapping from RAW Sanity documents (shapes in apps/studio/src/schemas) to the site's view-model types
 * (apps/web/src/data/types.ts and faqs.ts).
 *
 * Rules, in order of importance:
 *   1. Fail closed. If a field cannot be mapped without losing or guessing something, the whole document is excluded and the
 *      reason is reported. Nothing is repaired, defaulted or invented.
 *   2. A field that is required in the Studio schema is required here. An optional list becomes `[]` when absent (an empty
 *      list is the faithful reading of "none entered"). An optional scalar is left out when absent.
 *   3. Portable Text becomes paragraphs only when that is lossless: plain `normal` blocks of unmarked text. Headings, quotes,
 *      lists, bold/italic and links all fail the document, because the site's `body: string[]` cannot hold them.
 *   4. Reasons name fields and positions, never values, so a report can be shared without leaking content.
 *   5. Fields that exist in Sanity but have no counterpart in the site type (for example `region.narrative`) are not carried.
 *
 * Input contract: the document has ALREADY passed `isApprovalCurrent` on the exact raw object and has been through
 * `stripInternalFields` (see pull.ts). Nothing here re-checks approval.
 *
 * Approval record in the output: the site gate (`isShown`) recomputes the hash over the VIEW MODEL it is given, which is
 * different from the Sanity document. So after a successful mapping this module signs the view model with the real
 * `approvalFields` from @ablepoint/schemas, using the approver and time recorded on the Sanity document. The result is that
 * `isShown(doc, 'production', allowList)` still checks the approver allow-list and still withdraws the document if the
 * generated file is edited by hand.
 */
import { approvalFields } from '@ablepoint/schemas';
import type { HelpFaq } from '../../data/faqs';
import type { Faq, Guide, GuideSection, LegalPage, Region, Vacancy } from '../../data/types';

export const CMS_OUTPUT_TYPES = ['region', 'guide', 'faq', 'vacancy', 'legalPage'] as const;
export type CmsOutputType = (typeof CMS_OUTPUT_TYPES)[number];

/** The view-model type each output file holds. */
export interface CmsOutputMap {
  region: Region;
  guide: Guide;
  faq: HelpFaq;
  vacancy: Vacancy;
  legalPage: LegalPage;
}

export type RawDoc = Record<string, unknown>;

/** A document that has passed the approval gate. `doc` is the raw document with internal-only and review fields removed. */
export interface GatedDoc {
  readonly id: string;
  readonly type: string;
  readonly doc: Readonly<Record<string, unknown>>;
  /** Taken from the raw document AFTER the gate passed (stripInternalFields removes them from `doc`). */
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly reviewedAt?: string;
}

export interface MapContext {
  /** A referenced document, only if it was fetched and passed the gate itself. */
  ref(id: string): GatedDoc | undefined;
  /** Slugs of services marked available in this region by approved serviceCoverage documents, sorted. */
  coveredServiceSlugs(regionId: string): readonly string[];
}

export type MapFailureKind = 'mapping' | 'reference';
export type MapResult<T> = { ok: true; value: T } | { ok: false; kind: MapFailureKind; reason: string };

class MapError extends Error {
  constructor(
    readonly kind: MapFailureKind,
    message: string,
  ) {
    super(message);
  }
}
function fail(message: string): never {
  throw new MapError('mapping', message);
}

function attempt<T>(fn: () => T): MapResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof MapError) return { ok: false, kind: err.kind, reason: err.message };
    // Anything else is a surprise in the document's shape. Report it without echoing the message (it could contain data).
    return { ok: false, kind: 'mapping', reason: 'unexpected document shape' };
  }
}

// ---- field readers (each throws MapError with a reason that names the field, not the value) ----

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(d: Readonly<Record<string, unknown>>, key: string, where: string): string {
  const v = d[key];
  if (typeof v !== 'string' || v.trim() === '') return fail(`${where}.${key} is missing or empty`);
  return v;
}

function isoDate(v: unknown, label: string): string {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return fail(`${label} is missing or not a date`);
  return v;
}

function optIsoDate(d: Readonly<Record<string, unknown>>, key: string, where: string): string | undefined {
  const v = d[key];
  if (v === undefined || v === null) return undefined;
  return isoDate(v, `${where}.${key}`);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function slugOf(d: Readonly<Record<string, unknown>>, where: string): string {
  const s = d.slug;
  const current = isRecord(s) ? s.current : undefined;
  if (typeof current !== 'string' || !SLUG_RE.test(current)) return fail(`${where}.slug is missing or not a valid slug`);
  return current;
}

function stringList(d: Readonly<Record<string, unknown>>, key: string, where: string): string[] {
  const v = d[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x.trim() === '')) return fail(`${where}.${key} is not a list of text`);
  return v as string[];
}

function refId(v: unknown, label: string): string {
  if (!isRecord(v) || typeof v._ref !== 'string' || v._ref === '') return fail(`${label} is not a reference`);
  return v._ref;
}

function resolve(ctx: MapContext, v: unknown, expectedType: string, label: string): GatedDoc {
  const target = ctx.ref(refId(v, label));
  if (!target) throw new MapError('reference', `${label} points at a document that is not available and approved`);
  if (target.type !== expectedType) return fail(`${label} points at a document of the wrong type`);
  return target;
}

/** Embedded `{q, a}` pairs from `faq` references. `a` is the faq's short answer (apps/studio README, "Deviations from docs/06"). */
function faqPairs(d: Readonly<Record<string, unknown>>, ctx: MapContext, where: string): Faq[] {
  const v = d.faqs;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return fail(`${where}.faqs is not a list`);
  return v.map((item, i) => {
    const target = resolve(ctx, item, 'faq', `${where}.faqs[${i}]`);
    return { q: text(target.doc, 'question', `faq`), a: text(target.doc, 'shortAnswer', `faq`) };
  });
}

/**
 * Portable Text to paragraphs, only when lossless. Accepts plain `normal` blocks whose spans carry no marks. Blank paragraphs are
 * dropped. Everything else fails the document: headings, quotes, lists, bold or italic, links, and any non-block member.
 */
export function portableTextToParagraphs(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return fail(`${label} is not Portable Text`);
  const out: string[] = [];
  value.forEach((block, i) => {
    const at = `${label}[${i}]`;
    if (!isRecord(block) || block._type !== 'block') return fail(`${at} is not a text block`);
    if (block.style !== undefined && block.style !== 'normal') return fail(`${at} uses a heading or quote style that plain paragraphs cannot hold`);
    if (block.listItem !== undefined) return fail(`${at} is a list item that plain paragraphs cannot hold`);
    const children = block.children;
    if (!Array.isArray(children)) return fail(`${at} has no children`);
    let line = '';
    children.forEach((span, j) => {
      if (!isRecord(span) || span._type !== 'span' || typeof span.text !== 'string') return fail(`${at}.children[${j}] is not a text span`);
      if (span.marks !== undefined && (!Array.isArray(span.marks) || span.marks.length > 0)) return fail(`${at}.children[${j}] has bold, italic or link formatting that plain paragraphs cannot hold`);
      line += span.text;
    });
    if (line.trim() !== '') out.push(line);
  });
  return out;
}

function sectionList(d: Readonly<Record<string, unknown>>, where: string, required: boolean): GuideSection[] {
  const v = d.sections;
  if (v === undefined || v === null) return required ? fail(`${where}.sections is missing`) : [];
  if (!Array.isArray(v)) return fail(`${where}.sections is not a list`);
  if (required && v.length === 0) return fail(`${where}.sections is empty`);
  return v.map((s, i) => {
    if (!isRecord(s)) return fail(`${where}.sections[${i}] is not an object`);
    return { heading: text(s, 'heading', `${where}.sections[${i}]`), body: portableTextToParagraphs(s.body, `${where}.sections[${i}].body`) };
  });
}

function sourceList(d: Readonly<Record<string, unknown>>, where: string): { label: string; url: string }[] {
  const v = d.sources;
  if (!Array.isArray(v) || v.length === 0) return fail(`${where}.sources is missing or empty`);
  return v.map((s, i) => {
    if (!isRecord(s)) return fail(`${where}.sources[${i}] is not an object`);
    const url = text(s, 'url', `${where}.sources[${i}]`);
    let ok = false;
    try {
      ok = new URL(url).protocol === 'https:';
    } catch {
      ok = false;
    }
    if (!ok) return fail(`${where}.sources[${i}].url is not an https link`);
    return { label: text(s, 'label', `${where}.sources[${i}]`), url };
  });
}

/**
 * Adds `updatedAt`, `missingFacts` (when present) and the signed approval record to mapped content.
 * `updatedAt` is Sanity's `_updatedAt`; it is required, never invented.
 */
function finish<C extends object>(g: GatedDoc, content: C) {
  const updatedAt = isoDate(g.doc._updatedAt, '_updatedAt');
  const mf = g.doc.missingFacts;
  if (mf !== undefined && mf !== null && (!Array.isArray(mf) || mf.some((x) => typeof x !== 'string'))) return fail('missingFacts is not a list of text');
  const approvedAt = new Date(g.approvedAt);
  if (Number.isNaN(approvedAt.getTime())) return fail('approvedAt is not a date');
  const unsigned = { ...content, updatedAt, ...(Array.isArray(mf) ? { missingFacts: mf as string[] } : {}) };
  return { ...unsigned, ...approvalFields(unsigned as Record<string, unknown>, g.approvedBy, approvedAt) };
}

// ---- per-type mappers ----

export function mapRegion(g: GatedDoc, ctx: MapContext): MapResult<Region> {
  const d = g.doc;
  return attempt(() => {
    const head = d.isHeadOfficeRegion;
    if (head !== undefined && head !== null && typeof head !== 'boolean') fail('region.isHeadOfficeRegion is not true or false');
    return finish(g, {
      slug: slugOf(d, 'region'),
      name: text(d, 'name', 'region'),
      summary: text(d, 'summary', 'region'),
      ...(typeof head === 'boolean' ? { isHeadOfficeRegion: head } : {}),
      services: [...ctx.coveredServiceSlugs(g.id)],
      faqs: faqPairs(d, ctx, 'region'),
    });
  });
}

export function mapGuide(g: GatedDoc, ctx: MapContext): MapResult<Guide> {
  const d = g.doc;
  return attempt(() => {
    const author = resolve(ctx, d.author, 'author', 'guide.author');
    const reviewer = d.reviewer === undefined || d.reviewer === null ? undefined : resolve(ctx, d.reviewer, 'author', 'guide.reviewer');
    const publishedAt = optIsoDate(d, 'publishedAt', 'guide');
    const reviewedAt = g.reviewedAt === undefined ? undefined : isoDate(g.reviewedAt, 'reviewedAt');
    return finish(g, {
      slug: slugOf(d, 'guide'),
      title: text(d, 'title', 'guide'),
      answer: text(d, 'answer', 'guide'),
      sections: sectionList(d, 'guide', true),
      sources: sourceList(d, 'guide'),
      faqs: faqPairs(d, ctx, 'guide'),
      author: text(author.doc, 'name', 'author'),
      ...(reviewer ? { reviewer: text(reviewer.doc, 'name', 'author') } : {}),
      ...(reviewedAt ? { reviewedAt } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
  });
}

/** The topics the site's /faq page groups by. A Sanity faq must carry exactly one of them to map. */
export const HELP_FAQ_TOPICS = ['Referrals', 'Housing', 'Money and agreements', 'Privacy and safety'] as const;
// Compile-time guard: fails `astro check` if the site adds a topic this list does not know about.
const _topicsComplete: Exclude<HelpFaq['topic'], (typeof HELP_FAQ_TOPICS)[number]> extends never ? true : never = true;
void _topicsComplete;

export function mapFaq(g: GatedDoc, _ctx: MapContext): MapResult<HelpFaq> {
  const d = g.doc;
  return attempt(() => {
    const topics = d.topics;
    const topic = Array.isArray(topics) && topics.length === 1 ? topics[0] : undefined;
    if (typeof topic !== 'string' || !(HELP_FAQ_TOPICS as readonly string[]).includes(topic)) {
      return fail('faq.topics must hold exactly one of the site topics');
    }
    return finish(g, { topic: topic as HelpFaq['topic'], q: text(d, 'question', 'faq'), a: text(d, 'shortAnswer', 'faq') });
  });
}

/** Statuses the site build is allowed to see. Mirrors `vacanciesQuery`; anything else is refused even if a query returned it. */
export const PUBLISHABLE_VACANCY_STATUSES = ['available', 'temporarilyUnavailable', 'filled'] as const;
const VACANCY_TYPES = ['SIL', 'SDA', 'STA'] as const;

export function mapVacancy(g: GatedDoc, ctx: MapContext): MapResult<Vacancy> {
  const d = g.doc;
  return attempt(() => {
    const status = d.status;
    if (typeof status !== 'string' || !(PUBLISHABLE_VACANCY_STATUSES as readonly string[]).includes(status)) {
      return fail('vacancy.status is not one the site may publish');
    }
    const type = d.type;
    if (typeof type !== 'string' || !(VACANCY_TYPES as readonly string[]).includes(type)) return fail('vacancy.type is not SIL, SDA or STA');
    const region = resolve(ctx, d.region, 'region', 'vacancy.region');
    const lastVerifiedAt = optIsoDate(d, 'lastVerifiedAt', 'vacancy');
    return finish(g, {
      slug: slugOf(d, 'vacancy'),
      title: text(d, 'title', 'vacancy'),
      regionSlug: slugOf(region.doc, 'region'),
      suburb: text(d, 'suburb', 'vacancy'),
      type: type as Vacancy['type'],
      status: status as Vacancy['status'],
      summary: text(d, 'summary', 'vacancy'),
      features: stringList(d, 'features', 'vacancy'),
      ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
    });
  });
}

export function mapLegalPage(g: GatedDoc, _ctx: MapContext): MapResult<LegalPage> {
  const d = g.doc;
  return attempt(() =>
    finish(g, {
      slug: slugOf(d, 'legalPage'),
      title: text(d, 'title', 'legalPage'),
      description: text(d, 'description', 'legalPage'),
      sections: sectionList(d, 'legalPage', false),
    }),
  );
}

export const MAPPERS: { [K in CmsOutputType]: (g: GatedDoc, ctx: MapContext) => MapResult<CmsOutputMap[K]> } = {
  region: mapRegion,
  guide: mapGuide,
  faq: mapFaq,
  vacancy: mapVacancy,
  legalPage: mapLegalPage,
};

/** Runs the mapper for `type`. */
export function mapDocument(type: CmsOutputType, g: GatedDoc, ctx: MapContext): MapResult<CmsOutputMap[CmsOutputType]> {
  return (MAPPERS[type] as (g: GatedDoc, ctx: MapContext) => MapResult<CmsOutputMap[CmsOutputType]>)(g, ctx);
}

/** Slug used for ordering and duplicate detection. Types without a slug (faq) return undefined. */
export function slugOfOutput(type: CmsOutputType, value: CmsOutputMap[CmsOutputType]): string | undefined {
  return type === 'faq' ? undefined : (value as { slug: string }).slug;
}

/** Service slug from a gated `service` document. Used for `region.services`. */
export function serviceSlug(g: GatedDoc): string | undefined {
  try {
    return slugOf(g.doc, 'service');
  } catch {
    return undefined;
  }
}
