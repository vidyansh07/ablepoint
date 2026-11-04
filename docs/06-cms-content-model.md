# 06 — CMS and Content Model

## 1. Selection

| Criterion | Sanity (preferred) | Keystatic (alternative) |
|---|---|---|
| Staff-friendly editing UI | Yes (Studio, real-time collaboration) | Yes (Git-backed UI) but staff need GitHub or Keystatic Cloud accounts |
| Structured content + references | Strong | Good for file-based content |
| Roles (official pricing page, 3 Nov 2026) | **Free: only Administrator and Viewer.** Growth (US$15/seat/month, monthly billing only): adds Editor, Developer, Contributor; **no custom roles**. Custom roles, SSO, content releases, workflows, audit trail: Enterprise | Role model depends on Git permissions / Cloud plan (not verified this pass) |
| Scheduled publishing, comments/tasks | Scheduled drafts and comments/tasks on Growth; not on Free | Not native |
| Limits | Free: 20 seats, 10k documents, 250k API requests; Growth: 25k documents | n/a (repo-based) |
| Dataset region / document-history retention | **NOT VERIFIED** | n/a |
| Lock-in | Moderate (content portable via export) | Low (content in repo) |

**Recommendation:** Sanity **Growth** (≈ US$15 × editors; e.g. 4 seats ≈ US$60/month, unapproved purchase) because Free exposes only Administrator/Viewer, which breaks least privilege for editors. Compliance approval is enforced by the build gate (AR-7, below), not by an Enterprise workflow. Fallback: Keystatic if budget for Sanity seats is refused — but then editorial approval depends on Git pull-request review, which non-technical staff must be trained for.

## 2. Content types

All types carry: `title`, `slug` (validated, lowercase, no accents, controlled prefix), `seo` object, `reviewState`, `reviewedBy`, `reviewedAt`, `nextReviewDue`, `createdBy` (system).

| # | Type | Key fields |
|---|---|---|
| 1 | `siteSettings` (singleton) | legal name, trading name, ABN, NDIS registration number + registered groups (text + source URL), head-office address, main phone (E.164 + display), email, hours, social links, default OG image |
| 2 | `navigation` | ordered items (internal reference or external URL), CTA button |
| 3 | `footer` | link groups, legal links, acknowledgement of country text, accessibility statement link |
| 4 | `page` | blocks[] (hero, richText, cardGrid, cta, faq, processSteps, trustStrip, mediaText), template choice |
| 5 | `service` | summary, who it's for, what AblePoint provides, process steps, funding note (compliance-reviewed), related services, FAQs, regions[] via coverage |
| 6 | `region` | name, narrative (verified local facts), suburbs[], local contact, map embed policy (static image link, not iframe), staff coverage note, `officeType` enum (head office / service area only) — **no street address unless verified premises** |
| 7 | `serviceCoverage` | service ref × region ref, available (bool), capacity note (internal), public blurb, lastVerifiedAt |
| 8 | `property` | public name, region ref, suburb (not street), SIL/SDA classification, accessibility features[], photos (approved), **internal-only** fields in a separate private type (no addresses/residents) |
| 9 | `vacancy` | property ref, status (lifecycle), public availability summary, features, photo refs, lastVerifiedAt, internal owner (staff ref), enquiry CTA, publish window |
| 10 | `guide` | author ref, reviewer ref, reviewedAt, sources[] (authoritative URLs), answer-first summary, body blocks, FAQs[], disclaimers |
| 11 | `faq` | question, short answer, long answer, topic tags, reviewState |
| 12 | `teamMember` (approved profiles) | name, role, bio, photo, **consent record ref** (stored outside CMS), visible (bool) |
| 13 | `author` | name, credentials, bio, sameAs links |
| 14 | `testimonial` | quote, attribution (first name/initials), service tag, **consent reference**, `outcomeClaim` flag must be false |
| 15 | `mediaAsset` metadata | alt text (required), caption, credit, rights/consent status, source |
| 16 | `seo` (object) | title, description, canonical override, noindex, OG image, structured-data overrides |
| 17 | `landingPage` | campaign key, service+region, trimmed template, noindex option, conversion event mapping |
| 18 | `cta` | label, type (call, referral, enquire), tracking id |
| 19 | `legalPage` | version, effective date, approver, content blocks (privacy policy, complaints, accessibility statement) |
| 20 | `redirect` | from, to, status (301/302/410), reason, createdBy, approved (bool) — compiled at build into redirect config |

Validation highlights: banned-phrase check on rich text ("approved NDIS", "endorsed", "best", "leading"…) as an editor warning plus CI error; alt text required unless marked decorative; one H1 per page enforced by templates (editors choose H2+ only); phone/email only from `siteSettings`; vacancy cannot be `available` without `lastVerifiedAt` ≤ 14 days (proposal).

## 3. Roles and workflow

| Staff role | Sanity role (Growth) | Can |
|---|---|---|
| Content editor | Editor (or Contributor if drafts only) | Create/edit drafts; set `reviewState = inReview` |
| Marketing editor | Editor | Same + landing pages, CTAs |
| Compliance reviewer | Editor, restricted by convention + build gate | Sets `reviewState = approved` with `approvedBy`, `approvedAt` (custom input component limited to this role by user-ID allow-list in Studio config) |
| Publisher | Editor | Publishes documents (Sanity publish action) |
| Administrator | Administrator | Users, datasets, tokens |
| Developer | Developer | Schema, API tokens, webhooks |

Since custom roles are Enterprise-only, the **hard control** is in the site build: a document renders only if `reviewState == "approved"`, a named `approvedBy` exists, and `approvedContentHash` equals the SHA-256 of the document's own content fields as fetched (`isApprovalCurrent` in `@ablepoint/schemas`). The Studio "Approve for publication" action writes the hash; any later content edit changes the hash and withdraws approval until re-approved. (An earlier design compared `approvedAt >= _updatedAt`; that can never hold in Sanity because the approval save bumps `_updatedAt`, so it was replaced on 3 Nov 2026.) A hash covers one document; referenced documents carry their own approval. Unapproved-but-published documents never reach the public site. The Studio UI hides/locks the approval field for non-reviewers (soft control; documented limitation).

Flow: Draft → Editorial review → Compliance approval (required for NDIS funding/eligibility claims, regional capacity claims, testimonials, vacancy copy, legal pages) → Publish → Audit record. Audit: webhook on publish writes `{docId, revision, actor, time, reviewState}` to an append-only log (stored in the AU intake account's log store); Sanity history retention by plan **NOT VERIFIED**.

Preview: separate SSR preview deployment (AR-3) authenticated, reading drafts with a read-only token; production remains static. Rebuild on publish via Vercel deploy hook; typical latency expected minutes (not measured).

## 4. Vacancy lifecycle

```
draft ──▶ readyForReview ──▶ available ◀──▶ temporarilyUnavailable
                                │                     │
                                ▼                     ▼
                              filled ───────────────▶ archived
```
Transitions: draft→readyForReview (editor); readyForReview→available (compliance-approved + publisher); available↔temporarilyUnavailable (vacancy owner); available/temporarilyUnavailable→filled (vacancy owner; **auto-triggered by staff action only**); filled→archived (system after 30 days). A `filled`/`archived` vacancy is never rendered as available; page shows "no longer available — see current vacancies". Staleness rule: if `lastVerifiedAt` > 14 days, the site renders "availability unconfirmed — call us" instead of "available" (proposal). Later automated sync (A6) only writes **drafts** or updates `status` via a token with narrow scope; publication of availability remains human-approved until trust is established.

## 5. Information explicitly excluded from the CMS

Participant records, enquiries, resident details, unapproved addresses, staff personal data beyond consented public profile, anything classified C2+.

## 6. Limits and open items

- Annual billing for Sanity self-serve not offered (monthly only per pricing page).
- Content releases/scheduled publishing nuance by plan; confirm before relying on releases.
- API request quota (250k/month on Free/Growth) is ample for build-time fetches; confirm CDN request usage under CI rebuild patterns.
- Need: owner decision on seat count, who is Compliance reviewer, brand fonts/logo.
