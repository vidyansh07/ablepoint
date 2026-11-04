# 13 — Decisions, Open Requirements and Risk Register

## 1. Blocking decisions and inputs (needed to start Phase 1)

| ID | Item | Why it blocks | Needed from | Proposed default |
|---|---|---|---|---|
| B-01 | Supply the **purchased Zaver package** and licence document/receipt | Theme assessment is provisional; licence unknown | Owner/engineer | Proceed with Option C regardless; do not use demo-mirror assets |
| B-02 | Approve architecture (04, 05) and the AWS-vs-Supabase decision path | Determines intake build | Owner + compliance | AWS Sydney standard; Supabase only if DPA/support-access verified |
| B-03 | Approve minimal Phase 1 spend: Vercel Pro (commercial staging), Sanity Growth ≤ 3 seats | Hobby is non-commercial; Sanity Free roles inadequate | Owner | Approve both; defer everything else |
| B-04 | Name the compliance owner and NDIS-experienced content reviewer | Content gate and sign-offs need named people | Owner | — |
| B-05 | Access list: WordPress admin (read-only/export), hosting/DNS, registrar, GA4, GTM, Search Console, GBP, Google Ads, Meta Business, any enquiry log | Baselines, parity, W-22/W-23 | Owner | Read-only roles where possible |
| B-06 | Vector logo + brand assets and any brand guidelines | Design system | Owner | — |
| B-07 | Authorise escalation memo (W-01/02/03) to be sent now | Live compliance exposure | Engineer to owner | Send immediately; production fix is the owner's call |

## 2. Decision log (proposed defaults)

| ID | Decision | Options | Proposed default | Approver |
|---|---|---|---|---|
| D-01 | Theme approach | A / B / C | **C** (informed by Zaver layout); revisit B after package review | Owner |
| D-02 | Public host | Vercel (mandated) | Vercel Pro | Owner |
| D-03 | CMS | Sanity Growth / Keystatic | Sanity Growth | Owner |
| D-04 | Compliance gate mechanism | Enterprise workflows / build gate | Build gate (AR-7) | Compliance owner |
| D-05 | Intake platform | AWS Sydney / Supabase Sydney | AWS Sydney | Owner + adviser |
| D-06 | CRM | HubSpot Free/Starter / other | HubSpot **conditional** on region + AUP verification; minimal data | Owner |
| D-07 | Automation engine | n8n self-hosted AU / Make / other | n8n self-hosted in AU | Engineer |
| D-08 | First ad region | by capacity | Central Coast (to confirm with operations) | Operations + owner |
| D-09 | Call tracking | WildJar / none / alternative | WildJar if owner approves A$100–150/month | Owner |
| D-10 | "Qualified enquiry" definition | see 09 | stage ≥ Contacted + served region + service offered + not spam/duplicate | Owner + intake manager |
| D-11 | Step-1 data path | direct to AU API / via Vercel function | direct to AU API (AR-2) | Engineer + compliance |
| D-12 | Slugs for about/team/contact | preserve / move | preserve existing | Owner |
| D-13 | Region×service page consolidation | keep / consolidate | consolidate unless Search Console evidence says otherwise | Owner |
| D-14 | AI crawler policy | allow / block | allow public pages; revisit after legal view | Owner |
| D-15 | Sanity dataset/retention facts | verify | verify before go-live | Engineer |
| D-16 | Retention periods | per adviser | adviser-defined | Compliance + adviser |
| D-17 | Analytics on pages that contain the enquiry form or link (landing pages, `/referral/`) | on with strict GTM config / off | **Off** by default (implemented). Turning it on needs privacy-adviser sign-off: GTM container must have form-interaction auto-events, session replay and ad-platform tags disabled. Without it, ad-click attribution is lost at the landing page; conversions are only visible on the consented thank-you page. | Compliance + owner |

## 3. Unverified facts carried as assumptions

HubSpot data region + sensitive-data policy · Supabase DPA/subprocessors/support access · Vercel Sydney function region · Sanity dataset region and history retention · Resend Australian region · Twilio/ACMA sender-ID requirements · GBP posts API availability · Turnstile data residency · NDIS registration number and registered groups · which regions have premises · actual GA4/GTM/call-tracking state on the current site · whether Tamworth and Gunnedah have staff and capacity · CALD statistics and other roadmap claims.

## 4. Risk register (prioritised)

Likelihood/Impact: H/M/L. Score = rough priority only.

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Live site collects NDIS numbers without privacy notice (W-03), placeholder contact details visible (W-01), "approved" wording (W-02) | Occurring | H | Escalate now (B-07); prioritise in new site; do not touch production without owner | Owner |
| R-02 | Sensitive data leaks into logs, analytics, CRM, email or n8n | M | H | Data classification, scrubbing, canary tests, minimal CRM, no n8n for C3 | Engineer |
| R-03 | Unauthorised staff access (marketing → intake data) | M | H | RBAC server-side, MFA, break-glass alerts, authZ test matrix | Engineer |
| R-04 | Cross-border/subprocessor surprises (HubSpot, email/SMS, Turnstile, Vercel region) | M | H | Data-flow register, DPA review, AU-region choices; hold CRM go-live until verified | Compliance |
| R-05 | Using unlicensed assets/code from demo mirror | L | M | No copying; licence review (B-01) | Engineer |
| R-06 | Scope/time: ≈ 790 h estimate vs 25 h/week capacity; secure intake not ready at public launch | H | M | Phased gates; launch public site without full intake; clear interim contact options | Owner |
| R-07 | SEO loss at cutover (redirect gaps, lost URLs, title/H1 changes) | M | H | Full crawl, Search Console data, redirect tests, staged rollout, 14-day monitoring | Engineer |
| R-08 | Misleading NDIS claims or eligibility guidance published | M | H | Content gate, banned-phrase lint, named reviewers, no AI auto-publish | Compliance |
| R-09 | Vacancy information stale or wrong | M | M | Staleness rule, owner assignment, "unconfirmed" display, sync alerts | Intake manager |
| R-10 | A$500 ad pilot too small for statistically meaningful result; pressure to over-interpret | H | M | 60–90 day window, report confidence level, no promise | Engineer |
| R-11 | Vendor price/feature changes (Sanity roles, Vercel seats, HubSpot tiers) | M | M | Re-verify at purchase; exportable content; avoid lock-in | Engineer |
| R-12 | Single point of failure (one engineer; key-person risk) | M | M | Documentation, runbooks, IaC, handover kit | Owner |
| R-13 | Accessibility regressions / non-compliance | M | H | WCAG 2.2 AA tests in CI + manual; user testing with people with disability (recommended) | Engineer |
| R-14 | Staging exposed publicly or indexed | L | M | Auth wall + noindex header + checks | Engineer |
| R-15 | Spam/abuse of forms; SMS cost abuse | M | M | Turnstile server-side, rate limits, SMS caps | Engineer |
| R-16 | Meta policy restrictions on health-related audiences | M | M | Policy review, on-platform lead forms only after approval, no sensitive audiences | Marketing |
| R-17 | Source-of-truth drift between roadmap and live site (roadmap findings already changed) | M | L | Treat roadmap as baseline; re-crawl before each phase | Engineer |
| R-18 | Third-party access ("agent" research reports) containing errors | L | M | Primary figures flagged with source URLs and NOT VERIFIED markers; re-verify before purchase | Engineer |
