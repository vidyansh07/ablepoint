# 03 — Zaver Theme Assessment (provisional)

**Status: provisional.** The licensed Zaver package has not been supplied (see 01). This assessment is based on the public-demo mirror only. Per the brief, nothing here claims inspection of the licensed source. The decision below should be re-confirmed within a day of receiving the package.

## 1. Evidence base

| Question | What the mirror shows | Label |
|---|---|---|
| Layout system | Bootstrap grid + Elementor sections; CSS variables for typography (`--tcr-*`) | Verified |
| CSS architecture | Monolithic `theme.css` (122 KB) + `responsive.css` + Bootstrap (233 KB) + per-page Elementor CSS | Verified |
| JS dependencies | jQuery (+migrate), GSAP + ScrollTrigger, Popper, Bootstrap JS, Magnific Popup, Swiper, slicknav, theia-sticky-sidebar, Slider Revolution | Verified |
| Components worth studying | Header/mega-nav, service cards, team cards, pricing table, testimonial blocks, process steps, blog grid/classic layouts | Verified (rendered) |
| Forms | Contact Form 7 + Mailchimp plugin; placeholders as labels in the contact form | Verified / Inferred (labels) |
| Fonts/icons | Outfit, Roboto, Roboto Slab (Google Fonts); Font Awesome 5; Flaticon custom collection | Verified |
| Images | ~126 JPG demo photos (generic care imagery) | Verified; **rights unknown** |
| Accessibility | Skip-link text present; many `aria-hidden`; 2 images without `alt` on home; heading outline fine on demo home (1×H1) | Verified; full a11y audit **Not run** |
| Performance | Heavy legacy stack; Slider Revolution ≈ 580 KB JS uncompressed | Verified sizes; load timings **Not run** |
| Licence | Theme header says GPL v3. Marketplace/regular-vs-extended licence, bundled commercial plugins (Slider Revolution, possibly Elementor Pro widgets), icon fonts and images are separate questions | Header Verified; rest **Blocked** |

### Licence questions to resolve before any reuse

1. Which marketplace licence was bought, and does it cover a client's production site (AblePoint) built by a third party?
2. GPL v3 applies to the theme's PHP/WordPress code. Does the author declare a split licence (code GPL; images/fonts proprietary)? Photography almost never transfers.
3. Do we have the right to redistribute converted CSS/markup in an Astro repo that may be private or shared with the client?
4. Slider Revolution, Elementor Pro features, Flaticon and Font Awesome have their own terms. We will use none of them (see decision).

## 2. Options

- **Option A — Direct visual conversion.** Port Zaver's HTML/CSS into Astro with minimal change.
- **Option B — Selective component reuse.** Keep proven layout patterns and some CSS, rebuild every component in Astro with our own tokens, drop all jQuery/GSAP/slider code.
- **Option C — Custom design implementation.** Original AblePoint design system; Zaver used only as a pattern reference for information density and section ordering.

## 3. Weighted decision matrix

Scores 1 (poor) – 5 (excellent), higher is better; "dev complexity" and "effort" are scored as ease. Weights sum to 100. Scores are judgement calls by the author, not measurements; the margin between B and C is within that uncertainty.

| Criterion | Weight | A | B | C |
|---|---:|---:|---:|---:|
| Branding suitability (premium, Australian, human-centred) | 10 | 2 | 4 | 5 |
| Accessibility (WCAG 2.2 AA achievable) | 15 | 2 | 4 | 4 |
| Performance (JS/CSS weight, LCP/INP) | 15 | 1 | 4 | 5 |
| Technical debt | 10 | 1 | 4 | 4 |
| Security (fewer third-party libs, no legacy jQuery plugins) | 10 | 2 | 4 | 5 |
| Development complexity (ease) | 5 | 3 | 3 | 2 |
| Long-term maintenance | 10 | 2 | 4 | 4 |
| Licence compatibility / clarity | 10 | 2 | 3 | 5 |
| Content-editing fit (CMS-driven sections) | 5 | 3 | 4 | 4 |
| Estimated effort (ease) | 10 | 4 | 3 | 2 |
| **Weighted score (/100)** | | **41** | **75** | **83** |

Calculation: Σ(score × weight) ÷ 5. A = 205/5, B = 375/5, C = 415/5.

## 4. Recommendation

**Option C (original AblePoint design system), informed by Zaver's layout and information architecture; adopt B-style reuse only for specific patterns once the licensed package and its licence are confirmed.**

Reasons:
- Option A fails the performance and accessibility targets by construction (Bootstrap + jQuery + GSAP + slider) and carries the highest licence uncertainty.
- The brief asks for a completely new design with a redesigned palette and preserved logo; the demo's look (generic aged-care imagery, Roboto/Outfit, Bootstrap look) is not a differentiator.
- C's cost is design/build effort. Mitigation: build a small token-based system first (colours, type scale, spacing, 12 components) and review it with the owner before page work.
- If the package is later confirmed to include a clean static HTML/CSS build with permissive terms, re-score B; a switch would not change architecture, only Phase 1 effort.

**Nothing from the demo mirror is to be copied into the AblePoint repo** (images, icon fonts, CSS). Colours, fonts and imagery will be selected fresh (fonts self-hosted, subsetted, with licence recorded).

## 5. Design-system outline (to be built in Phase 1 after approval)

Tokens: colour (semantic: surface, text, brand, accent, success/warn/error, focus), type scale (fluid, 1.2 ratio), spacing (4-pt base), radius, shadow, container widths (reading width 68ch; layout 1200 px), motion (reduced-motion aware). Components: header/nav with mobile menu (no-JS fallback), sticky mobile CTA bar (Call · Refer), hero, service grid/card, region card, vacancy card, FAQ accordion (`<details>`), process steps, trust strip (registration), footer, form controls with visible labels and error summary, alerts, table, breadcrumb, pagination. Targets: WCAG 2.2 AA (focus appearance, target size ≥ 24 px — aim 44 px, accessible authentication, redundant entry), contrast ≥ 4.5:1 text, Easy Read variant templates.

Palette direction (proposal only): warm, high-contrast; avoid the demo's colours; keep logo untouched (logo file not yet provided; **Blocked**: need vector logo and brand guidelines).
