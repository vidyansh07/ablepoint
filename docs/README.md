# AblePoint Australia — Digital Growth Platform: Planning Pack

Status: **Phase 0 planning complete; Phase 1 build done on staging only (apps/web, packages, Studio code). Nothing deployed. Production WordPress untouched. Start with [25 — Final master plan](25-final-master-plan.md).**
Prepared: 3 November 2026. Author: Claude Code (Sonnet 5.5) on behalf of the engineering lead.

## How to read this pack

Evidence labels used everywhere: **Verified** (observed directly in this session, with a pointer) · **Inferred** (reasoned from verified facts) · **Recommended** (a proposal) · **Not inspected** · **Blocked** (needs access or an input we do not have).

| # | Document | Purpose |
|---|---|---|
| 01 | [Repository audit](01-repository-audit.md) | What is actually in the workspace; what is missing |
| 02 | [Current site audit](02-current-site-audit.md) | Live WordPress crawl and W-01…W-23 reconciliation |
| 03 | [Zaver theme assessment](03-zaver-theme-assessment.md) | Reuse options and weighted decision matrix |
| 04 | [Architecture](04-architecture.md) | Logical/deployment architecture, boundaries, technology register |
| 05 | [Intake data security](05-intake-data-security.md) | Restricted participant-intake subsystem |
| 06 | [CMS content model](06-cms-content-model.md) | Schemas, roles, workflow, vacancy lifecycle |
| 07 | [Sitemap and migration](07-sitemap-migration.md) | Old→new URL map, redirects, parity |
| 08 | [Search visibility](08-search-visibility.md) | SEO, AEO, GEO, local SEO |
| 09 | [CRM and automations](09-crm-automations.md) | CRM model, A1–A17 specifications |
| 10 | [Marketing and budget](10-marketing-budget.md) | A$500/month ad pilot, software cost models |
| 11 | [Test plan](11-test-plan.md) | Strategy, acceptance criteria, results to date |
| 12 | [Implementation roadmap](12-implementation-roadmap.md) | Phases, revised estimates, release gates |
| 13 | [Decisions and risks](13-decisions-and-risks.md) | Decisions needing approval, risk register |
| 14 | [Traceability](14-requirements-traceability.md) | W/G/A IDs and new requirements → deliverables |
| 15 | [Implementation status](15-implementation-status.md) | What is built, verified and still unverified |
| 16 | [UI reference research](16-ui-reference-research.md) | Patterns studied from Australian NDIS and disability sites |
| 17 | [Brand guidelines](17-brand-guidelines.md) | Logo, colour, type, illustration, voice, accessibility |
| 18 | [Work queue](18-work-queue.md) | Order of work and open questions for the owner |
| 19 | [Creative sourcing](19-creative-sourcing.md) | Verified licences, illustrators, icons, animation, photography |
| 20 | [SEO and growth contract](20-seo-growth-contract.md) | The pathway to rank, be cited and be trusted; what can and cannot be promised |
| 21 | [Agent API and content pipeline](21-agent-api-and-content-pipeline.md) | JSON API, OpenAPI, blog automation with human approval |
| 22 | [Understanding AblePoint today](22-current-ablepoint-understanding.md) | What the live site says; conflicts and questions |
| 23 | [Referrer trust checklist](23-referrer-trust-checklist.md) | What support coordinators look for; site checklist |
| 24 | [Hireup feature and stack analysis](24-hireup-feature-and-stack-analysis.md) | What was adopted, adapted or avoided, and why |
| 25 | [Final master plan](25-final-master-plan.md) | Phases, backlog, owner questions, gates, budget, risks, measures |
| 26 | [Operations runbooks](26-operations-runbooks.md) | Publish, vacancy, correction, rollback, privacy incident, ads, access, quarterly review (draft, not rehearsed) |
| 27 | [Regional fact sheet](27-region-fact-sheet-template.md) | What operations supplies per region so region pages stop being templates |

Supporting evidence (copied into the workspace, never modified):
- `source/ablepoint-growth-roadmap.html` — the historical roadmap (30 Oct 2026).
- `evidence/live-site-crawl-2026-11-03.json` + `live-site-crawl.py` — raw crawl output and the script that produced it (read-only GETs, 0.6 s delay, identifying user-agent).
- `evidence/live-sitemap-2026-11-03.xml`, `live-robots-2026-11-03.txt` — captured as served.

## Three findings that change the plan

1. **The "licensed Zaver source" is not in the workspace.** The folder supplied (`themecrafter.com/zaver/`, 540 files) is a byte-identical copy of an HTTrack scrape of the *public demo website* (rendered HTML, compiled CSS/JS, images, fonts). It contains no PHP theme files, no SCSS, no Elementor template exports, no licence file, and the scrape was interrupted. The theme assessment is therefore provisional. See 01 and 03.
2. **Critical compliance problems from the roadmap are still live today (3 Nov 2026).** Template placeholder address/phone/email in the footer of 32/32 crawled pages; "approved NDIS" wording on 2 pages; referral form with no privacy/consent text; `/privacy-policy/` returns 404. These are escalation items for AblePoint's owner, not things this project fixes on production. See 02 and 13.
3. **Some roadmap findings have changed.** Structured data now exists on every page (a plugin, ThinkRank SEO, added it) but is generic and contains the misspelling "Ablepoint Austrialia"; regional pages are now ~600 words, not ~300. The roadmap is a baseline, not current truth. See 02.

## What is needed from AblePoint before Phase 1 can start

See [13 — Decisions and risks](13-decisions-and-risks.md), section "Blocking decisions". In short: the actual licensed Zaver package and licence document; owner sign-off on the escalation list; approval of the Phase 1 software spend (or explicit "use free tiers only"); a named compliance owner; access list (GA4/GTM/Search Console/GBP/Ads/registrar).
