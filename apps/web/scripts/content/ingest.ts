/**
 * Draft ingest for agents and editors (docs/21-agent-api-and-content-pipeline.md).
 *   pnpm --filter @ablepoint/web content:ingest -- path/to/draft.json [--dry-run] [--out dir]
 * Validates the draft against the schema, runs the quality gates (thin content, duplicates, keyword stuffing, banned NDIS
 * wording, authoritative sources, reading level), and on success writes src/content/posts/<slug>.json as a DRAFT.
 * It never approves or publishes. Prints a machine-readable JSON report; exit code 1 on any error.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assessDraft, blogDraftSchema, draftText, type ExistingContent } from '@ablepoint/schemas';
import { guides } from '../../src/data/guides';

const args = process.argv.slice(2).filter((a) => a !== '--');
const file = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry-run');
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1]! : new URL('../../src/content/posts', import.meta.url).pathname);
const fail = (report: object) => { console.log(JSON.stringify(report, null, 2)); process.exit(1); };

if (!file) fail({ ok: false, errors: ['usage: content:ingest <draft.json> [--dry-run] [--out dir]'] });
let raw: unknown;
try { raw = JSON.parse(readFileSync(resolve(file!), 'utf8')); } catch (e) { fail({ ok: false, errors: [`cannot read JSON: ${(e as Error).message}`] }); }

const parsed = blogDraftSchema.safeParse(raw);
if (!parsed.success) fail({ ok: false, stage: 'schema', errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) });
const draft = parsed.data!;

const existing: ExistingContent[] = guides.map((g) => ({ slug: `guide:${g.slug}`, text: [g.title, g.answer, ...g.sections.flatMap((s) => [s.heading, ...s.body])].join('\n') }));
if (existsSync(outDir)) {
  for (const f of readdirSync(outDir).filter((f) => f.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    existing.push({ slug: p.slug, text: draftText(p) });
  }
}
const slugTaken = existsSync(join(outDir, `${draft.slug}.json`));
const assessment = assessDraft(draft, existing);
const errors = [...assessment.errors, ...(slugTaken ? [`slug "${draft.slug}" already exists: choose a new slug (updates go through review, not ingest)`] : [])];
const report = { ok: errors.length === 0, slug: draft.slug, written: false, errors, warnings: assessment.warnings, metrics: assessment.metrics, nearestExisting: assessment.nearestExisting };
if (errors.length) fail(report);

if (!dry) {
  mkdirSync(outDir, { recursive: true });
  const doc = {
    ...draft,
    reviewState: 'draft',
    updatedAt: new Date().toISOString(),
    missingFacts: ['Named human reviewer (fact-check)', 'Compliance approval', ...(draft.aiAssisted ? ['Human edit of AI-assisted text'] : [])],
  };
  writeFileSync(join(outDir, `${draft.slug}.json`), JSON.stringify(doc, null, 2) + '\n');
  report.written = true;
}
console.log(JSON.stringify(report, null, 2));
