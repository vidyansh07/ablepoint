# 11 — Test Plan and Acceptance Criteria

Result vocabulary: **Passed · Failed · Blocked · Not Run**. A passing build is not evidence of production readiness. Nothing is reported as Passed unless executed and evidence is stored in `docs/evidence/` (or the CI artifact link).

## 1. Results to date (Phase 0)

| Activity | Result | Evidence |
|---|---|---|
| Live-site read-only crawl of 31 sitemap URLs + 1 probe | **Passed** (executed; findings in 02) | `evidence/live-site-crawl-2026-11-03.json` |
| Roadmap read in full | **Passed** | `source/ablepoint-growth-roadmap.html` |
| Zaver mirror inventory | **Passed** (executed; mirror is demo output, not licensed source) | 01 |
| Vendor pricing/feature verification (Vercel, Sanity, Supabase, Turnstile, HubSpot, n8n, Resend, Twilio, WildJar, GBP posts API) | **Partly passed** — several items NOT VERIFIED (listed in 04 section 7) | agent reports summarised in 04, 05, 06, 10 |
| Lighthouse CLI on live WordPress (4 pages, mobile, lab) | **Passed (executed)**: perf 74–85, LCP 3.0–5.2 s | `evidence/lighthouse/live-wordpress-*.json` |
| Lighthouse CLI on staging build (5 templates, mobile, lab, localhost) | **Passed (executed)**: perf 100, a11y 100, best-practices 100, LCP 0.8 s; SEO 66 only because staging is deliberately `noindex` | `evidence/lighthouse/staging-*.json` |
| PageSpeed Insights API / CrUX field data | **Blocked** (API quota exceeded; Search Console access needed) | — |
| NDIS Commission registration record fetch | **Blocked** (request timed out after 30 s) | — |
| Unit tests: schemas 43, web 40 (incl. 21 colour-contrast pairs, content rules, redirect map, generated headers) | **Passed** | `pnpm test` |
| Playwright e2e + axe (WCAG 2.0/2.1/2.2 A/AA tags), every built route, desktop + mobile; keyboard menu, skip link, 44 px targets, form error state, no third-party requests; consent-gated analytics flow (fake GTM id, intercepted) | **Passed (90 tests)** | `pnpm --filter @ablepoint/web test:e2e` |
| `lint-dist` static checks on staging build (headings, links, canonicals, noindex, inline scripts, placeholders, banned phrases, JSON-LD parse, region similarity) | **Passed with warnings**: templated region pages ≈ 83–100% similar (expected until facts supplied; errors in production mode) | `node scripts/lint-dist.mjs` |
| Legacy URL parity (31 old URLs) | **Passed with 1 pending decision** (`/youth-services/`) | `evidence/migration-parity.md` |
| Manual accessibility (screen reader, zoom, voice control) | **Not Run** | — |
| Security tests, pen test, restore test | **Not Run** | — |

## 2. Test layers and tooling (proposed)

| Layer | Scope | Tooling |
|---|---|---|
| Unit | validation schemas, slug/URL normalisation, SEO metadata builders, redirect compiler, permission rules, vacancy state machine, idempotency | Vitest |
| Integration | CMS fetch + review gate, preview flow, form → intake API (synthetic), CRM sync (mock + sandbox), document upload/scan/download, webhooks (HMAC), authN/authZ, automation error paths | Vitest + test containers / sandbox accounts |
| End-to-end | navigation, region/service discovery, vacancy browse + enquire, contact and Step-1 referral (success, validation error, server error, rate limit), staff login (MFA), role permissions, editor publish flow, mobile layouts | Playwright (Chromium, WebKit, mobile viewports) |
| Accessibility | WCAG 2.2 AA | axe-core in CI; manual: keyboard-only, focus visibility, screen readers (VoiceOver + NVDA), zoom 200–400% reflow, contrast, 24/44 px targets, reduced motion, forms/errors, captions |
| Performance | LCP/INP/CLS, JS weight, image sizes | Lighthouse CI on home, service, region, vacancy, guide, referral; CrUX/Search Console for field data after launch |
| Security | listed in 3 | OWASP ZAP baseline, dependency/secret scans, manual testing, external penetration test |
| SEO | listed in 4 | custom crawler checks + Screaming Frog |
| Migration | redirects, parity, analytics | scripts in `scripts/` |

## 3. Security test cases (minimum)

Auth failure/lockout, MFA bypass attempts, horizontal IDOR (user A reads user B's case/document), vertical escalation (marketing → intake), upload abuse (oversize, wrong MIME, polyglot, EICAR via harmless test string, path traversal in filename), injection (SQL/NoSQL/XSS/header), CSRF on staff UI, rate-limit and Turnstile replay, enumeration via error messages, data in logs/analytics/URLs (grep of captured logs for synthetic canaries), private files not cached by CDN/browser, secrets in repo/build output, webhook forgery/replay, CORS misconfiguration, staging indexing leaks, backup restore, break-glass logging.

## 4. SEO test cases

All expected URLs return 200 and one canonical; sitemap contains only indexable 200s; robots rules; staging returns `noindex` + auth wall; unique titles/descriptions; JSON-LD validates and matches visible content; no orphan pages; heading hierarchy; no `#` links; redirect map: every old URL → final 200 in one hop; no redirect chains/loops; hreflang not used.

## 5. Acceptance criteria by template (initial)

| Criterion | Target |
|---|---|
| Lighthouse mobile performance | ≥ 90 (home, service, region, vacancy, guide, referral) |
| LCP / INP / CLS (p75, field after launch) | ≤ 2.5 s / ≤ 200 ms / ≤ 0.1 |
| axe violations | 0 serious/critical; manual checklist signed |
| JS shipped on content pages | within budget set in CI (initial target ≤ 60 KB gzip; revisit once measured) |
| Forms | labelled, error summary, keyboard operable, no PII in URLs/analytics; synthetic submission reaches intake DB; acknowledgement sent in staging within 2 min |
| Permissions | automated role × entity × action matrix: 100% expected outcomes |
| Content gate | unapproved/expired-approval documents never rendered (tested) |

## 6. Task evidence template (per implementation task)

Task ID · Description · Business value · Dependencies · Files/components · Security/privacy impact · Acceptance criteria · Test evidence · Result (Implemented / Tested / Verified on staging / Requires review / Blocked / Not started) · Remaining issues · Deployment status.

## 7. Milestone report contents

Completed work, actual tests executed (with counts), build and lint output summary, unverified integrations, regressions/risks, docs updated, what remains, request for approval of the next phase.
