# @ablepoint/intake-core

Provider-agnostic core for the restricted participant-intake service (docs/05-intake-data-security.md, Phase 4a).

> **Status: NOT usable for real participant data.** This package is tested logic plus *test doubles*. There is no database, no key-management service, no Turnstile integration, no object storage, no malware scanner, no identity provider and no staff UI. The SQL file parses and passes 26 row-level-security behaviour tests on an in-memory embedded Postgres (PGlite, synthetic rows), but has never been run on a real or managed database. Sign-off requirements in docs/05 §10 have not been met. Use synthetic data only.

TypeScript strict, ESM. Runtime dependencies: `@ablepoint/schemas` (workspace) and `node:crypto`. Everything else is injected through the ports in `src/ports.ts`.

```sh
pnpm --filter @ablepoint/intake-core test    # 287 tests
pnpm --filter @ablepoint/intake-core check   # tsc --noEmit
```

## What is implemented (and tested)

| Module | What it does | Tests |
|---|---|---|
| `src/ids.ts` | `generateCaseRef()` → `AP-7K3M-9Q2` (Crockford base32, no I/L/O/U, 7 symbols = 35 bits, unbiased `byte & 31`), `parseCaseRef()` for phone-dictated input | `ids.test.ts` |
| `src/crypto.ts` | AES-256-GCM field encryption. Envelope `v1.<keyId>.<iv>.<ct>.<tag>`. AAD binds version + key id + field + record id (a ciphertext cannot be moved to another field/case). Injected `KeyProvider`. Rotation (`needsRotation`, `rotateField`). Errors never contain plaintext. | `crypto.test.ts` |
| `src/profile.ts` | Seal/open/rotate the C3 participant-profile fields (NDIS number, DOB, support needs) | `profile.test.ts` |
| `src/policy.ts` | Pure deny-by-default RBAC `can(actor, action, resource, {now})` for the seven roles in docs/05 §4: assignment and region scope, field-level need-to-know for regional staff, time-boxed read-only break-glass for system administrators, audit drafts for denials, compliance reads and break-glass | `policy.test.ts` (hand-written role × resource × action × scenario matrix, 49 cases, plus escalation tests) |
| `src/handler.ts` | `handleEnquirySubmission(req, deps)`, the Step-1 endpoint: exact-origin allow-list + CORS preflight, per-IP rate limit, content-type and 16 KB limit (bytes), strict JSON envelope, honeypot, `enquirySchema` validation, idempotent replay, per-phone and per-email throttle, server-side Turnstile with single-use tokens (fail closed), record + audit event persisted together, generic error bodies | `handler.test.ts` |
| `src/logging.ts` | Logger with a field allow-list and safe-value pattern, so bodies, names, contacts, tokens, keys and error messages cannot be logged | `support.test.ts`, canary tests in `handler.test.ts` |
| `src/uploads.ts` | Upload request and content validation (≤ 10 MB; pdf/png/jpeg/docx allow-list; magic bytes; extension and MIME must agree), filename traversal rejection, generated object keys, TTL constants (upload ≤ 300 s, download ≤ 60 s, clamped), quarantine → scan → release state machine, `issueDownloadUrl` refuses anything not `released` | `uploads.test.ts` |
| `src/retention.ts` | Retention *decision* function with placeholder periods, all `adviserConfirmationRequired: true`. Nothing is ever reported as deletable until a rule id is explicitly confirmed; legal hold always wins. It deletes nothing. | `retention.test.ts` |
| `sql/001_init.sql` | Draft Postgres schema for the docs/05 §3 entities with forced row-level security, append-only audit log, document-transition trigger, break-glass predicate, definer functions for regional need-to-know and marketing aggregates | `sql.test.ts` (**static text checks only**) |

Test evidence (3 Nov 2026): **287 passed, 0 failed** — `crypto` 20, `handler` 71, `ids` 11, `policy` 79, `profile` 6, `retention` 14, `sql` 12, `support` 23, `uploads` 51. `tsc --noEmit` clean.

As a check that the tests bite, 11 deliberate regressions were applied one at a time (origin check disabled, region scope removed, marketing granted enquiry read, break-glass cap removed, idempotency lookup removed, PII added to a log line, Turnstile replay cache bypassed, AAD removed, quarantined made downloadable, retention gate removed, magic bytes weakened). Every one made at least one test fail. Source was restored afterwards and the full suite re-run green. Writing the tests also found one real bug (retrying a `scanFailed` document used the wrong state-machine event), now fixed.

## Test doubles (never deploy these)

| Name | Why it is not production |
|---|---|
| `InMemoryRepository` | Process memory only: no durability, encryption at rest, RLS or concurrency control |
| `StaticKeyProvider` | Holds raw keys in memory; a real provider must wrap a KMS/HSM |
| `FixedWindowRateLimiter`, `InMemoryReplayCache`, `InMemoryIdempotencyStore` | Correct for one process only. Behind a load balancer or serverless fan-out each instance has its own counters, so limits, replay protection and idempotency become per-instance. Production needs a shared store. Fixed windows also allow up to 2× the limit across a window boundary. |
| `InMemoryAuditSink` | Append-only by API shape, not durable or tamper-evident |

## NOT built

Real Postgres adapter, and the migration has not been run · KMS key provider and key lifecycle · Turnstile HTTP verifier · object-storage adapter (signed URLs, quarantine bucket) · malware scanner adapter · identity provider, MFA, sessions, CSRF protection for a staff UI · staff intake UI · HTTP adapter that supplies a *trusted* client IP · CRM/n8n integration · backups and restore tests · infrastructure-as-code · penetration test · privacy/legal sign-off · deletion and export workflows (retention only *decides*).

## Interpretations and deviations from docs/05 (please review)

1. **Intake staff on documents:** docs/05 §4 says "assigned cases" without an access mode. Implemented as read + write (upload) on assigned cases only.
2. **Aggregates** (`aggregate` resource) are readable by marketing, intake administrators, intake managers and compliance officers. docs/05 only specifies marketing; the others are an interpretation. Small-number suppression (< 5) is in the SQL function, not in TypeScript.
3. **Intake administrator cannot `assign`** (docs/05 lists "assign" under the manager only). **Intake manager cannot request export**; administrators request, managers approve deletion.
4. **Regional staff need-to-know fields** are a proposal: `displayName, region, servicesRequested, communicationPreferences, contactMethod` (no NDIS number, DOB or support needs).
5. **Break-glass** caps a grant at 4 hours, requires a ticket id, is read-only, and covers enquiry/profile/document only. The 4-hour cap and ticket rule are my choices, not in docs/05.
6. **DOB added** to the field-encrypted C3 set (docs/05 §3 names NDIS number and free-text needs).
7. **Docx detection is a heuristic** (ZIP signature plus the entry names `[Content_Types].xml` and `word/`). A crafted file can satisfy it; the malware scan and viewer sandboxing are the real controls. Legacy `.doc` and macro formats are rejected.
8. **Per-contact throttle** (3 per hour per phone/email) and **per-IP limit** (10 per 10 minutes) are placeholder numbers, not tuned.
9. **docs/05 §6 "fingerprint-free heuristics"** for abuse detection is not implemented; rate limits, Turnstile and a honeypot are.
10. **docs/05 §6 "per-access log" for downloads:** `can()` returns audit drafts and `draftToAuditEvent` maps them, but nothing in this package wires them to a sink on download, because there is no API layer yet.
11. **Audit atomicity** is expressed by `Repository` methods taking the audit event; only the in-memory double honours it. A Postgres adapter must write record and audit event in one transaction.
12. **Retention periods** are placeholders per docs/05 §7. Statutory periods are **not verified** and are `null` so the evaluator cannot delete.
13. **docs/05 §3 `source (utm hash)`** is not on the enquiry record: the shared Step-1 contract carries no source field.

## Known limitations

- **Duplicate in-flight submissions sharing one Turnstile token:** a retry *after* the first request finished is answered from the idempotency record (tested). Two requests racing with the *same* token: one is created and the other is refused as a token replay (403), because the token check runs before the idempotency key is reserved (observed and pinned by a test). The browser form disables the button on submit, and a retry with a fresh token succeeds.
- `case_ref` is a reference, not a secret (35 bits). It must never be the only credential for access to a case.
- The adapter must pass a **trusted** `ip`. Passing a client-controlled `X-Forwarded-For` would let an attacker dodge the per-IP limit.
- The enquiry schema accepts a free-text `bestTime` (≤ 80 chars). The form warns users not to include health details, but nothing here can detect that they did.
- `FixedWindowRateLimiter` and the replay cache grow in memory until pruned (pruning is triggered at 10,000 entries).
- SQL: never parsed by Postgres; RLS interplay with `SECURITY DEFINER` functions, `FORCE ROW LEVEL SECURITY` and role grants needs review by someone running it against a scratch database. SELECT auditing needs pgaudit or the API's access log; Postgres RLS does not log reads.

## Layout

```
src/        ids, crypto, profile, policy, handler, logging, uploads, repository, memory, memory-guards, retention, ports, hash, index
sql/        001_init.sql   (NOT EXECUTED — requires approval)
tests/      9 vitest files, 287 tests
```
