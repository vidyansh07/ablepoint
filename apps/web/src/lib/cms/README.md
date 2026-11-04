# CMS pull adapter (Sanity to site)

This folder holds the code that will let the site read approved content from Sanity instead of the typed files in `src/data`. It is built and tested, and it is **not connected to the site**. A normal build still reads `src/data` exactly as before.

## Status (honest)

| Item | State |
|---|---|
| Code and unit tests | Written. Tests are in `tests/cms.test.ts` and use fake documents only. |
| Run against a real Sanity project or dataset | **Never.** No project, dataset or token exists. |
| The queries | They are the ones in `apps/studio/src/queries.ts`, imported not copied. They have only ever been checked for shape. **Not tested against real data.** |
| HTTP client | Checked with an injected `fetch` (URL, headers, timeout, size cap, error wording). Never sent a real request. Based on Sanity's published Query API reference, read on 3 Nov 2026. |
| Extra system fields | **Unverified.** The approval hash covers every field except a short list (`_id`, `_rev`, `_createdAt`, `_updatedAt` and the review fields). If Sanity adds another metadata field that differs between a draft and its published copy, hashes will stop matching. The result is safe: documents are excluded, never wrongly shown. It would show up as "approvalStale" for everything on the first real run. |
| Wiring into `src/data` or any page | **Not done** (see "How it will be wired"). |
| `astro build` with this code present | Not run. `import.meta.glob` in `source.ts` is covered by the unit tests only. |

## What it does

`pnpm --filter @ablepoint/web cms:pull` runs this pipeline, in the order documented in `apps/studio/src/queries.ts`:

1. Fetch **raw** documents (`published` perspective) using the Studio's own queries.
2. Run `isApprovalCurrent(doc)` from `@ablepoint/schemas` on the exact raw object. This is the hard gate. It checks that the document is approved, has an approver and time, and that the stored hash matches the document's content now.
3. Only for documents that pass: remove internal-only and review fields (`stripInternalFields`).
4. Resolve references. Every referenced document is fetched raw by id (`byIdsQuery`) and must pass the gate itself. Image and file asset references are not documents and are skipped.
5. Map to the site's types (`map.ts`). A document with a reference that is missing or not approved is excluded. A document that cannot be mapped without losing or guessing something is excluded.
6. Write sorted-key JSON to `src/content/cms/<type>.json` and a `_manifest.json`.

Nothing is written unless every step succeeds. If a fetch fails, the previous files are left alone.

### Types

| File | Site type | Notes |
|---|---|---|
| `region.json` | `Region` | `services` comes only from approved `serviceCoverage` documents marked available, whose service and region both passed the gate. If there are none it is `[]`. |
| `guide.json` | `Guide` | `author` and `reviewer` are the `name` of approved `author` documents. `reviewedAt` is the guide's own "Last reviewed" date. |
| `faq.json` | `HelpFaq` (the /faq page) | The Sanity `topics` list must hold exactly one of the four topics the page groups by. Otherwise the FAQ is excluded. `a` is the short answer; the long answer has no place in the site type. |
| `vacancy.json` | `Vacancy` | `regionSlug` comes from the approved region. Only `available`, `temporarilyUnavailable` and `filled` are accepted. |
| `legalPage.json` | `LegalPage` | `easyRead` is not carried (Sanity has no such field). `version` and `effectiveDate` are not carried (the site type has no place for them). |

**Not mapped: `service`.** The site's `Service` type requires `icon` and `tint`. The Sanity `service` schema has neither field, and they cannot be worked out from other fields without inventing them. Services stay on the local file until the Studio schema gains those two fields.

Other Sanity types (`siteSettings`, `navigation`, `footer`, `page`, `landingPage`, `redirect`, `testimonial`, `teamMember`, `property`, `cta`) were not attempted. `author` and `serviceCoverage` are read as inputs only.

Sanity fields with no counterpart in the site types are not carried: for example `region.narrative`, `region.suburbs`, `seo`, photos, `accessibilityFeatures`, `faq.longAnswer`, `service.fundingNote`.

### Rich text

Portable Text becomes paragraphs only when that is lossless: plain paragraphs of unformatted text. Headings, quotes, bullet or numbered lists, bold or italic, links and images all make the document fail, because the site's `body: string[]` cannot hold them. The document is excluded and the manifest names the field and position (never the text). Relaxing this is a one-function change in `portableTextToParagraphs` and needs a decision from the content owner.

### The approval record in the output

The site gate (`src/lib/gate.ts`) recomputes the hash over the **site-side** document, which is not the Sanity document. So after a document passes the Sanity gate, `map.ts` signs the mapped document with `approvalFields(...)`, using the approver and time stored on the Sanity document. This means:

- `isShown(doc, 'production', allowList)` still works as today. The approver must be on the allow-list, and any hand edit to a generated file withdraws the document.
- The `approvedContentHash` in the output is **not** the Sanity hash. It is a hash of the mapped document.
- Two things to settle before go-live: the Studio stores a Sanity **user ID** in `approvedBy`, while `src/data/reviewers.json` holds "named people". The allow-list must contain the same strings the Studio writes, or nothing will show in production. (This fails closed.)

### Manifest

`_manifest.json` records: the source (`sanity` or `fixture`), the dataset name (never the token), the API version, per type the number fetched, written and excluded (by reason: `notApproved`, `approvalStale`, `mappingFailed`, `referenceNotApproved`), and a sorted list of every excluded document with its id and reason. Reasons name fields and positions only. It has no timestamp, so two runs on the same input give identical bytes.

Counts cover only what the queries returned. The real queries already filter on `reviewState == "approved"`, so on a real run `notApproved` will mostly be 0. The offline fixture source does not apply that filter, so it exercises the gate itself.

## Running it

Offline, from a JSON file of raw documents (an array):

```sh
pnpm --filter @ablepoint/web cms:pull -- --fixture tests/fixtures/cms/raw-documents.json --dry-run
pnpm --filter @ablepoint/web cms:pull -- --fixture tests/fixtures/cms/raw-documents.json --out node_modules/.cache/cms-try
```

Against Sanity (later, with a non-production dataset first):

```sh
SANITY_PROJECT_ID=... SANITY_DATASET=... SANITY_READ_TOKEN=... pnpm --filter @ablepoint/web cms:pull
```

All three variables are required. There are no defaults. The token is a read-only token from the Sanity project. It is sent only as an `Authorization: Bearer` header, never printed, and never written to any file or error message.

Options: `--fixture <file>`, `--out <dir>` (must be inside `apps/web`; default `src/content/cms`), `--dry-run` (print the manifest only). Exit code 0 on success, 1 on failure, 2 for a usage error.

### HTTP client choices

- `GET https://<projectId>.api.sanity.io/v2025-02-19/data/query/<dataset>?query=...&perspective=published`, parameters as `$name=<JSON>`.
- The `apicdn` host is not used, because a token is sent and the gate should see current data.
- Redirects are refused. 10 second timeout. 8 MiB response cap. Errors have fixed wording and never include the token, the URL's query or the response body.
- Reference lookups are sent in groups of 25 ids to keep each URL short.

## How it will be wired (later, after review)

`source.ts` exports `cmsOr(type, local)`. It returns the generated list only when `CONTENT_SOURCE=sanity` **and** the file exists. Otherwise it returns `local` unchanged.

In each data file, keep the local array and wrap the export, for example in `src/data/regions.ts`:

```ts
import { cmsOr } from '../lib/cms/source';
const localRegions: Region[] = [ /* existing entries */ ];
export const regions: Region[] = cmsOr('region', localRegions);
```

The same pattern applies to `guides` (`'guide'`), `helpFaqs` (`'faq'`), `vacancies` (`'vacancy'`) and `legalPages` (`'legalPage'`). Pages already filter with `visible()`, so the production gate still applies.

Build order: `pnpm --filter @ablepoint/web cms:pull`, then `CONTENT_SOURCE=sanity pnpm --filter @ablepoint/web build`. The pull is a separate step on purpose; the build never talks to Sanity.

Points to check when wiring:

- `cmsOr` replaces the whole list. Local entries with no CMS counterpart disappear (for example the local `easy-read` legal page has `easyRead` blocks that Sanity cannot hold).
- A related service or region that failed to map leaves its slug in other documents' lists. The pages already filter by what is visible, so it is not linked.
- If `CONTENT_SOURCE=sanity` and a type's file is missing, a warning is printed once and the local list is used.

## Why it is not wired yet (decision, 3 Nov 2026)

The adapter is complete and tested, but switching any data file to `cmsOr` today would **lose content that only exists in the local files**, because the Studio schemas lack the matching fields. These are the gaps to close first (all are Studio schema changes, to be made together with a real Sanity project):

| Site content | Gap in the Studio | Effect if wired now |
|---|---|---|
| Services (`icon`, `tint`) | `service` has no icon or tint | Services stay local (skipped by the adapter) |
| Region verified facts (`facts`: towns, about, partners, getting around, checked date) | `region` has no equivalent fields | Region pages would lose their fact sections |
| Easy Read blocks on legal pages (`easyRead`) | `legalPage` cannot hold them | The Easy Read page would disappear |
| Region photos and credits | Photos are a separate registry (`photos.registry.json`) | No effect on the registry, but photo choices stay in code |
| Home-page safety and funding blocks, testimonials, coordinator page | Not modelled in the Studio | Stay local |

Until those are closed, the local files remain the single source of truth, and the CMS path is proven only on fake documents.

## Before the first real run

1. Use a throw-away private dataset. On a public dataset, internal fields (`internalOwner`, `capacityNote`, `consentRef`) are readable by anyone; the pull strips them, but they are still exposed at the source.
2. Run the Studio Approve action on a few real test documents, publish them, then run `cms:pull --dry-run`. Expect `approvalStale` to be 0 for freshly approved documents. If everything is stale, look for an extra system field (see Status).
3. Check what actually arrived in `src/content/cms` against the Studio.
4. Decide whether `src/content/cms` is committed or generated in CI. It is not in `.gitignore` today.
