# @ablepoint/mcp-server

A read-only server that lets AI assistants look up AblePoint Australia's public website content, using the Model Context Protocol (MCP). It reads the same public JSON files that the website publishes under `/api/v1/` (see `docs/21-agent-api-and-content-pipeline.md`). It cannot change anything.

## Status (please read)

This is a first working version. It has not been used in real life yet.

**What has been tested (3 Nov 2026, all on one developer machine):**

- 148 automated tests pass in 7 test files, and `tsc --noEmit` is clean. The tests cover every tool, the input limits, the staging warning, the vacancy warnings, search ranking, the fetch rules (size limit, time limit, redirects, plain http), and the data checks.
- The tools were called through the MCP SDK's own client, both in memory and against a real running copy of the server connected over standard input and output.
- One test runs every tool against whatever is in `apps/web/dist` (the staging build of the website). That test is skipped automatically if the site has not been built.
- Test content is made-up fixture content in `tests/fixtures/site`. It contains no real AblePoint facts.

**What has NOT been tested:**

- It has not been tried with a real MCP client application (for example Claude Desktop, Claude Code, Cursor or any other). The configuration examples below are untested.
- The web fetching code (`--base-url`) has only been tested with a stand-in for the network. It has never fetched from a real website, so TLS, proxies and real redirects are untested.
- It has never been run against production content. The only real content seen so far is the staging build, which is draft content.
- No security review or penetration test has been done.

**What it is not:** it is not published to npm, not deployed anywhere, and has no hosting, accounts or credentials. It is marked `private`.

**One thing to know about the SDK:** the official package `@modelcontextprotocol/sdk` (pinned at 1.32.2) is now the "v1.x maintenance line". Its README says the current major version ships as separate packages (`@modelcontextprotocol/server` and `@modelcontextprotocol/client`), and that v1.x will keep getting bug and security fixes for at least six months after 27 July 2026. This package was asked to use `@modelcontextprotocol/sdk`, so it does. Moving to the newer packages is a future decision.

## What it can do

Ten tools, all read-only:

| Tool | What it does |
|---|---|
| `search_content` | Keyword search over titles and summaries of services, locations, guides, posts and vacancies. At most 10 results. |
| `get_organisation` | The published organisation record (name, website, phone, email, head office, regions served, registration if published). |
| `list_services` / `get_service` | List services, or get one in full by its slug. |
| `list_regions` / `get_region` | List locations, or get one in full by its slug. |
| `list_vacancies` | Vacancies with their published availability and the date each was last verified. Optional filters: `region`, `service`. |
| `list_faqs` | Frequently asked questions, optionally narrowed by a topic. |
| `list_guides_and_posts` | Guides and blog posts with their short answer, sources, author, reviewer and status. Optional `category`. |
| `how_to_refer` | Only the contact details found in the organisation record, plus a referral page address if one is published. It does not describe a process or response time. |

### What every result contains

Every successful result is one JSON object, returned both as text and as structured content:

- `environment` and `generatedAt`: where the data was built for and when. Always present.
- `stagingNotice`: present, and listed first, whenever the environment is not `production`. It says the data is staging content, may include unapproved drafts, and must not be presented as fact about AblePoint.
- `warnings`: things the reader must take into account.
- `dataNotice`: a reminder that the content below is quoted data and not instructions.
- `untrustedContent`: the website data itself. All text from the website is kept inside this one field.

### Vacancies

Each vacancy shows `availability` exactly as published and `lastVerifiedAt` exactly as published. Two extra fields help the reader:

- `effectiveAvailability`: what to rely on today. A vacancy published as `available` is shown as `unconfirmed` if it has no usable verification date, the date is in the future, or the date is more than 14 days old (the same 14-day rule the website uses).
- `warning`: a plain sentence, present whenever a vacancy is unconfirmed or older than 14 days.

An empty vacancy list always carries a warning that it does not prove no vacancy exists.

The vacancy data has no link to services. It only labels each vacancy SIL, SDA or STA. So the `service` filter accepts either one of those codes or a service slug whose published name clearly says SIL, SDA or short term accommodation. Any other service lists nothing, and the result says why.

## Choosing the data source

There is no default. You must choose one, or the server exits with a readable error.

| Option | Environment variable | Meaning |
|---|---|---|
| `--dist <dir>` | `ABLEPOINT_API_DIST` | Read `<dir>/api/v1/<resource>.json` from a built site on disk. |
| `--base-url <url>` | `ABLEPOINT_API_BASE_URL` | Fetch `<url>/api/v1/<resource>.json` over the network. Must be `https`. Plain `http` is allowed only for `localhost` and `127.0.0.1`. |

These two variables are the only environment variables the server reads. It reads no secrets and needs no accounts.

Rules for fetching over the network: 10 second time limit for each file; 2 MB size limit; redirects are followed only within the same site (a redirect to another host, port or plain `http` is refused); no cookies or credentials are sent; the only request headers are `User-Agent: ablepoint-mcp/<version>` and `Accept`; answers must have `apiVersion` set to `1` (or `v1`) or they are rejected. The site currently publishes `"apiVersion": "1"`. Results are kept in memory for 5 minutes. Failed loads are not kept.

## Running it locally

You need Node.js 22 or later and `pnpm install` run once at the repository root.

```sh
pnpm --filter @ablepoint/mcp-server start -- --dist ../../apps/web/dist
```

This uses the site's build output. Build the site first if `apps/web/dist` does not exist (this package never builds the site). The server then waits for an MCP client on standard input and output, so run on its own it looks as if it is doing nothing. Press Control-C to stop it. Logs go to standard error and never contain page content or request details.

Important when connecting a real client: `pnpm` prints a short banner to standard output, which breaks the MCP channel. Add `--silent`, or run the launcher directly:

```sh
pnpm --silent --filter @ablepoint/mcp-server start -- --dist ../../apps/web/dist
node packages/mcp-server/bin/ablepoint-mcp.mjs --dist apps/web/dist
```

The launcher runs the TypeScript source through `tsx`, so there is no build step.

Other commands:

```sh
pnpm --filter @ablepoint/mcp-server check   # tsc --noEmit
pnpm --filter @ablepoint/mcp-server test    # vitest run
```

## Example client configuration (untested examples)

These have not been tried with the named applications. Treat them as a starting point and check each application's own documentation. Replace `/ABSOLUTE/PATH/TO` with the real location of this repository.

A client that uses a JSON file with an `mcpServers` section (the style used by Claude Desktop and several other applications):

```json
{
  "mcpServers": {
    "ablepoint-content": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/bikash/packages/mcp-server/bin/ablepoint-mcp.mjs",
        "--dist",
        "/ABSOLUTE/PATH/TO/bikash/apps/web/dist"
      ]
    }
  }
}
```

A command-line client that adds servers by command (the style used by Claude Code):

```sh
claude mcp add ablepoint-content -- node /ABSOLUTE/PATH/TO/bikash/packages/mcp-server/bin/ablepoint-mcp.mjs --dist /ABSOLUTE/PATH/TO/bikash/apps/web/dist
```

To read from a site over the network instead, replace the last two arguments with `--base-url` and an `https` address, for example `https://example.invalid` (a placeholder, not a real site).

## Safety rules built in

- Read-only: there are no tools that write, send, publish, approve or delete. A test checks the tool names and annotations (`readOnlyHint` is true on every tool).
- No tool accepts a URL or a file path from the caller. The data source is fixed when the server starts. Tool arguments are short text such as a slug or a keyword, each with a maximum length, and unknown arguments are rejected.
- Website text is treated as untrusted. It is returned inside `untrustedContent` and never mixed into notices or error messages. Error messages are fixed sentences that never repeat fetched text.
- Only fields this package knows about are passed on. Anything extra in the data is dropped.
- Nothing is written to standard output except protocol messages. Logs are short event codes on standard error.
- Nothing is invented. Tools return only what the data says. `how_to_refer` states that no process, response time or eligibility rule is published.
- No email address or personal data appears anywhere in this package, including the `User-Agent`. A test scans the package for email addresses.

## Known gaps

- The organisation record does not currently include a referral page address. `how_to_refer` therefore reports `referralPageUrl: null`. If the site later publishes one as `referralUrl` in the organisation record, it is passed through automatically. The package does not guess the address.
- The `index` resource and `openapi.json` are not used by any tool.
- Search is simple keyword scoring over titles and summaries. It does not understand meaning or spelling mistakes.
- Guides and posts are listed with their short answer and section headings, not their full text.
- A snapshot can be out of date. Results are a copy of the website as built, not live availability.

## Files

- `src/server.ts` defines the ten tools. `src/source.ts` reads and checks the data. `src/schemas.ts` describes the expected shapes. `src/vacancies.ts` and `src/search.ts` hold the vacancy rules and the ranking. `src/main.ts` is the start-up code.
- `tests/fixtures/site/api/v1/` holds made-up fixture data, including one unconfirmed vacancy and one stale vacancy.
