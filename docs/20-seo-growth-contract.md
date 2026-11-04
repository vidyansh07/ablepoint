# 20 — Search, AI Visibility and Referral Growth: the Contract and Pathway

Date: 3 Nov 2026. Status: proposal for owner approval. Built from competitor sitemaps and pages read on 3 Nov 2026, official search-engine and AI-crawler documentation, ad-platform policy pages, and AblePoint's own live site. Nothing here is a ranking promise.

## 0. What can and cannot be promised

**Cannot be promised:** ranking above every site in Australia, "training" Google or any AI model to prefer AblePoint, or any enquiry volume. Rankings depend on competitors, user behaviour and search-engine decisions that nobody outside those companies controls. No tool, markup file or crawler setting forces inclusion; Google states there are "no additional requirements to appear in AI Overviews... nor other special optimizations necessary" and that optimising for generative AI search "is still SEO".

**Can be committed to:** the best-built, fastest, clearest, most trustworthy site in its niche; the most useful and original content for the people who actually refer (support coordinators, plan managers, hospital and justice discharge staff, families); complete technical crawlability for every search and answer engine; honest, compliant advertising; and a measured loop that finds what works and stops what does not.

**Why this is winnable.** Competitor sitemaps (read 3 Nov 2026): Mable has ~1,450 URLs and Hireup ~2,600, but they are marketplaces built around suburb and worker-search pages (about 630 and 1,040 suburb pages) and had **no SIL, SDA, support-coordination or short-term-accommodation location pages**; none of the sites checked has a **Gunnedah** page, and Dubbo and Orange are thin; Hireup's raw HTML is a near-empty JavaScript shell with no H1. Provider sites with vacancy and housing pages (Aruma, Ability Options, CPA, Scope, Yooralla) do well structurally but are large organisations; only one had a hospital-discharge page. A small regional provider can win **specific, high-intent, referrer-led searches**, not the head terms.

## 1. Positioning (what to be known for)

From the live site (`22-current-ablepoint-understanding.md`): AblePoint was founded to serve people who fall between services (homelessness, justice, health) and states specialties in mental health supports, complex needs and clients with criminal convictions. Recommended niche, **pending owner confirmation (questions C-1 to C-8)**:

> *Supported accommodation and support for people with complex needs in regional NSW, with a referral process built for support coordinators and discharge planners.*

This is where referrers struggle most to place participants and where marketplaces do not compete. Compliance caution: say it with dignity and facts, never imply outcomes, never name sensitive client groups carelessly, and never imply NDIS approval.

## 2. Site architecture (built to rank and to be read by agents)

| Layer | Pages | SEO purpose | Status |
|---|---|---|---|
| Referrer hub | `/for-support-coordinators/` (referral process, what we need, vacancy status, response, privacy, contact), `/referral/` | Converts the audience that actually sends clients; ranks for coordinator and discharge searches | Referral built; hub page queued (needs owner facts) |
| Service pages | core support, SIL, SDA, short-term accommodation, support coordination, community access | One page per service, plain-English, FAQs, related links | Built (draft copy) |
| Region hubs | six regions | One genuine page per region with local facts, team, services, vacancies, referral partners; **no keyword-swapped doorway pages** (Google lists city page sets that funnel to one page as doorway abuse) | Built (templated; needs real facts) |
| Region × service | only where there is real, unique content and demand (e.g. "SIL in Orange") | Targets the highest-intent local queries without thin pages | Rule enforced: pages ship only if `lint-dist` similarity check passes |
| Vacancies | list + one page per home | Highest-intent page type for coordinators; honest availability status | Built; empty until staff publish |
| Guides + blog | evergreen guides and referrer-focused posts | Topical authority, AEO answers, links | Pipeline built; 1 seed draft |
| Trust pages | registration, complaints, accessibility, Easy Read, privacy, image credits | E-E-A-T trust signals ("trust is most important", Google) | Drafts; need owner text |

Internal linking rules: every region links to its services, vacancies and guides; every service links to regions where it is verified; every post links to the matching service/region page and to at least two authoritative external sources; breadcrumbs on all pages (built).

## 3. Technical foundation (done unless noted)

Static HTML (server-rendered text for every crawler), canonical + `lang="en-AU"`, one H1 per page (lint-enforced), accessible markup (axe in CI), Lighthouse 100/100/100 and LCP 1.1–1.4 s in lab, strict CSP, sitemap with accurate `lastmod` only, `robots.txt` with per-bot groups, JSON-LD (Organization, WebSite, BreadcrumbList, Service, Article with author/reviewer/dates, FAQPage), Atom feed, public JSON API and OpenAPI, `llms.txt`, IndexNow tooling. Notes from official docs: FAQ rich results were removed by Google in May 2026 (FAQ content stays for users and other engines; no rich-result promise); Google does not use `llms.txt`; the Indexing API is only for job postings and livestreams (not used); `changefreq`/`priority` are ignored (omitted).

Still to do: Search Console and Bing Webmaster Tools verification (needs domain access); Rich Results/URL Inspection checks after deploy; real-user Core Web Vitals once traffic exists.

## 4. Content engine (quality over volume)

Google's spam policy targets "scaled content abuse" and raters mark unedited mass AI content lowest; YMYL-adjacent topics (disability support, funding) face higher standards. So: **about four substantial posts a month**, each with a named author, an NDIS-experienced reviewer, honest dates, 2+ authoritative sources and something original (AblePoint's actual process, regional knowledge, checklists). The pipeline (`21-agent-api-and-content-pipeline.md`) enforces thin-content, duplicate, stuffing, reading-level, banned-wording and source gates before a human ever sees a draft.

Topic map (first 24 briefs; each needs owner facts or reviewer sign-off):

| Cluster | Topics | Audience | Format |
|---|---|---|---|
| Choosing providers | Checklist for choosing a SIL provider (seed draft done); questions to ask an SDA provider; what to ask on a house visit; how to compare service agreements | Coordinators, families | Checklist + FAQ |
| Referrals | What a good referral contains; how we respond to referrals (real process); urgent hospital-discharge referrals; referral to vacancy timeline | Coordinators, discharge planners | Process explainer |
| Housing explained | SIL vs SDA vs STA in plain English (guide exists); what SDA design categories mean; moving into a shared home; tenancy and support are separate | Families, coordinators | Guide + comparison table |
| Complex needs | Housing and support for people with complex needs; supporting a person leaving hospital or custody; mental health supports and tenancy; positive behaviour support basics | Coordinators, health/justice staff | Guide (compliance-reviewed) |
| Regional | Services and housing in Central Coast, Newcastle, Dubbo, Orange, Tamworth, Gunnedah; local services directory; transport and community access by town | Families, coordinators | Local guide with verified facts |
| Working with us | Support worker roles and screening; how we train and support staff | Job seekers | Recruitment page (A16) |
| Policy and funding | Plain-English explainers of current NDIS changes, always sourced and dated | All | Short news explainers, reviewer-checked |

## 5. Local SEO (the fastest realistic win)

Whitespark's 2026 expert survey (reported, not Google data) puts primary Google Business Profile category and proximity first for the map pack. Google says you cannot pay for local ranking and that a service-area business should not publish a fake address or stuff services/locations into the name. Plan: complete GBP per **legitimate** location (resolve C-1/C-2 first), primary category chosen carefully, services, Q&A, real photos with consent, weekly posts (manual if the API is unavailable), review requests with no incentives (A8). Consistent name, address and phone everywhere. Directory listings to verify and claim: NDIS Provider Finder, MyCareSpace, Clickability and Housing Hub (competitor research found these directories carry thousands of provider profiles; listing terms and fees not yet verified).

## 6. Authority and links (white-hat only)

Earn, never buy: coordinator and plan-manager networks, regional councils and health districts, local disability services directories, hospital social-work teams, university/placement partners, peak bodies, and genuinely useful resources others cite (checklists, a plain-English glossary, vacancy transparency). Do not buy links, run link schemes, or post fabricated reviews; these breach search-engine policy and, for reviews, NDIS and consumer rules.

## 7. AEO and GEO (answer engines)

Make answers extractable and trustworthy: answer-first paragraph, question-led headings, comparison tables, sources named, reviewed and updated dates that change only when content changes, one canonical URL per answer. Allow the answer-engine crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Bingbot, Applebot, meta-webindexer) and, by owner choice, training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent); user-triggered fetchers (ChatGPT-User, Perplexity-User, Google-Agent) may ignore robots.txt, so never put anything private on a public URL. Monitor with the Search Console generative AI performance report, Bing AI Performance, and the 12-prompt monthly log (`08-search-visibility.md`).

## 8. Paid media

Full rules are in `10-marketing-budget.md` section 5. In short: Google Search only at A$500/month (one region, phrase/exact match, call asset, weekly search-term review, hard monthly stop); no remarketing, Customer Match or lookalike audiences from disability or health pages; ad platforms receive only neutral events (`phone_click`, `referral_submit`), never health, diagnosis, NDIS-number or service-detail data; no Meta pixel or lead forms with health fields without a written policy review; call assets rather than call-only ads (being retired); no gifts or cash-like rewards for referrals (NDIS inducement offence s73VA from 20 Nov 2026); consent first for any pixel (OAIC); Spam Act compliance for messages. Paid media supports the organic and referrer plan; it is not the main growth channel. Nothing launches without owner approval and compliance review of the ads.

## 9. Referrer trust (support coordinators)

Support coordinators are the main audience. Research (`23-referrer-trust-checklist.md`) shows they value being easy to reach, honest capacity answers, clear agreements and recommendations from peers, and that participants are wary of providers that deliver both support coordination and SIL/SDA. The new site therefore has a dedicated referrer hub with an explicit independence statement, a transparent vacancy page, honest response expectations (none promised until the owner commits), and registration, complaints and accessibility information on every relevant page. Listing on the NDIS Provider Finder, SDA Finder, Housing Hub and the main directories, with details identical to the website, is part of the plan.

## 10. Measurement

Pull (owner access): Search Console, Bing Webmaster Tools, GBP Insights, Keyword Planner volumes for "support coordinator/SIL/SDA/short term accommodation + each region", real Australian SERP checks for 15–20 priority queries (record local pack, AI Overview, who ranks, whether Mable, Hireup or directories appear), call tracking, CRM stages. KPIs and definitions as in `14` and the roadmap; "qualified enquiry" counted at CRM stage ≥ Contacted.

## 11. 90-day pathway

| Weeks | Do |
|---|---|
| 0–2 | Owner answers C-1 to C-8; registration number and groups; verify Search Console/Bing/GBP access; baseline queries; fix live-site compliance issues |
| 2–6 | Referrer hub page + region facts + vacancy process; first 4 reviewed posts; GBP set-up; directory claims; coordinator outreach list (A12) |
| 6–10 | Launch new site (cutover gates in `12`); IndexNow + sitemap submission; Google Ads pilot (A$500/month) and tracking; first coordinator meetings |
| 10–13 | Review search terms, referrals and rankings; double down on pages that earn referrals; refresh or drop weak pages |

## 12. Risks

Over-claiming (NDIS "approved", superlatives); doorway or templated region pages; AI content published without human review; duplicate/thin posts; inconsistent address data; promising response times that cannot be met; policy changes by Google/Meta; relying on one channel. Each has a gate or owner in `13`.
