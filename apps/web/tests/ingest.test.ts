import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isApprovalCurrent } from '@ablepoint/schemas';

const web = new URL('..', import.meta.url).pathname;
const seed = JSON.parse(readFileSync(join(web, 'content-drafts/sil-provider-checklist.json'), 'utf8'));
const run = (script: string, args: string[]) => spawnSync('pnpm', ['exec', 'tsx', script, ...args], { cwd: web, encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'ap-ingest-'));
const write = (dir: string, name: string, obj: unknown) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(obj)); return p; };

describe('draft ingest CLI', () => {
  it('writes a valid draft as reviewState "draft" and refuses to overwrite', () => {
    const out = tmp();
    const f = write(out, 'in.json', seed);
    const ok = run('scripts/content/ingest.ts', [f, '--out', join(out, 'posts')]);
    expect(ok.status).toBe(0);
    const doc = JSON.parse(readFileSync(join(out, 'posts', `${seed.slug}.json`), 'utf8'));
    expect(doc.reviewState).toBe('draft');
    expect(doc.approvedBy).toBeUndefined();
    expect(doc.missingFacts.join()).toMatch(/human reviewer/i);
    const again = run('scripts/content/ingest.ts', [f, '--out', join(out, 'posts')]);
    expect(again.status).toBe(1);
    expect(JSON.parse(again.stdout).errors.join()).toMatch(/already exists/);
  });
  it('rejects thin, unsourced and banned-wording drafts with a machine-readable report', () => {
    const out = tmp();
    const bad = { ...seed, slug: 'bad-draft-example', sections: seed.sections.slice(0, 3).map((s: { heading: string; body: string[] }) => ({ ...s, body: [s.body[0]] })), sources: [{ label: 'Some blog about it', url: 'https://example.com/x' }, { label: 'Another blog about it', url: 'https://example.org/y' }], summary: 'We are the best provider and we guarantee approval for every participant who contacts us today.' };
    const r = run('scripts/content/ingest.ts', [write(out, 'bad.json', bad), '--out', join(out, 'posts')]);
    expect(r.status).toBe(1);
    const rep = JSON.parse(r.stdout);
    expect(rep.ok).toBe(false);
    expect(rep.errors.join(' | ')).toMatch(/too thin|authoritative|banned phrase/);
    expect(existsSync(join(out, 'posts', 'bad-draft-example.json'))).toBe(false);
  });
  it('rejects schema violations', () => {
    const out = tmp();
    const r = run('scripts/content/ingest.ts', [write(out, 'x.json', { ...seed, slug: 'Bad Slug' }), '--out', join(out, 'posts')]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).stage).toBe('schema');
  });
  it('rejects a near-duplicate of an existing post', () => {
    const out = tmp();
    run('scripts/content/ingest.ts', [write(out, 'a.json', seed), '--out', join(out, 'posts')]);
    const dup = run('scripts/content/ingest.ts', [write(out, 'b.json', { ...seed, slug: 'second-sil-checklist-post' }), '--out', join(out, 'posts')]);
    expect(dup.status).toBe(1);
    expect(JSON.parse(dup.stdout).errors.join()).toMatch(/too similar/);
  });
});

describe('approve CLI', () => {
  it('needs a named human, then approval holds until the post is edited', () => {
    const out = tmp();
    const dir = join(out, 'posts');
    run('scripts/content/ingest.ts', [write(out, 'a.json', seed), '--out', dir]);
    expect(run('scripts/content/approve.ts', [seed.slug, '--dir', dir]).status).toBe(1); // no --by
    expect(run('scripts/content/approve.ts', [seed.slug, '--by', 'ChatGPT', '--dir', dir]).status).toBe(1); // not a person
    const ok = run('scripts/content/approve.ts', [seed.slug, '--by', 'Jo Reviewer', '--dir', dir]);
    expect(ok.status, ok.stderr).toBe(0);
    const doc = JSON.parse(readFileSync(join(dir, `${seed.slug}.json`), 'utf8'));
    expect(doc.reviewer).toBe('Jo Reviewer');
    expect(isApprovalCurrent(doc)).toBe(true);
    expect(isApprovalCurrent({ ...doc, title: doc.title + ' (edited)' })).toBe(false);
  });
});

describe('verify-approvals CLI (CI guard against self-approval)', () => {
  it('passes with no approved posts; fails for unlisted, bot, self or stale approvals', () => {
    const out = tmp();
    const dir = join(out, 'posts');
    run('scripts/content/ingest.ts', [write(out, 'a.json', seed), '--out', dir]);
    const rev = join(out, 'rev.json');
    writeFileSync(rev, JSON.stringify({ complianceReviewers: ['Jo Reviewer'] }));
    expect(run('scripts/content/verify-approvals.ts', ['--dir', dir, '--reviewers', rev]).status).toBe(0); // drafts only
    run('scripts/content/approve.ts', [seed.slug, '--by', 'Jo Reviewer', '--dir', dir]);
    expect(run('scripts/content/verify-approvals.ts', ['--dir', dir, '--reviewers', rev]).status).toBe(0);
    writeFileSync(rev, JSON.stringify({ complianceReviewers: [] }));
    expect(JSON.parse(run('scripts/content/verify-approvals.ts', ['--dir', dir, '--reviewers', rev]).stdout).problems.join()).toMatch(/not on the compliance reviewer list/);
    writeFileSync(rev, JSON.stringify({ complianceReviewers: ['Jo Reviewer'] }));
    const self = run('scripts/content/verify-approvals.ts', ['--dir', dir, '--reviewers', rev, '--pr-author', 'jo reviewer']);
    expect(self.status).toBe(1);
    expect(self.stdout).toMatch(/self-approval/);
    const p = join(dir, `${seed.slug}.json`);
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    writeFileSync(p, JSON.stringify({ ...doc, title: doc.title + ' edited' }));
    expect(run('scripts/content/verify-approvals.ts', ['--dir', dir, '--reviewers', rev]).stdout).toMatch(/hash does not match/);
  });
});
