# 21 — Agent API, Content Pipeline and Blog Automation

Date: 3 Nov 2026. Purpose: let agents and automation tools (n8n, scripts, LLM tools, search and answer engines) **read** the site's content in clean machine-readable form and **propose** new content, while a named human decides what is published.

## 1. What exists today (built and tested)

| Surface | Where | For whom | Notes |
|---|---|---|---|
| Public content API (static JSON) | `/api/v1/index.json`, `organisation`, `services`, `regions`, `guides`, `posts`, `vacancies`, `faqs`, `search-index` | Any agent, partner site, internal tool | Versioned envelope `{apiVersion, environment, generatedAt, publisher, data}`; same approval gate as the website; CORS `*`; `X-Robots-Tag: noindex` so JSON is not indexed as pages |
| OpenAPI 3.1 description | `/api/v1/openapi.json` | Tool builders, n8n HTTP/OpenAPI nodes, LLM tool-use | Generated from code; a test checks every resource has a path |
| `llms.txt` | `/llms.txt` | Optional plain-text map for AI tools | Google says it does not use `llms.txt` ("neither harm nor help"); no other provider has said it uses it. Cheap, so kept; never relied on |
| Atom feed | `/feed.xml` | Readers, aggregators, agents | Guides and posts |
| Sitemap | `/sitemap.xml` (production only) | Googlebot, Bingbot | Canonical, indexable URLs only; `lastmod` only where a real content update date exists |
| robots.txt policy | `/robots.txt` | All crawlers | Staging blocks all. Production: explicit groups allowing search and answer bots (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Applebot, meta-webindexer, Amazonbot, DuckDuckBot); training bots (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent) allowed by default (owner wants models to learn about AblePoint) and switchable with `AI_TRAINING=block` |
| IndexNow notifier | `scripts/indexnow.mjs` | Bing, Copilot, Yandex, Seznam, Naver, Yep | Not Google. Dry-run by default in tests; refuses non-production hosts; key file `public/indexnow-key.txt` (public by design) |
| Blog | `/blog/`, `/blog/<slug>/`, `/blog/topic/<category>/` | Readers, referrers, crawlers | Article schema with author, reviewer and honest dates; plain-English reading level gates |
| Draft ingest CLI | `pnpm --filter @ablepoint/web content:ingest -- draft.json [--dry-run]` | Agents and editors | Schema validation + quality gates; writes a **draft** only |
| Approve CLI | `pnpm --filter @ablepoint/web content:approve -- <slug> --by "Name"` | Named human reviewer | Rejects AI-like names; stores the content hash |
| CI guard | `content:verify` + `.github/workflows/content-gates.yml` | CI | Fails on stale hash, approver not on the list, bot-like approver, self-approval |

**Built since (3 Nov 2026):** a read-only MCP server, `packages/mcp-server` (10 tools over this API; stdio; reads a built site folder or an HTTPS base URL; 148 tests including an in-memory MCP client for every tool and a launcher test). It has **not** been tried with a real MCP client application and `--base-url` has only been tested with an injected fetch. Content it returns is labelled untrusted and carries a staging notice when the environment is not production.

**Not yet built or not yet run:** Sanity adapter and n8n workflow exports (see `15` for their current state); webhook → rebuild → IndexNow automation needs Vercel and a production host. All depend on accounts or decisions listed in §6.

## 2. The publishing pipeline (agents propose, humans decide)

```
n8n / script / LLM tool                     GitHub                          Humans
  1. pick topic from calendar
     (check /api/v1/search-index.json
      to avoid duplicates)
  2. gather official sources
  3. draft JSON in the contract  ──PR──▶  content-gates workflow runs:
     (blogDraftSchema)                      • ingest --dry-run (quality gates)
                                            • content:verify (approval rules)
                                                         │
                                                         ▼
                                            reviewer reads Vercel preview (protected)
                                            NDIS-experienced reviewer fact-checks
                                            compliance owner approves
                                                         │  content:approve --by "Name"
                                                         ▼
                                            merge → production build → only content with a
                                            current hash AND an approver on the reviewer list is shown
                                                         │
                                                         ▼
                                            post-deploy: IndexNow ping (Bing), Search Console
```

Why humans stay in the loop (official guidance, read 3 Nov 2026): Google's spam policy on **scaled content abuse** names "using generative AI tools to generate many pages without adding value", and its guidance says it is "critical to manually factcheck and review all AI-generated content before publishing". The Quality Rater Guidelines hold YMYL topics to higher standards and treat unedited mass AI content as lowest quality. NDIS eligibility and funding content also falls under AblePoint's compliance guardrail G-08.

### The draft contract (`packages/schemas/src/blog.ts`)

Fields: `slug`, `kind` (post|guide), `title` (20–70 chars), `summary` (80–170), `answer` (answer-first, ~40–90 words), `category`, `tags`, `regions`, `services`, `sections` (≥ 3, each with heading and paragraphs), `faqs`, `sources` (≥ 2, https), `author` (a person or role, never an AI), `aiAssisted`, `aiNotes`, optional `publishedAt`.

### Quality gates (an agent cannot bypass them; a human can still reject a draft that passes)

- Thin content: minimum 600 words (posts), 450 (guides).
- Reading level: error above Flesch–Kincaid grade 13, warning above 10.5 (target 8–10).
- Keyword stuffing: error when one term exceeds 4.5% of words.
- Duplicates: error above 30% shared 5-word phrasing with any existing guide or post.
- Banned NDIS wording and unsupported claims (G-01/G-03/W-04): "approved NDIS", "best provider", guarantees, eligibility certainty.
- Sources: at least 2 from an authoritative allow-list (ndis.gov.au, ndiscommission.gov.au, dss.gov.au, health.gov.au, aihw.gov.au, legislation.gov.au, accc.gov.au, oaic.gov.au, servicesaustralia.gov.au, abs.gov.au, nsw.gov.au, nds.org.au, pwd.org.au, stylemanual.gov.au).
- Author must not look like an AI; `aiAssisted: true` needs notes.

### Approval (two independent locks)

1. **Hash lock (AR-7):** approval stores a SHA-256 of the post's content; any later edit withdraws it.
2. **Reviewer list lock:** production shows content only if the approver's name is on `src/data/reviewers.json`, which ships **empty**. An agent can compute a valid hash but cannot publish, because adding a name to the list is a reviewed change owned by the compliance owner (CODEOWNERS; branch protection must be switched on in GitHub, which cannot be done from here).

## 3. n8n design (to build when n8n and GitHub access exist)

1. **Trigger:** weekly schedule, or a webhook from an editor with a one-line brief.
2. **Duplicate check:** HTTP GET `/api/v1/search-index.json`; stop if a similar title exists.
3. **Research:** fetch the official pages from the source allow-list only; store URLs and extracted facts.
4. **Draft:** LLM node with structured output in the `blogDraftSchema` shape and a prompt carrying the rules above. No participant data ever enters a prompt (A11 safety check in `packages/automation`).
5. **Open PR:** GitHub node writes `apps/web/content-drafts/<slug>.json` on a branch and opens a PR titled "Draft: …" with the research notes.
6. **Notify:** message the reviewer. Nothing else is automated.
7. **After merge:** deploy hook (Vercel) → IndexNow ping with the new URL.

Security: n8n self-hosted in an Australian region (n8n Cloud is hosted in the EU); a GitHub token limited to creating branches and PRs in this repo; no CMS publish rights; secrets in n8n's credential vault; execution data saved for errors only.

## 4. Sanity path (when the project exists)

The same draft contract maps to the `guide`/`post` documents in `apps/studio`. n8n creates a **draft document** through the Sanity mutation API with a token that cannot publish; the Studio "Approve for publication" action stores the same content hash; the site build applies the same gate. Roles, tokens and dataset privacy are in `apps/studio/README.md`.

## 5. API stability and safety rules

- Version in the path (`/api/v1/`); breaking changes get `/api/v2/`.
- Read-only. There is no write endpoint on the public site by design.
- Only public, approved content; no personal data; vacancies expose public fields and honest availability (`available`, `unconfirmed`, `temporarilyUnavailable`, `noLongerAvailable`).
- `api/` responses are `noindex`; the HTML pages are the canonical, indexable versions.
- Agents must not present AblePoint as offering anything not listed in the API and must check `lastVerifiedAt` for vacancies.

## 6. Needed to go further

- GitHub repository, branch protection and CODEOWNERS handle (compliance owner).
- Named compliance reviewers (to populate `reviewers.json`) and an NDIS-experienced fact-checker.
- n8n host decision (AWS Sydney self-hosted recommended) and an LLM provider account (no PII in prompts).
- Sanity project (for the CMS path) and Vercel deploy hook.
- Decision on training-crawler policy (`AI_TRAINING`), default allow.
