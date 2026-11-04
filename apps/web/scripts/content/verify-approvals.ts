/**
 * CI check for the human-approval rule (docs/21).
 *   pnpm --filter @ablepoint/web content:verify [-- --dir dir --reviewers file.json --pr-author handle]
 * Fails if any post is marked approved but (a) its approval hash no longer matches its content, (b) the approver is not on the
 * compliance reviewer list, or (c) the approver is the pull-request author (self-approval) or looks like a bot/agent.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isApprovalCurrent } from '@ablepoint/schemas';

const args = process.argv.slice(2).filter((a) => a !== '--');
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dir = resolve(val('--dir') ?? new URL('../../src/content/posts', import.meta.url).pathname);
const reviewersFile = resolve(val('--reviewers') ?? new URL('../../src/data/reviewers.json', import.meta.url).pathname);
const prAuthor = (val('--pr-author') ?? process.env.PR_AUTHOR ?? '').trim().toLowerCase();
const allow: string[] = JSON.parse(readFileSync(reviewersFile, 'utf8')).complianceReviewers ?? [];

const problems: string[] = [];
let approved = 0;
if (existsSync(dir)) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (doc.reviewState !== 'approved') continue;
    approved++;
    const by = String(doc.approvedBy ?? '').trim();
    if (!isApprovalCurrent(doc)) problems.push(`${f}: approval hash does not match the content (edited after approval?)`);
    if (!allow.includes(by)) problems.push(`${f}: approver "${by}" is not on the compliance reviewer list`);
    if (/(\bai\b|bot|gpt|claude|automation|n8n|system|llm|agent)/i.test(by)) problems.push(`${f}: approver "${by}" looks like an automation`);
    if (prAuthor && by.toLowerCase() === prAuthor) problems.push(`${f}: approver is the PR author (self-approval)`);
  }
}
console.log(JSON.stringify({ ok: problems.length === 0, approvedPosts: approved, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
