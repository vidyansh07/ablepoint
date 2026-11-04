# 17 — AblePoint Brand and UI Guidelines (v1, 3 Nov 2026)

Status: proposed for owner approval. Derived from the **existing AblePoint logo, which is preserved unchanged**. Everything else (palette tokens, type, illustration, icons) is new. The implementation in `apps/web` follows this document; if the two disagree, this document is the source of truth and the code should be fixed.

## 1. Logo

The current logo (public website, Nov 2025 upload) is a ring of rounded "A" letters in green, plum, orange and blue arranged around a blue dot, followed by the wordmark "Ablepoint" in a soft steel-blue rounded sans.

| Rule | Guideline |
|---|---|
| Use | Use the supplied logo artwork as is. Never redraw, recolour, outline, add effects, stretch, rotate or re-typeset the wordmark. |
| Files | Only a 512 × 141 px JPG (white background) and a 270 px square icon crop exist. **A vector master and a one-colour version are still needed from the owner.** Until then the logo appears on white or very light backgrounds only; on dark backgrounds it sits on a white rounded plate. |
| Size | Minimum width 120 px on screen. Header display 200–220 px wide (artwork is 512 px wide, so retina-sharp up to 256 px). Do not upscale beyond 256 px. |
| Clear space | At least half the logo's height on every side; nothing may overlap the ring or wordmark. |
| Background | White, paper (#FBF9F6) or tints of the brand colours with a plate. Never on photography without a plate. |
| Favicon / app icon | Cropped ring from the logo (no wordmark), on white. |
| Name in text | The logo reads "Ablepoint"; the owner's brief writes "AblePoint". **Open question for the owner:** which spelling is official. Until answered, running text uses "AblePoint Australia" and the logo is untouched. |

## 2. Colour

Brand hues come from the logo. Logo colours are mid-tones and fail contrast as text, so each hue has deeper tokens for UI. Ratios are measured against white (WCAG 2.2 AA needs 4.5:1 for text, 3:1 for large text and UI components).

| Role | Token | Hex | Contrast on white | Use |
|---|---|---|---|---|
| Logo blue (decorative) | `--blue-500` | #6785AB | 3.8 | Illustration, ring, large shapes only. Not for text |
| Primary blue | `--blue-700` | #2C5282 | 8.0 | Links, secondary buttons, icons |
| Deep blue | `--blue-900` | #1E3553 | 12.4 | Headings, footer background |
| Blue tint | `--blue-100` / `--blue-50` | #E6EDF6 / #F3F6FB | | Panels |
| Logo orange (decorative) | `--orange-500` | #D0976E | 2.5 | Illustration only |
| Action orange | `--orange-700` | #B14A12 | 5.4 (white text on it) | Primary buttons |
| Action orange hover | `--orange-800` | #9A3F0E | 6.8 | Hover/pressed |
| Orange tint | `--orange-100` | #FBEBDD | | Highlights |
| Logo plum (decorative) | `--plum-500` | #7C5889 | 5.8 | Illustration, tags |
| Deep plum | `--plum-800` | #4B2F56 | 11.4 | Accent text/icons |
| Plum tint | `--plum-100` | #EFE7F3 | | Panels |
| Logo green (decorative) | `--green-500` | #BDCC7E | 1.7 | Illustration only |
| Deep green | `--green-800` | #44591A | 7.8 | Success, "available" |
| Green tint | `--green-100` | #F0F4DC | | Panels |
| Ink | `--ink` | #1B2433 | 15.6 | Body text |
| Muted ink | `--muted` | #4B5568 | 7.5 | Secondary text |
| Paper | `--paper` | #FBF9F6 | | Page background |
| Line | `--line` | #D8DDE6 | | Borders (non-essential) |
| Focus | `--focus` | #0B57D0 | 6.4 | Focus ring, 3 px + 3 px offset |

Rules: orange is reserved for the single primary action on a screen and a few small highlights; blue carries structure; plum and green are accents. Never convey meaning by colour alone. All text/background pairs used in the UI are checked in `apps/web/tests/contrast.test.ts` (build fails if one drops below AA). A **high-contrast mode** (user toggle) switches to ink on white with 7:1+ for everything and 2 px solid borders.

## 3. Typography

- **Typeface:** Atkinson Hyperlegible (SIL OFL; designed by the Braille Institute for low-vision legibility), self-hosted, Latin subset, weights 400 and 700. One family keeps pages fast and clear; warmth comes from colour, shape and illustration.
- **Scale (fluid):** 14–15 / 17–19 (body) / 20–23 / 24–31 / 30–44 / 36–56 px. Line height 1.6 body, 1.2 headings. Reading measure 68 characters.
- **Rules:** sentence case everywhere (no all-caps headings), left-aligned (no justified text), headings never skip levels, links underlined, minimum 17 px body. User text-size control scales the whole interface (100 / 115 / 130 %).

## 4. Shape, space, elevation

Radius: 8 (controls), 16 (cards), 24 (panels), 999 (buttons). Spacing: 4 px base grid. Container 72 rem, gutter 16–32 px. Elevation: one soft shadow for cards; no heavy gradients. Targets at least 44 × 44 px.

## 5. Illustration and graphic device

- **The Gathering** (signature graphic): a ring of rounded pills in the four brand hues around a central dot, an original device that echoes the logo's "people around a point" idea without redrawing the logo. Used large and cropped in heroes, small as a section marker, and as the favicon-adjacent pattern. Decorative: always `aria-hidden`.
- **Spot illustrations:** simple geometric scenes (home with ramp, path, sun, plants) in brand tints. No cartoon people. Real people appear only as photographs.
- **Icons:** Lucide (ISC), 24 px grid, 2 px round stroke, one metaphor per service, always paired with a text label. Mapped by semantic name in `apps/web/src/components/Icon.astro`; notices in `/third-party-notices.txt`.
- **Banners and regional vignettes:** original SVG scenes in `apps/web/src/components/art/` (`BannerArt`, `RegionArt`): decorative, no people or text, one-time entrance only. See `19-creative-sourcing.md`.

## 5b. Motion

Purposeful and quiet. One-time entrances (≤ 1.6 s), micro-interactions (≤ 0.2 s), cross-page view transitions (progressive), a scroll-driven reading bar on guides. Transform and opacity only; nothing loops or flashes; everything disappears under `prefers-reduced-motion`; scroll-reveal fails open. Rules are enforced by `tests/e2e/motion.spec.ts`.

## 6. Photography (when supplied)

Real AblePoint participants, workers and homes in New South Wales, photographed with **written consent** recorded in the CMS (`mediaAsset` consent status). Natural light, eye-level, people doing things (not posed for pity), diverse ages and abilities, no stock overseas imagery, no images of people in vulnerable moments. Alt text describes the activity, not the disability. Until photographs exist the site uses illustration only; no empty photo placeholders ship to production.

## 7. Voice

Plain English (Year 8 reading level), warm, direct, respectful. "You" and "we". Say what happens next and when. Avoid jargon without explanation (spell out SIL, SDA, STA on first use), pity language ("suffering from", "confined to"), superlatives and unverifiable claims, and NDIS "approved/endorsed" wording. Use the person's preferred language (person-first or identity-first) where known. Offer Easy Read and alternative formats.

## 8. Components (all built in `apps/web`)

Header with phone pill and access tools; hero (split, with Gathering art); audience tiles; service tiles with icon circles; region cards; vacancy cards and empty state; steps; FAQ (native `details`); notice and draft banners; forms (visible labels, error summary, 44 px controls); consent strip; footer with logo plate; mobile action bar. Motion: none required; transitions ≤ 150 ms and disabled under `prefers-reduced-motion`.

## 9. Accessibility commitments baked into the UI

WCAG 2.2 AA target; keyboard operable; visible focus; skip link; landmarks; labels; error summaries; reduced motion; forced-colours support; user text-size and high-contrast controls (persisted in the browser, never sent anywhere); no auto-playing media or carousels. Automated checks run in CI; manual screen-reader and user testing are queued, not done.

## 10. Do and don't

Do use deep blue for headings and the orange pill for the one main action. Do keep illustration decorative. Don't use logo-tone colours for text, put the logo on busy imagery, show statistics we cannot prove, or ship placeholder photos.
