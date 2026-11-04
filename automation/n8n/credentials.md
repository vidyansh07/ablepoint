# n8n credentials: names and least-privilege scopes

These are the credentials the workflow exports refer to. The exports contain only the placeholder id `PLACEHOLDER` and the names below. No credential exists anywhere yet, and no secret belongs in this repository. After importing a workflow, open each node and choose the real credential.

| Credential name in the exports | n8n credential type | Used by | Least-privilege scope |
|---|---|---|---|
| GitHub token - draft PRs only - PLACEHOLDER | GitHub API (`githubApi`, access token) | blog-draft-to-pull-request (Get base branch SHA, Create branch, Create draft file, Open draft pull request) | A fine-grained personal access token (or a GitHub App installation) for this one repository only. Repository permissions: Metadata read, Contents read and write, Pull requests read and write. Nothing else: no Actions, Workflows, Administration, Secrets, Webhooks or organisation permissions. Short expiry. Owned by a dedicated machine account. |
| LLM API key - PLACEHOLDER | Header Auth (`httpHeaderAuth`) | blog-draft-to-pull-request (Draft with LLM) | A key created only for this workflow, able to call the text generation endpoint and nothing else (no file storage, fine-tuning or admin scopes), with a monthly spend limit set at the provider. The header name and value depend on the provider chosen. Check the provider's data retention terms before use. |
| SMTP - internal notifications - PLACEHOLDER | SMTP (`smtp`) | All four workflows (email nodes) | A send-only account or relay that can send from one fixed sender address. No mailbox read access. Used only for messages to internal staff addresses given by environment variables. |

## Notes on the GitHub token

- Contents write is the smallest permission that lets the token create a branch and commit a file. GitHub cannot limit it to branch names, so the token can in principle write to any unprotected branch and call the merge endpoint. Protect the default branch: require a pull request, require an approving review from a code owner, and do not let the machine account bypass these rules or be a code owner. The workflow itself never merges, approves, edits existing files or deletes anything (a test checks this).
- The exact permission names above are from memory of GitHub's fine-grained token settings and were not re-checked. Compare them with GitHub's current permission reference when creating the token.
- Keep the token out of environment variables. It belongs only in the n8n credential store.

## Secrets that are not n8n credentials

- `DEPLOY_WEBHOOK_SECRET` is read from the environment by the signature check, because Code nodes cannot read the credential store. Treat it as a secret: generate a long random value, store it with the deploy pipeline's secrets, rotate it if an editor leaves, and keep the editor list short. The same environment-access setting that makes this work lets editors read it.
- The IndexNow key is not secret. It is published in `apps/web/public/indexnow-key.txt`.

## Credentials that are deliberately absent

The site monitors, the vacancy monitor and the sitemap fetch call public URLs and need no credential. There is no credential for Sanity, Vercel, Google, a CRM, SMS, telephony or any system that holds participant data. If a future change seems to need one, it needs a new review first.
