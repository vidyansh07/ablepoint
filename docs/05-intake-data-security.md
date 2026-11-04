# 05 — Secure Referral and Participant Intake: Data and Security

Status: **design proposal; high-risk subsystem.** Nothing is to collect real participant data until the compliance owner and qualified advisers have signed off (section 10). Not legal advice; no compliance certification is claimed.

## 1. Data classification

| Class | Examples | Where allowed |
|---|---|---|
| C0 Public | Published CMS content, service descriptions | CMS, site, CDN |
| C1 Anonymous analytics | Page views, event names without identifiers | GA4/GTM (consent-aware) |
| C2 Contact / marketing personal info | Name, phone, email, organisation, referrer type, region, source | Intake DB (system of record); minimal copy in CRM |
| C3 Sensitive participant info | Participant identity, NDIS number, disability/support needs, guardian details, health or functional information, consents | Intake DB only |
| C4 Documents | Plans, assessments, reports, ID | Private object store only |
| C5 Credentials/secrets | API keys, DB credentials | Secrets manager only |

Rules: C3/C4 never appear in the repo, CMS, build output, analytics, URLs, logs, email bodies, SMS, CRM, error reports or n8n execution data. Note: that someone enquires about a *disability service* is itself arguably sensitive in context; service type recorded in CRM must be reviewed by the privacy adviser (default proposal: CRM stores service *category* only, e.g. "SIL", no needs detail).

## 2. Progressive collection

**Step 1 — Initial enquiry (public form → intake API).** Fields: enquirer name, phone and/or email, relationship/referrer type (self, family, support coordinator, plan manager, health professional, other), service of interest (checklist), region (list incl. "not sure"), preferred contact method + best time, consent to contact, collection notice link. No NDIS number, no support-needs free text (optional short free text is discouraged; if kept, a visible warning "don't include medical details" and server-side redaction/limit).
Outputs: `case_ref` (random, non-sequential, e.g. `AP-7K3M-9Q2`), minimal CRM contact/deal, acknowledgement to the enquirer, staff task.

**Step 2 — Restricted intake (authenticated link or staff-assisted).** Participant details, representative relationship, NDIS details where genuinely necessary, support requirements, documents, communication preferences, specific consents. Access only via short-lived, single-use link emailed/SMSed to the enquirer *or* completed by staff by phone. No sensitive content in the message that carries the link.

## 3. Logical data model (restricted DB)

| Entity | Key fields (illustrative) | Sensitivity |
|---|---|---|
| `enquiry` | id, case_ref, created_at, referrer_type, region, service_categories[], contact_method, consent_contact (bool + text version + timestamp), source (utm hash), idempotency_key | C2 |
| `person` | id, enquiry_id, role (enquirer/participant/representative), name, phone, email | C2/C3 |
| `participant_profile` | person_id, dob, ndis_number (encrypted, field-level), support needs, communication needs | C3 |
| `consent_record` | id, person_id, purpose, notice_version, given_at, channel, withdrawn_at | C2 |
| `document` | id, enquiry_id, object_key, mime, size, sha256, scan_status, uploaded_by, classification | C4 metadata |
| `case_event` | id, case_id, actor_id, type, at, meta (no PII) | C2 |
| `staff_user` | id, idp_subject, role, region_scope, active | C2 |
| `access_log` | id, actor, action, entity, entity_id, at, ip hash, outcome | C2 (append-only) |
| `retention_job` | id, entity, rule, run_at, result | operational |

Field-level encryption (application-layer with KMS-managed key) for NDIS number and free-text needs, in addition to storage encryption. The NDIS number is validated for format only (no external lookup) and never logged.

## 4. Roles and access (least privilege, server-enforced)

| Role | Enquiry metadata | Participant profile (C3) | Documents (C4) | Export/delete | Admin |
|---|---|---|---|---|---|
| Intake administrator | read/write all | read/write | read/write | request | no user mgmt |
| Intake manager | read/write all | read/write | read | approve deletion | assign |
| Intake staff | assigned cases | assigned cases | assigned cases | no | no |
| Regional staff | region-scoped, assigned only | need-to-know fields only | no by default | no | no |
| Compliance officer | read all + audit logs | read (audit purpose) | read (audit purpose) | execute retention/deletion | no |
| System administrator | infrastructure; **no data access by default** (break-glass with logging) | break-glass | break-glass | no | yes |
| Marketing staff | counts/aggregates and CRM only | **none** | **none** | no | no |

Enforcement: authorisation in API/DB layer (row-level policies or equivalent), never UI-only. Break-glass access generates an alert.

## 5. Platform options

| Concern | AWS Sydney (standard) | Supabase Sydney (lean) |
|---|---|---|
| Region | ap-southeast-2 (Sydney) | `ap-southeast-2` "Oceania (Sydney)" listed on Supabase region docs (Verified 3 Nov 2026) |
| Database | RDS/Aurora PostgreSQL, KMS, automated backups | Managed Postgres; Pro from US$25/org/month + compute; Free tier has **no backups** (Verified) |
| Point-in-time recovery | Available on RDS/Aurora (config) | PITR is a US$100/month add-on per 7-day retention (Verified); daily backups 7-day on Pro, 14-day on Team |
| Auth + MFA | Cognito (TOTP MFA) or equivalent; verify features/pricing | Supabase Auth; "Advanced MFA (phone)" US$75/month on first project (Verified); TOTP availability not verified |
| Private storage + malware scanning | S3 private + SSE-KMS + malware scanning service (e.g. GuardDuty Malware Protection for S3 — verify availability/pricing) | Storage buckets with access controls (plan table says included); malware scanning would be custom — not provided |
| Audit logging | CloudTrail, CloudWatch with log redaction, immutable bucket | Platform audit logs on Team (US$599/month, includes SOC2/ISO 27001 per pricing page); app-level audit table required either way |
| Compliance reports | AWS Artifact (verify IRAP/other scope relevant to AU health data) | SOC2 on Team; HIPAA add-on irrelevant to AU; DPA, subprocessors, support-access model **NOT VERIFIED** |
| Operational effort | Higher (IaC needed) | Lower |
| Cost certainty | Usage-based; **not priced in this pass** | Predictable base, add-ons add up |
| Lock-in | AWS services; Postgres portable | Postgres portable; Supabase Auth/Storage APIs less so |

**Recommendation (D-05):** AWS Sydney for production intake, because required controls (KMS, malware scanning, immutable audit, break-glass, IAM boundaries) are first-class there and each can be verified. Supabase Sydney is a credible lean alternative **only if** the DPA/subprocessor/support-access questions are answered satisfactorily and the Team-tier cost (≥ US$599/month) or compensating controls are accepted. Choosing Sydney does not by itself make the system Australian-only: Cloudflare Turnstile verification, email/SMS providers, GTM/GA4, HubSpot, error tracking and any LLM APIs are separate data flows to be inventoried in a data-flow register before go-live.

### Data-flow register (to complete before go-live)

| Flow | Data | Destination (region) | Verified? |
|---|---|---|---|
| Step 1 POST | C2 | Intake API (AU) | design |
| Turnstile siteverify | token + visitor IP | Cloudflare (global) | **NOT VERIFIED** for residency; no form content |
| Acknowledgement email | name, case_ref | Email provider (Resend lists "multi-region", Sydney not named) | **NOT VERIFIED**; consider SES Sydney |
| SMS | mobile number, short text | Twilio / Sinch / WildJar | **NOT VERIFIED** |
| CRM sync | name, contact, case_ref, stage | HubSpot (region unknown) | **NOT VERIFIED** |
| Error monitoring | stack traces without PII | tbd | tbd |
| Backups | encrypted snapshots | AU only (setting to assert) | design |

## 6. Security controls

| Control | Specification |
|---|---|
| Transport | TLS 1.2+; HSTS; no mixed content |
| Origin protection | Strict CORS allow-list (public site origins), `Origin`/`Sec-Fetch-Site` checks, no cookies on Step 1 (token-less, bot-checked), CSRF tokens on staff UI (cookie sessions) |
| Bot/abuse | Turnstile verified **server-side** per request (token single-use; reject replays); rate limit by IP + fingerprint-free heuristics; per-contact throttle; honeypot as secondary |
| Validation | Schema validation server-side (Zod/JSON Schema), length limits, allow-lists, output encoding; reject unknown fields |
| Idempotency | Client idempotency key stored hashed; replays return the original `case_ref` response |
| Uploads | Pre-signed, short-lived (≤ 5 min) upload URLs; size ≤ 10 MB/file (proposal), type allow-list verified by magic bytes; quarantine bucket → scan → release; unscanned files never downloadable |
| Downloads | Short-lived signed URLs (≤ 60 s), per-access log, `Content-Disposition: attachment`, no CDN caching |
| AuthN | Managed IdP; MFA mandatory for all staff; phishing-resistant (passkey/WebAuthn) where supported; session lifetime and idle timeout set; secure recovery procedure with identity check by manager |
| AuthZ | Deny-by-default; ownership + region scope; tested by horizontal/vertical bypass tests |
| Logging | Structured, field allow-list; PII scrubbed at source; separate security log with 12-month (proposal) retention; no request bodies logged |
| Secrets | Secrets manager; no secrets in repo/CI logs; rotation schedule; separate secrets per environment |
| Backups/DR | Encrypted automated backups in AU; quarterly restore test (record evidence); defined RPO/RTO (proposal: RPO ≤ 15 min, RTO ≤ 4 h — to confirm with owner) |
| Breach response | Documented plan aligned with the Notifiable Data Breaches scheme obligations (adviser to confirm), roles, contacts, decision tree, 30-day assessment clock noted, evidence preservation |
| Deletion/retention | Retention matrix by entity (section 7), tested deletion job, lawful-retention exceptions, deletion certificate to compliance |
| Dev hygiene | Dependency scanning, SAST, secret scanning in CI; synthetic data fixtures only; no prod data in non-prod |

## 7. Retention (placeholders for adviser decision)

| Entity | Proposed default | Notes |
|---|---|---|
| Step 1 enquiry that does not proceed | delete or de-identify after 12 months | adviser to confirm |
| Active participant records | per NDIS Commission / state records requirements | statutory minimum **not verified** here; many providers cite seven years — adviser to confirm |
| Documents | linked to case retention | |
| Access/security logs | 12 months hot, archived per adviser | |
| Marketing CRM contact | until withdrawal of consent or 24 months inactive (proposal) | |

## 8. Threat model summary (STRIDE-lite)

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | Stolen staff credentials | Mandatory MFA, passkeys, anomaly alerts |
| Tampering | Modified submission, forged webhook | Schema validation, signed webhooks (HMAC + timestamp), idempotency |
| Repudiation | Staff denies viewing a file | Append-only access log, export to immutable store |
| Information disclosure | IDOR on documents, CDN caching of private files, log leakage | Signed URLs, `Cache-Control: no-store`, PII scrubbing, authZ tests |
| Denial of service | Form flooding, upload abuse | Rate limits, WAF, size limits, queue |
| Elevation of privilege | Marketing user → intake data | Separate roles/identity pools, server-enforced policies, break-glass logging |
| Supply chain | Malicious npm package, compromised CI | Lockfiles, provenance checks, pinned actions, least-privilege deploy tokens |
| Malware upload | Weaponised PDF | Quarantine + scan + type allow-list; staff opens via viewer sandbox |

## 9. Test and evidence requirements

Penetration test by an external party before handling real data (cost line in 10). Restore test evidence. AuthZ test matrix (roles × entities × actions) automated. Upload abuse suite. See 11.

## 10. Sign-off needed before any real participant data

1. AblePoint compliance owner and privacy officer (named).
2. Qualified legal/privacy adviser: Privacy Act/APPs, NDIS Code of Conduct and Practice Standards (privacy, records), consent wording, notifiable-breach process, spam/marketing obligations.
3. Vendor data-processing terms reviewed for every subprocessor in the register.
4. External security test passed (no open High/Critical).
5. Staff training and access approval process in place.
