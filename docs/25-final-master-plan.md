# 25 — Final Master Plan

Date: 3 Nov 2026. Status: **proposed for owner approval**. This is the single document to read first. It consolidates the strategy (`20`), architecture (`04`, `05`), build status (`15`), compliance rules (`10` §5, `13`), the referrer-trust plan (`23`) and the open questions (`18`, `22`) into one ordered pathway from today to a live, growing site.

Evidence labels: **Built** (exists and was tested by me) · **Verified** (observed directly) · **Drafted** (exists, needs the owner or a reviewer) · **Blocked** (needs an account, access or a decision) · **Not started**. Nothing here is a ranking, enquiry-volume or revenue promise.

---

## 1. The goal in one paragraph

Make AblePoint the provider that **support coordinators, plan managers, discharge planners and families in six regional NSW areas** (Central Coast, Newcastle, Dubbo, Orange, Tamworth, Gunnedah) can find, trust and refer to quickly, with honest vacancy information and a safe referral process. Win by being the clearest, fastest, most accessible and most transparent site in a narrow niche (supported accommodation and support for people with complex needs, with a referral process built for coordinators), not by out-spending marketplaces such as Mable and Hireup on head terms. The production WordPress site is untouched until the owner authorises a migration.

## 2. Where we are today (3 Nov 2026)

| Area | State | Evidence |
|---|---|---|
| Public site on staging | **Built.** 40 static pages: home, 6 services, 6 regions with licensed photos, vacancies, guides, blog, FAQ, pricing and agreements, referrer hub, referral form, legal pages, Easy Read, image credits, style guide (staging only), landing page | `15`; Lighthouse mobile lab 100/100/100 on key pages |
| Brand and UI | **Built**, awaiting owner approval. Preserved logo, Atkinson Hyperlegible, logo-derived palette, original art, Lucide icons, motion, text-size and high-contrast modes | `17`, `19` |
| Accessibility | **Built** to WCAG 2.2 AA with automated checks (axe). **Not done:** manual screen-reader testing, testing with people with disability | `11`, `15` |
| Content governance | **Built.** Banned-phrase lint, draft/approve states, content-hash approval, production reviewer allow-list (ships empty), vacancy staleness rules | `06`, `21` |
| Agent and blog layer | **Built.** JSON API (9 resources), OpenAPI 3.1, `llms.txt`, Atom feed, robots policy per bot, IndexNow tool, draft ingest and approve CLIs, CI content gates. One seed draft post | `21` |
| Search foundation | **Built.** Canonical, structured data, accurate sitemap, per-bot robots. **Blocked:** Search Console, Bing, Google Business Profile | `20` |
| Referrer trust | **Drafted.** Coordinator hub with independence statement, vacancy transparency, checklist | `23` |
| Intake core | **Built as tested logic and test doubles only.** Crypto, RBAC, handler, uploads state machine, retention decisions. Draft Postgres schema now parses and passes 26 row-level-security behaviour tests on an in-memory embedded Postgres. **Not usable for real participant data** | `05`, `packages/intake-core` |
| Automations A1 to A17 | **Built as pure rules (429 tests).** No n8n workflows, no vendor integrations | `09` |
| CMS | **Built as Sanity Studio code (223 tests).** No Sanity project exists, nothing run live | `apps/studio` |
| Hosting, GitHub, Vercel, Sanity, n8n, HubSpot, GA4/GTM, Search Console, GBP, Ads | **Blocked on accounts and approvals** | `13` |

Latest verified test totals are in `15-implementation-status.md`. After the implementation pass on 3 Nov 2026: 1,536 unit tests, 206 browser tests, type checks clean. Everything below marked ✔ or ◐ in §5 reflects that pass; everything marked ○ still waits on an account, a person or a decision.

## 3. Principles that do not change

1. Production WordPress, DNS and the live domain are not touched without the owner's explicit, written go-ahead.
2. No real participant data in the repository, CMS, logs, analytics or staging. Synthetic data only until the intake platform passes sign-off (G5).
3. Nothing is invented: no testimonials, certifications, staff, addresses, vacancies, prices, response times or statistics. Unknowns are shown as unknown.
4. Humans publish. Agents and automation may draft and propose. A named, listed reviewer approves, and approval is tied to the exact content (hash).
5. No NDIS "approved" or "endorsed" wording, no superlatives, no eligibility certainty, no outcome promises.
6. No purchases, ad launches or outbound email/SMS without written approval.
7. Report honestly: Passed, Failed, Blocked or Not Run, with evidence.
8. Advertising and tracking follow the rules in `10` §5, including no health-adjacent data to ad platforms.

## 4. The master pathway: eight phases with exit gates

Hours are planning ranges from `12` (low-to-medium confidence). One engineer at about 25 h/week with owner, compliance and content support. Calendar dates below are **indicative and start only when the owner answers the Tier 1 questions in §6**.

| Phase | What happens | Exit gate | Status |
|---|---|---|---|
| **A. Foundation and UI** (done) | Monorepo, design system, templates, access tools, art, motion, photos, API, blog pipeline, referrer hub, support finder, FAQ, tests | **G1** staging review by the owner | Built; waiting for the owner's review |
| **B. Owner decisions and facts** (weeks 0 to 2) | Owner answers Tier 1 questions (§6): address, registration number, spelling, reviewers, niche, youth service, response commitment, facilities claims. Send the live-site escalation memo | **G0** approve architecture and first spend | **Blocked on owner** |
| **C. Accounts and plumbing** (weeks 1 to 4) | GitHub repo with branch protection and CODEOWNERS; Vercel Pro protected staging; Sanity project and Studio; Lighthouse CI and content-gates workflow running; Search Console and Bing verification on the staging-safe plan | CI green on a real run; Studio Approve action exercised for real | **Blocked on accounts** |
| **D. Content and compliance** (weeks 2 to 12, parallel) | Region fact sheets from operations; service pages; first 4 reviewed posts; reviewer list populated; pricing and agreement text; Easy Read commissioned and tested; regional staff review of vignettes; photography with consent | **G2** content approved by the named compliance reviewer | **Blocked on owner and reviewer** |
| **E. Referrer and local presence** (weeks 4 to 12) | Google Business Profile per legitimate location, directory listings (NDIS Provider Finder, MyCareSpace, Clickability, Housing Hub as verified), coordinator outreach list and first meetings, vacancy publishing routine | Listings match the website exactly (name, address, phone) | **Blocked on owner and access** |
| **F. Launch preparation** (weeks 10 to 16) | Migration rehearsal on staging, redirect and parity tests, analytics and consent configuration, manual accessibility testing, backup and rollback plan | **G3** pre-launch checklist (`12` §3) | Parity script **Built**; the rest not started |
| **G. Cutover** (about week 16) | Public marketing site on the production domain with safe routing: phone and email only, or Step 1 of the form once its API passes security review | **G4** explicit owner approval | Not started |
| **H. Secure intake and automations** (weeks 10 to 24) | AWS Sydney database, KMS, auth with MFA, storage and malware scan, staff UI, audit, retention, penetration test; then automations in the order in `09` | **G5** compliance sign-off and a passed penetration test before any real participant data | Not started |
| **I. Growth operations** (from launch, weeks 14+) | Google Ads pilot (A$500/month, one region), weekly search-term review, monthly content, monthly AI-visibility log, 30/60/90-day reviews | KPI reviews in §9 | Not started |

The public cutover does **not** wait for the secure intake platform. If Step 1 is not ready, the cutover site shows phone and email only. It must not publish a data-collecting form without safe storage.

## 5. Workstreams and backlog (everything, ordered)

Status key: ✔ done · ◐ partly done · ○ not started. "Needs" lists what blocks it.

### 5.1 Experience and brand
| Item | Status | Needs |
|---|---|---|
| Design system, templates, access modes, motion, art, icons | ✔ | Owner approval of `17` (Q1) |
| Vector logo and one-colour version | ○ | Owner supplies (Q2) |
| Official spelling "Ablepoint" or "AblePoint" | ○ | Owner (Q3) |
| Real photography of homes, staff and participants | ○ | Consent process and budget (Q4) |
| Commissioned disability-led illustration set | ◐ outreach drafted, **not sent** | Owner sets budget and sends |
| Easy Read pages written and tested with the target audience | ◐ pattern and brief | Commissioning budget |
| Regional staff review of the six vignettes | ◐ review sheet ready | Regional staff time |
| Pixabay photos | ◐ search tool built, untested live | Owner downloads files with page URL and creator, or sets `PIXABAY_KEY` locally; decide on people-photo risk |
| Careers page; language selector or read-aloud | ○ | Owner decision (Q5, Q6) |
| Usability tests: 5 or more coordinators and 5 or more people with disability | ○ | Recruitment, ethics, budget |
| Manual screen-reader pass (NVDA, VoiceOver, TalkBack) and keyboard-only pass | ○ | Tester time; a person who uses assistive tech daily is preferred |
| Safari and Firefox check of view transitions | ○ | Real browsers |

### 5.2 Content and trust
| Item | Status | Needs |
|---|---|---|
| Referrer hub and independence statement (draft) | ◐ | Owner facts (response approach, who answers) and reviewer approval |
| Region fact sheets (services, staff, premises, partners) | ◐ data model, validator, page sections and API field **built and tested**; template for operations in `27`; no facts supplied yet | Operations (C-2) |
| Service pages written from verified facts | ◐ drafts | Compliance review; C-4 facilities claims |
| Pricing and agreements page | ◐ draft, no prices | Owner confirms price approach against current NDIS price limits |
| Home safety and funding blocks | ◐ drafts, hidden in production | Reviewer approval |
| FAQ (draft) | ◐ | Reviewer approval |
| 24-brief blog topic map (`20` §4); about 4 reviewed posts a month | ◐ 1 seed draft | Named author and NDIS-experienced reviewer (B-04) |
| Testimonials | ○ gate built, **empty** | Written consent from real people; never invented |
| Plain-English glossary (SIL, SDA, STA, plan types) as linkable resource | ◐ page and 11 draft terms built (`/glossary/`, hidden in production until approved). ndis.gov.au refuses automated reading, so a person must compare each term with the official wording | Reviewer |
| Referral pack for coordinators (what we need, timeline, contacts) as a downloadable PDF and page | ◐ the hub page already lists what a referral needs. A PDF is **deliberately deferred**: a printed copy cannot be corrected once circulated, so it waits for confirmed facts | Owner process facts |
| Vacancy publishing routine and owner (who updates, how often) | ◐ rules and staleness built | Operations names an owner |
| Accessibility statement with real contact route and feedback process | ◐ | Owner |
| Registration, complaints, worker screening statements | ◐ | Verified registration number and groups (C-7) |

### 5.3 Search, AI visibility and local presence
| Item | Status | Needs |
|---|---|---|
| Technical SEO, structured data, sitemap, robots, API, feed, `llms.txt` | ✔ | — |
| Search Console and Bing Webmaster verification; submit sitemap | ○ | Domain access |
| 15 to 20 priority Australian SERP checks recorded (local pack, AI results, who ranks) | ○ | Owner browser or SEO tool (research tools here are US-only) |
| Keyword Planner volumes for service × region terms | ○ | Google Ads account |
| Google Business Profile per legitimate location; services, photos, weekly posts | ○ | Resolve C-1 and C-2 first |
| Directory claims and listings (terms and fees unverified) | ○ | Owner access and approval |
| White-hat link earning: councils, health districts, hospital social-work teams, peak bodies, coordinator networks | ○ | Outreach approval |
| Monthly 12-prompt AI-visibility log (`08`) | ○ | After launch |
| IndexNow ping on publish | ◐ tool built | Production key host and deploy hook |
| Redirect map and parity checks against the live site | ◐ parity script built, results in `evidence/migration-parity.md` | Final URL decisions (D-12, D-13) |

### 5.4 Platform and automation
| Item | Status | Needs |
|---|---|---|
| GitHub repository, branch protection, CODEOWNERS with the real handle | ○ | Owner creates repo |
| Vercel Pro project with protected staging, generated headers, deploy hook | ◐ config generated | Approval and account (B-03) |
| Sanity project, dataset privacy, roles, Approve action live | ◐ code and tests (225); Studio starts locally and its schema compiles (a crash bug was found and fixed on 4 Nov), but no project exists so no document form or Approve action has been seen | Approval and account (B-03) |
| Sanity adapter so the site reads CMS content instead of local files | ◐ **pull pipeline built and tested on fake documents** (`apps/web/src/lib/cms`, `cms:pull`): raw fetch → approval-hash gate → strip internal fields → map → deterministic JSON. **Not wired in**: the Studio lacks fields for service icon/tint, region facts and Easy Read blocks, so wiring now would delete that content (see the README in that folder). Never run against a real dataset | Sanity project; Studio schema additions |
| Webhook → rebuild → IndexNow | ◐ n8n workflow file written (HMAC check, production-host guard, sitemap fetch, IndexNow POST). A signing relay from the deploy pipeline is still needed and not built | Vercel, Sanity, n8n |
| n8n (self-hosted, AU) workflow exports: blog drafting to pull request, vacancy sync, monitors | ◐ **four workflow files written** in `automation/n8n/` (blog draft → pull request, post-deploy IndexNow, vacancy staleness monitor, site health monitor). All inactive, credentials are placeholders, consistency tests pass. **Never imported into or run on n8n**; several parameters are unverified (listed in its README) | n8n host (D-07), GitHub token, LLM account |
| MCP server exposing the read-only content API to agents | ✔ built and tested (`packages/mcp-server`, 10 read-only tools). Not tried with a real MCP client; `--base-url` never fetched from a real site | — |
| Performance budgets in the pipeline | ✔ per-page JavaScript and CSS budgets enforced in `lint-dist` (verified to fail when exceeded). ◐ Lighthouse CI workflow and `lighthouserc.json` written, parse correctly, **never run** | GitHub Actions run |
| Error and uptime monitoring | ○ | Account choice |

### 5.5 Secure intake and CRM (the largest and highest-risk stream)
| Item | Status | Needs |
|---|---|---|
| Intake core logic, test doubles, draft schema with row-level security | ◐ **Built and tested in-memory** | — |
| Real Postgres adapter, migrations, backups and restore tests | ○ | AWS decision and approval (D-05) |
| KMS key provider and rotation | ○ | AWS |
| Turnstile verifier against Cloudflare | ○ | Cloudflare account |
| Object storage with quarantine bucket and malware scanner | ○ | AWS |
| Staff identity, MFA, sessions, CSRF, staff intake UI | ○ | AWS, design |
| CRM (HubSpot) with minimal data only; region and sensitive-data policy verified first | ○ | D-06 verification |
| Email and SMS providers with Spam Act compliance and approved templates | ○ | Approval, sender-ID rules |
| Penetration test, privacy and legal review, retention periods | ○ | External quotes (D-16) |

### 5.6 Paid and measured growth
| Item | Status | Needs |
|---|---|---|
| Ad-policy and tracking rules | ✔ written (`10` §5) | Compliance sign-off |
| Landing page template (noindex, minimal header) | ✔ | Region and facts (D-08) |
| Consent-gated GTM and GA4, neutral events | ◐ built against a fake container id | Real container, consent copy (D-17) |
| Call tracking number | ○ | Approval (D-09) |
| Google Ads account, one Search campaign, A$500/month ceiling | ○ | Landing page live, tracking, capacity, compliance review of ads |
| Meta (Facebook, Instagram) | **Off** | Separate budget and a written policy review |

## 6. What I need from the owner, in the order that unblocks the most

### Tier 1 — facts and people (blocks accurate content and trust)
| # | Question | Recommended default if you want me to proceed |
|---|---|---|
| ASK-01 | **Head office and public locations.** The brief says Gosford; the live site lists Carlingford NSW and Orange. Which addresses may be published, and is there premises in each region? (C-1, C-2) | Publish no street address until answered; show service-area regions only |
| ASK-02 | **NDIS registration number and registered support groups** (C-7). | I check the NDIS Commission's public provider register once you confirm the legal entity name |
| ASK-03 | **Official spelling** ("Ablepoint" logo, "AblePoint" brief) and a **vector logo** (C-8, Q2). | Keep "AblePoint Australia" in text, logo untouched |
| ASK-04 | **Name the compliance owner and an NDIS-experienced reviewer** (B-04). Their names go in `reviewers.json`. | Without names, production shows no approved content by design |
| ASK-05 | **Approve the niche**: supported accommodation and support for people with complex needs, referral process for coordinators (C-5). | Approve; wording reviewed by the compliance owner |
| ASK-06 | **Is the youth / out-of-home-care service part of this site?** (C-3) It sits under a different regulatory framework. | Leave it out until advice is taken |
| ASK-07 | **What referral response time can you really keep?** (C-6) The live site says "less than a week". | Promise nothing numeric until you commit |
| ASK-08 | **Facilities claims** (sensory room, spa bath, nursing, gardens): true for which homes? (C-4) | Leave out until substantiated per home |
| ASK-09 | **Send the live-site escalation memo** (B-07): placeholder contact details, "approved NDIS" wording and a missing privacy policy are still on the live site as of 3 Nov 2026. | Send now; fixing production is your call |

### Tier 2 — accounts and spend (blocks everything that needs a live service)
| # | Question | Default |
|---|---|---|
| ASK-10 | Create the GitHub repository, switch on branch protection and give the real CODEOWNERS handle. | Required for the approval gate to be enforced |
| ASK-11 | Approve **Vercel Pro** and **Sanity Growth (up to 3 seats)** (B-03). | Approve both; nothing else yet |
| ASK-12 | Provide access: Search Console, Bing Webmaster, GA4, GTM, Google Business Profile, domain registrar/DNS, Google Ads (read-only or standard where possible) (B-05). | Read-only first |
| ASK-13 | Choose the intake platform path: **AWS Sydney** (recommended) and the n8n host (D-05, D-07); approve an AWS cost estimate first. | AWS Sydney; I produce the estimate |
| ASK-14 | Engage a privacy/legal adviser and a penetration tester; get quotes (D-16, X-xx). | Required before real data |

### Tier 3 — creative and media
| # | Question | Default |
|---|---|---|
| ASK-15 | **Pixabay**: send downloaded files with each page URL and creator, or set `PIXABAY_KEY` locally (never paste it in chat). Accept or refuse the risk of recognisable-people photos. | Landscapes and objects only |
| ASK-16 | Set the **illustrator and Easy Read budget** and send the drafted outreach emails yourself. | Nothing is sent by me |
| ASK-17 | Photography: can staff, homes and participants be photographed with written consent? (Q4) | Illustration and licensed landscapes only |
| ASK-18 | Add a **careers page**? Add **language or read-aloud** tools? (Q5, Q6) | Careers: yes later; read-aloud: defer |

### Tier 4 — growth and policy settings
| # | Question | Default |
|---|---|---|
| ASK-19 | **Training-crawler policy** (D-14): allow AI training crawlers (current default, you wanted models to learn about AblePoint) or block. | Allow; switch with `AI_TRAINING=block` |
| ASK-20 | **Call tracking** (D-09) and **first ad region** (D-08). | Central Coast, tracking after approval |
| ASK-21 | **Price and agreement text** for the pricing page against the current NDIS price limits. | No prices published |
| ASK-22 | **Referral gifts**: confirm there will be none (the NDIS inducement offence s73VA commences 20 Nov 2026). | None |

## 7. Release gates (all required before the production domain changes)

| Gate | Requirement | State |
|---|---|---|
| G0 | Architecture approved; first spend approved; Tier 1 answered | Waiting on owner |
| G1 | Staging design, accessibility and performance review | Ready for review |
| G2 | Content approved by named reviewer; legal and contact facts verified | Not started |
| G3 | Pre-launch checklist: redirects, parity, analytics, headers, manual accessibility, backup and rollback | Partly built |
| G4 | Owner's explicit written approval to switch the domain | — |
| G5 | Security and privacy sign-off and penetration test before **any** real participant data | Not started |

## 8. Growth plan after launch

1. **Referrers first.** Coordinator hub, honest vacancy page, a one-page referral pack, direct outreach to a short list of regional coordinators, plan managers, hospital social-work teams and justice liaison staff (drafts and sending are the owner's decision; the Spam Act applies to any email or SMS).
2. **Local presence.** Google Business Profile, directories and the six region pages with real, unique local facts. No doorway pages, no keyword-swapped clones. Region × service pages only where there is genuine unique content.
3. **Content that earns citations.** About four substantial posts a month, each with a named author, a reviewer, honest dates and two or more authoritative sources. The pipeline blocks thin, duplicated, stuffed and unsourced drafts before a human reads them.
4. **Answer engines.** Answer-first sections, comparison tables, one canonical URL per answer, the open API and feed, and a monthly 12-prompt visibility log. No tool forces inclusion.
5. **Paid, small and clean.** A$500/month Google Search in one region, phrase and exact match, call asset, neutral conversion events, weekly search-term review. Judged over 60 to 90 days on leading indicators.
6. **Continuous improvement.** 30, 60 and 90-day reviews; drop weak pages; strengthen what earns referrals; keep competitor sitemap checks (Mable, Hireup and regional providers) quarterly.

## 9. How success is measured (no promises)

| Measure | Definition | Source | Notes |
|---|---|---|---|
| Qualified enquiries | CRM stage at least "Contacted", served region, service offered, not spam or duplicate (D-10) | CRM | Primary outcome |
| Referrals from coordinators | Count by referrer type | CRM (minimal data) | Primary outcome |
| Time to first response | Median in business hours | CRM timestamps | Reported, no target promised until ASK-07 |
| Vacancy freshness | Share of published homes verified in the last 14 days | Site data | Target 100% |
| Organic impressions and clicks by region and service | Search Console | Needs access | Baseline first |
| Local pack presence for 15 to 20 priority queries | Manual SERP checks | Owner | Monthly |
| AI answer mentions | 12-prompt log | Manual | Monthly, anecdotal |
| Core Web Vitals, real users | Search Console | After traffic | Lab already 100/100/100 |
| Accessibility defects | Automated plus manual tests | CI and testers | Zero known AA failures |
| Cost per qualified enquiry (ads) | Spend ÷ qualified enquiries | Ads + CRM | Judge only after about 15 qualified enquiries or 90 days |

## 10. Budget summary

- **Approved ceiling:** A$500/month advertising (a cap, not a go-ahead).
- **Proposed first approval:** Vercel Pro (about US$40/month with one seat) and Sanity Growth (US$15 per seat, up to 3). Verified prices as of 3 Nov 2026 are in `10` §3.
- **Not yet priced or approved:** AWS intake platform (material), n8n hosting, call tracking (about A$100 to 150/month), email/SMS, monitoring, domain, photography, illustrator and Easy Read commissions, usability testing, privacy/legal adviser, penetration test (likely the largest one-time cost). Quotes are required before any estimate is relied on.
- The effort estimate is about 790 hours (range 600 to 1,000) in `12`; the work completed so far covers most of Phase 1 and a large part of the content and SEO engineering.

## 11. Top risks and how the plan answers them

| Risk | Plan |
|---|---|
| Live site collects NDIS numbers without a privacy notice and shows placeholder details (R-01) | Escalate now (ASK-09); the new site fixes it by design |
| Sensitive data leaks into analytics, ads, CRM or logs (R-02) | No analytics on form pages; neutral events only; allow-list sanitiser; synthetic data only until G5 |
| Misleading NDIS claims or AI-written content published (R-08) | Banned-phrase lint, quality gates, hash approval, reviewer allow-list, humans publish |
| Templated region pages treated as doorway pages | Lint warns on similarity now; replace with real regional facts before launch (Phase D) |
| Unverified facts (address, registration, facilities, response time) (C-1 to C-8) | Not published until the owner confirms |
| SEO loss at cutover (R-07) | Redirect map, parity script, staged rollout, 14-day monitoring |
| Ad-platform policy limits on health-related audiences (R-16) | Search only, no remarketing, neutral events, `10` §5 |
| Scope and single-engineer risk (R-06, R-12) | Phased gates, runbooks, IaC, handover kit; launch without the full intake platform |
| Policy changes by Google, Meta or the NDIS Commission | Quarterly policy re-read; the s73VA inducement offence from 20 Nov 2026 is already designed around |

## 12. What this plan cannot promise

Ranking above any named competitor, being featured in AI answers, any number of enquiries, any cost per enquiry, any response time (until the owner commits), NDIS outcomes for any person, or that the intake platform is safe for real data before the penetration test and sign-off. It does promise a build that is fast, accessible, honest, measurable and ready to be reviewed.

## 13. Next 14 days (once the owner replies)

| Days | Action | Who |
|---|---|---|
| 1 | Owner reads this plan, answers Tier 1 (ASK-01 to ASK-09) and sends the escalation memo | Owner |
| 1 to 3 | Owner creates the GitHub repo and approves Vercel Pro and Sanity Growth; I push the code and wire CI | Owner, engineer |
| 2 to 5 | Verify the registration on the public register; update the site with confirmed facts; populate `reviewers.json` through a reviewed change | Engineer, compliance |
| 3 to 7 | Protected staging on Vercel; Lighthouse CI; Sanity project and a live Approve-action test | Engineer |
| 5 to 10 | Region fact sheets from operations; first 4 posts drafted through the pipeline; reviewer pass | Operations, reviewer |
| 7 to 14 | Search Console and Bing verification on the staging-safe plan; Google Business Profile claim; SERP baseline; first coordinator list | Owner, engineer |

If the owner would rather start with something that needs no accounts, the best next engineering work is: the MCP server for agents, the Sanity adapter behind a feature switch, n8n workflow exports as files, and an expanded set of region-specific content templates ready for facts.
