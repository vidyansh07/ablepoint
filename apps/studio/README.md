# @ablepoint/studio — Sanity Studio schemas

Schema code for AblePoint's CMS (docs/06-cms-content-model.md, task P1-04).

## Status (honest)

| Item | State |
|---|---|
| 20 content types (18 documents, 2 object types) plus 8 page-builder block types | **Authored.** Typechecks (`tsc --noEmit`). |
| Validation rules (slugs, alt text, consent, banned phrases, contact details, street addresses, vacancy freshness, approval) | **Authored and unit-tested** as plain functions in `src/validation/`. Schema wiring checked with a fake `Rule` recorder. |
| Desk structure, singleton handling, webhook audit mapper, GROQ queries | **Authored and unit-tested** (queries are checked for shape only, not executed). |
| "Approve for publication" document action (`src/approve-action.ts`) | **Authored; type-checked against Sanity 6.21; decision logic unit-tested** (`src/approve-logic.ts`). **Never exercised in a running Studio.** It uses `useCurrentUser` and `useDocumentOperation`; behaviour inside Studio (patching a draft, creating a draft from a published document, release versions) is unverified. It does not run Studio validation and it does not publish. |
| Studio run in a browser (`sanity dev`) | **Run once locally on 4 Nov 2026 with a placeholder project id.** It builds and starts, and the schema now compiles: running it found a real bug the unit tests could not (page-builder blocks and inline list items used a default field group their types do not declare, so Studio crashed with "Field group 'content' is not defined in schema for type 'heroBlock'"). Fixed, with a regression test (`field-groups.test.ts`). Sanity's own `schema validate` reports 0 errors and 0 warnings, and `schema extract` compiles all 20 content types. Without a real project the Studio stops at "Project not found", so **no document form, desk structure, validation message or Approve action has been seen in a browser.** |
| Queries run against a dataset | **Not run.** |
| Sanity plan | **Not purchased.** The Free plan has only Administrator and Viewer roles; Growth (US$15/seat/month, per sanity.io/pricing on 3 Nov 2026) adds Editor, Developer and Contributor. |
| Webhook configured in Sanity | **Not done.** How a webhook exposes the acting user is **unverified**; the mapper records `"unknown"` when absent. |
| Integration with `apps/web` | **Not done.** The site still reads typed files in `apps/web/src/data`; `src/queries.ts` (raw-document queries) plus the gate is the intended replacement. |

Counts: see the test run in the task report; run `pnpm --filter @ablepoint/studio test`.

## How approval works

1. **Approve action (Studio).** A listed compliance reviewer (ID in `SANITY_STUDIO_COMPLIANCE_REVIEWER_IDS`) runs "Approve for publication" on a document that is *In review*. The action writes four fields onto the draft with `approvalFields(...)` from `@ablepoint/schemas`: `reviewState = approved`, `approvedBy`, `approvedAt` and `approvedContentHash`, a SHA-256 of the document's own content fields at that moment. With an empty allow-list the action is disabled and says why. It does not publish; a publisher publishes afterwards.
2. **Any later edit withdraws it.** Changing any content field changes the hash, so the stored hash no longer matches. Studio shows a warning; the site hides the document. The reviewer approves again. Bookkeeping (review fields, `_id`, `_rev`, `_createdAt`, `_updatedAt`) is excluded from the hash, so saving or publishing the approval does not invalidate it, and a published copy hashes the same as the draft it came from (both tested).
3. **Recomputed at build (HARD gate).** The build fetches the **raw** stored document (`src/queries.ts` has no projection, no `->`, no aliasing), runs `isApprovalCurrent(doc)` on exactly that object, and only then maps it to a view model, strips internal-only fields (`stripInternalFields`) and resolves references (`collectRefIds` + `byIdsQuery`; each referenced document is fetched raw and must pass the gate itself).
4. **Soft controls in Studio.** `approvedBy`/`approvedAt` are read-only unless the user is a listed reviewer; `approvedContentHash` is read-only and hidden; setting *Approved* by hand without the record is a validation error. These can be bypassed by anyone with API write access or an Administrator role. They guide editors; the build gate is what protects the live site.

Custom roles, content workflows and a built-in audit trail are **Enterprise-only** in Sanity (pricing page, 3 Nov 2026), which is why the gate is at build time.

### What the hash does NOT cover

- **Referenced documents.** References are hashed as the unresolved `{_ref}` value. Editing the FAQ a service points at does not invalidate the service's approval; the FAQ has its own approval and must pass the gate on its own. Pointing at a *different* document does change the hash.
- **Asset binary content.** An image is a reference to an asset; replacing the file behind the same asset id (not normally possible in Sanity) or editing image bytes is not detected. Alt text, caption and rights fields are in the document and are covered.
- **Anything outside the document**: the site template, other documents' wording, or facts that became untrue.
- **Validation.** The action does not check Studio validation (the Publish action does); approving a document with validation errors is possible but it cannot then be published from Studio.
- **Possible extra system fields (unverified).** The hash excludes only `_id`, `_rev`, `_createdAt`, `_updatedAt`. If Sanity adds other metadata (for example a `_system` object) that differs between a draft and its published copy, hashes would differ and approvals would silently fail closed (hidden, never wrongly shown). This must be checked against a real dataset before go-live.

## Public dataset warning

On the Free plan datasets are public: any published document is readable by anyone who knows the project ID. Fields marked INTERNAL (`vacancy.internalOwner`, `serviceCoverage.capacityNote`) are never queried by the site but **would be exposed** by a public dataset. Use a private dataset (Growth) before entering anything internal, and keep `internalOwner` a role label, never a person.

## Layout

```
sanity.config.ts      Studio config. Reads project ID, dataset, reviewer IDs from SANITY_STUDIO_* env. No defaults, no hard-coded IDs.
sanity.cli.ts         CLI config, same env.
src/schemas/          Types: site.ts (siteSettings, navigation, footer, cta, redirect), content.ts (page, service, region,
                      serviceCoverage, guide, faq, legalPage, landingPage), people.ts (author, teamMember, testimonial),
                      accommodation.ts (property, vacancy), objects.ts (seo, mediaAsset, navItem, blocks), shared.ts
src/validation/       Pure functions. Unit-testable without Sanity.
src/structure.ts      Desk: awaiting-review list, singletons, vacancies by status, one list per other type.
src/queries.ts        GROQ for the site build (raw documents) + post-gate helpers (stripInternalFields, collectRefIds).
src/approve-logic.ts  Pure availability/patch logic for the Approve action.
src/approve-action.ts The Studio document action (wires approve-logic to Sanity hooks). Registered in sanity.config.ts for all 18 document types.
src/webhook-audit.ts  Publish webhook payload -> {docId, docType, revision, actor, time, reviewState}. Body-free by construction.
src/env.ts            Strict env reader (used by sanity.config.ts and tests).
```

## Running it (later, after owner approval)

```sh
cp .env.example .env     # fill in a NON-production project/dataset
pnpm --filter @ablepoint/studio exec sanity dev
```

Do not point this at any real project until: the plan is approved and purchased, the dataset is private, the compliance reviewer IDs are known, and the Approve action and raw queries have been exercised against a throw-away dataset (including the draft/published hash check).

## Deviations from docs/06

- `redirect` carries the standard review fields instead of a separate `approved` boolean; the site derives "approved" from the gate.
- `docType` is added to the audit record (metadata only, no content).
- `faqs` are references to `faq` documents; `apps/web` types hold `{q, a}`, so queries alias `question`/`shortAnswer`.
- `serviceCoverage.capacityNote` and `vacancy.internalOwner` exist as specified but are risky in a public dataset (see warning above).
- Approval uses a content hash (`approvedContentHash`) rather than comparing timestamps, per the coordinator's decision.
- Guide `reviewer` is not hard-required at the schema level (the build/approval process should require it); `author` is.
