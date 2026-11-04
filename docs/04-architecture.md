# 04 — System Architecture

Status: **proposal for approval.** Nothing below has been built or provisioned.

## 1. Design principles

1. Static-first public site; no participant data ever touches the public site's build, repo, logs or analytics.
2. The CMS holds **public** content only. The restricted intake service is a separate security boundary with its own cloud account, identity, logs and backups.
3. The marketing CRM holds the minimum needed to run follow-up (contact details, source, case reference ID, stage). It never holds assessments, documents or support-need detail.
4. Automation moves **references (IDs, timestamps)**, not sensitive payloads, wherever possible.
5. Smallest maintainable architecture: one public app, one CMS studio, one intake API + staff UI. No shared UI package until a second consumer exists.

## 2. Logical architecture

```
                          ┌────────────────────────────── PUBLIC ZONE ───────────────────────────┐
 Visitors ──HTTPS──▶ CDN ─▶  Astro static site (Vercel)  ◀── build-time fetch ── Sanity (public content)
                          │      │  GTM/GA4 (consent-gated, no PII)                         ▲
                          │      │                                                          │ staff edit
                          └──────┼──────────────────────────────────────────────────────────┼────┘
                                 │ Step 1 enquiry (Turnstile token + minimal fields)         │
                                 ▼ direct browser POST (CORS allow-list, no Vercel hop)       │
 ┌────────────────────── RESTRICTED INTAKE ZONE (AU region, separate account) ──────────────────────┐
 │ API gateway + functions ─▶ PostgreSQL (encrypted) ─▶ private object store (docs, malware-scanned)│
 │ Identity (MFA) ─▶ Staff intake UI (RBAC, server-enforced) ─▶ audit log (append-only)             │
 └───────────────┬──────────────────────────────────────────────────────────────────────────────────┘
                 │ events: {caseRef, region, service, source, stage}   (no sensitive payload)
                 ▼
        Automation (n8n self-hosted, AU) ──▶ HubSpot (marketing CRM, minimal record)
                 │                      ├─▶ SMS/email provider (permitted acknowledgements only)
                 │                      ├─▶ Sanity API (vacancy sync, draft only)
                 │                      └─▶ Reporting (Looker Studio / sheet; aggregate numbers only)
```

### Zones and rules

| Zone | Contents | May hold personal info? | Notes |
|---|---|---|---|
| Public | Astro static output, Vercel CDN, GTM/GA4 | No (anonymous analytics only, consent-aware) | Vercel never receives form PII if Step 1 posts directly to the AU API |
| CMS | Sanity project/datasets | No participant data; staff identities only | Approved team profiles/testimonials need written consent records held elsewhere |
| Marketing CRM | HubSpot | Limited personal contact data; no health/support-need data | Hosting region and sensitive-data policy **not verified** (agent could not read pages) → treat as Australian-residency-unknown until confirmed |
| Restricted intake | DB, object store, staff UI | Yes (sensitive) | Separate account; synthetic data only outside production |
| Automation | n8n | Transient references | Self-host in AU; n8n Cloud is hosted in Frankfurt (official pricing page) → not for personal data |

## 3. Key architectural decisions (see 13 for the decision log)

| ID | Decision | Rationale | Status |
|---|---|---|---|
| AR-1 | Astro (static output) + TypeScript strict on Vercel | Matches mandatory decisions; minimal JS; Astro adapter only needed for on-demand rendering | Proposed |
| AR-2 | Step-1 form posts **directly** from browser to the AU intake API; Vercel functions do not process PII | Vercel Functions default to `iad1` (Washington); Sydney availability not verified in this pass; avoiding the hop removes a cross-border and logging surface | Proposed |
| AR-3 | Separate preview deployment (SSR) for draft previews, behind authentication; production stays fully static | Keeps production attack surface minimal | Proposed |
| AR-4 | Intake platform on AWS ap-southeast-2 as the **standard** option; Supabase Sydney as the **lean** option pending verification (see 05) | Control over logging, KMS, malware scanning, audit; Supabase facts gaps (DPA, support access) unverified | Decision D-05 |
| AR-5 | n8n self-hosted in the AU intake account for anything touching intake events | Sustainable Use Licence permits internal business use; avoids EU-hosted cloud | Proposed |
| AR-6 | CRM: HubSpot, minimal record + case reference ID | Roadmap choice; features/regions need verification before real data | Proposed |
| AR-7 | Build-time gate: a document renders in production only if its stored `approvedContentHash` matches the hash of its current content (and a named approver exists) | Provides the compliance gate without an Enterprise Sanity plan; any edit after approval withdraws it | **Implemented and unit-tested** in `@ablepoint/schemas`; Studio action in progress |
| AR-8 | Images and fonts processed at build (Astro image service/sharp), fonts self-hosted | Avoids per-image runtime billing and third-party font requests | Proposed |

## 4. Repository layout (smallest viable)

```
apps/web/            Astro public site (TypeScript strict)
apps/studio/         Sanity Studio config (schemas, desk structure, roles notes)
apps/intake-api/     Intake API + staff UI (only if/when intake is approved to build)
packages/schemas/    Zod contracts shared by web (form client) and intake-api (server)
automation/          n8n workflow exports (sanitised) + runbooks
scripts/             Crawl/redirect/parity/validation utilities
tests/               e2e (Playwright), a11y (axe), schema/SEO checks
docs/                this pack
```
`packages/ui` and `packages/config` are **not** created up front (candidate only). Tooling: pnpm workspaces, Vitest, Playwright, axe-core, Lighthouse CI, ESLint, Prettier. Exact versions chosen at scaffold time from current official docs (Vercel notes: Node.js 24 LTS default; Node 20 deprecated 1 Oct 2026).

## 5. Environments

| Env | Hosting | Data | Access | Indexing control |
|---|---|---|---|---|
| Local | developer machine | synthetic/mocked | developer | n/a |
| PR preview | Vercel preview deployments | synthetic CMS dataset (`staging`) | Vercel Authentication (team members) | `X-Robots-Tag: noindex`, no sitemap |
| Staging | Vercel project `ablepoint-staging` on a non-production hostname | synthetic; test credentials only; no production CRM/SMS | Deployment Protection; reviewers who are not Vercel team members need Shareable Links or the Password Protection add-on (**US$20/project/month on Pro, per Vercel pricing page**) — approval needed | auth wall **plus** noindex header; robots.txt is not relied on |
| Production | Vercel project on `ablepointaustralia.com.au` | real public content; intake separate | public | indexable; cutover only after explicit approval |

Vercel plan note (Verified, vercel.com/docs/plans/hobby, 3 Nov 2026): Hobby is restricted to non-commercial, personal use. A business website — including its staging — requires Pro (US$20/month base + US$20 per developer seat; viewer seats free).

Intake environments (dev/staging/prod) are separate cloud accounts or at minimum separate accounts-per-stage with no data copy from production to lower environments.

## 6. Performance and delivery design

- Prerendered pages by default; islands only for: mobile nav fallback enhancement, vacancy filter (progressively enhanced), intake form validation.
- Images: AVIF/WebP via build pipeline, explicit width/height, `fetchpriority=high` on hero only, lazy elsewhere.
- Fonts: 1–2 families, self-hosted woff2, subset to Latin, `font-display: swap`, preload the primary face.
- Third-party scripts: GTM only, loaded after consent; no session replay on intake pages; Turnstile only on form pages.
- Budgets (CI-enforced): JS ≤ 60 KB gzip on content pages (target; to be validated), LCP ≤ 2.5 s p75, INP ≤ 200 ms, CLS ≤ 0.1, Lighthouse mobile performance ≥ 90 on representative templates.
- Caching: immutable hashed assets (1 year), HTML revalidated; CMS publish → webhook → rebuild (full rebuild acceptable at this content scale).
- Rollback: Vercel promote/rollback to a previous deployment; DNS TTL lowered before cutover; WordPress kept intact and reachable for the cutover window.

## 7. Open technical verifications (before commitments)

1. Vercel function region options incl. Sydney (`syd1`) — **NOT VERIFIED**.
2. Vercel redirect limits (large 301 maps) and `vercel.ts`/Astro redirect behaviour — verify in docs at implementation time.
3. Sanity dataset region and document-history retention by plan — **NOT VERIFIED**.
4. HubSpot data-hosting region and sensitive-data acceptable-use position — **NOT VERIFIED** (help pages returned 404 to the research agent).
5. Supabase DPA, subprocessors, support-access model — **NOT VERIFIED**.
6. ACMA SMS Sender ID Register requirements — **NOT VERIFIED**.
7. Google Business Profile posts API availability for new projects — **NOT VERIFIED** (posts endpoint is documented; access gating unknown).
