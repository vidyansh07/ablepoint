# 14 — Requirements Traceability Matrix

Status key: Open (live issue) · Planned (addressed in a future phase) · Blocked · Not started. No requirement is marked complete; nothing is implemented.

## 1. Weaknesses W-01 – W-23 (details in 02)

| ID | Sev. | Verified 3 Nov? | Deliverable(s) | Phase | Validation | Status |
|---|---|---|---|---|---|---|
| W-01 | Critical | Open | 02 §6, 06 `siteSettings`, 12 P0-08 | 0 (escalate) / 1 | No placeholder strings in crawl | Open (escalated) |
| W-02 | Critical | Open | 02 §6, 06 lint, 08 | 0 / 1 | Banned-phrase CI check | Open (escalated) |
| W-03 | High | Open | 05, 06 `legalPage`, 02 §6 | 0 / 4a | e2e notice/consent test | Open (escalated) |
| W-04 | High | Not re-verified | 06 lint, 08 | 2 | Lint + human review | Planned |
| W-05 | Med | Open | 06 navigation/footer, 11 link check | 1 | Link checker | Planned |
| W-06 | Med | Open | 07 slugs, 06 lint | 1/2b | Spell + slug lint | Planned |
| W-07 | Low | Not reproduced (home) | 06 `siteSettings` | 1 | Grep canonical phone | Planned |
| W-08 | High | Changed (partial) | 08 §2 | 2 | Schema + Rich Results tests | Planned |
| W-09 | High | Open | 07 §4, 06 date fields | 2b | Date audit | Planned |
| W-10 | Med | Open | 03 templates, 08 §1 | 1 | Heading test | Planned |
| W-11 | Med | Changed / partly unverified | 07 | 1/2b | Link checker | Planned |
| W-12 | Low | Open | 08 §1 | 1/2 | Metadata tests | Planned |
| W-13 | Med | Blocked | 04 §6, 11 | 0 (measure) / 1 | Lighthouse JSON | Blocked |
| W-14 | High | Open | 08 §5, 07 | 2 | Content sign-off | Planned |
| W-15 | High | Changed | 08 §5, 07 §2 | 2 | Region fact checklist; similarity check | Planned |
| W-16 | High | Partly verified | 06 vacancy, 08 §3 | 2 | Content review | Planned |
| W-17 | Med | Open | 08 §3 | 2 | Publish calendar | Planned |
| W-18 | Low | n/a | 03 (retain strengths) | 2 | — | Noted |
| W-19 | High | Partly verified | 03 CTA bar | 1 | e2e/manual mobile | Planned |
| W-20 | High | Not verified | 05, 09 A1/A17 | 4a | e2e + staging acknowledgement | Planned |
| W-21 | High | Open | 06 vacancy, 09 A6 | 2/4b | lifecycle tests | Planned |
| W-22 | High | Not visible / Blocked | 10 §1, 08, 09 A3/A9 | 0/3 | Tag assistant, GA4 DebugView | Blocked (access) |
| W-23 | Med | Blocked | 08 §5 | 0 | GBP audit sheet | Blocked (access) |

## 2. Guardrails G-01 – G-08

| ID | Guardrail | Where addressed | Validation |
|---|---|---|---|
| G-01 | No "NDIS-approved/endorsed/fully covered" | 06 lint, 08, 10 ad-copy review | CI banned-phrase check; ad copy sign-off |
| G-02 | No inducements/referral payments/incentivised reviews | 09 A8/A12, 10 | Workflow design review; compliance approval to activate |
| G-03 | No participant pricing above others | 06 (no pricing content without review), 08 | Content review |
| G-04 | Testimonials only with written consent, no outcome/eligibility claims | 06 `testimonial` consent + `outcomeClaim=false` | Content gate |
| G-05 | Privacy: notice on every form, AU-region data, retention rule, pixel off participant pages | 05, 09, 10 (Meta), 04 | e2e, tag audit, data-flow register |
| G-06 | Check Meta data-source category before spend | 10 Meta | Policy review recorded before any test |
| G-07 | Accessibility as trust signal (roadmap says WCAG 2.1 AA; this project targets **2.2 AA** per newer decision), Easy Read, captions | 03 §5, 11 | axe + manual |
| G-08 | AI drafts, humans publish | 06 gate, 09 A11 | No auto-publish test |

## 3. Automations A1 – A17 (details in 09)

All 17 specified in 09 §3 with phase and dependencies; build order in 09 §4; **status: Not started**. Validation: per-workflow test set (common standard in 09 §2) and staging runs with synthetic data.

## 4. Confirmed decisions and new requirements

| ID | Requirement (from brief) | Deliverable | Validation | Status |
|---|---|---|---|---|
| N-01 | Astro + TypeScript strict, static-first | 04 AR-1 | build/lint/type checks | Planned |
| N-02 | Entirely new premium accessible design; keep logo | 03 | design review, a11y | Planned (logo Blocked) |
| N-03 | Evaluate licensed Zaver source | 03, 01 | package received | Blocked |
| N-04 | Vercel hosting; staging-first; WP untouched | 04 §5, 12 gates | No production deploy before G4 | Planned |
| N-05 | Sanity (preferred) with staff + developer editing | 06 | CMS acceptance test | Planned |
| N-06 | New CRM configured | 09 | pipeline test | Planned (conditional) |
| N-07 | Complete referral/intake + documents | 05 | security tests, sign-off | Planned (high-risk) |
| N-08 | n8n evaluated | 04 AR-5, 09 | licence + region verified | Planned |
| N-09 | A$500/month ads only; no software budget approved | 10 | spend approvals | Open |
| N-10 | Full 90-day roadmap scope, revised timeline | 12 | milestone reports | Planned |
| N-11 | Sitemap + old→new URL map + redirects | 07 | redirect test | Planned |
| N-12 | SEO/AEO/GEO/local SEO specification | 08 | tests in 11 | Planned |
| N-13 | Analytics events (`phone_click`, `contact_submit`, `referral_submit`, `vacancy_view`, `vacancy_enquiry`, `gbp_click`), consent-aware, no PII | 08, 10, 05 | tag tests on staging | Planned |
| N-14 | Performance targets (Lighthouse ≥ 90, LCP/INP/CLS) | 04 §6, 11 | Lighthouse CI + field data | Planned |
| N-15 | Test plan with honest reporting | 11 | results table | In progress (Phase 0 results recorded) |
| N-16 | Cost models and separation of ad vs software budget | 10 | owner approval | Planned |
| N-17 | Production migration strategy and gates | 12 §3, 07 §5 | gate checklist | Planned |
| N-18 | Planning-only until approval | all | no app code written; confirmed by file inventory | Met for Phase 0 |
