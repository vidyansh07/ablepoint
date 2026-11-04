## What this changes and why

<!-- One or two plain sentences. Link the work item or decision if there is one. -->

## Checklist

Tick each box, or write "not applicable" and say why.

- [ ] **No real participant data.** Code, content, fixtures, screenshots and logs use synthetic data only (names, NDIS numbers, phone numbers, emails, addresses, case details).
- [ ] **No unverified claims.** Nothing invented or assumed: testimonials, certifications, staff, addresses, vacancies, prices, response times, statistics. Unknown facts are shown as unknown.
- [ ] **Banned wording lint is clean.** `pnpm --filter @ablepoint/web build:staging` then `pnpm --filter @ablepoint/web lint:dist` pass. No "NDIS approved" or "endorsed", no superlatives, no guarantees, no eligibility certainty.
- [ ] **Content approval hash.** If any post, guide or other approved content changed, the approval was recorded again by a named reviewer on the reviewer list (`content:approve`), and `content:verify` passes. Automation and drafts are never self-approved.
- [ ] **Accessibility check.** Keyboard-only pass, visible focus, labels, contrast and reduced motion checked for anything visual. The axe tests pass. A manual screen-reader pass is noted if the change affects interaction.
- [ ] **No tracking on form pages.** `/referral/` and the intake path carry no analytics or ad tags. Ad platforms receive only neutral events (`docs/10` section 5.1).
- [ ] **Checks run.** `pnpm -r check` and `pnpm -r test` pass.

## Evidence

<!-- Passed, Failed, Blocked or Not Run, with what you ran. Do not write "should work". -->
