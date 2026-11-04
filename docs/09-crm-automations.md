# 09 — CRM Model and Automations A1–A17

No automation transmitting real participant data is built or enabled until approved (05 section 10). All workflow definitions are exported to `automation/` with secrets stripped; staging uses synthetic data and test credentials.

## 1. CRM (HubSpot — candidate)

Verified from the official pricing page (3 Nov 2026): Free CRM, up to 2 users, 1,000 contacts, 1,000 records for other standard objects, USD. Starter Customer Platform from US$20/seat/month (promotional prices exist). **Not verified:** data-hosting region (knowledge-base page returned 404) and sensitive-data acceptable-use position (policy page 404). Decision D-06 is therefore conditional: confirm both before any real contact data enters HubSpot; fallback candidates: Pipedrive (roadmap figures unverified) or a lightweight CRM module inside the intake platform.

### Entities

| Entity | Contents | Never contains |
|---|---|---|
| Contact | name, phone/email, role (participant contact, family, coordinator, plan manager, other), consent flags, region, source | NDIS number, support needs, diagnoses, documents |
| Organisation / referral partner | name, type (support coordination, plan manager, LAC partner, hospital social work, GP, other), region, relationship owner | |
| Enquiry (deal) | `case_ref`, service category, region, stage, owner, source/campaign, timestamps | clinical or assessment content |
| Task / activity | follow-ups, calls (duration, outcome), meetings | recordings with participant content (link only, access-controlled in call-tracking tool) |
| Recruitment lead | applicant name, contact, role applied, stage | screening notes beyond HR-need; separate access |
| Campaign reference | UTM keys, campaign id | |

### Pipeline (roadmap baseline, refined with entry/exit rules)

| Stage | Entry | Exit | Owner | Required data | Response expectation | Valid next |
|---|---|---|---|---|---|---|
| New | Enquiry created (form/call/Meta/referral partner) | First human contact attempted | Auto-assigned (A4) | contact method, region, service | Auto-ack ≤ 2 min (if channel works); **human** first response < 15 min in business hours, else ≤ 24 h | Contacted, Lost(spam/duplicate) |
| Contacted | Human reached or attempted ≥ 2 times | Intake call booked/held | Intake staff | outcome note (no sensitive detail) | follow-ups per A5 | Intake call, Lost |
| Intake call | Call scheduled/held | Service agreement offered/signed or declined | Intake manager | eligibility-to-serve check result (yes/no/waitlist) | within 2 business days | Service agreement, Lost |
| Service agreement | Agreement sent | Signed or lapsed | Intake manager | agreement status | 5 business days nudge | Active, Lost |
| Active | Agreement signed | Service ends | Regional staff | start date | — | (closed/won) |
| Lost | Declined/no response/out of area/no capacity | — | Owner | reason code (required) | — | Re-open allowed (logged) |

Duplicate rule: match on normalised phone or email + region within 90 days; merge rather than create; never auto-merge when both have different case_refs without staff confirmation. Reporting definitions: *qualified enquiry* = reached stage ≥ Contacted **and** in served region **and** service offered **and** not spam/duplicate (D-10 to confirm). CRM permissions: marketing sees aggregate and contact-level marketing fields only; intake team sees pipeline; sensitive detail stays in the intake app and is linked by `case_ref` only. Do-not-contact flag overrides every automation. Deletion/archival: contact deletion on request propagates from intake system (retention job) to CRM.

## 2. Common automation standard (applies to every workflow)

- **Platform:** n8n Community Edition self-hosted in the AU account (Sustainable Use Licence permits internal business use; offering it to others is not permitted). n8n Cloud is EU-hosted (Frankfurt per official pricing page) → excluded for personal data.
- **Authentication:** per-workflow service credentials in the n8n credential vault; scoped API keys; webhook endpoints require HMAC signature + timestamp (reject > 5 min skew); IP allow-lists where vendors publish them.
- **Validation:** schema-validate every inbound payload; reject unknown fields; normalise phone to E.164, email lower-case.
- **Idempotency:** each run keyed by `source_event_id`; duplicate events are no-ops (store keys 7 days+).
- **Retries:** transient failures retry with exponential backoff (e.g. 1 m, 5 m, 30 m, max 3); permanent failures → dead-letter table + alert.
- **Logging:** execution data saving set to *errors only without payloads*; custom log lines carry `case_ref`, step, outcome, never PII; execution retention ≤ 14 days.
- **Notifications:** failures → on-call channel + email to automation owner; staff-facing tasks created in CRM.
- **Runbook per workflow:** purpose, owner, trigger, dependency list, how to pause, how to replay, known failure modes, contact.
- **Tests per workflow:** happy path, invalid payload, duplicate event, downstream outage (retry), permission denied, do-not-contact contact, out-of-hours behaviour.
- **Privacy class:** P0 no personal data; P1 contact data (C2); P2 touches C3 (prohibited in n8n; handled inside intake service instead).

## 3. Workflow specifications

| ID | Trigger → Actions (summary) | Key rules / validation | Privacy | Failure / idempotency | Depends on | Phase | Success measure |
|---|---|---|---|---|---|---|---|
| **A1** Referral acknowledgement | Intake API event `enquiry.created` → create/update CRM contact+deal (case_ref, region, service, source) → send acknowledgement (email and/or SMS if consented) → notify intake lead | Ack text states it is automated and when a human will respond; no sensitive content; respect channel consent; business-hours text variant | P1 | Dedupe on `case_ref`; retry; if CRM down, ack still sends and CRM sync queued | Intake API (P4), CRM, email/SMS provider | 4 (basic form-to-email earlier only with safe routing) | % acknowledged ≤ 2 min; first *human* response time tracked separately |
| **A2** Missed-call follow-up | Call-tracking "missed/voicemail" webhook → check contact permission/do-not-contact → send SMS (if lawful) → CRM task | Only for numbers that called us (adviser to confirm consent basis); content identifies AblePoint and offers opt-out; quiet hours; rate limit one SMS per number/24 h | P1 | Idempotent on call_id | Call tracking vendor, SMS provider, ACMA sender-ID requirements (**not verified**) | 4 | % missed calls with human callback < 1 business hour |
| **A3** Call logging | Answered call ≥ 60 s → CRM activity with source/campaign/duration/recording link → create enquiry if new number | Recording only with consent notice; retention set; recordings stay in vendor, link access-controlled | P1 (recordings may hold C3 → treat as C3 in vendor) | call_id idempotent | Call tracking + CRM | 3/4 | % calls attributed to source |
| **A4** Lead routing | New enquiry → match service+region to owner table → assign → if unassigned 30 min escalate to manager | Routing table versioned in repo | P1 | idempotent on case_ref | CRM, staff roster | 4 | % assigned < 5 min |
| **A5** Follow-up cadence | Stage unchanged 24 h → owner reminder; day 3/7 courtesy message to enquirer **only if** consented & not DNC; Lost requires reason | Opt-out in every outbound; stop on reply or stage change | P1 | scheduled with state in CRM | A1, A4 | 4 | enquiry→agreement conversion; reminder compliance |
| **A6** Vacancy board sync | Source of truth (staff form/CRM object) → validate → write Sanity **draft** or status change → human publish (initially) → rebuild → "last verified" stamp | Closed vacancies must flip to non-available on next sync; staleness rule (06) | P0 | upsert by vacancy id; failures alert; site never shows available when sync failed > 24 h | CMS, deploy hook | 4 | median age of displayed availability < 7 days |
| **A7** GBP publishing | Approved content queue → eligible profiles via API → post | **API access unverified**; fallback manual weekly post checklist | P0 | per-post id | Verified GBP access | 4 (conditional) | posts/week; GBP interactions |
| **A8** Review requests | Stage "Active ≥ 30 days" → human-approved list → SMS/email to participant/nominated contact with neutral wording and opt-out | **No incentives or gifts**; adviser sign-off on whether/when to ask vulnerable participants; compliance approval to activate | P1 | idempotent per contact | CRM, compliance | 4 (gated) | review velocity, complaints = 0 |
| **A9** Weekly performance report | Fri 07:00 → pull aggregates (GA4, Ads, call tracking, CRM counts) → dashboard + email summary | Aggregates only; small-number suppression (e.g. suppress < 5 in breakdowns) | P0 | retries; stale-data banner | all sources | 4 | report delivered by 08:00 each Friday |
| **A10** Rank & GBP monitoring | Daily/weekly tracker → alert on drop > 3 positions (threshold review) | Tool choice and spend unapproved | P0 | idempotent per run | tool selection | 4 | alerts acted on |
| **A11** AI-assisted content | Brief → AI draft (draft state only) → human fact-check → compliance review → editorial approval → publish | **Never auto-publish** NDIS eligibility/funding content; AI output labelled in CMS; no participant data in prompts | P0 | draft-only token | CMS gate | 4 | % drafts passing review first time; zero unreviewed publishes |
| **A12** Referral-partner engine | Partner list → approved outreach sequence → monthly capacity summary built from verified vacancy data → replies create CRM tasks | Spam Act-style consent/identify/unsubscribe handling (adviser to confirm for B2B); no inducements to refer | P1 | idempotent per partner/month | CRM Starter (sequences) – spend unapproved | 4 | partners logged, meetings booked |
| **A13** Uptime & performance | 5-min uptime ping; weekly PageSpeed/CrUX check on 6 templates; alert on 5xx, LCP > 2.5 s | PSI API key needed (public quota exhausted today) | P0 | idempotent | monitoring tool | 3/4 | MTTD < 10 min |
| **A14** AI visibility | Monthly 12-prompt run → log (see 08) | Human-reviewed log; no scoring claims; API terms respected | P0 | idempotent per month/engine | API access (spend unapproved) | 4 | log completeness |
| **A15** Meta lead form | Approved Meta lead webhook → CRM (tag vacancy/recruitment) → A1 | **Only after Meta health-data policy review and budget approval**; no sensitive questions in the form; no audiences/retargeting from CRM data | P1 | lead_id idempotent | Meta approval | 3/4 (gated) | lead→qualified rate |
| **A16** Recruitment pipeline | Application → screening answers → human review → interview scheduling → onboarding checklist task | No automated rejection; applicant data access-controlled; retention policy | P1 | idempotent | ATS/CRM, calendar | 3/4 | time-to-interview |
| **A17** Spam & data hygiene | Submit → Turnstile server verify → validation → dedupe → store in intake DB → minimal CRM reference | Format-only NDIS number check (no external lookup); never log values; spam → quarantine table not CRM | P1/P2 (runs inside intake API, **not** n8n) | token single-use; fail closed | Turnstile (free), intake API | 1 (design) → 4 | spam rate in CRM, false-positive rate |

## 4. Dependencies and build order

A17 (inside intake API) → A1 → A4 → A3 → A5 → A9/A13 (aggregates, safe early) → A6 → A2 (after sender-ID/consent decisions) → A12 → A8/A15/A16 (gated by approvals) → A7/A10/A14 (tool/API-dependent) → A11 (content tooling, last, because it adds risk).
