/**
 * Sanity -> site "pull" pipeline. Follows the order documented in apps/studio/src/queries.ts exactly:
 *
 *   1. fetch RAW documents with the queries exported by apps/studio/src/queries.ts (imported, not copied);
 *   2. run `isApprovalCurrent(doc)` on the exact raw object (the HARD gate);
 *   3. only then `stripInternalFields`;
 *   4. resolve references: collect ids with `collectRefIds`, fetch those documents raw with `byIdsQuery`, and gate each one too;
 *   5. map to the site's view models (map.ts); a document with an unavailable reference, or one that cannot be mapped
 *      losslessly, is excluded;
 *   6. write deterministic JSON (sorted keys, stable ordering) plus a manifest.
 *
 * Everything is computed in memory first. Files are written only if every step succeeded, so a failed fetch leaves the
 * previous output untouched. Documents that fail are left out of the output and counted, with their ids, in `_manifest.json`.
 *
 * Not wired into the site: nothing in src/pages or src/data imports this file. See README.md in this folder.
 */
import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isApprovalCurrent, type Reviewable } from '@ablepoint/schemas';
import { SITE_QUERIES, byIdsQuery, collectRefIds, stripInternalFields } from '../../../../studio/src/queries';
import { SANITY_API_VERSION, SANITY_PERSPECTIVE, type SanityClient } from './fetch';
import { CMS_OUTPUT_TYPES, mapDocument, serviceSlug, slugOfOutput, type CmsOutputMap, type CmsOutputType, type GatedDoc, type MapContext, type RawDoc } from './map';

export class PullError extends Error {
  override readonly name = 'PullError';
}

export const EXCLUSION_REASONS = ['notApproved', 'approvalStale', 'mappingFailed', 'referenceNotApproved'] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

/** Which query fetches each output type. Imported from the Studio so the two cannot drift. */
const OUTPUT_QUERIES: Record<CmsOutputType, string> = {
  region: SITE_QUERIES.regions,
  guide: SITE_QUERIES.guides,
  faq: SITE_QUERIES.faqs,
  vacancy: SITE_QUERIES.vacancies,
  legalPage: SITE_QUERIES.legalPages,
};

/** At most this many ids per by-id request, to keep the GET URL short. */
export const REF_CHUNK_SIZE = 25;

// ---- sources ----

export interface DocumentSource {
  readonly kind: 'sanity' | 'fixture';
  readonly dataset: string | null;
  collection(spec: { type: string; query: string }): Promise<unknown[]>;
  byIds(spec: { ids: readonly string[]; query: string }): Promise<unknown[]>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDraftOrVersionId = (id: string) => id.startsWith('drafts.') || id.startsWith('versions.');
/** Sanity asset documents (images and files). They have no reviewState and nothing in the site types uses them. */
const isAssetId = (id: string) => /^(image|file)-/.test(id);

function asList(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new PullError('The source returned something other than a list of documents.');
  return value;
}

export function httpSource(client: SanityClient, dataset: string): DocumentSource {
  return {
    kind: 'sanity',
    dataset,
    async collection({ query }) {
      return asList(await client.query(query));
    },
    async byIds({ ids, query }) {
      return asList(await client.query(query, { ids: [...ids] }));
    },
  };
}

/**
 * Offline source over a list of raw documents. It applies the same id-path rule as the queries (no `drafts.` or `versions.`
 * ids) but deliberately does NOT apply the `reviewState == "approved"` pre-filter, so the gate itself is what gets exercised.
 * It does not evaluate the vacancy status filter either; map.ts refuses unpublishable statuses on its own.
 */
export function fixtureSource(documents: unknown): DocumentSource {
  const all = asList(documents);
  return {
    kind: 'fixture',
    dataset: null,
    async collection({ type }) {
      return all.filter((d) => isRecord(d) && d._type === type && !(typeof d._id === 'string' && isDraftOrVersionId(d._id)));
    },
    async byIds({ ids }) {
      return all.filter((d) => isRecord(d) && typeof d._id === 'string' && ids.includes(d._id) && !isDraftOrVersionId(d._id));
    },
  };
}

// ---- the gate ----

export type GateResult = { ok: true; gated: GatedDoc } | { ok: false; reason: 'notApproved' | 'approvalStale' };

/**
 * Step 2 and 3. `isApprovalCurrent` runs on `raw` itself, before anything touches it. Only a document that passes is stripped.
 * A `drafts.` or `versions.` id is refused here as a second line of defence: an approved draft is not a published document.
 */
export function gate(raw: RawDoc): GateResult {
  const id = String(raw._id);
  if (isDraftOrVersionId(id) || raw.reviewState !== 'approved') return { ok: false, reason: 'notApproved' };
  if (!isApprovalCurrent(raw as unknown as Reviewable)) return { ok: false, reason: 'approvalStale' };
  const { approvedBy, approvedAt, reviewedAt } = raw;
  if (typeof approvedBy !== 'string' || typeof approvedAt !== 'string' || Number.isNaN(Date.parse(approvedAt))) return { ok: false, reason: 'approvalStale' };
  const doc = stripInternalFields(raw) as Record<string, unknown>;
  return {
    ok: true,
    gated: { id, type: String(raw._type), doc, approvedBy, approvedAt, ...(typeof reviewedAt === 'string' ? { reviewedAt } : {}) },
  };
}

function checkedDocs(list: unknown[], what: string, expectedType?: string): RawDoc[] {
  return list.map((d) => {
    if (!isRecord(d) || typeof d._id !== 'string' || typeof d._type !== 'string' || (expectedType !== undefined && d._type !== expectedType)) {
      throw new PullError(`The source returned a malformed document in ${what}.`);
    }
    return d;
  });
}

// ---- manifest ----

export interface TypeReport {
  fetched: number;
  written: number;
  excluded: Record<ExclusionReason, number>;
}

export interface Exclusion {
  type: string;
  id: string;
  reason: ExclusionReason;
  /** Field names and positions only. Never document content. */
  detail?: string;
}

export interface Manifest {
  schemaVersion: 1;
  /** `fixture` when read from a local file, `sanity` when fetched. */
  source: 'sanity' | 'fixture';
  /** The dataset name. Never the token. `null` for a fixture run. */
  dataset: string | null;
  apiVersion: string | null;
  perspective: typeof SANITY_PERSPECTIVE;
  types: Record<CmsOutputType, TypeReport>;
  /** Documents used only as input (not written). */
  support: {
    serviceCoverage: { fetched: number; passedGate: number; excluded: { notApproved: number; approvalStale: number } };
  };
  references: { requested: number; resolved: number; failedGate: number; notReturned: number };
  exclusions: Exclusion[];
}

export interface PullResult {
  manifest: Manifest;
  /** File name -> exact text to write. */
  files: Record<string, string>;
  outputs: { [K in CmsOutputType]: CmsOutputMap[K][] };
}

// ---- deterministic JSON ----

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      if (value[k] !== undefined) out[k] = sortKeys(value[k]);
    }
    return out;
  }
  return value;
}

/** JSON with object keys sorted at every depth, two-space indent and a trailing newline. Array order is preserved. */
export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

// ---- the pipeline ----

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const zeroReasons = (): Record<ExclusionReason, number> => ({ notApproved: 0, approvalStale: 0, mappingFailed: 0, referenceNotApproved: 0 });

export async function runPull(source: DocumentSource): Promise<PullResult> {
  const exclusions: Exclusion[] = [];
  const types = {} as Record<CmsOutputType, TypeReport>;
  const exclude = (type: string, id: string, reason: ExclusionReason, detail?: string) => exclusions.push({ type, id, reason, ...(detail ? { detail } : {}) });

  // Steps 1 to 3: fetch raw, gate, strip.
  const gatedByType = {} as Record<CmsOutputType, GatedDoc[]>;
  for (const type of CMS_OUTPUT_TYPES) {
    const raws = checkedDocs(await source.collection({ type, query: OUTPUT_QUERIES[type] }), type, type);
    types[type] = { fetched: raws.length, written: 0, excluded: zeroReasons() };
    gatedByType[type] = [];
    for (const raw of raws) {
      const r = gate(raw);
      if (r.ok) gatedByType[type].push(r.gated);
      else {
        types[type].excluded[r.reason]++;
        exclude(type, String(raw._id), r.reason);
      }
    }
  }
  const coverageRaws = checkedDocs(await source.collection({ type: 'serviceCoverage', query: SITE_QUERIES.serviceCoverage }), 'serviceCoverage', 'serviceCoverage');
  const coverage: GatedDoc[] = [];
  const coverageReport = { fetched: coverageRaws.length, passedGate: 0, excluded: { notApproved: 0, approvalStale: 0 } };
  for (const raw of coverageRaws) {
    const r = gate(raw);
    if (r.ok) {
      coverage.push(r.gated);
      coverageReport.passedGate++;
    } else {
      coverageReport.excluded[r.reason]++;
      exclude('serviceCoverage', String(raw._id), r.reason);
    }
  }

  // Step 4: resolve references. Each referenced document is fetched raw by id and must pass the gate itself.
  const refsOf = (g: GatedDoc) => collectRefIds(g.doc).filter((id) => !isAssetId(id));
  const wanted = new Set<string>();
  for (const g of [...CMS_OUTPUT_TYPES.flatMap((t) => gatedByType[t]), ...coverage]) refsOf(g).forEach((id) => wanted.add(id));
  const ids = [...wanted].sort(cmp);
  const resolved = new Map<string, GatedDoc>();
  let failedGate = 0;
  for (let i = 0; i < ids.length; i += REF_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + REF_CHUNK_SIZE);
    for (const raw of checkedDocs(await source.byIds({ ids: chunk, query: byIdsQuery }), 'referenced documents')) {
      if (!chunk.includes(String(raw._id)) || resolved.has(String(raw._id))) continue;
      const r = gate(raw);
      if (r.ok) resolved.set(r.gated.id, r.gated);
      else failedGate++;
    }
  }
  const references = { requested: ids.length, resolved: resolved.size, failedGate, notReturned: ids.length - resolved.size - failedGate };

  // Region.services comes only from approved coverage documents that say "available" and whose service and region both resolved.
  const covered = new Map<string, Set<string>>();
  for (const c of coverage) {
    if (c.doc.available !== true) continue;
    const regionId = isRecord(c.doc.region) ? c.doc.region._ref : undefined;
    const serviceId = isRecord(c.doc.service) ? c.doc.service._ref : undefined;
    if (typeof regionId !== 'string' || typeof serviceId !== 'string') continue;
    const region = resolved.get(regionId);
    const service = resolved.get(serviceId);
    const slug = service && service.type === 'service' ? serviceSlug(service) : undefined;
    if (!region || region.type !== 'region' || !slug) continue;
    const set = covered.get(regionId) ?? new Set<string>();
    set.add(slug);
    covered.set(regionId, set);
  }
  const ctx: MapContext = {
    ref: (id) => resolved.get(id),
    coveredServiceSlugs: (regionId) => [...(covered.get(regionId) ?? [])].sort(cmp),
  };

  // Step 5: map.
  const outputs = {} as { [K in CmsOutputType]: CmsOutputMap[K][] };
  for (const type of CMS_OUTPUT_TYPES) {
    const mapped: { g: GatedDoc; value: CmsOutputMap[CmsOutputType] }[] = [];
    for (const g of gatedByType[type]) {
      const missing = refsOf(g).filter((id) => !resolved.has(id));
      if (missing.length) {
        types[type].excluded.referenceNotApproved++;
        exclude(type, g.id, 'referenceNotApproved', `referenced document(s) not available and approved: ${missing.sort(cmp).join(', ')}`);
        continue;
      }
      const r = mapDocument(type, g, ctx);
      if (r.ok) mapped.push({ g, value: r.value });
      else {
        const reason: ExclusionReason = r.kind === 'reference' ? 'referenceNotApproved' : 'mappingFailed';
        types[type].excluded[reason]++;
        exclude(type, g.id, reason, r.reason);
      }
    }
    // Two documents with one slug would claim the same URL. Neither can be chosen, so neither is written.
    const bySlug = new Map<string, number>();
    for (const m of mapped) {
      const s = slugOfOutput(type, m.value);
      if (s !== undefined) bySlug.set(s, (bySlug.get(s) ?? 0) + 1);
    }
    const kept = mapped.filter((m) => {
      const s = slugOfOutput(type, m.value);
      if (s !== undefined && (bySlug.get(s) ?? 0) > 1) {
        types[type].excluded.mappingFailed++;
        exclude(type, m.g.id, 'mappingFailed', 'another approved document of this type has the same slug');
        return false;
      }
      return true;
    });
    // Stable order: by slug then id; faqs (no slug) by creation time then id.
    kept.sort((a, b) => {
      const ka = slugOfOutput(type, a.value) ?? String(a.g.doc._createdAt ?? '');
      const kb = slugOfOutput(type, b.value) ?? String(b.g.doc._createdAt ?? '');
      return cmp(ka, kb) || cmp(a.g.id, b.g.id);
    });
    (outputs as Record<CmsOutputType, unknown[]>)[type] = kept.map((m) => m.value);
    types[type].written = kept.length;
  }

  exclusions.sort((a, b) => cmp(a.type, b.type) || cmp(a.id, b.id) || cmp(a.reason, b.reason));
  const manifest: Manifest = {
    schemaVersion: 1,
    source: source.kind,
    dataset: source.dataset,
    apiVersion: source.kind === 'sanity' ? SANITY_API_VERSION : null,
    perspective: SANITY_PERSPECTIVE,
    types,
    support: { serviceCoverage: coverageReport },
    references,
    exclusions,
  };
  const files: Record<string, string> = { '_manifest.json': stableStringify(manifest) };
  for (const type of CMS_OUTPUT_TYPES) files[`${type}.json`] = stableStringify(outputs[type]);
  return { manifest, files, outputs };
}

// ---- output location and writing ----

/**
 * The folder the CLI may write to. Default `<webRoot>/src/content/cms`. Anything that resolves (through symlinks) outside
 * `webRoot`, or to `webRoot` itself, is refused.
 */
export function resolveOutDir(webRoot: string, requested?: string, cwd: string = process.cwd()): string {
  const root = realpathSync(webRoot);
  const target = requested === undefined ? join(root, 'src', 'content', 'cms') : resolve(cwd, requested);
  let existing = target;
  const tail: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    tail.unshift(basename(existing));
    existing = parent;
  }
  const real = join(realpathSync(existing), ...tail);
  const rel = relative(root, real);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new PullError('--out must be a folder inside apps/web.');
  }
  return real;
}

/** Writes every file to a temporary name first, then renames them all, so a failure part-way leaves the old files in place. */
export function writeOutputs(files: Readonly<Record<string, string>>, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const names = Object.keys(files).sort(cmp);
  const tmp = names.map((n) => join(outDir, `.${n}.${process.pid}.tmp`));
  try {
    names.forEach((n, i) => writeFileSync(tmp[i]!, files[n]!, 'utf8'));
    names.forEach((n, i) => renameSync(tmp[i]!, join(outDir, n)));
  } catch (err) {
    for (const t of tmp) rmSync(t, { force: true });
    throw err;
  }
  return names.map((n) => join(outDir, n));
}
