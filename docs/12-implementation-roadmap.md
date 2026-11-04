# 12 — Implementation Roadmap (revised)

The roadmap's 292 hours assumed WordPress repairs plus a small Astro rebuild. The confirmed scope adds a premium redesign, a CMS with an approval gate, a secure participant-intake platform and 17 automations. Estimates below are **planning ranges with low-to-medium confidence**, to be re-baselined after Phase 0 inputs arrive. Original phase IDs retained.

## 1. Revised hour estimates

| Phase | Original (h) | Revised planning estimate (h) | Range (h) | Main drivers |
|---|---:|---:|---|---|
| 0 Audit, access, architecture | 18 | 45 | 35–60 | access list, baselines, licence review, cost verification, data-flow register |
| 1 Design system + staging foundation | 40 (WP repair) | 150 | 110–200 | tokens/components, 8 templates, CMS schemas + gate, CI, a11y baseline, staging protection |
| 2 Content, SEO, AEO, GEO | 60 | 110 | 80–150 | 6 region pages from verified facts, SIL/SDA, 4 guides, schema, keyword map |
| 2b Migration and validation | 45 | 80 | 60–110 | content/media import, redirect map, parity, a11y/perf validation, staff handover |
| 3 Marketing and advertising | 45 | 50 | 35–70 | tracking design, landing pages, Ads setup/ops (A$500 pilot), Meta policy review |
| 4a Intake platform | (within 60) | 140 | 100–200 | API, DB, auth/MFA, staff UI, uploads/scan, audit, retention, restore tests |
| 4b Automations A1–A17 | (within 60) | 120 | 90–170 | build order in 09, runbooks, tests |
| X Security, compliance, QA (cross-cutting) | — | 60 | 40–90 | internal tests, remediation after pen test, documentation for sign-off |
| Ongoing reporting/owner meetings | 24 | 36 | 24–48 | ~2–3 h/week for ~14 weeks |
| **Total** | **292** | **≈ 790** | **≈ 600–1,000** | |

Not included: external penetration test, legal/privacy adviser time, photography, vendor onboarding delays, owner review latency (these are calendar risks; quotes needed).

## 2. Calendar (indicative; single engineer ≈ 25 h/week, with owner/compliance/content support)

| Week | Milestone | Gate |
|---|---|---|
| 0–2 | Phase 0 complete: approved architecture, access granted, baselines, escalation items sent to owner, licensed theme received | **G0** approve architecture + Phase 1 spend |
| 3–8 | Phase 1: design system, templates, CMS + review gate, staging protected, CI | **G1** staging review (design, a11y baseline, performance baseline) |
| 6–14 | Phase 2 content (parallel); region facts from operations; compliance review cycles | **G2** content approved |
| 12–16 | Phase 2b: migration rehearsal on staging, redirect tests, analytics parity, staff handover | **G3** pre-launch checklist (below) |
| ~16 | **Public site cutover** (marketing site + Step-1 enquiry with safe routing, or call/email-only if intake not ready) | **G4** explicit owner approval |
| 10–22 | Phase 4a intake platform build and test; security testing | **G5** compliance sign-off + pen test pass → real data permitted |
| 14–24 | Phase 3 pilot (Google Ads, region with capacity) once landing page/tracking live; Phase 4b automations in dependency order | per-automation approval |
| ongoing | weekly report, monthly GEO check, content reviews | — |

The full secure intake is realistically **not** live by week 6 (and probably not by week 16); the public cutover must not wait for it, but must not publish a data-collecting form without safe routing/storage (rule 12/user instruction). Interim options if Step-1 service is not ready at cutover: phone number + published email address only, or Step-1 enquiry to the restricted API with minimal fields once that API (not the whole staff UI) passes security review.

## 3. Release gates (all required before production)

Approved design · approved and compliance-reviewed content · staff CMS acceptance test · verified legal/contact facts (registration number, address policy) · form/intake tests on staging (synthetic data) · auth and permission tests · privacy/compliance review · redirect map complete and tested · SEO parity · analytics parity · Lighthouse/CWV targets met on staging · accessibility testing (automated + manual) · backup/restore validated · DNS/cutover and rollback plan · owner approval. No routine deployment touches the production domain.

## 4. Backlog skeleton (task IDs)

| ID | Task | Phase | Depends | Security/privacy impact |
|---|---|---|---|---|
| P0-01 | Access list issued and returned | 0 | owner | none |
| P0-02 | Receive licensed Zaver package + licence; re-run theme assessment | 0 | owner | none |
| P0-03 | Baseline: GA4/Search Console exports, enquiry log | 0 | P0-01 | handle exports as confidential |
| P0-04 | Run Lighthouse locally on live key pages; store JSON | 0 | none | none |
| P0-05 | Verify NDIS registration record + registered groups | 0 | network | none |
| P0-06 | Data-flow register + vendor DPA review list | 0 | D-05, D-06 | high |
| P0-07 | AWS cost estimate for intake (calculator) | 0 | D-05 | none |
| P0-08 | Escalation memo to owner (W-01/02/03 + privacy policy) | 0 | 02 | high urgency |
| P1-01 | Monorepo scaffold (pnpm, TS strict, lint, CI) | 1 | G0 | none |
| P1-02 | Design tokens + 12 core components + a11y tests | 1 | P1-01, P0-02 | none |
| P1-03 | Templates: home, service, region, vacancy, guide, referral, landing, legal | 1 | P1-02 | none |
| P1-04 | Sanity schemas, Studio roles, review gate (AR-7) | 1 | P1-01 | medium |
| P1-05 | Staging deploy with auth wall + noindex | 1 | P1-01 | medium |
| P1-06 | Step-1 form UI + Zod contract (mock endpoint only) | 1 | P1-03 | high (no real submit) |
| P2-xx | Content, schema, keyword map, GEO baseline | 2 | P1-04 | low |
| P2b-xx | Import, media, redirects, parity, handover | 2b | P2 | low |
| P3-xx | Tracking design, landing pages, Ads account (no launch) | 3 | P2b | medium |
| P4a-xx | Intake infra (IaC), API, auth/MFA, uploads/scan, staff UI, audit, retention | 4a | D-05, compliance | high |
| P4b-xx | A17, A1, A4, A3, A5, A9/A13, A6, A2, A12 … (09 order) | 4b | P4a | high |
| X-xx | External pen test, restore test, sign-off pack | X | P4a | high |

## 5. Responsible roles

Owner/executive (approvals, spend) · Compliance owner (content/legal sign-off) · Intake manager (pipeline rules, staff roles) · Operations/regional leads (capacity and regional facts) · Content editor(s) · Engineer (lead) · External: privacy/legal adviser, security tester, photographer, designer (optional).
