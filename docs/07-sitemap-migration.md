# 07 — Sitemap, URL Migration and Redirect Specification

Principle: preserve indexed URLs where reasonable; redirect only where the URL is misspelt, structurally replaced, or consolidated. No production redirects are activated before an approved cutover. Source of truth for "old": `evidence/live-sitemap-2026-11-03.xml` (31 URLs) — the full inventory still needs a Screaming-Frog-style crawl including non-sitemap URLs (images, attachments, feeds, tag/category archives) and Search Console export.

## 1. Target sitemap vs existing

| Target URL | Existing equivalent | Action |
|---|---|---|
| `/` | `/` | Keep |
| `/about/` | `/about-us/` | **Decision D-12:** keep `/about-us/` (preserve) or move to `/about/` with 301. Default proposal: keep `/about-us/`. |
| `/our-team/` | `/our-support-team/` | Default: keep existing slug `/our-support-team/`; add 301 only if target slug chosen |
| `/contact/` | `/contact-us/` | Default: keep `/contact-us/` |
| `/careers/` | none | New (needs recruitment content; A16) |
| `/services/` | none | New hub |
| `/core-support/` | `/core-support/` | Keep |
| `/supported-independent-living/` | same | Keep (content split: overview / vacancies / funding explainer) |
| `/sda/` | `/sda/` | Keep |
| `/short-term-accommodation/` | `/short-term-accomodation/` (misspelt) | **New correct slug + 301 from old** |
| `/support-coordinator/` | same | Keep |
| `/community-access/` | same | Keep |
| (youth services) | `/youth-services/` | Keep pending services inventory (not in target list; claims "approved"; no H1) |
| `/locations/` | none | New hub |
| `/locations/central-coast/` etc. | `/ndis-support-service-providers-{region}/` for Central Coast, Newcastle, Dubbo, Orange | New canonical region URLs; 301 from the four old region landing pages |
| `/locations/tamworth/`, `/locations/gunnedah/` | none | New; **publish only after capacity/registration verified** |
| `/vacancies/`, `/vacancies/[slug]/` | none | New |
| `/guides/`, `/guides/[slug]/` | `/news/` + two 2017-dated posts | `/news/`→`/guides/` 301; posts → clean slugs with 301 |
| `/referral/` | `/referral/` | Keep URL; new two-step flow |
| `/privacy-policy/`, `/feedback-complaints/`, `/accessibility/`, `/easy-read/` | `/privacy-policy/` is 404 | New |
| `/thank-you/` | `/thank-you/` | Keep, set `noindex` |

## 2. Region × service pages (12 existing)

Existing: `core-support-{central-coast,newcastle,dubbo,orange}`, `support-coordinator-{central-coast,orange,dubbo}`, `supported-independent-living-{central-coast,orange,dubbo}`, `short-term-accomodation-newcastle`.

Recommendation: **consolidate** into each region page as service sections (avoids doorway pages) *unless* Search Console shows a page earns meaningful impressions/clicks or capacity data justifies unique content. Procedure: pull 12 months of Search Console data per URL; keep a page only when it has (a) its own verified facts (staff, properties, suburbs) and (b) demand evidence. Others 301 to the region page anchor (or the service page if region content is thin). Decision per URL recorded in `redirect` records; owner approves.

## 3. Redirect map (draft; not activated)

| Old | New | Status | Reason |
|---|---|---|---|
| `/short-term-accomodation/` | `/short-term-accommodation/` | 301 | spelling |
| `/short-term-accomodation-newcastle/` | `/locations/newcastle/#short-term-accommodation` | 301 | consolidate (pending D-13) |
| `/ndis-support-service-providers-newcastle/` | `/locations/newcastle/` | 301 | structure |
| `/ndis-support-service-providers-dubbo/` | `/locations/dubbo/` | 301 | structure |
| `/ndis-support-service-providers-central-coast/` | `/locations/central-coast/` | 301 | structure |
| `/ndis-support-service-providers-orange/` | `/locations/orange/` | 301 | structure |
| `/core-support-{region}/`, `/support-coordinator-{region}/`, `/supported-independent-living-{region}/` | `/locations/{region}/#service` | 301 | consolidate (pending D-13) |
| `/news/` | `/guides/` | 301 | structure |
| `/2017/02/01/how-to-choose-ndis-provider-in-sydney/` | `/guides/choosing-an-ndis-provider/` (title to be re-scoped; Sydney framing needs verification) | 301 | clean slug; **preserve original publication date in metadata** |
| `/2017/02/01/ndis-core-vs-capacity-building/` | `/guides/ndis-core-vs-capacity-building/` | 301 | clean slug |
| `/feed/`, `/comments/feed/` | none (410 or 404) | decide | WP artefacts |

Rules: no chains (A→B→C) — map old directly to final; trailing-slash policy fixed (with slash); lowercase; query-string handling defined; retired URLs with no equivalent return 410 only if no inbound links/traffic, otherwise 301 to nearest parent. Implementation: generate from `redirect` records + this table into the host redirect config at build; unit-test every row; crawl old URL list against staging to verify final status 200 in one hop.

## 4. Content parity and media

- Parity report: for each old URL, map to new page/section and record which content blocks are carried over, rewritten, or dropped (with reason). Content that makes unverified claims is **not** carried over.
- Media register: filename, source URL, dimensions, alt text status, rights (own/stock/unknown), consent status for people shown; unknown-rights images excluded.
- Dates: preserve original publication date where genuinely known (**owner/WordPress admin check needed**; the 2017 date may be wrong, as roadmap W-09 notes); add `reviewedAt` and `modifiedAt` separately; never reset to imply recency.
- Internal links: rewrite to new canonical; link checker in CI.
- Tracking parity: replicate whatever GA4/GTM exists after admin access; consent-aware.
- Sitemap: generated; compare URL sets pre/post; robots.txt references the real sitemap (current site references a 404 sitemap).

## 5. Post-launch monitoring

Search Console coverage and 404 report daily for 14 days, server logs for 404/5xx on Vercel, weekly rank/impression comparison for top 20 URLs, redirect crawl re-run at +1, +7, +30 days. No claim of "zero 404s" without evidence from those checks.
