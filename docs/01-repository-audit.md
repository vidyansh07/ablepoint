# 01 — Repository and Source Audit

Date: 3 Nov 2026 · Scope: everything physically available to this session.

## 1. Workspace state

| Item | Finding | Label |
|---|---|---|
| `/Users/vidyansh/bikash` at session start | Empty directory. Not a git repository. No `package.json`, lockfile, or source. | Verified |
| Folder added during session | `/Users/vidyansh/bikash/themecrafter.com/zaver/` (540 files, 25 MB) | Verified |
| Relationship to `~/Downloads/ABLEPOINT.zip` | `diff -rq` against the zip's extracted contents: identical except macOS `.DS_Store`. The zip additionally holds `hts-cache/` and `hts-log.txt` (HTTrack metadata). | Verified |
| Roadmap file | `~/Downloads/ablepoint-growth-roadmap.html` (95,806 bytes). Not in the workspace; copied to `docs/source/` for traceability. Read in full. | Verified |
| Git history / branches | None (no repository). | Verified |
| Existing Astro / CMS / backend code for AblePoint | None exists. | Verified |

**Conclusion:** this is a greenfield project. There is no AblePoint codebase to audit; "repository audit" reduces to auditing the Zaver reference material.

## 2. What the "Zaver folder" actually is

Evidence: `hts-cache/doit.log`, `hts-cache/readme.txt`, `hts-log.txt`.

- Produced by **WinHTTrack 3.51-0**, launched 2 Nov 2026 21:25 against `https://themecrafter.com/zaver/` with filters for images/CSS/JS/fonts/video. (Verified)
- It is a mirror of the **public demo website** — i.e. the *output* of a WordPress + Elementor site, not the theme package a buyer downloads. (Verified)
- The mirror is **incomplete**: `hts-cache/interrupted.lock` is present; `hts-log.txt` records 22 errors (e.g. 404 on `/blog/service/ndis-support/`, 404 on `arrow-bg-left.png`, 400 on malformed `project-img*.jpg>"` URLs) and 350 mentions of HTTP 429 (rate limiting) with retries. Some images/pages are therefore missing. (Verified)
- Several "pages" are duplicates saved under hashed names (`index035f.html`, `index0c42.html` …) and recursive `https_/themecrafter.com/...` directories caused by HTTrack mis-parsing links. (Verified)

### Contents

| Type | Count | Notes |
|---|---|---|
| HTML | 218 | Rendered WordPress pages (home, home-02/03/04, about-us, service, our-team, our-pricing, contact-us, blog layouts, posts, categories, feeds) |
| JPG / PNG / SVG | 126 / 45 / 3 | ~15 MB under `wp-content/uploads` — demo stock photography |
| CSS | 42 | Theme, Bootstrap, Elementor-generated per-post CSS, plugin CSS, font CSS |
| JS | 22 | See dependency table |
| Fonts | woff2 30, ttf 5, woff 1, eot 1 | Font Awesome 5, a Flaticon custom icon font, Google Fonts (Outfit, Roboto, Roboto Slab) |
| JSON | 30 | WP oEmbed responses — not useful |
| PHP | 1 | `xmlrpc0db0.php` — an HTTrack-saved response, not theme code |

### Not present (so cannot be assessed)

PHP template files · SCSS/LESS sources · build tooling (`package.json`, webpack/gulp) · Elementor template/kit export JSON · Slider Revolution slider export · plugin source (`zaver-core`) · any LICENSE/readme/documentation file · theme demo-content XML · original (uncompressed, un-resized) images. **Blocked** until the purchased package is supplied.

## 3. Verified theme facts (from compiled output)

| Fact | Source | Label |
|---|---|---|
| Theme: *Zaver — NDIS Elderly & Disability Service WordPress Theme*, v1.2.0, author Theme Crafter | `wp-content/themes/zaver/style*.css` header | Verified |
| Declared theme licence header: **GNU GPL v3** | same header | Verified (header only; says nothing about bundled images, icon fonts or commercial plugins) |
| Page builder: Elementor 4.2.2; demo plugins: Slider Revolution 6.7.25, Contact Form 7 6.1.6, Mailchimp for WP, Redux framework 4.5.13, `zaver-core` | `<meta name="generator">`, `?ver=` query strings, plugin paths | Verified |
| Layout/CSS: Bootstrap (CSS 233 KB, JS 61 KB, uncompressed on disk) + theme CSS 122 KB + responsive 48 KB + style 41 KB; Elementor per-post CSS | file sizes | Verified |
| JS libraries: jQuery 87 KB + migrate, GSAP 71 KB + ScrollTrigger 40 KB, Popper 20 KB, Magnific Popup 44 KB, theia-sticky-sidebar 17 KB, Swiper, slicknav, Slider Revolution (rs6 416 KB + rbtools 165 KB) | file sizes | Verified |
| Typography via CSS variables `--tcr-body-ff`, `--tcr-ch-title-ff`, `--tcr-ch-subtitle-ff`; Google Fonts Outfit + Roboto + Roboto Slab; Font Awesome 5 Free; Flaticon custom font | theme CSS | Verified |
| Responsive breakpoints seen: 1640, 1200, 991, 945, 881, 767, 575, 442 px | `responsive*.css` | Verified |
| Demo home page: 115 KB HTML, 28 images (2 without `alt`), 1×`<h1>`, 8×`<h2>`, **no JSON-LD**, skip-link text present, 32 `aria-hidden` uses, contact form uses placeholders (`placeholder="Full Name"`) | grep over `index.html`, `contact-us/index.html` | Verified (label association not conclusively tested → Inferred that labels are absent) |
| Third-party hosts referenced by home | `fonts.googleapis.com` ×6, `fonts.gstatic.com`, `www.youtube.com` | Verified |

### Initial technical risks for reuse

- The stack (Bootstrap + jQuery + GSAP + Slider Revolution + Elementor runtime) contradicts the performance budget (Lighthouse mobile ≥ 90, minimal JS). Slider Revolution alone is ~580 KB of JS before gzip. (Inferred: needs measurement on the real package.)
- Icon font + Font Awesome 5 would ship hundreds of unused glyphs. (Inferred)
- Demo content is generic aged-care/disability imagery from overseas stock; AblePoint needs its own. (Verified for images being demo; origin not checked.)
- Elementor-generated CSS is per-post and not portable; layout would have to be re-authored in Astro regardless. (Inferred)

## 4. Items for the next audit pass (not done)

1. Receive and hash the purchased theme ZIP; read its licence and the marketplace item licence terms (regular vs extended).
2. Inspect real HTML/CSS/JS source (if the package ships a static HTML version as the prompt states: "HTML, CSS, JavaScript, assets") and run a licence scan on bundled fonts/icons/images.
3. Lighthouse and axe on the supplied static pages in a local server.

## 5. Constraints and technical risks recorded

| ID | Risk | Mitigation |
|---|---|---|
| R-SRC-1 | Planning on a scraped demo instead of the licensed package could lead to using assets we are not licensed to redistribute | Do not copy any asset from the mirror into the AblePoint repo; treat it as a visual reference only until the package + licence are confirmed |
| R-SRC-2 | Scraped HTML includes third-party tracking/CDN calls | Never serve the mirror; keep it outside the repo |
| R-SRC-3 | `hts-log.txt` may contain sensitive crawl info (HTTrack warning in `readme.txt`) | Not copied into the repo; stays in Downloads |
