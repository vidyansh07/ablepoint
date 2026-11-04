# 19 — Creative Sourcing: Illustration, Icons, Banners, Animation, Photography

Date: 3 Nov 2026. Licence facts were read from official pages by research agents on this date; **not legal advice**; re-read each licence before publishing anything. "NOT VERIFIED" means the page could not be read and nothing was assumed.

## Decision summary

| Need | Decision | Why |
|---|---|---|
| Icons | **Lucide** (ISC; Feather-derived icons MIT), integrated via `lucide-static`, notices in `/third-party-notices.txt` | Verified commercial-use licence, 1,600+ consistent 24 px icons, tree-shaken at build (no client cost) |
| Illustration and banners | **Original SVG artwork** (done): home scene, 5 banner scenes, 7 regional vignettes. **Plan a commissioned set** from a disability-led Australian illustrator as the long-term brand asset | Original work is licence-clean, on-brand, animatable, tiny (2–6 KB each). Generic free libraries are widely seen on other sites and rarely represent disability well |
| Animation | **CSS and SVG only** (one-time entrances, micro-interactions, view transitions, scroll progress); no Lottie/Rive/GSAP runtime | Zero JavaScript weight, full `prefers-reduced-motion` control, WCAG 2.2.2 and 2.3.1 by construction |
| Photography | **Real, consented AblePoint photography**; no free stock photos of people with disability | Unsplash and Pexels licences do not clear identifiable people (no model-release grant) |
| Easy Read pictures | Commission or license a purpose-made set; do not use non-commercial symbol sets | ARASAAC terms not verified; Mulberry and OpenMoji are share-alike |

## 1. Icons and pictograms

| Source | Licence (read 3 Nov 2026) | Commercial use | Obligations | Verdict |
|---|---|---|---|---|
| **Lucide** (lucide.dev; GitHub LICENSE) | ISC; some Feather-derived icons MIT | Yes | Keep the copyright and permission notice in copies | **YES. In use** |
| Phosphor (github.com/phosphor-icons/core) | MIT, 1,200+ icons, several weights incl. duotone | Yes | Keep notice | YES (alternative if a duotone/weights style is wanted) |
| Tabler Icons (github.com/tabler/tabler-icons) | MIT; 6,257 icons, 24 px grid, 2 px stroke | Yes | Keep notice | YES (alternative) |
| Heroicons (github.com/tailwindlabs/heroicons) | MIT | Yes | Keep notice | YES |
| Material Symbols | Repo is Apache 2.0; the Google Fonts page was unreadable | Likely yes | Keep licence and notices | NOT VERIFIED for Material Symbols specifically |
| Mulberry Symbols (mulberrysymbols.org) | CC BY-SA 4.0 | Yes, with attribution; modified symbols must be shared under the same licence | Attribution; share-alike; do not charge for the symbols themselves | CONDITIONAL |
| OpenMoji (openmoji.org/faq) | CC BY-SA 4.0 | Yes ("even commercially") | Attribution; share-alike | CONDITIONAL |
| Widgit Symbols (widgit.com) | Commercial licence by request ("often free or very low-cost" for a few symbols with acknowledgement) | Negotiated | Licence required | CONDITIONAL (enquire: copyright@widgit.com) |
| ARASAAC, Photosymbols, "Change" picture bank | Pages unreadable or URL unknown | NOT VERIFIED | | NOT VERIFIED. Do not use until read |

## 2. Illustration and commissioning

Free libraries (read 3 Nov 2026):

| Library | Licence | Verdict |
|---|---|---|
| unDraw | Free incl. commercial, no attribution; no competing library, no AI/ML training | YES (generic style) |
| Open Peeps, Open Doodles, Humaaans | CC0, free for commercial use, no credit | YES (character-based styles; check representation) |
| Storyset (Freepik) | Free but **credit required** unless Flaticon Premium | CONDITIONAL |
| ManyPixels | Commercial, no attribution; licence text truncated when read | CONDITIONAL |
| Disabled And Here (affecttheverb.com) | CC BY 4.0 with credit ("[ARTIST] for Disabled And Here"); disability-led photo and illustration collection | CONDITIONAL (credit; check each image) |

**Recommendation:** do not use generic free characters as the brand's main imagery. Commission a disability-led Australian illustrator for a small, owned set (hero, 4 spot scenes, Easy Read pictures) and keep the current original art until it arrives.

Where to find illustrators (leads from search; none contacted, no commitments made):

| Lead | What it is | Notes |
|---|---|---|
| **Studio A** (studioa.org.au; licensing page; phone 02 9439 1281; hello@studioa.org.au) | Sydney supported studio for professional artists with intellectual disability; licenses and commissions artwork for webpages, advertising and documents | Licensed, not free; no prices or terms on the page read; enquire. Strong values fit for an NDIS provider |
| **ADNA** (Australian Disability Network for the Arts) | National network (supported by Creative Australia) opening commissions for artists with disability | Check its channels for current opportunities; terms not read |
| **Illustrators Australia** (illustratorsaustralia.com; Find an Illustrator) | Non-profit professional association; connect directly with members; each sets own terms | Not an agency |
| **ASA Style File** (asastylefile.com) | Curated portfolio site run by the Australian Society of Authors | Application-based; curated |
| Accessible Arts NSW (aarts.net.au) | Peak arts and disability body in NSW | A route into the community; no commission programme confirmed |

Guidance on portraying disability (republished PWDA guidance via the Commons Social Change Library, plus ADCET): avoid pity or "helpless" imagery; avoid staged or exaggerated poses; show a range of disabilities including invisible ones; show people on equal footing with others; give images meaningful alt text; people with disability should not be spoken for. The primary PWDA page could not be loaded (DNS failure for pwda.org.au; the organisation's domain appears to be pwd.org.au, unverified): **read the primary source before writing the final brief.**

### Illustrator brief (draft, for owner approval)

Scope: one flexible character-free-or-character illustration system for AblePoint (home hero, services, vacancies, guides, referral) plus 8–12 Easy Read pictures; formats SVG (layered) and PNG; delivered with a written licence for perpetual, worldwide, commercial web and print use by AblePoint, modification rights, and credit if the artist wishes. Palette: the brand tokens in `17-brand-guidelines.md`. Principles: dignity, agency, everyday moments, diversity of ability and background; nothing that implies pity or superhuman achievement. Accessibility: art is decorative; meaning is carried by text. Budget and timeline: to be set by the owner after quotes.

## 3. Banners and imagery (what exists now)

Original, animated, decorative SVG (`src/components/art/`): `BannerArt` scenes services, locations, vacancies, guides, referral (4.9–6.5 KB each); `RegionArt` vignettes for the six regions plus default (2.2–3.8 KB each); `HeroArt` home scene; `Ring` brand device. No people, no text, no traced material. **Regional staff should review the cultural cues** (guitar for Tamworth, koala for Gunnedah, lighthouse and ship for Newcastle, orchards for Orange) before publication. Cultural motifs of Aboriginal and Torres Strait Islander peoples are deliberately **not** used; any such work must be commissioned from and led by First Nations artists with consent.

Photography: real AblePoint people, homes and regions with written consent (`06-cms-content-model.md` consent fields). Stock options found but not cleared: Getty "This Is Australia" / Starting with Julius disability collection (licence type **NOT VERIFIED**), MiAccess image library (not read), Unsplash and Pexels (commercial use allowed, but the licences exclude or do not clear recognisable people and give no model release).

### Photos now on the site (owner decision 3 Nov 2026: "use online available photos")

Six regional landscape photographs from **Wikimedia Commons** (open licence API, licence read per file), used as credited, licensed placeholders on the region pages: Central Coast (Terrigal sea cliffs, CC0), Newcastle (Nobbys Lighthouse from Fort Drive, CC BY-SA 4.0), Dubbo (Macquarie River/Wambuul, CC BY-SA 4.0), Orange (Cook Park bandstand, CC BY-SA 4.0), Tamworth (lookout view, CC BY-SA 3.0), Gunnedah (Namoi River, CC BY-SA 3.0). Each is listed in `src/data/photos.generated.json` and the `/image-credits/` page with creator, licence and source; each page shows a credit line under the photo. Share-alike (SA) photos are resized and cropped for the web; per the licences, those adapted copies are shared under the same licence, which does not affect the rest of the site. A Gunnedah candidate was rejected because its author could not be identified.

**Why no photos of people yet.** Pexels blocks automated access (Cloudflare 403, not circumvented), and Unsplash and Pexels licences do not clear recognisable people (no model release; Pexels says it does not warrant consents). Showing a stock photo of a person in a disability-services context can also imply that person is an AblePoint participant or worker, which conflicts with guardrail G-04. If photos of people are wanted before real photography exists, license from a library with model releases (for example the Getty "This Is Australia" disability collection, licence terms to be read) and never present stock people as AblePoint participants or staff.

## 4. Animation

Verified: Lottie "Simple License" permits commercial use without attribution (competing-service restrictions apply); GSAP's standard licence (30 Apr 2025) is free for commercial use including former paid plugins. Rive and Motion licence pages returned 404 (NOT VERIFIED). **None are used**: the same polish is achieved in CSS and SVG with no runtime.

Browser support (MDN, 3 Nov 2026): `@view-transition` is not Baseline (limited availability; used as progressive enhancement); `animation-timeline` is Baseline 2026 (used for the guide reading-progress bar, with `@supports`); `prefers-reduced-motion` is widely available.

WCAG 2.2: 2.2.2 requires a pause/stop/hide mechanism for auto-starting motion lasting more than 5 s; 2.3.1 forbids more than three flashes per second; 2.3.3 (AAA) lets users disable interaction animation. AblePoint's rules (enforced by `tests/e2e/motion.spec.ts`): every animation finite, ≤ 2.2 s, transform/opacity only, none running after 5 s, zero animations under reduced motion, scroll-reveal fails open.

## 5. Easy Read

The Australian Government Style Manual (stylemanual.gov.au) covers Easy Read layout and style and recommends involving people from the target group when writing, designing and testing, and working with an Easy Read professional on images; Inclusion Australia publishes "A Guide to Commissioning Easy Read Resources". The page here is a draft pattern only: **commission Easy Read writing and illustration, and have it tested by people with intellectual disability, before approval.**

## 6. Decisions needed

1. Commission a disability-led illustrator (Studio A and ADNA first)? Budget and timeline.
2. Approve contacting Studio A (and one or two others) for quotes. Nothing has been sent.
3. Approve Lucide as the permanent icon set (alternatives Phosphor, Tabler are drop-in).
4. Photography consent process and photographer.
5. Regional staff review of the six regional vignettes.
