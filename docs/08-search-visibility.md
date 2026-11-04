# 08 — SEO, AEO, GEO and Local SEO Specification

## 1. Technical SEO requirements (built into templates)

| Area | Requirement | Check |
|---|---|---|
| Rendering | Prerendered crawlable HTML for all public pages | Fetch with JS disabled; compare text |
| Headings | Exactly one H1 per page, logical H2→H3, no skips | CI heading-outline test |
| Titles/descriptions | Unique, ≤ 60 / ≤ 155 characters (guideline), generated from CMS `seo` fields with fallbacks; **no meta keywords tag** | Metadata test; uniqueness report |
| Canonicals | Absolute, self-referencing, one per page, trailing-slash policy | Crawl |
| Indexability | `noindex` on thank-you, search, preview, staging; sitemap lists only indexable 200 URLs | Crawl vs sitemap |
| Sitemaps | Generated XML sitemap(s) with accurate `lastmod` = real content modification (not build time); robots.txt points to it | Validate; Search Console |
| Internal links | Breadcrumbs, related services/regions, hub pages; no `#` links | Link checker |
| Images | AVIF/WebP, width/height, descriptive alt (not keyword-stuffed), OG images | Image audit |
| Redirects | Per doc 07; single hop | Redirect test |
| 404/410 | Helpful 404 with search/phone/referral links; correct status | e2e |
| Duplicates | One canonical per topic; region×service consolidation | Similarity report |
| Freshness | `datePublished` (true), `dateModified`, visible "Reviewed on" for guides | Content model validation |
| Staging | Auth wall + `X-Robots-Tag: noindex` | Header test on every staging response |

## 2. Structured data (generated from CMS fields, validated)

| Type | Where | Notes |
|---|---|---|
| `Organization` (with `NGO`/`MedicalOrganization` **not** assumed — choose the most accurate type after review) | site-wide (home) | Correct legal/trading name (the current JSON-LD has "Ablepoint Austrialia"); phone in E.164; `sameAs` only to profiles that exist; registration number as plain text in description/`identifier` only if verified |
| `WebSite` | home | Add `SearchAction` only if a real site search exists |
| `BreadcrumbList` | all non-home | |
| `Service` | service pages | `provider` = Organization, `areaServed` = verified regions only |
| `LocalBusiness` | **only** where a verified premises/service-area profile exists; otherwise omit | No fictitious addresses; do not create one per region without verified premises |
| `Article` + `Person` | guides | Author and reviewer, `datePublished`, `dateModified` |
| `FAQPage` | pages with genuine visible Q&A | Eligibility for rich results is **not** assured and Google limits FAQ rich results for many sites; markup is for machine clarity only |
| `ItemList`/`Offer` for vacancies | **not used** until legal review of availability claims | Avoid implying commercial offers |

Validate syntax (Schema.org validator) and eligibility (Rich Results Test) separately; record outputs in `evidence/`.

## 3. AEO — answer-first content

Template for each guide/service FAQ: question as heading → 40–60 word direct answer → detail → source citations (NDIS Commission, NDIS, Services Australia pages as applicable) → author, reviewer, reviewed date → related links. Comparison tables where useful (SIL vs SDA, core vs capacity building). Plain-English (target reading age ≈ Year 8; Easy Read versions for key pages). Human review is mandatory for eligibility, funding and plan-management statements (roadmap guardrail G-08); the CMS gate (06) blocks publication until a named reviewer approves.

Initial guides: (1) changing NDIS providers, (2) SIL vs SDA, (3) short-term accommodation and respite, (4) what support coordination does. Owner of facts: AblePoint's NDIS-experienced reviewer (name needed – **Blocked**).

## 4. GEO — generative engine visibility

No promise of citations or rankings. Actions: consistent entity data (name, address policy, phone, registration number wording), crisp factual pages per service and region, authoritative references, crawlable public pages, an `llms.txt` is optional and **not** claimed to affect inclusion; allow reputable AI crawlers by robots policy decision of the owner (D-14), but never expose non-public data.

### Baseline prompt set (12) — proposed

| # | Prompt | Intent |
|---|---|---|
| 1 | "NDIS provider Central Coast NSW" | provider discovery |
| 2 | "supported independent living vacancies Central Coast" | vacancy |
| 3 | "SIL provider Newcastle NSW" | provider |
| 4 | "NDIS short term accommodation respite Newcastle" | STA |
| 5 | "NDIS support coordinator Dubbo" | coordination |
| 6 | "disability accommodation Orange NSW NDIS" | accommodation |
| 7 | "NDIS provider Tamworth" (only after region verified) | provider |
| 8 | "NDIS provider Gunnedah" (only after region verified) | provider |
| 9 | "SIL vs SDA difference NDIS" | education |
| 10 | "how do I change NDIS provider mid plan" | education |
| 11 | "what does an NDIS support coordinator do" | education |
| 12 | "AblePoint Australia NDIS provider" | brand/entity accuracy |

Log per run: engine, date/time, location setting, account type, exact prompt, mention (Y/N), nature (cited/listed/described), sources cited, factual accuracy (accurate/inaccurate/partial), geographic relevance, notes. Run monthly, same procedure; treat results as directional — models, personalisation and retrieval change between runs. The roadmap target ("mention in ≥ 4 of 12") is a hypothesis; there is no AI "visibility score" in this project.

## 5. Local SEO

Verified regions (user-confirmed for planning): Central Coast, Newcastle, Dubbo, Orange, Tamworth, Gunnedah. Head office Gosford (address not yet captured). **Not verified:** which regions have staffed premises, registration groups per region, capacity per service.

### Service × region page map (proposal)

| Region | Region page | Distinct service sections (only if verified) | Priority |
|---|---|---|---|
| Central Coast | Yes (head office region) | core support, coordination, SIL/SDA, STA | 1 |
| Newcastle | Yes | core support, STA, (coordination?) | 2 |
| Dubbo | Yes | core support, coordination, SIL | 3 |
| Orange | Yes | core support, coordination, SIL | 3 |
| Tamworth | Yes **after verification** | tbd | 4 |
| Gunnedah | Yes **after verification** | tbd | 4 |

Each region page content: who serves the area (named only with consent), suburbs/towns served, services actually available with capacity statement owned by operations, accommodation (via vacancy module), local referral relationships *only if factual and approved*, practical FAQs, contact method, accessibility notes. Minimum content bar: a page ships only if it contains at least five facts unique to that region (internal check); otherwise it stays unpublished.

### Google Business Profile

Create/claim profiles only where eligible (staffed, customer-visible premises or a legitimate service-area business per Google guidelines); no virtual offices, no duplicates. Keep NAP strings in `siteSettings` and replicate exactly. Categories/services/photos/Q&A drafted in P2 and approved by owner. Posting via API (A7) is **not assumed**: the posts endpoint is documented (`localPosts`), but access for new projects is unverified; plan a manual weekly post as fallback.

### Directories and citations

Candidate list from the roadmap (NDIS Provider Finder, MyCareSpace, Clickability, Karista, Disability Support Guide, WayAhead, council directories) — each requires current-eligibility verification, identical NAP, and a verified-date column in the citation sheet.

### Local tracking

Per region: organic clicks, impressions, indexed pages, GBP calls/website clicks/directions (GBP Performance, once access granted), local keyword visibility (tool choice deferred; unapproved spend), referral enquiries, vacancy enquiries.

## 6. Keyword map (to build in Phase 2, tooling dependent)

Rows: service (core support, SIL, SDA, STA, support coordination, community access) × region (6). Columns: head term, intent, monthly volume (from Keyword Planner/Search Console — **not yet collected**; the roadmap's "≈6,600 AU searches/month for 'NDIS provider'" is unverified), difficulty, target URL, status. Avoid creating a page per cell; map multiple cells to the region page or service page.
