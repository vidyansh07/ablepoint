# 24 — Hireup: Feature and Technology Analysis (adopt, adapt, avoid)

Date: 3 Nov 2026. Sources: a full-page screenshot of hireup.com.au supplied by the owner (`Downloads/screencapture-hireup-au-2026-11-03_19_47_43.png`) and a technology-detection list pasted by the owner. Neither was independently re-verified against the live site, and a detector list shows what scripts were *seen*, not how they are configured. Hireup is a worker-marketplace for participants; AblePoint is a provider whose largest audience is support coordinators and discharge planners. So features are judged on whether they help *that* audience, and technology on whether it is compatible with AblePoint's privacy rules (`05`, `10`) and the advertising-policy limits in `10` §5.

## 1. Features seen on the page and what was done

| Hireup pattern | Decision | What was built or why not |
|---|---|---|
| Hero with a plain "find support" action | **Adapt** | `SupportFinder` on the home page and `/locations/`: choose region and service, get matching region, service and vacancy links. Runs in the browser against the public JSON API (`/api/v1/*.json`), sends nothing anywhere, no tracking of what was chosen. It lists AblePoint's own pages only. It does not search a marketplace of workers, because AblePoint is not one |
| Worker profiles and ratings | **Avoid** | AblePoint is not a marketplace. Ratings and reviews of individuals raise NDIS and consumer-law issues (fake or incentivised reviews are unlawful) |
| Testimonial / quote cards | **Adapt, gated** | `TestimonialCards` + `src/data/testimonials.ts` ships **empty**. `assertTestimonial` requires written consent, a verified source and an approved state before a quote can render. No invented quotes. Health-related testimonials need extra care (AHPRA guidance applies to regulated health practitioners; NDIS Code of Conduct and ACCC rules apply to all) |
| "Safe, screened workers" / safety messaging | **Adapt, draft** | `home.ts` holds draft safety and funding blocks. They are hidden in production until the compliance reviewer approves exact wording. Screening statements must match the NDIS Worker Screening requirements and AblePoint's real process |
| Funding explainer (NDIS, plan managed, self-managed) | **Adapt, draft** | Funding block on the home page (draft, hidden in production) and the guides. Must never imply eligibility or approval |
| FAQ hub | **Adopt** | `/faq/` with client-side filter (progressive: all answers visible without script). Draft, reviewer-gated. Google removed FAQ rich results in May 2026, so the value is for users and answer engines, not a search feature |
| Pricing / "what does it cost" | **Adapt, draft** | `/pricing-and-agreements/` states that supports are charged within NDIS price limits and that a service agreement is signed first. **No prices are published** until the owner confirms them against the current NDIS Pricing Arrangements and Price Limits |
| App-store badges | **Avoid** | No app exists |
| Footer "locations we cover" | **Adopt** | Footer "Where we work" lists the six confirmed regions, which also strengthens internal linking |
| Careers / "become a worker" route | **Queued (Q5)** | Needs the owner's yes and a real recruitment process (A16) |
| Typeform-style intake | **Avoid** | Third-party form tools would send participant details to another processor. The referral form stays on AblePoint's own intake path (`05`) |
| Trustpilot widget | **Defer** | Third-party review widgets load external scripts and set cookies. Reviews must be genuine, not incentivised (s73VA from 20 Nov 2026 covers inducements related to NDIS referrals). Revisit once real reviews exist and consent handling is designed |

## 2. Technology list: compatible with AblePoint?

| Technology seen at Hireup | Decision | Reason |
|---|---|---|
| Prismic (headless CMS) | **Adopt the idea** | Sanity is the chosen headless CMS (`06`, `apps/studio`) with a content-hash approval gate |
| React, GSAP, Bootstrap 5, core-js | **Avoid** | The site ships almost no JavaScript on content pages (about 1.6 KB gzip), Lighthouse mobile lab 100/100/100. A JavaScript framework would trade away speed and crawlability (Hireup's raw HTML was observed as a near-empty shell, `20` §0). Motion is CSS-only and respects reduced motion |
| PWA / web app manifest | **Defer** | No 512 px icon or vector logo exists yet (Q2), and installability is not a need for a provider site |
| Open Graph tags | **Adopt (done)** | OG and Twitter card tags and a generated share image exist |
| CDN (CloudFront) and AWS load balancer | **Equivalent** | Vercel's CDN serves the static site. AWS (Sydney) is planned only for the restricted intake service (`04`, `05`) |
| Google Tag Manager + GA4 | **Adopt, consent-gated** | GTM loads only after consent, never on `/referral/` or other form pages, events pass through an allow-list sanitiser (`15`) |
| Facebook (Meta) Pixel, TikTok Pixel | **Avoid for now** | Disability/health context. Meta restricts health-related events and audiences, and the OAIC expects express consent for sensitive information shared through pixels (`10` §5). Reconsider only after a written policy and privacy review |
| The Trade Desk, Microsoft Advertising, ad exchanges | **Avoid** | Programmatic retargeting of people who visited disability-support pages would reveal sensitive inferences. Not compatible with the A$500/month budget either |
| Hotjar (session replay) | **Avoid** | Replay and heatmap tools can capture typed text and sensitive context. The referral form must never be recorded. Use aggregate analytics and moderated user testing instead |
| Mixpanel, Segment | **Avoid** | A customer-data pipeline invites sending identifiers and attributes to many tools. The event allow-list already limits what leaves the browser |
| VWO (A/B testing) | **Avoid** | Low traffic cannot power A/B tests, and client-side testing adds scripts and flicker. Improve through usability testing and Search Console data |
| Typeform | **Avoid** | See §1 |
| Trustpilot | **Defer** | See §1 |

## 3. What Hireup's page does not show (and where AblePoint can differ)

Hireup's strength is a consumer marketplace with worker search. It does not offer what referrers ask for most: a vacancy view, a clear referral pathway, honest capacity answers and complex-needs positioning (`20`, `23`). AblePoint's plan leans into those, and into regional pages (no competitor page was found for Gunnedah, and Dubbo and Orange coverage was thin; `20` §0).

## 4. Verified vs not verified

Verified: the features built from this analysis are covered by unit and browser tests (finder, testimonial gate, FAQ hub, footer regions; see `15`). Not verified: how Hireup's tags are configured, and any claim about Hireup's performance or results. Nothing here is a copy of Hireup's text or design.
