# @ablepoint/automation

Business rules behind automations A1–A17 ([docs/09](../../docs/09-crm-automations.md)) as **pure, deterministic, unit-tested TypeScript functions**. This is the logic that n8n code nodes or a small service would call. It is **not** n8n workflows and it talks to nothing.

## Status (honest)

| Built and unit-tested | NOT built |
|---|---|
| Decision rules, validators, schemas, lints, state machines below | n8n workflows (JSON), webhook endpoints, schedulers |
| Synthetic data only; every time-dependent function takes `now` explicitly | Vendor integrations (HubSpot, Twilio/Sinch, WildJar, Meta, Google Business Profile, Looker Studio, PageSpeed, LLM APIs) |
| HMAC webhook verification, replay guard (in-memory), backoff schedule | A shared replay/idempotency store, dead-letter queue, alerting |
| | CRM connection, consent/DNC data source, public-holiday calendar, staff roster |

Passing unit tests here is **not** evidence that any automation works end to end.

## A1–A17 → modules

| ID | Automation | Module | What the rules cover |
|---|---|---|---|
| A1 | Referral acknowledgement | `acknowledgement.ts` | Channel choice, consent/DNC, quiet hours, automated-vs-human labelling, 120 s ack SLA, first-human-response SLA (<15 business min, else 24 h) |
| A2 | Missed-call follow-up | `missedcall.ts` | DNC first, consent basis, mobile-only, 1 SMS/number/24 h, quiet-hours deferral, staff task always created, compliant SMS body |
| A3 | Call logging | `calllog.ts` | Answered inbound ≥ 60 s, new-vs-known number, attribution source, recording-consent handling, masked numbers |
| A4 | Lead routing | `routing.ts` | Versioned routing table, most-specific rule wins, fallback owner, 30 business-minute escalation |
| A5 | Follow-up cadence | `followup.ts` | Pipeline stage transitions, Lost-reason requirement, 24 h owner reminder, day-3/day-7 courtesy messages with consent/DNC/opt-out/reply/quiet-hours gates |
| A6 | Vacancy board sync | `vacancy.ts` | Record validation (no street addresses/identifiers), create-draft only, human publish for availability, fail-safe suspend, 14-day staleness, 24 h sync-health guard. Uses `canTransition` / `vacancyDisplay` from `@ablepoint/schemas` |
| A7 | GBP publishing | `gbp.ts` | Approved content only, eligible profile, pacing, API access treated as unverified → manual fallback |
| A8 | Review requests | `reviews.ts`, `inducements.ts` | Active ≥ 30 days, separate consent, nominated contact, no open complaint, activation switch, inducement/rating-steering lint |
| A9 | Weekly report | `reporting.ts` | PII guard (throws), small-number suppression (< 5) with complementary suppression, low-confidence flag, no sensitive fields |
| A10 | Rank/GBP alerts | `monitoring.ts` | Drop > 3 places, lost ranking |
| A11 | AI-assisted content | `content.ts` | Human fact-check, compliance approval current, AI labelling, banned phrases, eligibility/funding never auto-publish, prompt safety |
| A12 | Referral-partner engine | `partners.ts` | Capacity summary from verified, non-stale, available vacancies only; outreach gates; reply classification |
| A13 | Uptime/CWV watch | `monitoring.ts` | LCP/INP/CLS thresholds, any 5xx, consecutive-failure uptime alert, notification cooldown |
| A14 | AI visibility | `aivisibility.ts` | Record schema (zod), latest-run-per-prompt counts, limitations note, **no score** |
| A15 | Meta lead form | `metaleads.ts` | Allow-listed contact fields, sensitive-question rejection (names only), vacancy/recruitment tagging |
| A16 | Recruitment pipeline | `recruitment.ts` | Stage machine, no automated rejection, queue prioritisation only, applicant-access roles |
| A17 | Spam/data hygiene | `hygiene.ts` | Dedupe keys, 90-day match window, never auto-merge differing case refs, NDIS-number **format-only** check, Turnstile fail-closed + quarantine |
| all | Webhooks, retries | `webhook.ts`, `retry.ts` | HMAC-SHA256 constant-time verify, ±300 s window, replay key/store; 1 m/5 m/30 m backoff, dead-letter, idempotency keys |

Shared: `common.ts` (consent gate, quiet/business hours, masking), `messaging.ts` (outbound lint), `identifiers.ts` (NDIS-number-like detector).

## Assumptions to confirm (flagged in code)

- **Quiet hours** 21:00–08:00 Australia/Sydney: not specified in docs/09; adviser to confirm.
- **Business hours** Mon–Fri 09:00–17:00 Sydney: AblePoint's hours are unverified (docs/13). No public-holiday data unless supplied via `holidays`.
- **Unknown callers (A2)**: no SMS unless `allowInboundCallInferredConsent` is enabled; the consent basis awaits adviser sign-off.
- **Acknowledgements (A1)** respect quiet hours for SMS, falling back to email if available. Whether acknowledgements are exempt is for the adviser.
- **NDIS number format**: nine digits, format only. The authoritative rules were not checked against NDIA documentation; the optional `43` prefix check is off by default.
- Street-address and identifier detection are heuristics and can false-positive; a human edits the source record.

## Commands

```sh
pnpm --filter @ablepoint/automation test    # vitest
pnpm --filter @ablepoint/automation check   # tsc --noEmit
```
