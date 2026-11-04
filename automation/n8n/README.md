# n8n workflow exports

NOT imported into or tested on a running n8n instance. These files were written from n8n's documentation and source code. They have never been loaded into n8n, never been run, and never connected to any account. Treat them as a careful first draft that a person must import, check node by node, and test before anything is switched on.

## Purpose

Four workflows from the plan in `docs/21-agent-api-and-content-pipeline.md` (sections 2 and 3) and `docs/25-final-master-plan.md` (section 5.4):

| File | What it does | What it must never do |
|---|---|---|
| `workflows/blog-draft-to-pull-request.json` | Weekly or manual. Checks the public search index for similar content, asks a language model for a draft in the `blogDraftSchema` shape, runs cheap pre-checks, creates a branch, writes `apps/web/content-drafts/<slug>.json`, opens a pull request titled "Draft: <title>", and emails the reviewer. | Publish, merge, approve, edit existing content, read participant data, or put personal data in a prompt. |
| `workflows/post-deploy-indexnow.json` | A signed webhook from the deploy pipeline. Verifies the signature, refuses to run unless `SITE_BASE_URL` is the production host, reads `/sitemap.xml`, and tells IndexNow (Bing family, Yandex, Seznam, Naver, Yep; not Google) which URLs exist. | Run against staging, a preview, or localhost. |
| `workflows/vacancy-staleness-monitor.json` | Daily. Reads `/api/v1/vacancies.json` and emails the vacancy owner a list of vacancies that are unconfirmed or were last verified more than 14 days ago. | Change a vacancy or mark one available. It only reports. |
| `workflows/site-health-monitor.json` | Every 30 minutes. Checks a short list of paths for HTTP 200, the right indexing rules for the environment, and valid JSON from `/api/v1/index.json`. Alerts on failure. | Alert on a single blip, or repeat the same alert within an hour. |

All four are saved with `"active": false`. Nothing should be activated until the owner has approved the account, host and notification decisions listed in `docs/25-final-master-plan.md` section 6.

The decision logic in the Code nodes mirrors the pure rules in `packages/automation/src` (`vacancy.ts`, `monitoring.ts`, `webhook.ts`, `content.ts`) and `packages/schemas/src/blog.ts`. `packages/automation/tests/n8n-exports.test.ts` runs the Code-node bodies in a small local harness and compares them with those rules.

## Honest status

| Item | Written from docs | Imported into n8n | Run on n8n | Code-node logic tested locally | Notes |
|---|---|---|---|---|---|
| blog-draft-to-pull-request | Yes | No | No | Yes (mocked n8n globals, vitest) | Language model request and response shapes are generic examples. Not tried against any provider. |
| post-deploy-indexnow | Yes | No | No | Yes | Needs a signing relay in the deploy pipeline. The relay is not built. |
| vacancy-staleness-monitor | Yes | No | No | Yes | Compared with `vacancyDisplay()` for ages around the 14-day boundary. |
| site-health-monitor | Yes | No | No | Yes | Compared with `evaluateUptime()` and `shouldNotify()`. |
| Credentials | Names and scopes only | No | No | n/a | See `credentials.md`. Nothing is created anywhere. |
| Environment variables | Listed below | No | No | n/a | None are set anywhere. |

"Tested locally" means the JavaScript inside the Code nodes was executed by vitest with fake versions of `$input`, `$`, `$env` and `$getWorkflowStaticData`. It does not mean n8n ran anything.

## Which node parameters were checked against n8n documentation and source

Checked on 3 November 2026 by reading n8n's public documentation and the node source files in the `n8n-io/n8n` repository (master branch).

Confirmed from source or documentation:

- Node type names and the version lists for: `httpRequest` (4 to 4.5, used 4.5), `code` (1 and 2, used 2), `github` (1 and 1.1, used 1.1), `webhook` (up to 2.2, used 2.2), `respondToWebhook` (up to 1.5, used 1.5), `scheduleTrigger` (up to 1.4, used 1.2), `emailSend` (2 and 2.1, used 2.1), `if` (up to 2.4, used 2.2), `stickyNote` (1), `manualTrigger` (1).
- HTTP Request parameter names: `method`, `url`, `authentication` (`none`, `predefinedCredentialType`, `genericCredentialType`), `nodeCredentialType`, `genericAuthType`, `sendHeaders`, `headerParameters`, `sendBody`, `contentType`, `specifyBody`, `jsonBody`, and the options `timeout`, `response.response.fullResponse`, `response.response.neverError`, `response.response.responseFormat`, `redirect.redirect.followRedirects` and `maxRedirects`.
- Code node parameters `language`, `mode`, `jsCode` and the values `javaScript` and `runOnceForAllItems`.
- GitHub node: resources and operations, the `file` > `create` parameters (`owner`, `repository` as resource locators in `name` mode, `filePath`, `binaryData`, `fileContent`, `commitMessage`, `additionalParameters.branch.branch`), the `pullRequest` > `create` parameters (`base`, `head`, `title`, `body`, `draft`), and the credential name `githubApi`. The node has no create-branch operation, so the branch is created with an HTTP Request node.
- Webhook node: `httpMethod`, `path`, `responseMode` values (`onReceived`, `lastNode`, `responseNode`), the `rawBody` option (the raw body is stored as binary data under `data`).
- Respond to Webhook: `respondWith` value `json`, `responseBody`, `options.responseCode`.
- Schedule Trigger `rule.interval[]` field names for weeks, days and minutes.
- Email Send: credential `smtp`, `subject`, `emailFormat`, `text`, `options`.
- Sticky Note: `content`, `height`, `width`, `color`.
- Workflow `settings` keys: `timezone`, `saveDataErrorExecution`, `saveDataSuccessExecution`, `saveManualExecutions`, `saveExecutionProgress`, `executionTimeout`, `executionOrder`.
- Node-level fields `retryOnFail`, `maxTries`, `waitBetweenTries`, `onError` exist on the node interface.
- Environment variable names and defaults for `NODE_FUNCTION_ALLOW_BUILTIN`, `N8N_BLOCK_ENV_ACCESS_IN_NODE`, the `EXECUTIONS_DATA_*` family and `N8N_PAYLOAD_SIZE_MAX`; the workflow static data behaviour (not saved in test runs).
- GitHub REST: `GET /repos/{owner}/{repo}/git/ref/heads/<branch>` and `POST /repos/{owner}/{repo}/git/refs` (from docs.github.com).
- IndexNow: the POST body, the 10,000 URL limit and the 200, 202, 400, 403, 422, 429 meanings (from indexnow.org).

Not confirmed. Check each of these on a real instance:

- The allowed string values for node-level `onError`. The value `continueRegularOutput` is from memory; the type definition was not in the file that was read.
- The shape of an IF node condition: `id`, `leftValue`, `rightValue` and the operator object `{ "type": "boolean", "operation": "true", "singleValue": true }`. Only the filter `options` block (including `version: 2` for IF 2.2) was confirmed.
- The Email Send parameter names `fromEmail` and `toEmail` (they are defined in a source file that was not read).
- Whether `this.helpers.getBinaryDataBuffer` is available inside the Code node when task runners are on. The documentation does not mention it. The Verify signature node falls back to reading inline base64 binary data and fails closed (`raw_body_unavailable`) if neither works. Whether the binary data is inline depends on `N8N_DEFAULT_BINARY_DATA_MODE`; the documentation says `default` keeps binary data in memory but does not say it is base64 inside the item.
- Whether the HTTP Request node accepts `githubApi` as `nodeCredentialType`. The documentation says it accepts credential types that have an `authenticate` method; that was not confirmed for `githubApi`. If it is refused, switch those two nodes to Header Auth.
- The exact output of the HTTP Request node when "include response headers and status" is on and the format is text (the Code nodes accept a string, a `{ data }` object or a parsed object), and the output item when a node fails with continue-on-error.
- That Webhook header names arrive in lower case.
- The language model request body and response shape (provider not chosen).
- The Dependabot, Lighthouse CI and GitHub Actions details listed in the final section.
- Whether `$env` is readable. The security page of n8n's documentation lists `N8N_BLOCK_ENV_ACCESS_IN_NODE` with default `false`, while the 2.0 breaking-changes page says the default became `true`. Set it to `false` explicitly (see below) and test.

## Host recommendation

Self-host n8n in an Australian region, for example AWS Sydney (`docs/21` section 6 recommends this; the decision is D-07 and is the owner's). Per `docs/21` section 3, n8n Cloud is hosted in the EU (not re-checked here), so it must not be used for anything personal. These four workflows use no personal data. The later automations A1 to A17 (`docs/09`) do, so choose one host for all of them rather than splitting.

Sensible minimum: HTTPS in front of n8n; the editor UI not exposed to the internet; only the webhook path of `post-deploy-indexnow` reachable from outside; a database with backups; a short list of named editors. Read n8n's task runner documentation before choosing internal or external mode: it describes what a person who can edit a workflow can reach in each mode.

## Environment variables

Set these on the n8n instance. Only `DEPLOY_WEBHOOK_SECRET` is secret. Anyone who can edit a workflow can read every variable while `$env` access is allowed, so keep the list of editors short.

| Variable | Used by | Meaning |
|---|---|---|
| `SITE_BASE_URL` | all four | Origin of the site to read, with no path and no trailing slash. For `post-deploy-indexnow` it must be the production origin. |
| `SITE_EXPECTED_ENV` | site-health-monitor | `production` or `staging`. Decides which indexing rules count as correct. |
| `PRODUCTION_HOST` | post-deploy-indexnow | The exact production host name. The guard refuses unless the host of `SITE_BASE_URL` equals it. |
| `INDEXNOW_KEY` | post-deploy-indexnow | The IndexNow key. It is public by design (`apps/web/public/indexnow-key.txt`). |
| `DEPLOY_WEBHOOK_SECRET` | post-deploy-indexnow | Shared secret for the HMAC signature. Secret. |
| `BLOG_TOPIC_BRIEF` | blog | A one-line public topic for scheduled runs (20 to 300 characters). Never put personal details in it. |
| `BLOG_AUTHOR_NAME` | blog | A human or named role for the `author` field, never an AI. |
| `LLM_API_URL` | blog | Full URL of the language model endpoint. |
| `LLM_MODEL` | blog | Model name sent in the request. |
| `GITHUB_REPO_OWNER` | blog | Owner of the repository. |
| `GITHUB_REPO_NAME` | blog | Name of the repository. |
| `GITHUB_BASE_BRANCH` | blog | Branch the pull request targets, normally the default branch. |
| `NOTIFY_FROM_ADDRESS` | all four | Sender address for internal notifications. |
| `EDITORIAL_NOTIFY_ADDRESS` | blog | Who is told about a draft pull request or a stopped run. |
| `VACANCY_NOTIFY_ADDRESS` | vacancy-staleness-monitor | The vacancy owner. |
| `ALERT_NOTIFY_ADDRESS` | post-deploy-indexnow, site-health-monitor | Who receives alerts. |

Instance settings the workflows rely on:

- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, so `$env` works in expressions and Code nodes.
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, so the signature check in `post-deploy-indexnow` can `require('crypto')`. If task runners are used in external mode, the same allowance goes in the runner's `n8n-task-runners.json` (`env-overrides`). Allow only `crypto`; do not use `*`.
- Short execution history: `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE` set to a small number of hours (the default is 336), `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`, `EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false`.
- Each workflow also sets this itself: successful runs are not saved, manual runs are not saved, progress is not saved, failed runs are saved, and each has an execution timeout.
- Timezone `Australia/Sydney` is set per workflow for the schedules.

## Security notes

- No participant data. All four workflows read only public JSON that the site already publishes. The blog workflow sends a language model only the staff-written brief and the list of public titles, and checks the prompt with the same three patterns as `checkPromptSafety()` in `packages/automation/src/content.ts` (email, phone, NDIS-number-like). It stops with an error if any match. The draft is checked again with the same patterns before a pull request is opened. Staff who write a brief must not paste enquiry or participant details into it.
- Execution data. Keep history minimal as above. Failed runs are saved, and they contain node inputs and outputs, so they can hold the text of a draft and the public vacancy fields. They do not contain personal data if the rules above are followed.
- Tokens and scopes. The GitHub token is limited to this repository and to creating branches, files and pull requests. There is no CMS token, no Vercel token and no merge or approval step anywhere. See `credentials.md`. The token cannot by itself stop a branch being merged; protected branches, required reviews and a code owner who is not the bot do that.
- Humans publish. The blog workflow stops at a pull request. The content-gates workflow runs the quality checks on it. A named reviewer on `apps/web/src/data/reviewers.json` approves the exact content hash. Source links in a draft come from the model and are not fetched or checked by the workflow; the PR text says so and the reviewer must open each one. Adding the research step from `docs/21` section 3 (fetching official pages from the allow-list) is future work.
- Webhook. `post-deploy-indexnow` signs with HMAC-SHA256 over `<timestamp>.<raw body>`, accepts a window of plus or minus 300 seconds (boundary included), compares in constant time, rejects replays using workflow static data (saved only for active production runs, not editor test runs), and fails closed when the secret, signature, timestamp or raw body is missing. Callers send headers `x-ablepoint-timestamp` and `x-ablepoint-signature`. Consider also restricting the source IP addresses on the Webhook node.
- Notifications. They go to internal addresses taken from environment variables, never to participants or referrers. They are still outbound email, so under principle 6 in `docs/25` they need the owner's written approval before the workflows are made active.
- Advertising and tracking rules in `docs/10` section 5 are not touched: none of these workflows sends data to an ad platform or adds a tag to a page. The health monitor does check that `/referral/` is not noindex in production and not indexable in staging; it does not look at tags.

## How to try them (once an n8n instance exists)

1. Install n8n on the chosen host and set the instance settings above.
2. Create the credentials listed in `credentials.md` with the exact names shown there.
3. Set the environment variables. Use a staging site for the first trials; for `post-deploy-indexnow` use the dry-run approach below.
4. Import one workflow with "Import from file". Open every node, fix anything n8n flags (especially the items under "Not confirmed"), and re-select each credential.
5. Run it manually and read each node's output before moving on.
   - blog: use a test repository first, not the real one.
   - IndexNow: trigger the webhook with a signed request against a host that is not production. The guard must refuse. Only then try production, after approval.
   - monitors: point `SITE_BASE_URL` at staging with `SITE_EXPECTED_ENV=staging`.
6. Record what happened (Passed, Failed, Blocked, Not Run) in `docs/15-implementation-status.md`. Do not mark a workflow as working on the strength of the unit tests here.
7. Activate a workflow only with the owner's written approval.

## Known limitations

- The vacancy page state is computed when the site is built, so a listing can still read "available" on the site after it has gone stale. The monitor recomputes from `lastVerifiedAt` and says so in its message.
- The blog duplicate check is a cheap word-overlap screen against published titles. Drafts waiting in open pull requests are not in the search index; the CI similarity check (30 percent shared phrasing) and the reviewer cover that.
- A staging site behind deployment protection answers 401 or 403, so the health monitor would alert. Monitor production, or an unprotected staging.
- Failure counts and replay keys live in workflow static data. n8n documents that it is experimental and may misbehave under frequent runs; for these low-volume workflows that is acceptable, but a shared store would be better if volume grows.
- Sanity as the draft target (`docs/21` section 4) is not built; these workflows use GitHub pull requests.

## CI helper files that go with this work

`.github/workflows/lighthouse.yml`, `.github/dependabot.yml`, `.github/pull_request_template.md` and `apps/web/lighthouserc.json` are not n8n files. They were also written without a repository and have not run. Details that were not verified: that Dependabot's `npm` ecosystem handles this pnpm workspace from the root directory; that the runner image ships a Chrome that Lighthouse CI can find; that `settings.formFactor` is accepted from `lighthouserc.json` (Lighthouse's default is already mobile); and whether the performance and best-practices budgets pass on the real staging build. The first real run will show.
