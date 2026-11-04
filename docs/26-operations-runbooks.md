# 26 — Operations Runbooks (draft)

Date: 3 Nov 2026. Status: **draft procedures, none rehearsed.** They describe how the platform is meant to be run once accounts exist (`25` phases C to I). Each one must be rehearsed on staging with synthetic data before gate G3, and the privacy runbook needs the privacy adviser's review. Where a step depends on a product feature that has not been checked (for example Vercel rollback behaviour), it says so.

Roles used: **Owner** (executive approvals), **Compliance owner** (named, on the reviewer list), **Reviewer** (NDIS-experienced, on the reviewer list), **Editor** (writes content), **Operations lead** (vacancies, regional facts), **Engineer**.

## R1. Publish or change content

**Trigger:** a new post, guide, service or region change, or a correction.

1. Editor (or an automation) creates a draft. Automation may only open a pull request with a draft file; it cannot approve or merge.
2. CI runs `content:ingest --dry-run`, `content:verify`, type checks, tests and the banned-wording lint. A failing gate blocks the merge.
3. Reviewer reads the protected preview, checks every fact against its source, and checks wording against `docs/17` §7 and `docs/10` §5.2.
4. Compliance owner approves. The approval stores a hash of the exact content; any later edit withdraws the approval.
5. Merge. The production build shows the item only if the hash is current and the approver is on `reviewers.json`.
6. After deploy, the engineer (or the IndexNow workflow) pings IndexNow for the new URL. Google discovers it through the sitemap.
7. Record the change in the change log (who, what, when, source).

**Done when:** the page is live, its approval is current, and the preview and production text match.

## R2. Update a vacancy

**Trigger:** a bed becomes free, is held, or is filled; or the weekly check.

1. Operations lead confirms the current position with the home. Never publish a vacancy that has not been confirmed.
2. Set the status and `lastVerifiedAt` today. Statuses are `available`, `unconfirmed`, `temporarilyUnavailable`, `noLongerAvailable`.
3. A vacancy not verified for 14 days is shown as "unconfirmed" automatically, and the staleness monitor alerts the owner of the home.
4. When a person is placed, change the status the same day and keep no personal detail about the person anywhere in the record.

**Done when:** the public page and the API show the same status and verification date.

## R3. Correct or withdraw wrong content quickly

**Trigger:** anyone reports an incorrect or unsafe statement (for example a wrong claim about funding, a wrong phone number, a photo problem).

1. Engineer or compliance owner sets the item's review state back to draft (or removes the offending paragraph). This withdraws the approval automatically.
2. Rebuild and deploy. In production the item disappears from pages, the sitemap, the feed, the API and `llms.txt`.
3. If a search result still shows it, request removal in Search Console (needs access) and ping IndexNow for the URL.
4. Compliance owner decides whether the error needs a notice to anyone affected. Record the cause and the fix.

**Target:** removal deployed the same business day. This is an intention, not a verified capability.

## R4. Roll back a bad deployment

**Trigger:** the site is broken, shows content it should not, or headers are wrong.

1. Use the host's rollback to the previous good deployment (Vercel provides rollback to an earlier deployment; **behaviour, plan limits and exact steps are to be confirmed when the account exists**).
2. Run the post-deploy checks: home, a service, a region, `/referral/`, `/robots.txt`, `/sitemap.xml`, `/api/v1/index.json`, security headers.
3. Open an incident note: what failed, how it was found, time to recover, and the test that would have caught it.
4. Add that test before the next release.

**Never:** change DNS or the production domain during an incident without the owner's written approval.

## R5. Suspected privacy incident (skeleton, needs adviser review)

**Trigger:** any sign that personal information may have been seen by the wrong person, sent to the wrong place, or exposed (for example a referral email sent to the wrong address, a log containing personal details, an analytics event carrying a name).

1. Contain: stop the flow (disable the form or automation, revoke the token, remove the exposed file). Do not delete evidence.
2. Tell the compliance owner and owner immediately.
3. Record what happened, what information, how many people, and for how long. Do not copy the personal information into the incident note.
4. The compliance owner and privacy adviser assess whether the Notifiable Data Breaches scheme applies (generally: an eligible breach likely to cause serious harm needs notification to the OAIC and affected people; the law allows 30 days to assess a suspected breach, but act as fast as possible). They also decide whether NDIS Commission reporting duties apply to AblePoint as a registered provider.
5. Fix the cause and add a test or control.
6. Review after 30 days.

This runbook is a prompt for the adviser, not legal advice.

## R6. Change control for advertising

**Trigger:** any new campaign, ad, audience, tag or conversion.

1. Check the change against `docs/10` §5. Anything that sends data to an ad platform, builds an audience, or names a health or disability attribute is refused unless the compliance owner has approved it in writing.
2. Compliance owner approves ad copy and the landing page.
3. Owner approves spend. The monthly ceiling is A$500 and campaigns have a hard monthly stop.
4. Log the change (date, who, what, why).
5. Weekly: read the search-term report, add negatives, pause anything irrelevant or non-compliant.

**Pause immediately if:** capacity ends in the target region, a policy changes, an ad is flagged, or cost per qualified enquiry is clearly out of range after enough data (see `docs/10` §1).

## R7. Add or remove a reviewer, editor or other access

**Joiner:** the owner approves in writing. The engineer adds the person to the CMS role they need and nothing more. A reviewer is added to `reviewers.json` through a pull request that the compliance owner approves (CODEOWNERS). Multi-factor authentication is required for every account.

**Leaver or role change:** remove access the same day (CMS, GitHub, hosting, analytics, ads, Google Business Profile, n8n, shared mailbox). If the person was a reviewer, remove them from `reviewers.json`; content they approved remains valid only if the owner confirms it.

**Quarterly:** compare the access list with the real team.

## R8. Quarterly review

1. Re-read the Google, Meta, OAIC and NDIS Commission policy pages that `docs/10` §5 relies on, and note any change.
2. Re-run a competitor sitemap check (Mable, Hireup, and two or three regional providers).
3. Re-run accessibility checks (automated plus a manual keyboard and screen-reader pass of the main journeys).
4. Update dependencies; keep TypeScript on 6.x until `@astrojs/check` supports 7. Review the dependency bot's pull requests.
5. Rotate secrets and keys that have a rotation schedule.
6. Review traffic, referrals and enquiries against `docs/25` §9. Drop or rewrite weak pages.
7. Check that every published fact (registration number, address, phone, vacancy practice, response approach) is still true.

## R9. Backups and restore (applies once the intake database exists)

Not built. When it exists: automated encrypted backups in an Australian region, a documented restore, and a **restore test before go-live and then twice a year**. The CMS dataset is exported on a schedule to a private location. Content in this repository is the second copy of anything published.

## What these runbooks do not cover

Legal advice, the intake platform's own operations (to be written with the platform: key management, malware-scan failures, retention runs), and on-call arrangements for a team larger than one engineer.
