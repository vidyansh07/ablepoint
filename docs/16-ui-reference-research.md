# 16 — UI Reference Research: Australian NDIS and Disability Sites

Date: 3 Nov 2026. Method: loaded each site's public home page once in a desktop (1440×900) and a mobile (390×844) browser and studied the first screen. Screenshots were used for analysis only; nothing was copied, and none are stored in the repository. Patterns below are re-expressed in AblePoint's own design. Sites reviewed: Hireup (NDIS marketplace), Life Without Barriers, Cerebral Palsy Alliance, Yooralla, and the NDIS (ndis.gov.au). Two more (Mable, Achieve Australia) could not be loaded because the network dropped; they are not part of this review.

## What these sites do well (and what AblePoint adopts)

| # | Pattern | Seen on | Why it works for this audience | AblePoint adaptation |
|---|---|---|---|---|
| 1 | **Phone number always visible in the header**, as a pill/button, not buried in a contact page | CPA, Yooralla, NDIS | Families and coordinators often prefer to call; reduces steps | Header phone pill on desktop; round phone icon button beside the menu on mobile |
| 2 | **Accessibility tools in a top utility bar** (text size, high contrast, read aloud, print, language) | Yooralla, NDIS, CPA | Signals access is core; helps users who need it without browser tweaks | Text size A−/A/A+ and high-contrast toggle (persisted locally), Easy Read link. No third-party widget; no overlay product |
| 3 | **Audience routing** ("I'm looking for…", persona tiles) | Hireup, LWB | Visitors are different people (participant, family, coordinator, health professional); routing cuts confusion | "Who are you?" section with tiles for self / family / support coordinators and plan managers / health professionals, each leading to a relevant page (existing pages only) |
| 4 | **Service quick-link tiles with icon in a coloured circle** | LWB, NDIS | Scannable; icons help people with low literacy or cognitive load | Original line-icon set (24 px, 2 px stroke) in tinted circles; one icon per service |
| 5 | **A single dominant call to action per screen**, white or high-contrast pill on a coloured field | Yooralla, CPA, Hireup | Clear next step | One orange primary pill ("Make a referral") plus one outline secondary ("Call …") |
| 6 | **Trust line near the hero** ("Proudly NDIS registered since…") | Hireup | Registration status is the first thing coordinators check | Trust strip renders registration only when verified; never an invented statistic |
| 7 | **Friendly flat illustration of diverse people** instead of stock photography | NDIS | Inclusive without needing consent for each image | AblePoint uses an original abstract "gathering" motif drawn from its logo (people-around-a-point idea) and leaves real photography to consented, commissioned images; no generic overseas stock |
| 8 | **Rounded shapes, generous radius, soft panels** | Yooralla, CPA | Warm, approachable | 16–24 px radii, pill buttons, tinted panels |
| 9 | **Hero with large readable heading, short supporting line, single action**, image or illustration on one side | Yooralla, CPA | Fast comprehension on mobile | Split hero (text left, illustration right) collapsing to stacked on mobile |
| 10 | **Notice banners for time-sensitive information**, dismissible | NDIS, Yooralla | Keeps important updates visible without hijacking the page | Notice component for vacancies/availability updates; never a carousel |
| 11 | **Search and "Refer" affordances for returning professionals** | CPA ("Refer to CPA" tab), NDIS | Referrers are repeat visitors | Referral is the header CTA and sits in the mobile bar; no vertical side tab (not accessible on small screens) |
| 12 | **Mobile header: logo, phone icon, menu icon** | CPA | One-thumb access | Same, with 44 px targets |

## Things deliberately not copied

- **Carousels and auto-advancing hero sliders** (CPA, others): poor for accessibility and attention; AblePoint uses a static hero.
- **Cookie banners that cover half of a mobile screen** (Yooralla): AblePoint's banner is a compact top strip and only appears when analytics is configured.
- **Third-party accessibility overlays**: not used; real accessible markup and a small, local text-size/contrast control instead.
- **Large uppercase monospace display type** (LWB): reduces legibility for many readers.
- **Unstyled/slow mobile loads** (the NDIS mobile page rendered without CSS in our capture, likely because of blocked or lazy assets): reminder to keep critical CSS first-party and small.
- **Statistics banners** ("11,000+ clients"): AblePoint has no verified figures, so no numbers are shown.

## Design principles drawn from the research

1. Warm and human, never clinical or pitying. 2. Obvious next step on every screen (call or refer). 3. Plain English first; icons support, never replace, words. 4. Access features built in and visible. 5. Colour from the existing logo, used with accessible contrast. 6. Real people only with consent; illustration otherwise.

## Limits of this research

Five sites, home pages only, one visit each, one viewport pair; no usability testing, no analytics. Findings are directional. People with disability and referrers (coordinators, plan managers) should review the redesigned prototype before launch (queued; see `18-work-queue.md`).
