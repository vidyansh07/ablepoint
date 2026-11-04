# 15 — Implementation Status (3 Nov 2026)

Approval to start development was given by the engineering lead. Scope started: **Phase 1 foundation only**, staging-first. Nothing deployed, no DNS or production change, no external accounts created, no purchases, no real submissions.

## Built and verified locally

| Area | State | Evidence (run 3 Nov 2026) |
|---|---|---|
| Monorepo (pnpm workspaces, TS strict) | Implemented | `pnpm install` ok |
| `packages/schemas`: Step-1 enquiry contract, AU phone normaliser, content approval gate (AR-7), banned-phrase lint, vacancy lifecycle + staleness, redirect validator | Implemented, **29 unit tests passed** | `pnpm --filter @ablepoint/schemas test` |
| Design tokens + CSS (self-hosted Atkinson Hyperlegible, OFL), 14 components, 8 template families | Implemented | astro check: 0 errors, 0 warnings, 0 hints |
| Pages: home, 6 services (existing slugs kept), services hub, locations hub + 6 regions, vacancies (empty state), guides hub + 4 draft guides, referral, contact-us, about-us, our-support-team, privacy-policy, feedback-complaints, accessibility, easy-read, thank-you (noindex), 404, robots.txt | Implemented (content is **draft**, not approved) | 31 pages built (staging) |
| JSON-LD (Organization, WebSite, BreadcrumbList, Service, Article, FAQPage) from data | Implemented, not yet validated with external validators | `lint-dist` parses all JSON-LD |
| Step-1 form (UI, error summary, honeypot, idempotency key, optional Turnstile/endpoint via env) | Implemented in **demo mode**: with no `PUBLIC_INTAKE_ENDPOINT` nothing is sent | Playwright: empty submit, valid submit sends no request, honeypot |
| Draft-content gate | Verified: production build = 9 pages, no draft text; staging shows banners | `PUBLIC_SITE_ENV=production astro build`; `lint-dist` fails on links to hidden pages (intended) |
| Legacy redirect map (19 rows, draft, `approved:false`) + generated `vercel.json` (CSP `script-src 'self'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, noindex on non-prod) | Implemented, **not deployed**; redirect behaviour on Vercel not yet tested | unit tests: no chains/loops; header test |
| Build-output linter (`lint-dist`) | Implemented | staging: 31 pages, 0 errors, 0 warnings |
| Contrast tests (21 token pairs, WCAG AA) | **Passed** | web unit tests: 39 passed |
| E2E + axe (WCAG 2.0/2.1/2.2 A/AA tags) on every built route, desktop 1280 and mobile 390; skip link, keyboard menu, 44 px targets, no third-party requests/console errors, form error state | **76 passed** | `pnpm --filter @ablepoint/web test:e2e` (Google Chrome) |
| JS weight | Enquiry page 24.5 KB gzip (zod); other pages ≈ 0.5 KB | measured from `dist/_astro` |

## Not done / not verified

- Manual accessibility testing (screen readers, zoom, voice control): **Not Run**. axe passing is not conformance.
- Lighthouse / Core Web Vitals on the built pages: **Not Run**.
- Vercel deployment, preview protection, redirect and header behaviour on Vercel: **Not Run**.
- Sanity Studio and schemas, preview deployment, content migration: **Not started** (content currently lives in typed files in `apps/web/src/data`; CMS-agnostic).
- Restricted intake platform, CRM, n8n, analytics/consent, call tracking, ads: **Not started**.
- Logo: wordmark placeholder (vector logo not supplied). NDIS registration number, address, hours, team, testimonials, photography: not supplied, therefore not shown.
- Content accuracy: all copy is draft and unreviewed. Region pages carry no local facts until operations supply them.
- Sitemap output only verified for production mode structure (sitemap-index emitted); not validated in Search Console.

## Known decisions made while building

- Top-level service URLs kept as on the current site (`/core-support/` etc.); `/short-term-accommodation/` corrected spelling with a draft 301 from the old slug.
- TypeScript pinned to 6.x because `@astrojs/check` does not yet accept 7.x.
- Astro 7 `astro preview` daemonises in non-interactive shells, so e2e uses `scripts/serve-dist.mjs`.
- Astro telemetry disabled locally.

## Next tasks (proposed order)

1. P1-04 Sanity studio/schemas + review gate wiring (needs Sanity Growth approval, B-03).
2. P1-05 Vercel staging project with deployment protection (needs Vercel Pro approval, B-03) and a header/redirect smoke test.
3. Lighthouse CI + bundle budget check in CI; GitHub Actions workflow.
4. Receive brand assets (logo, photography), real facts from operations, compliance reviewer name.
5. Intake API design spike (AWS Sydney, IaC) once D-05 is confirmed.


## Update: later phases started (3 Nov 2026)

Scope rule unchanged: staging-first, no deployment, no purchases, no external accounts, synthetic data only.

| Phase | Package / area | What exists | Evidence | What it is NOT |
|---|---|---|---|---|
| 1 | `packages/schemas` | Approval gate by content hash (replaces a flawed timestamp rule found by the Studio fork), analytics event/consent contract, redirects validator | **58 unit tests** incl. SHA-256 vectors vs FIPS 180-4 and Node crypto | — |
| 1 | `apps/studio` | Sanity v6 schemas for all 20 docs/06 types + 8 block types, validation functions, desk structure, webhook-audit mapper, GROQ queries | **223 tests**, tsc clean; "Approve for publication" Studio action and hash-based queries added (type-checked only) | Never run in a browser or against a dataset; no Sanity project exists; Growth plan not purchased |
| 1 | `.github/workflows/ci.yml` | hygiene + verify jobs (install, typecheck, tests, staging build, lint, e2e), no deploy | Authored; **never run on GitHub** | — |
| 2b | `apps/web/scripts/migration-parity.mjs` | All 31 legacy URLs classified: 11 kept, 19 redirect (draft), 1 pending owner decision | `docs/evidence/migration-parity.md` | Redirects not active anywhere; "kept" ≠ content migrated |
| 2 | `lint-dist` region similarity check | Region pages are 83–100% templated: warning in staging, **error in production** | lint output | Not fixed: needs real local facts from operations |
| 3 | Consent-gated analytics | Banner, allow-listed events, no analytics on `/referral/`; fake-GTM e2e | 90 e2e tests | No real GTM/GA4 container; decision D-17 open |
| 3 | Landing page template | `/lp/sil-central-coast/` draft, noindex, minimal header | build + lint | Not a launched campaign; region choice D-08 open |
| 4a | `packages/intake-core` | Case refs, AES-256-GCM field crypto, deny-by-default RBAC, Step-1 handler (origin, rate limit, Turnstile port, idempotency, audit, privacy-safe logging), upload validation and quarantine state machine, retention decisions, draft Postgres schema with RLS | **287 tests**; fork mutation-tested 11 deliberate regressions (all caught); I re-ran: 287 pass, tsc clean | No real DB, KMS, Turnstile, storage, scanner, IdP or staff UI. SQL not yet run on a managed Postgres (it is exercised on in-memory PGlite since the master plan pass, see below). In-memory limiter/replay/idempotency are single-process. **Not usable for real participant data.** |
| 4b | `packages/automation` | Pure rules for A1–A17 (webhook HMAC + skew, retry, routing, follow-up, missed call, call log, vacancy sync, review lint, reporting suppression, monitoring thresholds, content gate, partners, AI-visibility log, Meta leads, recruitment, hygiene) + A1/A7 | **429 tests**; I re-ran: 429 pass, tsc clean | **No n8n workflows, no vendor/CRM integration.** Business hours (Mon–Fri 9–5) and quiet hours (21:00–08:00 Sydney) are assumptions; NDIS-number format unverified |

### Measured (lab, 3 Nov 2026)

Lighthouse mobile, this machine: live WordPress home perf 84 / LCP 3.0 s, referral 74 / 5.2 s, ≈ 1 MB per page; staging build perf 100 / a11y 100 / LCP 0.8 s, ≈ 55 KB per page (localhost, not a production claim). Evidence: `docs/evidence/lighthouse/`.

### Test totals (re-run by the lead, not only reported by forks)

schemas 58 · web unit 42 · automation 429 · intake-core 287 · studio 223 (= 1,039 unit tests) · web e2e + axe + intake integration 102. `pnpm -r check` clean in every package; staging `lint-dist` 0 errors; production build hides all unapproved content. Re-run by the lead after the final change, 3 Nov 2026.

### Newly open decisions

D-17 analytics on form-bearing pages (default off) · approval-hash semantics are covered by tests but have not been exercised in a live Studio · who maintains the in-memory-to-shared-store swap for rate limiting (needs infra choice D-05).

### Regressions caught and fixed during this run

1. Timestamp-based approval gate could never pass in Sanity (approval save bumps `_updatedAt`) → replaced by content-hash approval.
2. `lint-dist` could not load `@ablepoint/schemas` under plain Node after the hash change (extensionless import) → banned-phrase list isolated in `banned.ts`; regression test added.
3. Header "Make a referral" button failed WCAG contrast through CSS specificity → fixed; axe now guards it.

### Still unverified (needs accounts, a dataset, or a browser session)

Studio Approve action in a running Studio · GROQ queries against a dataset · whether Sanity adds other metadata fields that would change the hash between draft and published copies (fails closed: hides content) · GitHub Actions run · Vercel behaviour of headers/redirects · manual screen-reader testing · everything in intake-core's "NOT built" list · all automation integrations.

### Integration step: website form to the real intake handler (3 Nov 2026)

`packages/intake-core/dev/server.ts` (LOCAL ONLY, in-memory, synthetic) wraps the real `handleEnquirySubmission`. The built site, running under its generated CSP, now submits to it in Playwright:

- Real submission reaches the handler and lands on `/thank-you/`; payload has exactly `enquiry, idempotencyKey, noticeVersion, turnstileToken`, and no NDIS number.
- Turnstile client added (explicit render, single-use token, reset after failure, submit held until the check completes). **Gap found:** before this the form never sent a token, so the handler (which fails closed) would have rejected every real submission. Verified against a stubbed Turnstile only; not against Cloudflare.
- Replay protection and the 3-per-hour per-contact throttle fired in the tests themselves (identical test tokens/phones were rejected), confirming they are wired end to end.
- Server rejection shows a focused, accessible error and leaves the form usable.
- Generated CSP (`script-src 'self' https://challenges.cloudflare.com`, no `unsafe-inline`/`unsafe-eval`) allows the form and refuses an injected inline script. **Gap found and fixed:** pages used inline `style=` attributes that this CSP would have blocked in production (lost spacing); replaced with utility classes and `lint-dist` now fails on any inline style attribute.

Still not verified: real Cloudflare Turnstile, real hosting headers on Vercel, a real database, a real client-IP source (the dev server uses the local TCP peer).

## UI and brand pass (3 Nov 2026)

Follows `17-brand-guidelines.md` (derived from the preserved logo) and `16-ui-reference-research.md`.

- **Preserved logo** used in the header and footer (optimised to webp at 2x); favicons and touch icon cropped from the logo ring with sharp (`scripts/build-brand-assets.mjs`). Only a 512 px JPG on white exists: vector master requested (Q2).
- **New original assets:** 30-icon line set (`Icon.astro`), the "Gathering" ring device (`Ring.astro`), home/hero illustration (`HeroArt.astro`). No stock imagery, no drawn people, no photos.
- **Tokens:** brand hues from the logo with deep accessible variants; decorative logo tones are never used for text (test enforced). High-contrast mode tokens tested at 7:1.
- **Access tools:** text size (100/115/130%) and high contrast, stored in `localStorage` only, applied before first paint by `public/a11y-init.js`; reflow verified at 130% text on sampled pages.
- **Layout:** utility bar with phone and tools, single-row logo header, audience routing tiles, icon service cards, illustrated empty and 404 states.
- **Bugs found by tests and fixed:** text-size buttons failed WCAG label-in-name (visible "A+" vs accessible name); header wrapped and overflowed at 130% text; linter mis-read Astro's empty `alt`.
- **Test totals now:** web unit 70 · web e2e + axe + intake integration + UI 118 · lint 0 errors (staging). Other packages unchanged (schemas 58, automation 429, intake-core 287, studio 223).
- **Not done:** owner approval of the guidelines; vector logo; photography; manual screen-reader and user testing.

## Templates, style guide and polish pass (3 Nov 2026)

- **Templates:** service pages (callout "who it is for", check-list, numbered steps, region chips, FAQ, sticky contact card), region pages, guide pages (quick-answer callout, on-this-page list, sources, author/reviewer line), vacancy cards and detail (status pill: available / unconfirmed / temporarily unavailable / no longer available), Easy Read block pattern and an Easy Read page (draft; icons only, needs real Easy Read illustrations and review by people with intellectual disability).
- **Living style guide:** `/styleguide/` renders tokens (with measured contrast), type, buttons, cards, notices, icons and brand art from the real components. Built in staging/development only, always noindex, absent from production builds (verified: 0 style-guide pages in a production build).
- **Social share image** (`public/og-default.png`, generated by `scripts/build-og.mjs` from the preserved logo + ring) and `og:image` / `twitter:card` tags; Organization schema gains `logo`.
- **Bugs found by tests and fixed:** (1) the analytics/consent script pulled all of `@ablepoint/schemas` (including zod) into every page, adding ~80 KB JS; `sideEffects: false` now keeps zod on the referral page only (content pages: 1.6 KB gzip JS; referral page: 24.8 KB gzip); (2) zod's JIT probe tripped the CSP (`script-src: eval`) on the referral page; JIT is now disabled in browsers before schemas are built, and a strict `securitypolicyviolation` test guards it; (3) icon circles squashed inside flex callouts; (4) lint now also rejects inline `<style>` elements.
- **Lighthouse (mobile, lab, staging build on localhost, 3 Nov 2026):** home / service / region / guide / referral: performance 100, accessibility 100, best practices 100, LCP 1.1 s, CLS ≤ 0.001, 89–108 KiB transferred uncompressed (referral 177 KiB). SEO 69 only because staging is deliberately `noindex`. Evidence: `docs/evidence/lighthouse/`.
- **Totals now (lead re-run):** unit 1,067 (schemas 58, web 70, automation 429, intake-core 287, studio 223); browser e2e + axe + CSP + intake + UI 122; `pnpm -r check` clean; staging lint 0 errors.

## Creative pass: icons, banners, regional art, motion (3 Nov 2026)

- **Sourcing research** (`19-creative-sourcing.md`): licences read from official pages for icon sets, illustration libraries, animation tooling and stock sources; verified leads for disability-led Australian illustrators (Studio A, ADNA, Illustrators Australia, ASA Style File). Several pages could not be read (Rive, Motion, ARASAAC, Photosymbols, Getty collection terms, primary PWDA page): recorded as NOT VERIFIED. Nobody has been contacted and nothing purchased.
- **Icons:** migrated to **Lucide** (ISC, verified) via `lucide-static`, resolved at build time (no client JS); 40 semantic names mapped; licence notices generated from the packages' own LICENSE files into `/third-party-notices.txt` and linked in the footer.
- **Art (two forks, reviewed by me):** `BannerArt` (5 scenes) and `RegionArt` (7 vignettes) as original SVG with scoped CSS; wired into services, locations, vacancies, guides, referral, contact, region pages and the home region cards; both visually reviewed.
- **Motion system** (`src/styles/motion.css`): view transitions, scroll-reveal that fails open, card/button micro-interactions, hero entrance, guide reading-progress bar. 
- **Tests:** default e2e runs under reduced motion (settled state); `motion.spec.ts` checks, on 10 routes, that animations are finite, ≤ 2.2 s, transform/opacity only and none run after 5 s; that reduced motion gives zero animations; that reveal never leaves content hidden and fails open when the observer script is blocked; and axe with normal motion. **172 e2e tests pass**; unit 70; lint 0 errors.
- **Lighthouse (mobile, lab, staging):** home / locations / service / guide / referral all perf 100, a11y 100, best-practices 100; LCP 1.1 to 1.4 s; CSS total 6.4 KB gzip; 98 to 192 KiB transferred uncompressed.
- **Not done:** regional-staff review of the vignettes; a commissioned illustration set; real photography; manual screen-reader and user testing; checking the view-transition behaviour in Safari and Firefox.

## Photos and outreach pack (3 Nov 2026)

- **Owner decisions applied:** illustrator commission approved (drafts only, nothing sent); regional-staff art review approved (review sheet and image prepared); online photos approved; Easy Read to be commissioned and tested (brief prepared).
- **Photos:** six licensed regional landscapes from Wikimedia Commons with creator, licence and source recorded per file (`photos.generated.json`, generated by `scripts/fetch-commons-photos.mjs`, which refuses any licence other than CC0 / CC BY / CC BY-SA). Shown as hero photos on region pages with credit lines; `/image-credits/` page lists everything; footer links to it. 5 new unit tests (every region has a photo, licences allowed, creators named, source links, alt text lint).
- **Findings:** Pexels blocked automated access (not circumvented); a Gunnedah photo was dropped because the author was unidentifiable.
- **Measured:** region page with photo: Lighthouse mobile lab performance 100, accessibility 100, best practices 100, LCP 1.2 s, 201 KiB uncompressed. 174 browser tests pass, unit 75 in web; lint 0 errors.
- **Outreach pack** (`docs/outreach/`): illustrator brief, drafts for Studio A, ADNA and Illustrators Australia, and an Easy Read commissioning brief. **None sent.** Owner sets budget and sends.
- **Process note:** an earlier image-search helper script sent a contact email in its HTTP User-Agent to the public Wikimedia API; the committed scripts use no email. 

## Growth, agents and blog pass (3 Nov 2026)

- **Research (4 agents, official sources; limits stated in each doc):** competitor sitemaps and schema (Mable, Hireup, Aruma, Ability Options, CPA, Scope, Yooralla, MyCareSpace, Clickability); Google, OpenAI, Anthropic, Perplexity, Apple, Meta, Common Crawl, Bing and IndexNow guidance; support-coordinator trust signals; (ad-platform policy report pending when this was written). WebSearch is US-only so **no Australian SERP data was seen**; owner must pull Search Console and real SERP checks.
- **Built:** public JSON content API (9 resources) + OpenAPI 3.1; `llms.txt`; Atom feed; production sitemap with accurate `lastmod` (replaces the plugin); `robots.txt` per-bot policy (search/answer bots allowed; training bots allowed by default, `AI_TRAINING=block` to flip); IndexNow tooling; blog (`/blog/`, posts, topics) with Article schema; draft ingest CLI with quality gates; approve CLI; CI `content-gates` workflow and `content:verify`; production gate extended with a reviewer allow-list that ships **empty**; referrer hub `/for-support-coordinators/` with a drafted independence statement; photo registry with a production gate for recognisable-people photos; Pixabay API search helper (untested live: no key).
- **Tests:** unit 1,114 (schemas 70, web 105, automation 429, intake-core 287, studio 223); browser e2e 182 passed; staging lint 0 errors.
- **Findings acted on:** Google removed FAQ rich results (May 2026) and ignores `llms.txt` (kept cheap, not relied on); scaled-content-abuse policy drove the quality gates and the humans-approve rule; competitor gaps (no SIL/SDA location pages, no Gunnedah page, thin Dubbo/Orange, JS-shell sites) drove the region and referrer plan.
- **Live-site finding:** its contact page lists **Carlingford NSW and Orange**, not Gosford (see `22-current-ablepoint-understanding.md`, question C-1).
- **Not done:** Pixabay photos (site blocks scripts; no API key supplied); Search Console/Bing/GBP set-up; MCP server; Sanity adapter; n8n workflows; real posts beyond one seed draft.

## Hireup-inspired features, database check and master plan pass (3 Nov 2026)

- **Source:** the owner's Hireup full-page screenshot and technology-detection list, analysed in `24-hireup-feature-and-stack-analysis.md` (adopt, adapt, avoid, with reasons). Neither input was independently re-verified.
- **Built:** support finder (home and `/locations/`, runs in the browser against the public JSON API, sends nothing anywhere); testimonial component and gate (`assertTestimonial`; ships **empty**, nothing invented); draft home blocks for safety and funding (hidden in production until approved); FAQ hub with filter; `/pricing-and-agreements/` draft with no prices; footer "Where we work" regions column.
- **Bugs found by tests and fixed:** finder links used absolute build-origin URLs from the API (now converted to paths); the empty live region of the finder results stayed hidden by the scroll-reveal rule (excluded `[aria-live]`).
- **Draft SQL now exercised:** `packages/intake-core/sql/001_init.sql` parses and runs on an in-memory embedded Postgres (PGlite) and passes 26 behaviour tests (`tests/rls.pglite.test.ts`, synthetic rows): RLS enabled and forced on all 10 tables; public role insert-only; assignment-based staff visibility; marketing sees nothing; regional staff only get the restricted function view (no DOB, NDIS number or support needs); audit log append-only (privileges and triggers); document state machine and release-only downloads; scanner role limited to `scan_status`; filename and size checks; plaintext refused in encrypted columns; small-number suppression below 5; break-glass needs a ticket and a window of 4 hours or less. Still **not** run on a managed Postgres, no pgaudit, backups, KMS or identity provider. Test dependency `@electric-sql/pglite` is a dev dependency only. The file header and README were corrected (they said it had never been parsed).
- **Ad-policy and tracking rules** recorded in `10` §5 and summarised in `20` §8. They come from a research pass over official policy pages and must be re-read before any campaign.
- **Master plan:** `25-final-master-plan.md` consolidates phases, backlog, owner questions (ASK-01 to ASK-22), gates, risks and measures.
- **Cleanup:** two TypeScript hints removed (`astro check` now 0 errors, 0 warnings, 0 hints).
- **Re-run by the lead on the day (all passing):** `pnpm -r check` clean · unit tests: schemas 70, web 109, automation 429, intake-core 313, studio 223 (**1,144**) · Playwright e2e + axe + CSP + intake integration + motion + features: **198 passed** · staging build 40 pages, `lint-dist` 0 errors and 12 warnings (templated region pages 81 to 100% similar once the place name is removed; two long titles) · migration parity: 31 legacy URLs, 11 kept, 19 redirected, 1 awaiting an owner decision (`/youth-services/`), 0 broken, 0 unmapped.
- **Production-mode build (empty reviewer list):** 12 pages, no service, region, post, pricing or coordinator page, sitemap and API show no unapproved content (`posts` and `services` are empty arrays). `lint-dist` reports 206 broken-link errors in that mode because navigation points at pages that are hidden. This is the intended safety net: the production build cannot pass until the compliance reviewer approves content and the allow-list is populated.
- **Still unverified:** all items in earlier "Still unverified" lists, plus Hireup's real tag configuration, the Pixabay search script against the live API, and every external account or integration.

## Master plan implementation pass (3 Nov 2026)

Scope: everything in `25-final-master-plan.md` that needs no account, no spend and no outside person. Three pieces were built by delegated agents and then re-checked by me (I re-ran each package's tests and type check and read the safety-relevant code); the rest I built myself.

**Built and tested**
- **Region fact sheets:** `RegionFacts` type, validator (`src/lib/region-facts.ts`), conditional page sections, `localFacts` field in the regions API (null until supplied), template for operations in `27`. No facts invented. Checked once with fake facts in a throwaway build: sections render, the checker's name and permission references do not reach the page or the API; then removed. 9 unit tests and 3 e2e tests.
- **Glossary** (`/glossary/`, 11 draft terms): hidden in production until approved; every term flagged for comparison with the official NDIS wording because ndis.gov.au returned HTTP 403 to automated reading (not circumvented).
- **Bug found and fixed:** `/faq/` was built in production as an empty page and missing from the sitemap. It now builds only when at least one answer is approved; sitemap includes `/faq/` and `/glossary/` only when visible. Production build is now 11 pages.
- **Performance budgets:** `lint-dist` fails a page above 10 KB gzip JavaScript (40 KB for `/referral/`) or 16 KB CSS. Measured today: 2.3 to 3.6 KB JS on content pages, 27 KB on `/referral/`, about 7 KB CSS. Verified that the check fails when a limit is lowered.
- **MCP server** (`packages/mcp-server`, 148 tests): 10 read-only tools over the public API, stdio, reads a built folder or an HTTPS URL, untrusted-content labelling, staging notice, vacancy staleness warnings. The organisation API now includes `referralUrl` so `how_to_refer` is useful. Found while building: the API emits `apiVersion` `"1"` (not `"v1"`); the server accepts both.
- **Sanity pull adapter** (`apps/web/src/lib/cms`, `cms:pull`, 74 tests on fake documents): fetch raw, approval-hash gate, strip internal fields, strict mapping (any unmappable rich text fails the document), deterministic output with a manifest of exclusions, atomic write. **Deliberately not wired in:** the Studio lacks fields for service icon/tint, region facts and Easy Read blocks, so switching now would delete that content. The mapped output carries a re-signed approval record (hash of the mapped document), and the reviewer allow-list is still enforced at render time; the Studio writes a Sanity user ID into `approvedBy`, so `reviewers.json` must hold the same strings.
- **n8n workflow files** (`automation/n8n/`): blog draft → pull request (cannot merge or publish), post-deploy IndexNow (signature check and production-host guard), vacancy staleness monitor, site health monitor. All inactive, placeholder credentials, 154 consistency tests that also run the Code-node logic against the repository's pure rules. Several n8n parameters are unverified (listed in its README).
- **CI files:** Lighthouse CI workflow and `apps/web/lighthouserc.json`, Dependabot config (TypeScript and vitest major bumps ignored), pull request template with the compliance checklist. They parse; none has run (no repository exists).
- **Docs:** `24` Hireup analysis, `26` operations runbooks (draft, not rehearsed), `27` regional fact sheet, ad rules in `10` §5.

**Re-run by the lead after the last change (all passing)**
- `pnpm -r check`: 0 errors, 0 warnings, 0 hints.
- Unit tests **1,536**: schemas 70, mcp-server 148, automation 583, intake-core 313, studio 223, web 199.
- Playwright e2e (axe, CSP, intake integration, motion, features): **206 passed**.
- Staging build 41 pages, `lint-dist` 0 errors and 12 warnings (templated region pages, two long titles). Migration parity: 31 legacy URLs, 0 broken, 0 unmapped, 1 awaiting the owner (`/youth-services/`).
- Production-mode build (empty reviewer list): 11 pages, no draft text, empty services/regions/posts in the API, sitemap without FAQ or glossary.

**Not verified:** any real n8n import or run; any real MCP client; any real Sanity project, dataset or Studio Approve action; any GitHub Actions run (CI, content gates, Lighthouse); Lighthouse budgets on a CI runner; Dependabot handling this workspace; the glossary against official wording.

**Observed once:** one web test (`ingest.test.ts`, the approvals CLI) timed out under load in an agent's baseline run and passed on every later run, including mine. Treat as a load-sensitive test to watch in CI.

## Studio run (4 Nov 2026)

Asked to run the CMS, I started Sanity Studio locally (`sanity dev`, port 3333) with a placeholder project id. No Sanity project exists, so nothing was created, no account was used and nothing was sent except the Studio's own start-up request to Sanity's servers.

- **Result:** Studio builds and starts. With no real project it stops at "Project not found". That is the furthest it can go without a project, a login and a dataset.
- **Bug found by running it (not by the 223 earlier Studio tests):** the Studio crashed on load with "Field group 'content' is not defined in schema for type 'heroBlock'". Cause: helper functions gave every text field `group: 'content'`, but page-builder block types and inline list items (opening hours, social links, footer link groups, guide sections and sources, legal sections) declare no field groups. Fixed (`group: null` for fields inside object types) and covered by a new regression test, `field-groups.test.ts`, which also found nine more fields in inline list items that Studio would have crashed on when an editor opened those documents.
- **Checks after the fix:** Studio tests 225 pass (was 223), `tsc` clean, Sanity's `schema validate` 0 errors and 0 warnings, `schema extract` compiles all 20 content types.
- **Still unverified:** every document form, the desk structure, validation messages in the editor, and the Approve action. They need a real project and login.

