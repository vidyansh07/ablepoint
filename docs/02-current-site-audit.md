# 02 — Current WordPress Site and SEO Audit

Date: 3 Nov 2026 · Method: read-only HTTP GETs (identifying user-agent `AblePointAudit/1.0`, 0.6 s between requests), HTML parsing. Script and raw output: `evidence/live-site-crawl.py`, `evidence/live-site-crawl-2026-11-03.json`. No logins, no form submissions, no write requests.

## 1. Platform (Verified from page source)

- WordPress (generator tag) with **OceanWP** theme, **Elementor 4.2.4**, Essential Addons for Elementor (Lite), Royal Elementor Addons, **Fluent Forms**, Ocean Extra, **ThinkRank SEO 2.8.0** (SEO + sitemap).
- HTTP→HTTPS and `www`→apex both resolve to `https://ablepointaustralia.com.au/` (final URL checked; redirect hop count not recorded).
- `robots.txt`: `Disallow: /wp-admin/` only; `Sitemap:` line points to `/page-sitemap.xml`, which returns **404**. The real sitemap is `/sitemap.xml` (`/wp-sitemap.xml` redirects to it). `sitemap_index.xml`, `post-sitemap.xml`, `category-sitemap.xml` → 404.
- `/wp-login.php` and `/xmlrpc.php` (RSD link in `<head>`) are publicly reachable; `/wp-json/` advertised. Normal for WordPress but widen the attack surface. (Security hardening is for the incumbent site owner; recorded here, not actioned.)
- No GTM, gtag/GA4, Microsoft Clarity, Meta pixel or Turnstile strings in the HTML of any of the 32 pages. **This does not prove tracking is absent** (server-side or consent-gated injection, or admin-only configuration, would not show). Label: *not visible publicly*; needs admin access to confirm (W-22).

## 2. URL inventory (31 sitemap URLs + 1 probe)

Sitemap lists 31 page URLs (images excluded). All returned 200. Probe `/privacy-policy/` → **404**, `/accomodation/` → 404.

| Group | URLs |
|---|---|
| Home / corporate | `/`, `/about-us/`, `/our-support-team/`, `/contact-us/`, `/referral/`, `/thank-you/`, `/youth-services/`, `/community-access/` |
| Core services (Sydney-titled) | `/core-support/`, `/support-coordinator/`, `/supported-independent-living/`, `/short-term-accomodation/`, `/sda/` |
| Region × service | Core support: `central-coast`, `newcastle`, `dubbo`, `orange` · Support coordinator: `central-coast`, `orange`, `dubbo` · SIL: `central-coast`, `orange`, `dubbo` · STA: `newcastle` only |
| Region landing | `/ndis-support-service-providers-{newcastle,dubbo,central-coast,orange}/` |
| Blog | `/news/`, `/2017/02/01/how-to-choose-ndis-provider-in-sydney/`, `/2017/02/01/ndis-core-vs-capacity-building/` |

Gaps (Verified absent from sitemap/nav): **no Tamworth or Gunnedah pages**, no vacancy page, no privacy policy, no complaints/feedback page, no accessibility/Easy Read page, no careers page, no support-coordinator pages for Newcastle.

## 3. Page-level measurements (32 pages)

| Measure | Result |
|---|---|
| Word count (visible text incl. nav/footer) | min 206, median 631, max 1,269 |
| Pages with more than one `<h1>` | **20 of 32** |
| Pages with zero `<h1>` | 1 (`/youth-services/`) |
| Titles containing "Sydney" | 7 (home, core-support, support-coordinator, SIL, STA, SDA, one blog post) |
| Titles > 60 characters | 8 |
| Meta description missing | 1 (the 404 template) |
| Meta `keywords` tag present | 4 pages (home-adjacent: `/news/`, `/core-support/`, Dubbo page, blog post) |
| `noindex` | 1 (the 404 template). `/thank-you/` is indexable and in the sitemap. |
| Canonical mismatches | 0 |
| JSON-LD present | 32/32 (ThinkRank). Types sampled on 12 pages: WebPage, BreadcrumbList; home also Organization + WebSite/SearchAction; blog posts BlogPosting + Person + ImageObject. **No LocalBusiness, Service or FAQPage seen on sampled pages.** |
| `href="#"` or empty links | 10 on every standard page, 18 on blog pages |
| Footer placeholder strings ("Street Name, FL 54785", "621-254-2147", "contact@support.com", "Opens in your application") | **32 of 32 pages** |
| "approved NDIS" wording | 2 pages (`/`, `/youth-services/`) |
| "Austrialia" misspelling | In `og:site_name`, Organization JSON-LD `name`, and the 404 title; "accomodation" in slugs and nav |

Copy/paste error (Verified): `/supported-independent-living-dubbo/` has title "Supported Independent Living **Orange** (SIL)".

## 4. Roadmap W-01 → W-23 reconciliation

Status key: **Open** (still present) · **Changed** (differs from roadmap) · **Not reproduced** · **Not re-verified** · **Blocked** (needs access).

| ID | Roadmap sev. | Original finding (30 Oct 2026) | Verification 3 Nov 2026 | Status | Proposed remediation / phase | Validation |
|---|---|---|---|---|---|---|
| W-01 | Critical | Footer template placeholders | Placeholder address/phone/email + "Opens in your application" on 32/32 pages. Real number 1300 088 549 also present on home | **Open** | Escalate to owner now (production fix is theirs to authorise). New site: real NAP from CMS Global Settings, single source. P0 escalate / P1 | Crawl shows zero placeholder strings |
| W-02 | Critical | "approved NDIS Provider" | String present on `/` and `/youth-services/` (context not read) | **Open** | Escalate. New site: "registered NDIS provider" + registration number/groups once verified (NDIS Commission record fetch failed this session – **Blocked**) | Content lint rule bans "approved/endorsed" |
| W-03 | High | Referral form without privacy/consent; policy link "#" | Form fields (first/last name, email, phone, NDIS number, referred by) with no privacy/consent/collection wording on page; `/privacy-policy/` 404; footer still has "Term & Private Policy" text with `#` links | **Open** | Escalate (live collection of NDIS numbers). New site: two-step intake with collection notice and consent (doc 05) | Manual + e2e test of notice/consent |
| W-04 | High | Unsupported superlatives | Not re-scanned this pass | **Not re-verified** | Content lint + human review in P2 | Lint report |
| W-05 | Medium | Dead footer/social links | `#`/empty hrefs on every page (10–18) | **Open** | P1 nav/footer from CMS; no `#` links allowed (build check) | Link checker |
| W-06 | Medium | Spelling: Austrialia, Accomodation | Still present in OG site name, Organization JSON-LD, 404 title, URLs/nav | **Open** | P1 copy; slug rename with 301 (doc 07) | Spell + slug lint |
| W-07 | Low | Malformed phone "013 000 88549" | Not found on home page source; other pages not checked | **Not reproduced (home)** | Single formatted phone token in global settings | Grep for non-canonical phone formats |
| W-08 | High | No structured data | **Changed:** JSON-LD now on all pages (WebPage/Breadcrumb; home Organization/WebSite; posts BlogPosting). Quality poor: Organization name misspelt, no LocalBusiness/Service/FAQ | **Changed (partial)** | Replace with typed schema generated from CMS fields (doc 08) | Schema validator + Rich Results Test |
| W-09 | High | Backdated blog dates `/2017/02/01/` | Both posts still under `/2017/02/01/`; home JSON-LD `datePublished` also 2017-02-01; sitemap `lastmod` 2026-09-22 | **Open** | Preserve true publication history if known (needs owner input); modified/reviewed dates separate; 301 to clean slugs | Date audit table |
| W-10 | Medium | Duplicate H1s, skipped levels | 20/32 pages with multiple H1; 1 with none | **Open** | Template enforces one H1 | Heading-outline test in CI |
| W-11 | Medium | Central Coast link → Newcastle; broken email | Central Coast pages now exist (4). Footer `mailto:` uses the placeholder address. "Areas We Serve" link targets **not re-checked** | **Changed / partly not verified** | P1 | Link checker |
| W-12 | Low | Truncated meta, title casing, keywords tag | 8 titles >60 chars; keywords tag on 4 pages; Dubbo title still "Ndis Service Provider Dubbo" | **Open** | P1/P2 metadata templates; no keywords tag | Metadata test |
| W-13 | Medium | Speed unmeasured | **Measured 3 Nov 2026** with Lighthouse CLI (mobile emulation, lab, this machine): home perf 84 / LCP 3.0 s; SIL 85 / 3.1 s; Dubbo 85 / 3.1 s; referral **74 / LCP 5.2 s**; transfer ≈ 0.9–1.1 MB per page. a11y 90–96, SEO 85. Lab data only; field data (CrUX/Search Console) still **Blocked** (access). | **Open (measured)** | Astro rebuild (staging lab: perf 100, LCP 0.8 s, ≈55 KB) — lab, localhost, not a production claim | `evidence/lighthouse/*.json` |
| W-14 | High | Sydney-centred targeting | 7 titles + H1 sub-headings say Sydney; head office Gosford; operating regions elsewhere | **Open** | Re-centre on verified regions; keep Sydney only if service verified | Content brief sign-off |
| W-15 | High | Thin/odd regional copy (~300 words) | **Changed:** regional pages 586–679 words with near-identical H1/H2 patterns ("Friendly NDIS Support Services in Dubbo" …). Similarity not measured → *Inferred* template reuse. Tamworth/Gunnedah missing | **Changed** | Rewrite from verified regional facts (doc 08) | Pairwise similarity check |
| W-16 | High | SIL page weak | `/supported-independent-living/` 1,075 words, 9 H2, 2 H1. Vacancy/funding content **not read** | **Partly verified** | Split overview / vacancies / funding explainer; human NDIS review | Content review log |
| W-17 | Medium | Only two dated blog posts | Still two posts, both Sydney | **Open** | 4 guides then ongoing | Publishing calendar |
| W-18 | Low | Strengths to keep | n/a | — | Preserve 1300 number, CALD stat if substantiated, service menu | — |
| W-19 | High | Weak CTAs, no sticky bar | One `tel:` link on home; visual/mobile behaviour not tested (no browser run) | **Partly verified** | Sticky mobile CTA bar in template | e2e + manual |
| W-20 | High | Referral form UX/routing | Confirmation page `/thank-you/` exists; required markers, routing, SLA not verifiable without submitting (we will not submit) | **Not verified** | Doc 05 flow | e2e on staging with synthetic data |
| W-21 | High | No vacancies listing | No vacancy URL/nav item | **Open** | Vacancy module (doc 06) | Page + lifecycle tests |
| W-22 | High | No visible analytics/call tracking | Not visible in any page source; admin check needed | **Verified not-visible / Blocked** | Access list; GTM/GA4 design doc 08/10 | Tag assistant on staging |
| W-23 | Medium | GBP unaudited | Needs GBP manager access | **Blocked** | Phase 0 access list | GBP audit sheet |

## 5. Additional findings not in the roadmap

| ID | Finding | Evidence | Severity (proposed) |
|---|---|---|---|
| X-01 | `robots.txt` advertises a sitemap URL that 404s | `/page-sitemap.xml` → 404 | Medium |
| X-02 | `/thank-you/` indexable and in sitemap (conversion page should be `noindex`, and tracked) | crawl robots meta | Low |
| X-03 | Copy/paste title error on Dubbo SIL page ("Orange") | title tag | Medium |
| X-04 | Region×service page set (~12 near-identical pages) → doorway-page risk | similar structure/H1 patterns (Inferred) | Medium |
| X-05 | `youth-services` has no H1 and an "approved" claim; service not in the target service list | crawl | Medium (clarify whether service is offered) |
| X-06 | Public `xmlrpc.php` and `wp-login.php` | HTTP 200 | Low/Medium (owner's host/WAF) |

## 6. Escalation list for AblePoint owner / compliance lead (do not fix on production without authorisation)

1. Replace placeholder footer address/phone/email (W-01).
2. Remove "approved NDIS" wording (W-02).
3. Suspend or add a collection notice to the live referral form that collects NDIS numbers (W-03) and publish a privacy policy.
4. Confirm registration number and registered service groups wording against the NDIS Commission register (fetch blocked this session).

## 7. Not done / blocked in this pass

- Lighthouse / Core Web Vitals (PSI quota) · mobile rendering and visual accessibility checks (no browser run) · axe/manual a11y · image inventory and alt text · full internal-link graph and redirect chains · content read of service pages (W-04, W-16 detail) · GBP, GA4, GTM, Search Console, Ads · NDIS Commission register record (timeout) · WordPress admin export of page authorship/dates.
