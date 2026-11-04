# 18 — Work Queue (as directed 3 Nov 2026)

Order set by the engineering lead: **UI and brand first**, then everything else. Items marked **ASK** need the owner's input before work continues; nothing in the queue proceeds past that point without it.

## Done in this step: UI, brand and assets

| Item | Status |
|---|---|
| Reference research (Hireup, Life Without Barriers, Cerebral Palsy Alliance, Yooralla, NDIS) | Done: `16-ui-reference-research.md` |
| Brand guidelines v1 derived from the preserved logo | Done, **awaiting owner approval**: `17-brand-guidelines.md` |
| Assets | Favicons and touch icon cropped from the preserved logo ring; original line-icon set (30 icons); "Gathering" ring graphic; hero/home illustration; logo optimised (webp, 2x) |
| UI redesigned to the guidelines | Done: utility bar (phone, text size A / A+ / A++, high contrast, Easy Read), logo header, hero with illustration, "How can we help you?" audience routing, icon service cards, vacancy band, region cards, steps, CTA band, logo-plate footer, form card, illustrated empty/404 states |
| Access features | Text size and high-contrast modes persisted locally, applied before first paint; tested with axe in both modes; no horizontal scroll at 130% text |
| Verification | 70 web unit tests (incl. high-contrast 7:1 pairs), 118 browser tests, lint 0 errors |

## Also done since: templates, style guide, share image

Service/region/guide/vacancy templates, Easy Read pattern and page, `/styleguide/` (staging only), OG image, CSP-clean referral page. Details in `15-implementation-status.md`.

## Latest request (3 Nov 2026): growth, blog automation, agent APIs, Pixabay photos

Done: strategy contract (`20`), agent API and blog pipeline (`21`), understanding of AblePoint today (`22`), referrer trust (`23`). **ASK:** (1) head office/address: Gosford, or Carlingford and Orange as on the live site? (2) Pixabay: send the downloaded files with each page URL and creator, or a free API key (never paste it in chat; set `PIXABAY_KEY` locally); decide whether recognisable-people photos may go live with a named risk acceptance. (3) Is the youth/out-of-home-care service part of this site? (4) Approve the niche positioning (complex needs, referrer-first). (5) Name compliance reviewers for `reviewers.json`. (6) Training-crawler policy: allow (default) or block. (7) GitHub repo, Sanity and n8n access.

## Owner decisions received 3 Nov 2026

1. Commission a disability-led illustrator: **yes** (drafts ready in `docs/outreach/`, **nothing sent**; owner to send, set budget). 2. Regional staff review of the vignettes: **yes** (`docs/review/regional-art-review.md`). 3. Photography: **use online-available photos**: done for regional landscapes with licences and credits; people photos deferred (see `19-creative-sourcing.md` §3). 4. Easy Read: **commission and test** (brief in `docs/outreach/04-easy-read-commissioning-brief.md`).

## Creative sourcing (see `19-creative-sourcing.md`)

Done: licence research, Lucide icons, original banners and regional art, motion system. **ASK:** approve commissioning a disability-led illustrator (Studio A / ADNA / Illustrators Australia), budget, and who may contact them; regional staff review of vignettes; photography consent process.

## ASK before continuing (need the owner)

| # | Question | Why it matters |
|---|---|---|
| Q1 | Approve (or change) the brand guidelines: palette, type, "Gathering" device, hero illustration | Everything else follows them |
| Q2 | Provide the **logo as a vector (SVG/PDF/AI)**, plus a one-colour or white version | The only artwork is a 512 px JPG on white; on dark backgrounds it needs a white plate |
| Q3 | Which spelling is official: **"Ablepoint"** (logo, current site) or **"AblePoint"** (your brief)? | Used in all copy, schema, page titles |
| Q4 | Photography: can staff, homes and participants be photographed with written consent, or should we commission it? Until then the site is illustration-only | Real photos build trust more than illustration; consent is mandatory |
| Q5 | Is a **careers / work with us** page wanted now? (Hireup and others route workers separately; the audience tiles currently have no worker tile) | New page and tile |
| Q6 | Should the site offer a **language selector or read-aloud** like NDIS.gov.au? (Not built; needs a decision on tooling and translation sources) | Scope and privacy |

## Queued (not started), in order

1. Owner review of the redesigned UI (desktop, mobile, text size, high contrast), then changes.
2. Usability test with people with disability and with referrers (coordinators, plan managers).
3. Sanity project, studio run, approval action exercised for real (needs Sanity Growth, GitHub, Vercel Pro approvals; D-03/B-03).
4. Region facts, SIL/SDA content, four guides: content write-up with the named compliance reviewer (needs B-04).
5. Real photography integration and alt text (needs Q4).
6. Vercel protected staging, header/redirect smoke test, Lighthouse CI.
7. Analytics container, consent copy, call tracking (needs D-09, D-17).
8. Intake platform build-out (AWS Sydney, D-05): Postgres adapter, KMS, Turnstile, storage and scanner, staff UI, pen test.
9. CRM (HubSpot, after region and sensitive-data verification), n8n workflows, SMS/email providers.
10. Google Ads pilot (A$500/month) after landing page, tracking and compliance review.
11. Production migration planning and cutover gates (`12-implementation-roadmap.md`).

## Master plan pass (3 Nov 2026)

Everything in the queue that can be done without an external account or approval is now done or drafted. The ordered, owner-facing version of what remains is `25-final-master-plan.md` (phases A to I, backlog by workstream, gates G0 to G5, and the consolidated questions ASK-01 to ASK-22). Done in this pass: Hireup analysis (`24`), ad-policy and tracking rules (`10` §5, `20` §8), draft database exercised in-memory, status and README updates, full re-verification.

Remaining queue items all need an account, a person or a decision: GitHub (branch protection), Vercel Pro, Sanity, Search Console/Bing/GBP, n8n host, AWS, Pixabay files or key, commissioning and sending outreach, regional staff review, photography consent, Easy Read testing, usability tests, manual screen-reader testing, reviewer names, facts C-1 to C-8. Work that could still be built without accounts (optional): MCP server for agents, Sanity adapter behind a feature switch, n8n workflow exports as files, region content templates ready for facts.

## Master plan implementation pass (3 Nov 2026)

Done in this pass without accounts: region fact-sheet model and template (`27`), draft glossary, FAQ build bug fixed, performance budgets, MCP server, Sanity pull adapter (not wired: Studio schema gaps), four n8n workflow files, CI helper files (Lighthouse, Dependabot, PR template), operations runbooks (`26`). Details and test totals in `15`.

Still blocked, unchanged: every item in `25` §6 (ASK-01 to ASK-22). New owner-side items created by this pass: operations fills in one fact sheet per region (`27`); a person compares the glossary with the official NDIS wording; decide whether `apps/web/src/content/cms` is committed or generated in CI; add the missing fields to the Studio (service icon/tint, region facts, Easy Read) before the CMS path is wired; set up a request-signing relay if the post-deploy IndexNow workflow is to be used; choose an MCP client to try the server with.

