# AblePoint Australia — web platform

Static-first Astro site (TypeScript strict) for AblePoint Australia. Planning pack: [`docs/`](docs/README.md). Implementation status: [`docs/15-implementation-status.md`](docs/15-implementation-status.md).

```
apps/web/            Astro public site (staging-first; nothing here deploys to production by itself)
packages/schemas/    Zod contracts + governance rules (enquiry, content gate, vacancy lifecycle, redirects)
docs/                Planning, audit, architecture, evidence
```

## Commands

```sh
pnpm install
pnpm dev                                  # local dev server
pnpm --filter @ablepoint/web build:staging   # staging build (noindex, drafts visible, no sitemap)
pnpm --filter @ablepoint/web lint:dist       # static checks on dist/ (set PUBLIC_SITE_ENV to match the build)
pnpm test                                 # unit tests (schemas + web)
pnpm --filter @ablepoint/web check        # astro check (types)
pnpm --filter @ablepoint/web test:e2e     # Playwright + axe on every built route (needs Google Chrome installed)
```

## Environments

`PUBLIC_SITE_ENV=production|staging|development` (see `apps/web/.env.example`).
Production builds render **only** content whose compliance approval is current (`reviewState: approved`, `approvedBy`, `approvedAt >= updatedAt`). All content ships as `draft`, so a production build intentionally has almost no pages until a named reviewer approves content. Non-production builds show drafts with a visible banner, add `noindex`, disallow all in `robots.txt` and emit no sitemap.

`apps/web/vercel.json` is generated (`pnpm --filter @ablepoint/web gen:vercel`) and committed in its **staging-safe** form (noindex header on). Regenerate with `gen:vercel:production` only at an approved cutover.

## Rules

No participant data in this repository, build output, logs or analytics. No production deploy, DNS change or live integration without explicit owner approval (docs/12 release gates). The `themecrafter.com/` Zaver demo mirror is git-ignored and must not be copied into the repo.
# ablepoint
# ablepoint
# ablepoint
