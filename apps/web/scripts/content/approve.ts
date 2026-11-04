/**
 * Human approval step.
 *   pnpm --filter @ablepoint/web content:approve -- <slug> --by "Reviewer Name" [--dir dir] [--publish-date YYYY-MM-DD]
 * Re-runs the quality gates, records the named reviewer and date, and stores the content hash that the production build
 * checks (AR-7). Any later edit to the post changes the hash and withdraws approval until this is run again.
 * This must be run by a person: the reviewer name is required and may not be an AI or automation label.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { approvalFields, assessDraft, blogDraftSchema, draftText, type ExistingContent } from '@ablepoint/schemas';

const args = process.argv.slice(2).filter((a) => a !== '--');
const slug = args.find((a) => !a.startsWith('--'));
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const by = val('--by');
const dir = resolve(val('--dir') ?? new URL('../../src/content/posts', import.meta.url).pathname);
const die = (msg: string): never => { console.error(JSON.stringify({ ok: false, error: msg })); process.exit(1); };

if (!slug || !by) die('usage: content:approve <slug> --by "Reviewer Name"');
if (/(\bai\b|bot|gpt|claude|automation|n8n|system|llm|agent)/i.test(by!)) die('approver must be a named person');
const path = join(dir, `${slug}.json`);
if (!existsSync(path)) die(`no such post: ${path}`);
const doc = JSON.parse(readFileSync(path, 'utf8'));

const parsed = blogDraftSchema.safeParse(doc);
if (!parsed.success) die(`schema: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
const others: ExistingContent[] = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== `${slug}.json`).map((f) => { const p = JSON.parse(readFileSync(join(dir, f), 'utf8')); return { slug: p.slug, text: draftText(p) }; });
const a = assessDraft(parsed.data!, others);
if (!a.ok) die(`quality gates failed: ${a.errors.join(' | ')}`);

const now = new Date();
doc.reviewer = by;
doc.reviewedAt = now.toISOString().slice(0, 10);
doc.publishedAt = val('--publish-date') ?? doc.publishedAt ?? now.toISOString().slice(0, 10);
doc.updatedAt = now.toISOString();
delete doc.missingFacts;
Object.assign(doc, approvalFields(doc, by!, now));
writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, slug, approvedBy: by, approvedAt: doc.approvedAt, hash: doc.approvedContentHash, warnings: a.warnings }, null, 2));
