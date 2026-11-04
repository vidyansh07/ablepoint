# 10 — Marketing Plan and Budget

**No spend is approved except the A$500/month advertising allowance, and even that is a ceiling, not an authorisation to switch on campaigns.** Software subscriptions, call tracking, SMS, security testing and legal review are separate, unapproved items.

## 1. Google Search pilot — A$500/month media

### Constraints that follow from the budget

- Daily cap ≈ A$16 (500 ÷ 30.4). Use a hard monthly stop in addition (Google may overspend on individual days; confirm account-level budget behaviour at setup).
- Roadmap assumptions (self-published agency benchmarks, **unaudited**): CPC A$3.50–8, 6–10% of clicks become enquiries, A$40–90 cost per qualified enquiry "healthy". Arithmetic only: A$500 ÷ A$8 ≈ 62 clicks to A$500 ÷ A$3.50 ≈ 143 clicks per month; at 6–10% that is about 4–14 enquiries, of which only some will be qualified. **This is not a forecast and no lead count is promised.**
- Consequence: a single month yields too little data to judge A$90/A$150 thresholds (the roadmap recommended A$1,500/month; the confirmed budget is one-third of that). Smart bidding needs far more conversions (roadmap cites 30), so use manual CPC or capped Maximise Clicks. Evaluate over **60–90 days** and weight leading indicators (qualified call rate, call length, relevant search terms) over cost per qualified enquiry until n ≥ ~15.

### Region choice

Select one region only after operations confirm capacity (service, staff, rooms). Candidate order by roadmap/operations context: Central Coast (home region) then Newcastle — **a decision for AblePoint**, recorded in 13 (D-08).

### Structure (proposal)

| Item | Setup |
|---|---|
| Campaign | 1 Search campaign, 1 region, geo-target "presence" (people in the area) |
| Ad groups | by service with demonstrated intent: SIL (vacancy/enquiry), support coordination, short-term accommodation/respite (only the ones with capacity) |
| Match types | Phrase and exact; no broad match at this budget |
| Negatives | seed list: jobs/careers/courses/"how to become", other states, "free", competitor names not targeted unless approved, "what is"; review search-term report weekly and extend |
| Ads | Responsive search ads written from verified facts; "registered NDIS provider" only with the verified registration; no "approved", "best", "leading", no price claims, no outcome promises; human compliance review before launch |
| Assets | Call asset (tracking number), location extension only if a verified GBP exists |
| Landing pages | Campaign landing page template (06 type `landingPage`): region, service, registration statement, phone, short enquiry form, minimal nav, noindex optional |
| Conversions | (1) call ≥ 60 s (call tracking, unapproved spend), (2) `contact_submit`/`referral_submit` (Step 1), (3) offline import of "qualified enquiry" using GCLID **only through consent-based, privacy-reviewed process; no participant identifiers to Google** |
| Spend control | Owner approval of campaign; daily and monthly caps; limited account access (standard user for engineer; admin = owner); weekly search-term review; pause rule if capacity ends; ad copy change log |

Stop/scale hypotheses from roadmap: pause if cost per qualified enquiry > A$150 after sufficient data; consider scaling if < A$90 sustained. At this budget apply them only once ≥ 15 qualified enquiries exist or 90 days elapsed, whichever is first, and document the confidence level.

### Meta (Facebook/Instagram)

Not allocated any of the A$500. Prior to any test: written budget decision; review of Meta's policies on health-related/sensitive categories (roadmap flags January 2025 restrictions on lower-funnel events and custom audiences for health and wellness domains); confirm Events Manager classification; forbid using referral, health or NDIS data for audiences/optimisation/retargeting; server-side tagging is not a workaround for platform rules. Vacancy and recruitment tests stay in the plan as *gated* (A15). The detailed rules are in section 5.

## 2. Measurement spend vs media

Media A$500/month ≠ call tracking (WildJar Starter A$150/month, Verified on wildjar.com/pricing 3 Nov 2026) ≠ software. Without call tracking, phone leads (likely the main conversion) cannot be attributed to ads; this is a business decision for the owner (D-09).

## 3. Software and service cost models (unapproved; native currencies; verified where marked)

Verification date 3 Nov 2026 from official pages. "NV" = not verified this pass. Roadmap figures (30 Oct) shown only when not re-verified.

| # | Category | Candidate | Cost basis | Lean | Standard | Notes |
|---|---|---|---|---|---|---|
| 1 | Website hosting | Vercel Pro | US$20/month base + US$20 per developer seat; viewer seats free; Hobby is non-commercial only | 1 dev seat: ≈ US$40/month (confirm whether first seat included) | 2 seats + password protection add-on US$20/project/month → ≈ US$80+ | Usage overage risk (bandwidth, functions); monthly credit US$20 included |
| 2 | CMS | Sanity Growth | US$15/seat/month, monthly billing only | 3 seats ≈ US$45 | 5 seats ≈ US$75 | Free tier insufficient for roles |
| 3 | Database (intake) | AWS RDS/Aurora PostgreSQL **or** Supabase | Supabase Pro from US$25/org + compute; PITR add-on US$100/mo; Team US$599/mo | AWS small instance: **unpriced**; Supabase Pro ≈ US$25 + compute + PITR | Multi-AZ / Team tier | Choose after D-05 |
| 4 | Document storage | S3 private + KMS (or Supabase storage 100 GB incl. on Pro) | AWS usage-based **unpriced** | small | | Malware scanning cost unpriced |
| 5 | Authentication | Cognito (or Supabase Auth) | **unpriced**; Supabase advanced phone MFA US$75/month | | | Prefer TOTP/passkeys |
| 6 | CRM | HubSpot Free → Starter | Free: US$0 (2 users, 1,000 contacts); Starter US$20/seat (promos exist) | Free | 2 seats ≈ US$40 | Region/AUP NV |
| 7 | Automation infra | n8n self-hosted (AU) | server cost **unpriced**; Cloud Starter €20/month (EU-hosted; not for personal data) | small instance | HA setup | Licence permits internal use |
| 8 | Email delivery | Resend Free / Pro | Free: 3,000/month, 100/day; Pro US$20/month for 50,000 | Free | Pro | AU region NV; consider SES Sydney |
| 9 | SMS | Twilio AU | US$0.0515/segment out; mobile number US$8.25/month (currency label not explicit on page) | ≈ US$8.25 + usage | + volume | Sender-ID rules NV; alternatives Sinch/WildJar SMS (A$0.06) |
| 10 | Call tracking | WildJar | Starter A$150/month (4 numbers, 500 min); Growth A$89 + A$8.50/number + A$0.10/min | Growth ≈ A$100–150 | Starter A$150 | Recording consent, retention |
| 11 | SEO tools | Free tools first (Search Console, Screaming Frog free ≤ 500 URLs); Local Falcon/Ahrefs from roadmap (NV) | | US$0 | roadmap ≈ US$25–130 (NV) | |
| 12 | AI API usage | content drafting and A14 monitor | per-token; **unpriced** | small | | No PII in prompts |
| 13 | Monitoring | uptime + error tracking | free tiers likely; **unpriced** | US$0 | paid tier | |
| 14 | Backups | included in DB choice; cross-region copies in AU | **unpriced** | | | |
| 15 | External security & compliance review | pen test, legal/privacy adviser | one-time quotes **required**; do not estimate | required before real data | | Likely the largest one-time cost |
| 16 | Advertising | Google Ads | A$500/month (approved ceiling) | A$500 | A$500 | Meta: A$0 |

### Totals (what can honestly be said)

- **Verified recurring software floor (Lean):** Vercel ≈ US$40 + Sanity ≈ US$45 + WildJar ≈ A$100–150 (if call tracking approved) + Twilio number ≈ US$8 + HubSpot/Resend/Turnstile free = roughly **US$95–100 + A$100–150 per month** before AWS/infra, usage, AI API, monitoring, domain, and one-time reviews. AWS (intake DB, storage, auth, n8n host) is **unpriced** and will be material; get an AWS pricing-calculator estimate in Phase 0 follow-up.
- **Standard stack:** add second dev/editor seats, HubSpot Starter, Resend Pro or SES, password-protected staging, paid monitoring — estimate after infra pricing.
- **One-time:** design/build hours (see 12), pen test, privacy/legal review, photography (if commissioned), call-tracking setup.
- Compared with the roadmap's lean stack (A$150 + ~US$25 per month), the approved scope adds a real intake platform, CMS seats and security reviews, so the roadmap software budget is **not** a valid ceiling.

Cost-saving alternatives: Keystatic instead of Sanity (but weaker approval controls), Supabase Pro instead of AWS (pending verification), Cloudflare Pages instead of Vercel (roadmap alternative; brief mandates Vercel), free monitoring, manual GBP posts and rank checks instead of paid tools. Lock-in notes: Postgres and content exports keep exit paths open; HubSpot and Sanity are replaceable with export work.

## 4. Approval gates for spend

Nothing in section 3 is purchased until the owner approves a named list. Proposed first approval (P1 start): Vercel Pro (needed for any commercial staging), Sanity Growth seats (≤ 3), nothing else. Advertising launches only after landing page, tracking, capacity confirmation and compliance review of ad copy.

## 5. Advertising policy and tracking rules (added 3 Nov 2026)

Source: an ad-policy research pass over official Google, Meta, OAIC, ACMA and NDIS Commission material on 3 Nov 2026. Platform policies change often and the research could not see inside AblePoint's ad accounts, so **re-read the current policy pages before any campaign is switched on**, and have the compliance reviewer sign off on ad copy, audiences and tags. This section restricts what the engineer may configure; it does not authorise any spend.

### 5.1 Rules for the website, GTM and tags

1. **Neutral events only for ad platforms.** Google Ads and any Meta tag may receive only neutral conversion events such as `phone_click` and `referral_submit`. No diagnosis, disability type, NDIS number, health need, service-category detail or free text, in event names, parameters, URLs or page titles. The existing allow-listed sanitiser already limits what leaves the browser; the GTM container must be configured so that ad tags cannot read other data-layer values.
2. **No tags on form pages.** `/referral/` and the intake path carry no analytics or ad tags (already enforced and tested).
3. **Consent first.** Tags load only after the visitor opts in. The OAIC expects express consent where sensitive information could be disclosed through pixels, so the consent text must say plainly what is shared and with whom.
4. **No remarketing or similar-audience building from disability or health pages.** Google restricts personalised advertising (remarketing, Customer Match, similar/lookalike audiences) in the disability and health category. Do not create audiences from visitors to support, vacancy or referral pages, and do not upload participant or referrer lists to any ad platform.
5. **No Meta pixel or Meta Conversions API** until a written policy review is done. Meta prohibits ads that assert or imply personal attributes (for example "Are you living with a disability?") and flags health-suggesting custom conversions and lead-form questions.
6. **No participant identifiers to any ad platform**, including offline conversion imports. Qualified-enquiry import to Google (GCLID) is allowed only under a privacy-reviewed, consent-based process with no participant identifiers; until that exists, count qualified enquiries in the CRM instead.
7. **Server-side tagging is not a workaround** for any rule above.

### 5.2 Rules for ads and campaigns

1. **Phone:** use call assets (with a tracking number only after the owner approves call tracking). Google is ending call-only ads (the research found they stop serving in February 2027), so do not build on them.
2. **Wording:** the banned-phrase list applies to ads. No "NDIS approved/endorsed", "best", "leading", guarantees, price claims or outcome promises. Say "registered NDIS provider" only with the verified registration number and groups (question C-7).
3. **Targeting:** location targeting by region and keyword intent only (people searching for a service). No targeting of people by health condition or disability.
4. **Meta lead forms:** none with disability, health or diagnosis fields, unless Meta permission is confirmed in writing.
5. **Referral incentives:** do not offer gifts, cash-like rewards or discounts for referrals. The NDIS inducement offence (s73VA) commences on 20 Nov 2026 and the Commission has said it targets such arrangements. Referral thank-you messages must be words only. Legal review required before any partner or referrer programme.
6. **Reviews and testimonials:** never invented, incentivised or selectively solicited. Consent in writing for any quote. Regulated health practitioners have additional testimonial limits (AHPRA); where AblePoint engages such practitioners, check their rules.
7. **Email and SMS:** the Spam Act 2003 (consent, sender identification and unsubscribe, ss16 to 18) applies to every automated message (A1 to A17). No outreach is sent without approval, and any quiet-hours rule stays in force.

### 5.3 What this means for the A$500/month pilot

Search only, one region, phrase and exact match, no remarketing, no audience lists, neutral conversion events, call asset, weekly search-term review, compliance sign-off on every ad, hard monthly stop. Measurement beyond clicks and calls relies on the CRM, not on feeding health-adjacent data back to ad platforms. If a rule above makes a measurement idea impossible, the idea is dropped, not worked around.

