import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTHORITATIVE_DOMAINS, POST_CATEGORIES, VACANCY_STALE_DAYS as SCHEMAS_VACANCY_STALE_DAYS, assessDraft, blogDraftSchema, vacancyDisplay } from '@ablepoint/schemas';
import { VACANCY_STALE_DAYS } from '../src/vacancy';
import { DAY_MS } from '../src/common';
import { InMemoryReplayStore, MAX_SKEW_SECONDS, acceptWebhook, signWebhook, verifyWebhook } from '../src/webhook';
import { VITALS_THRESHOLDS, evaluateUptime, shouldNotify } from '../src/monitoring';
import { checkPromptSafety, detectSensitiveTopics } from '../src/content';

/**
 * Guards for the n8n workflow exports in automation/n8n/workflows (docs/21 section 3, docs/25 section 5.4).
 * The workflows are written from n8n documentation and have NOT been imported into or run on an n8n instance.
 * These tests check the files themselves (structure, no secrets, safe wiring) and run the Code-node bodies in a small local
 * harness with mocked n8n globals, comparing them with the pure rules in this package. Passing here is not evidence that
 * the workflows run in n8n.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const n8nDir = join(repoRoot, 'automation', 'n8n');
const WORKFLOW_FILES = ['blog-draft-to-pull-request.json', 'post-deploy-indexnow.json', 'vacancy-staleness-monitor.json', 'site-health-monitor.json'] as const;
const NOT_TESTED_LINE = 'NOT imported into or tested on a running n8n instance';

// Hosts that may appear in the exports. api.indexnow.org is the IndexNow endpoint; api.github.com is the GitHub REST API (the n8n GitHub node
// has no create-branch operation, so branches are made with an HTTP Request node); docs.n8n.io is the only documentation host.
const ALLOWED_URL_HOSTS = new Set(['api.indexnow.org', 'api.github.com', 'docs.n8n.io']);
const KNOWN_NODE_TYPES = new Set([
  'n8n-nodes-base.stickyNote',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.webhook',
  'n8n-nodes-base.respondToWebhook',
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.code',
  'n8n-nodes-base.if',
  'n8n-nodes-base.github',
  'n8n-nodes-base.emailSend',
]);
const TRIGGER_TYPES = new Set(['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.manualTrigger', 'n8n-nodes-base.webhook']);
const KNOWN_CREDENTIAL_TYPES = new Set(['githubApi', 'httpHeaderAuth', 'smtp']);

// ---------------------------------------------------------------------------
// Types and helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: number[];
  parameters: Json;
  credentials?: Record<string, { id: string; name: string }>;
  webhookId?: string;
}
interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main?: Array<Array<{ node: string; type: string; index: number }>> }>;
  settings: Json;
  active: boolean;
  pinData?: unknown;
}

const readText = (path: string) => readFileSync(path, 'utf8');
const load = (file: string): N8nWorkflow => JSON.parse(readText(join(n8nDir, 'workflows', file))) as N8nWorkflow;
const nodeNamed = (w: N8nWorkflow, name: string): N8nNode => {
  const n = w.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node not found: ${name}`);
  return n;
};
const codeOf = (w: N8nWorkflow, name: string): string => String(nodeNamed(w, name).parameters.jsCode);

/** Every string in a JSON value, keys included. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allStrings(v, out);
    }
  }
  return out;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const TOKEN_PATTERNS: Array<[string, RegExp]> = [
  ['bearer token', /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/i],
  ['sk- key', /\bsk-[A-Za-z0-9_-]{16,}/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{20,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['long hex string', /\b[0-9a-f]{32,}\b/i],
  ['long mixed-case alphanumeric string', /\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*[A-Z])[A-Za-z0-9]{32,}\b/],
];
const URL_PATTERN = /https?:\/\/[^\s"'`)<>\],]+/g;

/** Is `target` reachable from any trigger without passing through `skip` (and without following `skipEdge`)? */
function reachable(w: N8nWorkflow, target: string, opts: { skip?: string; skipEdge?: { from: string; output: number } } = {}): boolean {
  const starts = w.nodes.filter((n) => TRIGGER_TYPES.has(n.type)).map((n) => n.name);
  const seen = new Set<string>();
  const queue = [...starts];
  while (queue.length) {
    const cur = queue.shift() as string;
    if (cur === opts.skip || seen.has(cur)) continue;
    seen.add(cur);
    if (cur === target) return true;
    (w.connections[cur]?.main ?? []).forEach((targets, output) => {
      if (opts.skipEdge && opts.skipEdge.from === cur && opts.skipEdge.output === output) return;
      for (const t of targets) queue.push(t.node);
    });
  }
  return false;
}

// Local harness for n8n Code-node bodies (mode: run once for all items). Not n8n itself: it only supplies the globals the bodies use.
interface Item {
  json: Json;
  binary?: Json;
}
interface Ctx {
  input?: Item[];
  nodes?: Record<string, Item[]>;
  env?: Record<string, string>;
  staticData?: Json;
  helpers?: { getBinaryDataBuffer?: (index: number, prop: string) => Promise<Buffer> };
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
const nodeRequire = createRequire(import.meta.url);
const listApi = (items: Item[]) => ({ first: () => items[0], last: () => items[items.length - 1], all: () => items });

async function runCode(code: string, ctx: Ctx = {}): Promise<Item[]> {
  const fn = new AsyncFunction('$input', '$', '$env', '$getWorkflowStaticData', 'require', code);
  const $ = (name: string) => {
    const items = ctx.nodes?.[name];
    if (!items) throw new Error(`Code node asked for node "${name}" but the test did not provide it`);
    return listApi(items);
  };
  const staticData = ctx.staticData ?? {};
  // n8n only lets the Code node import modules named in NODE_FUNCTION_ALLOW_BUILTIN. The export documents crypto only.
  const req = (m: string) => {
    if (m !== 'crypto') throw new Error(`module not allowed: ${m}`);
    return nodeRequire(m);
  };
  return (await fn.call({ helpers: ctx.helpers ?? {} }, listApi(ctx.input ?? []), $, ctx.env ?? {}, () => staticData, req)) as Item[];
}
const first = async (code: string, ctx?: Ctx): Promise<Json> => {
  const out = await runCode(code, ctx);
  const item = out[0];
  if (!item) throw new Error('Code node returned no items');
  return item.json;
};

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Checks that apply to every workflow
// ---------------------------------------------------------------------------

describe.each(WORKFLOW_FILES)('n8n export %s', (file) => {
  const raw = readText(join(n8nDir, 'workflows', file));
  const w = JSON.parse(raw) as N8nWorkflow;
  const names = w.nodes.map((n) => n.name);

  it('parses and has the importable top-level shape, and is inactive', () => {
    expect(typeof w.name).toBe('string');
    expect(w.name.length).toBeGreaterThan(3);
    expect(Array.isArray(w.nodes)).toBe(true);
    expect(w.nodes.length).toBeGreaterThan(2);
    expect(typeof w.connections).toBe('object');
    expect(typeof w.settings).toBe('object');
    expect(w.active).toBe(false);
  });

  it('has unique node names and ids, and every node has a known type, a version and a position', () => {
    expect(new Set(names).size).toBe(names.length);
    const ids = w.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of w.nodes) {
      expect(KNOWN_NODE_TYPES.has(n.type), `unexpected node type ${n.type} in "${n.name}"`).toBe(true);
      expect(typeof n.typeVersion).toBe('number');
      expect(n.position).toHaveLength(2);
      expect(typeof n.parameters).toBe('object');
    }
  });

  it('only uses connection sources and targets that name existing nodes, and has no orphans', () => {
    for (const [source, conn] of Object.entries(w.connections)) {
      expect(names, `connection source "${source}"`).toContain(source);
      for (const targets of conn.main ?? []) {
        for (const t of targets) {
          expect(names, `connection target "${t.node}" from "${source}"`).toContain(t.node);
          expect(t.type).toBe('main');
        }
      }
    }
    const incoming = new Set<string>();
    for (const conn of Object.values(w.connections)) for (const targets of conn.main ?? []) for (const t of targets) incoming.add(t.node);
    for (const n of w.nodes) {
      if (n.type === 'n8n-nodes-base.stickyNote' || TRIGGER_TYPES.has(n.type)) continue;
      expect(incoming.has(n.name), `"${n.name}" has no incoming connection`).toBe(true);
      expect(reachable(w, n.name), `"${n.name}" cannot be reached from a trigger`).toBe(true);
    }
    for (const n of w.nodes.filter((x) => TRIGGER_TYPES.has(x.type))) expect(incoming.has(n.name), `trigger "${n.name}" must not have an input`).toBe(false);
    expect(w.nodes.some((n) => TRIGGER_TYPES.has(n.type))).toBe(true);
  });

  it('has sticky notes that explain the purpose and state it was not run on n8n', () => {
    const stickies = w.nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote');
    expect(stickies.length).toBeGreaterThanOrEqual(1);
    expect(stickies.some((s) => String(s.parameters.content).includes(NOT_TESTED_LINE))).toBe(true);
    expect(stickies.every((s) => String(s.parameters.content).length > 80)).toBe(true);
  });

  it('contains no email addresses, token-like strings or personal-data field names', () => {
    for (const s of allStrings(w)) {
      expect(EMAIL.test(s), `email-like string in ${file}: ${s.slice(0, 60)}`).toBe(false);
      for (const [label, re] of TOKEN_PATTERNS) expect(re.test(s), `${label} in ${file}: ${s.slice(0, 60)}`).toBe(false);
    }
    const deny = /ndisNumber|dateOfBirth|\bdob\b|diagnosis|medicareNumber|ownerId|verifiedBy|firstName|lastName|phoneNumber|participantName/i;
    for (const s of allStrings(w)) expect(deny.test(s), `personal-data field name in ${file}: ${s.slice(0, 60)}`).toBe(false);
  });

  it('only contains https URLs on the allow-listed hosts', () => {
    for (const s of allStrings(w)) {
      for (const m of s.match(URL_PATTERN) ?? []) {
        expect(m.startsWith('https://'), `non-https URL: ${m}`).toBe(true);
        const host = new URL(m.replace(/\{\{.*$/, '')).hostname;
        expect(ALLOWED_URL_HOSTS.has(host), `URL host not allow-listed: ${host}`).toBe(true);
      }
    }
  });

  it('uses only credential placeholders of known types', () => {
    for (const n of w.nodes) {
      for (const [type, cred] of Object.entries(n.credentials ?? {})) {
        expect(KNOWN_CREDENTIAL_TYPES.has(type), `unknown credential type ${type}`).toBe(true);
        expect(cred.id).toBe('PLACEHOLDER');
        expect(cred.name).toContain('PLACEHOLDER');
      }
    }
  });

  it('references environment variables that are documented in the README', () => {
    const readme = readText(join(n8nDir, 'README.md'));
    const vars = new Set<string>();
    for (const s of allStrings(w)) for (const m of s.matchAll(/\$env\.([A-Z][A-Z0-9_]*)/g)) vars.add(m[1] as string);
    expect(vars.size).toBeGreaterThan(0);
    for (const v of vars) expect(readme, `${v} is used in ${file} but missing from README.md`).toContain(`\`${v}\``);
  });

  it('only references nodes that exist when a Code node or expression names another node', () => {
    for (const s of allStrings(w)) for (const m of s.matchAll(/\$\((['"])([^'"]+)\1\)/g)) expect(names, `reference to missing node "${m[2]}"`).toContain(m[2]);
  });

  it('keeps execution data small and sets a timeout', () => {
    expect(w.settings.saveDataSuccessExecution).toBe('none');
    expect(w.settings.saveManualExecutions).toBe(false);
    expect(w.settings.saveExecutionProgress).toBe(false);
    expect(typeof w.settings.executionTimeout).toBe('number');
    expect(w.settings.timezone).toBe('Australia/Sydney');
  });

  it('has Code nodes that compile', () => {
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$getWorkflowStaticData', 'require', String(n.parameters.jsCode)), `Code node "${n.name}"`).not.toThrow();
    }
  });

  it('does not use nodes that run commands, read files or call arbitrary services', () => {
    expect(w.nodes.filter((n) => /executeCommand|ssh|readWriteFile|localFileTrigger/i.test(n.type))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// a. blog-draft-to-pull-request
// ---------------------------------------------------------------------------

describe('blog-draft-to-pull-request', () => {
  const w = load('blog-draft-to-pull-request.json');

  it('has the weekly schedule and manual triggers', () => {
    expect(w.nodes.filter((n) => n.type === 'n8n-nodes-base.scheduleTrigger')).toHaveLength(1);
    expect(w.nodes.filter((n) => n.type === 'n8n-nodes-base.manualTrigger')).toHaveLength(1);
    const rule = w.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger')?.parameters.rule;
    expect(rule.interval[0].field).toBe('weeks');
  });

  it('fetches the search index from the configured site and calls the model through a credential placeholder', () => {
    expect(nodeNamed(w, 'Fetch search index').parameters.url).toBe('={{ $env.SITE_BASE_URL }}/api/v1/search-index.json');
    const llm = nodeNamed(w, 'Draft with LLM');
    expect(llm.parameters.url).toBe('={{ $env.LLM_API_URL }}');
    expect(llm.credentials?.httpHeaderAuth?.id).toBe('PLACEHOLDER');
  });

  it('cannot publish: no merge, approve, edit or delete operation anywhere', () => {
    const github = w.nodes.filter((n) => n.type === 'n8n-nodes-base.github');
    const pairs = github.map((n) => `${n.parameters.resource}:${n.parameters.operation}`).sort();
    expect(pairs).toEqual(['file:create', 'pullRequest:create']);
    for (const n of w.nodes.filter((x) => x.type === 'n8n-nodes-base.httpRequest')) {
      const method = String(n.parameters.method);
      const url = String(n.parameters.url);
      expect(['GET', 'POST'], `${n.name} uses ${method}`).toContain(method);
      expect(url, `${n.name}`).not.toMatch(/merge|\/pulls\/|auto_merge|\/reviews|\/releases|\/dispatches|\/contents\//i);
      if (url.includes('api.github.com')) expect(url).toMatch(/\/git\/(ref\/heads|refs)/);
    }
    const text = JSON.stringify(w);
    expect(text).not.toMatch(/"operation":\s*"(merge|delete|edit|update|close|dispatch)"/);
  });

  it('writes the draft to a branch, never to the base branch, and opens the PR from that branch', () => {
    const file = nodeNamed(w, 'Create draft file').parameters;
    expect(file.filePath).toContain('filePath');
    expect(String(file.additionalParameters.branch.branch)).toContain('.branch');
    const pr = nodeNamed(w, 'Open draft pull request').parameters;
    expect(pr.head).toContain('.branch');
    expect(pr.base).toBe('={{ $env.GITHUB_BASE_BRANCH }}');
    expect(pr.title).toContain('prTitle');
    expect(codeOf(w, 'Pre-checks')).toContain("prTitle: 'Draft: ' + draft.title");
    expect(codeOf(w, 'Pre-checks')).toContain("'apps/web/content-drafts/' + draft.slug + '.json'");
  });

  it('only reaches branch, file and PR creation through the pre-check "passed" output', () => {
    for (const target of ['Get base branch SHA', 'Create branch', 'Create draft file', 'Open draft pull request']) {
      expect(reachable(w, target), `${target} reachable`).toBe(true);
      expect(reachable(w, target, { skip: 'Pre-checks passed?' }), `${target} must sit behind the pre-check gate`).toBe(false);
      expect(reachable(w, target, { skipEdge: { from: 'Pre-checks passed?', output: 0 } }), `${target} must only follow the true output`).toBe(false);
      expect(reachable(w, target, { skipEdge: { from: 'Proceed?', output: 0 } }), `${target} must only follow the duplicate-check true output`).toBe(false);
    }
    expect(reachable(w, 'Draft with LLM', { skipEdge: { from: 'Proceed?', output: 0 } })).toBe(false);
  });

  it('keeps the rule lists in the Code nodes equal to the exported schema constants', () => {
    for (const name of ['Build prompt', 'Pre-checks']) {
      const code = codeOf(w, name);
      const domains = JSON.parse((/const AUTHORITATIVE_DOMAINS = (\[.*?\]);/s.exec(code) as RegExpExecArray)[1]!.replace(/'/g, '"')) as string[];
      expect(domains, name).toEqual([...AUTHORITATIVE_DOMAINS]);
      const cats = JSON.parse((/const CATEGORIES = (\[.*?\]);/s.exec(code) as RegExpExecArray)[1]!.replace(/'/g, '"')) as string[];
      expect(cats, name).toEqual([...POST_CATEGORIES]);
    }
    expect(codeOf(w, 'Pre-checks')).toContain('const MIN_WORDS = { post: 600, guide: 450 };');
  });

  const searchIndex = (titles: string[]): Item[] => [{ json: { apiVersion: '1', environment: 'production', data: titles.map((t, i) => ({ id: `item-${i}`, type: 'post', title: t, url: `https://example.test/blog/item-${i}/`, summary: 'x', updatedAt: null })) } }];

  it('Duplicate title check stops on a similar existing title and on an unreadable index, and passes a new topic', async () => {
    const code = codeOf(w, 'Duplicate title check');
    const brief = 'How support coordinators can compare supported independent living providers in regional NSW';
    const nodes = { 'Topic brief': [{ json: { brief, briefProvided: true } }] };
    const similar = await first(code, { nodes, input: searchIndex(['How support coordinators compare supported independent living providers']) });
    expect(similar.proceed).toBe(false);
    expect(similar.reason).toBe('similar_content_exists');
    const fresh = await first(code, { nodes, input: searchIndex(['What respite and short term accommodation can include']) });
    expect(fresh.proceed).toBe(true);
    expect(fresh.existingTitles).toHaveLength(1);
    const broken = await first(code, { nodes, input: [{ json: { error: 'timeout' } }] });
    expect(broken.proceed).toBe(false);
    expect(broken.reason).toBe('search_index_unreadable_or_unexpected_version');
    const noBrief = await first(code, { nodes: { 'Topic brief': [{ json: { brief: '', briefProvided: false } }] }, input: searchIndex([]) });
    expect(noBrief.proceed).toBe(false);
  });

  it('Duplicate title check applies the same prompt-safety rule as checkPromptSafety()', async () => {
    const code = codeOf(w, 'Duplicate title check');
    for (const brief of ['Contact the family on 0412 345 678 about moving in', 'Write about the participant with NDIS number 430 123 456', 'Explain things to a reader at someone@example.test please']) {
      expect(checkPromptSafety(brief).ok).toBe(false);
      const out = await first(code, { nodes: { 'Topic brief': [{ json: { brief, briefProvided: true } }] }, input: searchIndex([]) });
      expect(out.proceed, brief).toBe(false);
      expect(String(out.reason)).toMatch(/^prompt_safety:/);
    }
    const clean = 'Explain how short term accommodation differs from respite for regional families';
    expect(checkPromptSafety(clean).ok).toBe(true);
    expect((await first(code, { nodes: { 'Topic brief': [{ json: { brief: clean, briefProvided: true } }] }, input: searchIndex([]) })).proceed).toBe(true);
  });

  it('Build prompt carries the schema rules and sends no personal data', async () => {
    const code = codeOf(w, 'Build prompt');
    const out = await first(code, { env: { LLM_MODEL: 'model-placeholder' }, nodes: { 'Duplicate title check': [{ json: { brief: 'A plain-English explainer on short term accommodation', existingTitles: ['An existing title'] } }] } });
    const body = out.requestBody as Json;
    expect(body.model).toBe('model-placeholder');
    const prompt = `${body.system}\n${body.messages[0].content}`;
    expect(checkPromptSafety(prompt).ok).toBe(true);
    for (const d of AUTHORITATIVE_DOMAINS) expect(prompt).toContain(d);
    expect(prompt).toMatch(/participant/i);
    expect(prompt).toMatch(/at least 600 words/);
    expect(prompt).toMatch(/Never include personal information/);
    expect(prompt).toMatch(/NDIS approved/);
    expect(prompt).toContain('3 to 12 sections');
    await expect(first(code, { env: {}, nodes: { 'Duplicate title check': [{ json: { brief: 'x', existingTitles: [] } }] } })).rejects.toThrow(/LLM_MODEL/);
    await expect(first(code, { env: { LLM_MODEL: 'm' }, nodes: { 'Duplicate title check': [{ json: { brief: 'Call 0412 345 678', existingTitles: [] } }] } })).rejects.toThrow(/Prompt safety/);
  });

  describe('Pre-checks agree with blogDraftSchema and assessDraft', () => {
    const code = codeOf(w, 'Pre-checks');
    const base = JSON.parse(readText(join(repoRoot, 'apps', 'web', 'content-drafts', 'sil-provider-checklist.json'))) as Json;
    const asModelReply = (draft: Json): Item[] => [{ json: { content: [{ type: 'text', text: '```json\n' + JSON.stringify(draft) + '\n```' }] } }];
    const ctx = (draft: Json, existing: { titles?: string[]; slugs?: string[] } = {}): Ctx => ({
      env: { BLOG_AUTHOR_NAME: 'Editorial team' },
      nodes: { 'Duplicate title check': [{ json: { brief: 'brief', existingTitles: existing.titles ?? [], existingSlugs: existing.slugs ?? [] } }] },
      input: asModelReply(draft),
    });
    const reference = (draft: Json) => {
      const withAuthor = { ...draft, author: 'Editorial team', aiAssisted: true, aiNotes: 'x' };
      const parsed = blogDraftSchema.safeParse(withAuthor);
      return parsed.success && assessDraft(parsed.data).ok;
    };

    it('passes the repository sample draft, and the file it would write also passes the real schema and gates', async () => {
      expect(reference(base)).toBe(true);
      const out = await first(code, ctx(base));
      expect(out.errors).toEqual([]);
      expect(out.ok).toBe(true);
      expect(out.prTitle).toBe(`Draft: ${base.title}`);
      expect(out.branch).toBe(`draft/${base.slug}`);
      expect(out.filePath).toBe(`apps/web/content-drafts/${base.slug}.json`);
      const written = JSON.parse(String(out.fileContent)) as Json;
      expect(written.author).toBe('Editorial team');
      expect(written.aiAssisted).toBe(true);
      expect(written.publishedAt).toBeUndefined();
      const parsed = blogDraftSchema.safeParse(written);
      expect(parsed.success).toBe(true);
      expect(parsed.success && assessDraft(parsed.data).ok).toBe(true);
      expect(String(out.prBody)).toContain('not approved, not published');
    });

    it('drops fields the model should not set (publication date, extra keys) and uses the configured human author', async () => {
      const out = await first(code, ctx({ ...base, author: 'Claude', publishedAt: '2026-11-01', reviewState: 'approved', approvedBy: 'someone' }));
      const written = JSON.parse(String(out.fileContent)) as Json;
      expect(written.author).toBe('Editorial team');
      expect(written.publishedAt).toBeUndefined();
      expect(written.reviewState).toBeUndefined();
      expect(written.approvedBy).toBeUndefined();
    });

    const mutations: Array<[string, (d: Json) => Json]> = [
      ['thin content', (d) => ({ ...d, sections: d.sections.slice(0, 3).map((s: Json) => ({ heading: s.heading, body: [s.body[0]] })), faqs: [] })],
      ['only one source', (d) => ({ ...d, sources: d.sources.slice(0, 1) })],
      ['no authoritative sources', (d) => ({ ...d, sources: [{ label: 'A blog about providers', url: 'https://blog.example.test/a' }, { label: 'Another blog about providers', url: 'https://blog.example.test/b' }] })],
      ['http source', (d) => ({ ...d, sources: d.sources.map((s: Json) => ({ ...s, url: s.url.replace('https://', 'http://') })) })],
      ['title too long', (d) => ({ ...d, title: 'A very long title that goes well past the seventy character limit for titles' })],
      ['summary too short', (d) => ({ ...d, summary: 'Too short.' })],
      ['unknown category', (d) => ({ ...d, category: 'opinion' })],
      ['too few sections', (d) => ({ ...d, sections: d.sections.slice(0, 2) })],
      ['bad slug', (d) => ({ ...d, slug: 'Not A Slug' })],
      ['duplicate headings', (d) => ({ ...d, sections: [d.sections[0], d.sections[0], ...d.sections.slice(2)] })],
    ];
    it.each(mutations)('rejects: %s', async (_label, mutate) => {
      const draft = mutate(structuredClone(base));
      expect(reference(draft)).toBe(false);
      const out = await first(code, ctx(draft));
      expect(out.ok).toBe(false);
      expect((out.errors as string[]).length).toBeGreaterThan(0);
      expect(out.fileContent).toBe('');
    });

    it('rejects an email address, an NDIS-number-like value and a phone number in the text', async () => {
      for (const injected of ['Email the team at someone@example.test for help.', 'Quote reference 430 123 456 when you ring.', 'Ring 0412 345 678 to ask.']) {
        const draft = structuredClone(base);
        draft.sections[0].body[0] = `${draft.sections[0].body[0]} ${injected}`;
        const out = await first(code, ctx(draft));
        expect(out.ok, injected).toBe(false);
        expect((out.errors as string[]).join(',')).toMatch(/possible_personal_data/);
      }
    });

    it('rejects a slug or title that already exists, and output that is not JSON', async () => {
      expect((await first(code, ctx(base, { slugs: [base.slug] }))).errors).toContain('slug_already_exists');
      expect((await first(code, ctx(base, { titles: [base.title] }))).errors).toContain('title_already_exists');
      const out = await first(code, { ...ctx(base), input: [{ json: { choices: [{ message: { content: 'Sorry, I cannot do that.' } }] } }] });
      expect(out.ok).toBe(false);
      expect(out.errors).toContain('model_output_is_not_a_json_object');
    });

    it('accepts a chat-completions style reply, and rejects when no human author is configured or the author looks like an AI', async () => {
      const chat = { ...ctx(base), input: [{ json: { choices: [{ message: { content: JSON.stringify(base) } }] } }] };
      expect((await first(code, chat)).ok).toBe(true);
      expect((await first(code, { ...ctx(base), env: {} })).errors).toContain('author_not_configured');
      expect((await first(code, { ...ctx(base), env: { BLOG_AUTHOR_NAME: 'ChatGPT' } })).errors).toContain('author_must_be_a_human_or_named_role');
    });

    it('flags the same sensitive topics as detectSensitiveTopics() without blocking', async () => {
      const draftText = [base.title, base.summary, base.answer, ...base.sections.flatMap((x: Json) => [x.heading, ...x.body]), ...base.faqs.flatMap((f: Json) => [f.q, f.a])].join('\n');
      const expected = detectSensitiveTopics(draftText);
      const out = await first(code, ctx(base));
      const warned = String((out.warnings as string[]).find((x) => x.startsWith('sensitive_topics_')) ?? '');
      for (const topic of expected) expect(warned, topic).toContain(topic);
      if (expected.length === 0) expect(warned).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// b. post-deploy-indexnow
// ---------------------------------------------------------------------------

describe('post-deploy-indexnow', () => {
  const w = load('post-deploy-indexnow.json');
  const SECRET = 'test-secret-value-not-real';

  it('has a webhook trigger that keeps the raw body for the signature check', () => {
    const hook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook') as N8nNode;
    expect(hook.parameters.httpMethod).toBe('POST');
    expect(hook.parameters.options.rawBody).toBe(true);
    expect(hook.parameters.responseMode).toBe('responseNode');
    expect(typeof hook.webhookId).toBe('string');
  });

  it('documents the crypto allowance and checks the signature in a Code node that requires crypto', () => {
    const code = codeOf(w, 'Verify signature');
    expect(code).toContain("require('crypto')");
    expect(code).toContain('timingSafeEqual');
    expect(code).toContain('const MAX_SKEW_SECONDS = 300;');
    expect(code).toContain('$env.DEPLOY_WEBHOOK_SECRET');
    const sticky = w.nodes.filter((n) => n.type === 'n8n-nodes-base.stickyNote').map((n) => String(n.parameters.content)).join('\n');
    expect(sticky).toContain('NODE_FUNCTION_ALLOW_BUILTIN=crypto');
    expect(readText(join(n8nDir, 'README.md'))).toContain('NODE_FUNCTION_ALLOW_BUILTIN=crypto');
  });

  it('uses the same skew window as webhook.ts', () => {
    expect(MAX_SKEW_SECONDS).toBe(300);
    expect(codeOf(w, 'Verify signature')).toContain(`const MAX_SKEW_SECONDS = ${MAX_SKEW_SECONDS};`);
  });

  it('contains the production-host guard and the submit step only runs behind it', () => {
    const guard = codeOf(w, 'Production host guard');
    expect(guard).toContain('$env.SITE_BASE_URL');
    expect(guard).toContain('$env.PRODUCTION_HOST');
    expect(guard).toMatch(/localhost\|staging\|example\\\.invalid/);
    for (const target of ['Fetch sitemap', 'Build IndexNow payload', 'Submit to IndexNow']) {
      expect(reachable(w, target)).toBe(true);
      expect(reachable(w, target, { skip: 'Production host guard' }), `${target} must sit behind the guard`).toBe(false);
      expect(reachable(w, target, { skipEdge: { from: 'Guard passed?', output: 0 } }), `${target} must only follow the guard's true output`).toBe(false);
      expect(reachable(w, target, { skip: 'Verify signature' }), `${target} must sit behind the signature check`).toBe(false);
      expect(reachable(w, target, { skipEdge: { from: 'Signature valid?', output: 0 } }), `${target} must only follow the signature's true output`).toBe(false);
    }
  });

  it('posts to the IndexNow endpoint with host, key and keyLocation from the validated payload', () => {
    const submit = nodeNamed(w, 'Submit to IndexNow').parameters;
    expect(submit.url).toBe('https://api.indexnow.org/indexnow');
    expect(submit.method).toBe('POST');
    expect(submit.jsonBody).toBe('={{ JSON.stringify($json.payload) }}');
    const build = codeOf(w, 'Build IndexNow payload');
    expect(build).toContain('$env.INDEXNOW_KEY');
    expect(build).toContain('host: guard.host');
    expect(build).toContain("keyLocation: new URL('/indexnow-key.txt', guard.origin).toString()");
    expect(nodeNamed(w, 'Fetch sitemap').parameters.url).toBe('={{ $env.SITE_BASE_URL }}/sitemap.xml');
  });

  describe('production host guard behaviour', () => {
    const code = codeOf(w, 'Production host guard');
    const run = (env: Record<string, string>) => first(code, { env });
    it('allows only the exact https production origin', async () => {
      expect(await run({ SITE_BASE_URL: 'https://www.example.test', PRODUCTION_HOST: 'www.example.test' })).toMatchObject({ allowed: true, host: 'www.example.test', origin: 'https://www.example.test' });
    });
    it.each([
      ['staging host', { SITE_BASE_URL: 'https://staging.example.test', PRODUCTION_HOST: 'www.example.test' }],
      ['a different host that does not look like staging', { SITE_BASE_URL: 'https://other.example.test', PRODUCTION_HOST: 'www.example.test' }],
      ['same host in a different case is fine but a sub-domain is not', { SITE_BASE_URL: 'https://app.www.example.test', PRODUCTION_HOST: 'www.example.test' }],
      ['staging host even if it is configured as production', { SITE_BASE_URL: 'https://staging.example.test', PRODUCTION_HOST: 'staging.example.test' }],
      ['localhost', { SITE_BASE_URL: 'http://localhost:4331', PRODUCTION_HOST: 'localhost:4331' }],
      ['preview host', { SITE_BASE_URL: 'https://project-abc.vercel.app', PRODUCTION_HOST: 'project-abc.vercel.app' }],
      ['example.invalid', { SITE_BASE_URL: 'https://example.invalid', PRODUCTION_HOST: 'example.invalid' }],
      ['plain http', { SITE_BASE_URL: 'http://www.example.test', PRODUCTION_HOST: 'www.example.test' }],
      ['trailing slash', { SITE_BASE_URL: 'https://www.example.test/', PRODUCTION_HOST: 'www.example.test' }],
      ['path present', { SITE_BASE_URL: 'https://www.example.test/site', PRODUCTION_HOST: 'www.example.test' }],
      ['production host not configured', { SITE_BASE_URL: 'https://www.example.test' }],
      ['site url missing', { PRODUCTION_HOST: 'www.example.test' }],
      ['not a url', { SITE_BASE_URL: 'www.example.test', PRODUCTION_HOST: 'www.example.test' }],
    ])('refuses: %s', async (_label, env) => {
      const out = await run(env);
      expect(out.allowed).toBe(false);
      expect(typeof out.reason).toBe('string');
    });
  });

  describe('signature check agrees with verifyWebhook() and acceptWebhook() in webhook.ts', () => {
    const code = codeOf(w, 'Verify signature');
    const NOW = new Date('2026-11-03T10:00:00Z');
    const nowSec = Math.floor(NOW.getTime() / 1000);
    const bodyText = JSON.stringify({ event: 'deploy.succeeded', paths: ['/', '/guides/'] });
    const build = (over: { secret?: string; sigSecret?: string; ts?: number | string; tsHeader?: string; body?: string; sigBody?: string; prefix?: string; sig?: string | null } = {}) => {
      const ts = over.ts ?? nowSec;
      const body = over.body ?? bodyText;
      const sigHex = over.sig === undefined ? signWebhook(over.sigSecret ?? SECRET, Number(ts), over.sigBody ?? body) : over.sig;
      const headers: Json = {};
      if (sigHex !== null) headers['x-ablepoint-signature'] = (over.prefix ?? '') + sigHex;
      if (over.tsHeader !== undefined) headers['x-ablepoint-timestamp'] = over.tsHeader;
      else headers['x-ablepoint-timestamp'] = String(ts);
      return {
        item: { json: { headers, body: JSON.parse(bodyText) }, binary: { data: { data: Buffer.from(body, 'utf8').toString('base64'), mimeType: 'application/json' } } } as Item,
        body,
        sigHex,
        ts,
        secret: over.secret ?? SECRET,
      };
    };
    const n8n = async (c: ReturnType<typeof build>, staticData: Json = {}, viaHelper = true) => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const helpers = viaHelper ? { getBinaryDataBuffer: async () => Buffer.from(c.body, 'utf8') } : {};
      return first(code, { input: [c.item], env: { DEPLOY_WEBHOOK_SECRET: c.secret }, staticData, helpers });
    };
    const cases: Array<[string, NonNullable<Parameters<typeof build>[0]>]> = [
      ['valid signature', {}],
      ['valid signature with sha256= prefix', { prefix: 'sha256=' }],
      ['wrong secret', { sigSecret: 'another-secret' }],
      ['body changed after signing', { sigBody: '{"event":"other"}' }],
      ['missing signature', { sig: null }],
      ['malformed signature', { sig: 'zz' }],
      ['timestamp exactly 300 s old (accepted)', { ts: nowSec - 300 }],
      ['timestamp 301 s old', { ts: nowSec - 301 }],
      ['timestamp exactly 300 s in the future (accepted)', { ts: nowSec + 300 }],
      ['timestamp 301 s in the future', { ts: nowSec + 301 }],
      ['non-numeric timestamp', { tsHeader: 'yesterday' }],
      ['missing timestamp header value', { tsHeader: '' }],
    ];
    it.each(cases)('%s', async (_label, over) => {
      const c = build(over);
      const verdict = verifyWebhook({ secret: c.secret, body: c.body, signature: c.sigHex ?? undefined, timestamp: over.tsHeader ?? c.ts, now: NOW });
      const got = await n8n(c);
      expect(got.ok).toBe(verdict.ok);
      if (!verdict.ok) expect(got.reason).toBe(verdict.reason);
      else expect(got.paths).toEqual(['/', '/guides/']);
    });

    it('fails closed with no secret, like verifyWebhook()', async () => {
      const c = build({});
      const verdict = verifyWebhook({ secret: '', body: c.body, signature: c.sigHex ?? undefined, timestamp: c.ts, now: NOW });
      const got = await n8n({ ...c, secret: '' });
      expect(verdict).toEqual({ ok: false, reason: 'missing_secret' });
      expect(got).toEqual({ ok: false, reason: 'missing_secret' });
    });

    it('rejects a replay of the same delivery, like acceptWebhook()', async () => {
      const c = build({});
      const store = new InMemoryReplayStore();
      const args = { secret: c.secret, body: c.body, signature: c.sigHex as string, timestamp: c.ts, now: NOW };
      expect(acceptWebhook(args, store).ok).toBe(true);
      expect(acceptWebhook(args, store)).toEqual({ ok: false, reason: 'replayed' });
      const staticData: Json = {};
      expect((await n8n(c, staticData)).ok).toBe(true);
      expect(await n8n(c, staticData)).toEqual({ ok: false, reason: 'replayed' });
    });

    it('forgets an old delivery once its replay window has passed, like InMemoryReplayStore', async () => {
      const staticData: Json = {};
      const a = build({});
      expect((await n8n(a, staticData)).ok).toBe(true);
      const later = new Date(NOW.getTime() + MAX_SKEW_SECONDS * 2 * 1000 + 1000);
      const laterSec = Math.floor(later.getTime() / 1000);
      const b = build({ ts: laterSec });
      vi.useFakeTimers();
      vi.setSystemTime(later);
      const out = await first(code, { input: [b.item], env: { DEPLOY_WEBHOOK_SECRET: SECRET }, staticData, helpers: { getBinaryDataBuffer: async () => Buffer.from(b.body, 'utf8') } });
      expect(out.ok).toBe(true);
      // the first delivery's key was purged, leaving only the new one (same behaviour as the in-memory store)
      expect(Object.keys((staticData.seen ?? {}) as Json)).toHaveLength(1);
      const store = new InMemoryReplayStore();
      expect(acceptWebhook({ secret: SECRET, body: a.body, signature: a.sigHex as string, timestamp: a.ts, now: NOW }, store).ok).toBe(true);
      expect(acceptWebhook({ secret: SECRET, body: b.body, signature: b.sigHex as string, timestamp: b.ts, now: later }, store).ok).toBe(true);
      expect(store.size).toBe(1);
    });

    it('reads the raw body from inline binary data when the helper is unavailable, and fails closed when neither works', async () => {
      const c = build({});
      expect((await n8n(c, {}, false)).ok).toBe(true);
      const noBody = { ...c, item: { json: c.item.json } as Item };
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const out = await first(code, { input: [noBody.item], env: { DEPLOY_WEBHOOK_SECRET: SECRET }, helpers: {} });
      expect(out).toEqual({ ok: false, reason: 'raw_body_unavailable' });
    });
  });

  describe('payload builder follows buildPayload() in apps/web/scripts/indexnow.mjs', () => {
    const code = codeOf(w, 'Build IndexNow payload');
    const sitemap = (...urls: string[]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
    const nodes = (paths: string[] = []) => ({ 'Production host guard': [{ json: { allowed: true, host: 'www.example.test', origin: 'https://www.example.test' } }], 'Verify signature': [{ json: { ok: true, paths } }] });
    const env = { INDEXNOW_KEY: 'abcdef1234567890abcdef1234567890' };

    it('builds host, key, keyLocation and a de-duplicated URL list', async () => {
      const out = await first(code, { env, nodes: nodes(), input: [{ json: { data: sitemap('https://www.example.test/', 'https://www.example.test/guides/', 'https://www.example.test/', 'https://www.example.test/a?x=1&amp;y=2') } }] });
      expect(out.ready).toBe(true);
      expect(out.payload).toEqual({
        host: 'www.example.test',
        key: env.INDEXNOW_KEY,
        keyLocation: 'https://www.example.test/indexnow-key.txt',
        urlList: ['https://www.example.test/', 'https://www.example.test/guides/', 'https://www.example.test/a?x=1&y=2'],
      });
    });
    it('submits only changed paths that are in the sitemap when paths are given', async () => {
      const out = await first(code, { env, nodes: nodes(['/guides/', '/not-in-sitemap/']), input: [{ json: { data: sitemap('https://www.example.test/', 'https://www.example.test/guides/') } }] });
      expect((out.payload as Json).urlList).toEqual(['https://www.example.test/guides/']);
    });
    it.each([
      ['a URL on another host', sitemap('https://www.example.test/', 'https://other.example.test/x'), env, 'sitemap_contains_a_url_on_another_host'],
      ['no URLs', sitemap(), env, 'no_urls_to_submit'],
      ['a sitemap that is not a urlset', '<html>Not found</html>', env, 'sitemap_missing_or_not_a_urlset'],
      ['a bad key', sitemap('https://www.example.test/'), { INDEXNOW_KEY: 'short' }, 'indexnow_key_invalid'],
      ['a key with a space', sitemap('https://www.example.test/'), { INDEXNOW_KEY: 'abcdef 1234567890' }, 'indexnow_key_invalid'],
    ])('refuses %s', async (_label, xml, e, reason) => {
      const out = await first(code, { env: e, nodes: nodes(), input: [{ json: { data: xml } }] });
      expect(out).toEqual({ ready: false, reason });
    });
    it('refuses more than 10,000 URLs', async () => {
      const urls = Array.from({ length: 10001 }, (_, i) => `https://www.example.test/p${i}/`);
      expect(await first(code, { env, nodes: nodes(), input: [{ json: { data: sitemap(...urls) } }] })).toEqual({ ready: false, reason: 'too_many_urls' });
    });
  });

  it('treats only 200 and 202 from IndexNow as accepted', async () => {
    const code = codeOf(w, 'Evaluate IndexNow response');
    const nodes = { 'Build IndexNow payload': [{ json: { count: 7 } }] };
    for (const [status, ok] of [[200, true], [202, true], [400, false], [403, false], [422, false], [429, false]] as const) {
      const out = await first(code, { nodes, input: [{ json: { statusCode: status } }] });
      expect(out.ok, String(status)).toBe(ok);
      expect(out.submitted).toBe(ok ? 7 : 0);
    }
    expect((await first(code, { nodes, input: [{ json: { error: 'timeout' } }] })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// c. vacancy-staleness-monitor
// ---------------------------------------------------------------------------

describe('vacancy-staleness-monitor', () => {
  const w = load('vacancy-staleness-monitor.json');
  const code = codeOf(w, 'Flag stale or unconfirmed vacancies');
  const NOW = new Date('2026-11-20T00:00:00Z');

  it('uses the same staleness constant as packages/automation/src/vacancy.ts', () => {
    expect(VACANCY_STALE_DAYS).toBe(14);
    expect(VACANCY_STALE_DAYS).toBe(SCHEMAS_VACANCY_STALE_DAYS);
    const days = /const VACANCY_STALE_DAYS = (\d+);/.exec(code);
    expect(days, 'constant declared in the Code node').not.toBeNull();
    expect(Number(days?.[1])).toBe(VACANCY_STALE_DAYS);
    const dayMs = /const DAY_MS = (\d+);/.exec(code);
    expect(Number(dayMs?.[1])).toBe(DAY_MS);
  });

  it('reads the vacancies API and notifies through an environment-variable address', () => {
    expect(nodeNamed(w, 'Fetch vacancies API').parameters.url).toBe('={{ $env.SITE_BASE_URL }}/api/v1/vacancies.json');
    expect(nodeNamed(w, 'Notify vacancy owner').parameters.toEmail).toBe('={{ $env.VACANCY_NOTIFY_ADDRESS }}');
    expect(nodeNamed(w, 'Daily schedule').parameters.rule.interval[0].field).toBe('days');
    expect(reachable(w, 'Notify vacancy owner', { skipEdge: { from: 'Any vacancies flagged?', output: 0 } })).toBe(false);
  });

  const vac = (id: string, availability: string, lastVerifiedAt: string | null) => ({ id, type: 'vacancy', title: id, url: `https://example.test/vacancies/${id}/`, vacancyType: 'SIL', region: 'central-coast', suburb: 'Gosford', summary: 's', features: [], availability, lastVerifiedAt });
  const run = async (rows: Json[]) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    return first(code, { input: [{ json: { apiVersion: '1', environment: 'production', generatedAt: NOW.toISOString(), publisher: 'x', data: rows } }] });
  };
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

  it.each([0, 1, 13, 13.99, 14, 14.0001, 14.5, 15, 60])('flags an available vacancy verified %s days ago exactly when vacancyDisplay() says unconfirmed', async (age) => {
    const verified = ago(age);
    const shownByRules = vacancyDisplay('available', verified, NOW);
    const out = await run([vac('v1', 'available', verified)]);
    expect(out.hasIssues).toBe(shownByRules === 'unconfirmed');
    if (age === 14) expect(out.hasIssues).toBe(false);
    if (age === 14.0001) expect(out.hasIssues).toBe(true);
  });

  it('flags an available vacancy with no verification date, like vacancyDisplay()', async () => {
    expect(vacancyDisplay('available', undefined, NOW)).toBe('unconfirmed');
    const out = await run([vac('v1', 'available', null)]);
    expect(out.hasIssues).toBe(true);
    expect((out.flagged as Json[])[0]?.problem).toBe('never_verified');
  });

  it('flags a vacancy already shown as unconfirmed, and ignores states that do not depend on verification age', async () => {
    const out = await run([
      vac('recent-unconfirmed', 'unconfirmed', ago(2)),
      vac('old-unconfirmed', 'unconfirmed', ago(30)),
      vac('paused', 'temporarilyUnavailable', ago(90)),
      vac('gone', 'noLongerAvailable', null),
      vac('fresh', 'available', ago(3)),
    ]);
    const flagged = out.flagged as Json[];
    expect(flagged.map((f) => f.id)).toEqual(['recent-unconfirmed', 'old-unconfirmed']);
    expect(flagged.map((f) => f.problem)).toEqual(['shown_as_unconfirmed', 'verification_older_than_14_days']);
    expect(out.count).toBe(2);
    expect(String(out.notifyText)).toContain('Only a person who knows the real situation can confirm availability');
  });

  it('reports nothing when every vacancy is fresh or the list is empty, and alerts when the API is unreadable', async () => {
    expect((await run([])).hasIssues).toBe(false);
    expect((await run([vac('a', 'available', ago(1))])).hasIssues).toBe(false);
    const broken = await first(code, { input: [{ json: { error: 'timeout' } }] });
    expect(broken.hasIssues).toBe(true);
    expect(String(broken.notifySubject)).toContain('could not read');
  });

  it('only lists public fields', async () => {
    const out = await run([vac('a', 'available', null)]);
    expect(Object.keys((out.flagged as Json[])[0] as Json).sort()).toEqual(['ageDays', 'id', 'lastVerifiedAt', 'problem', 'region', 'shownAs', 'suburb', 'type']);
  });
});

// ---------------------------------------------------------------------------
// d. site-health-monitor
// ---------------------------------------------------------------------------

describe('site-health-monitor', () => {
  const w = load('site-health-monitor.json');
  const listCode = codeOf(w, 'Build check list');
  const evalCode = codeOf(w, 'Evaluate checks');
  const BASE = 'https://www.example.test';

  it('runs every 30 minutes and alerts through an environment-variable address, only when something failed', () => {
    expect(nodeNamed(w, 'Every 30 minutes').parameters.rule.interval[0]).toEqual({ field: 'minutes', minutesInterval: 30 });
    expect(nodeNamed(w, 'Send alert').parameters.toEmail).toBe('={{ $env.ALERT_NOTIFY_ADDRESS }}');
    expect(reachable(w, 'Send alert', { skipEdge: { from: 'Any alerts?', output: 0 } })).toBe(false);
  });

  it('uses the same thresholds as monitoring.ts', () => {
    expect(evaluateUptime([{ at: new Date(0), status: 500 }, { at: new Date(1), status: null }]).alert).toBe(true);
    expect(evalCode).toContain('const MIN_CONSECUTIVE = 2;');
    expect(evalCode).toContain('const COOLDOWN_MINUTES = 60;');
  });

  it('checks the paths named in the brief, and refuses to start without a valid environment', async () => {
    const items = await runCode(listCode, { env: { SITE_BASE_URL: BASE, SITE_EXPECTED_ENV: 'production' } });
    const paths = items.map((i) => i.json.path);
    expect(paths).toEqual(expect.arrayContaining(['/', '/locations/', '/referral/', '/robots.txt', '/sitemap.xml', '/api/v1/index.json']));
    expect(items.map((i) => i.json.url)).toContain(`${BASE}/api/v1/index.json`);
    await expect(runCode(listCode, { env: { SITE_BASE_URL: BASE, SITE_EXPECTED_ENV: 'prod' } })).rejects.toThrow(/SITE_EXPECTED_ENV/);
    await expect(runCode(listCode, { env: { SITE_BASE_URL: 'not a url', SITE_EXPECTED_ENV: 'staging' } })).rejects.toThrow(/SITE_BASE_URL/);
  });

  // Fake HTTP responses shaped like the HTTP Request node output with "include response headers and status" and text format.
  type Env = 'production' | 'staging';
  const page = (env: Env, over: { meta?: boolean; header?: boolean; status?: number } = {}): Json => ({
    statusCode: over.status ?? 200,
    headers: (over.header ?? env === 'staging') ? { 'x-robots-tag': 'noindex, nofollow' } : {},
    body: `<html><head><meta name="robots" content="${(over.meta ?? env === 'staging') ? 'noindex, nofollow' : 'index, follow'}" /></head><body>ok</body></html>`,
  });
  const healthy = (env: Env, path: string): Json => {
    if (path === '/robots.txt') return { statusCode: 200, headers: {}, body: env === 'production' ? 'User-agent: *\nAllow: /\nDisallow: /thank-you/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://www.example.test/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n' };
    if (path === '/sitemap.xml') return env === 'production' ? { statusCode: 200, headers: {}, body: '<?xml version="1.0"?><urlset></urlset>' } : { statusCode: 404, headers: {}, body: 'Not found' };
    if (path === '/api/v1/index.json') return { statusCode: 200, headers: { 'X-Robots-Tag': 'noindex' }, body: JSON.stringify({ apiVersion: '1', environment: env, data: {} }) };
    return page(env);
  };
  const NOW = new Date('2026-11-03T00:00:00Z');
  const tick = async (env: Env, mutate: (path: string, res: Json) => Json, staticData: Json, at: Date) => {
    vi.useFakeTimers();
    vi.setSystemTime(at);
    const list = await runCode(listCode, { env: { SITE_BASE_URL: BASE, SITE_EXPECTED_ENV: env } });
    const responses = list.map((i) => ({ json: mutate(String(i.json.path), healthy(env, String(i.json.path))) }));
    return first(evalCode, { nodes: { 'Build check list': list }, input: responses, staticData });
  };
  const same = (_p: string, r: Json) => r;
  const ids = (out: Json) => (out.alerts as Json[]).map((a) => a.id).sort();

  it.each(['production', 'staging'] as const)('is quiet when a healthy %s site answers correctly', async (env) => {
    const out = await tick(env, same, {}, NOW);
    expect(out.hasAlerts).toBe(false);
    expect(out.checked).toBe(7);
  });

  it('accepts the API body when the HTTP node gives it as { data: text }', async () => {
    const out = await tick('production', (p, r) => (p === '/api/v1/index.json' ? { ...r, body: { data: r.body } } : r), {}, NOW);
    expect(out.hasAlerts).toBe(false);
  });

  it('alerts at once when a production page is noindex (header or meta), as a critical problem', async () => {
    const byMeta = await tick('production', (p, r) => (p === '/' ? page('production', { meta: true }) : r), {}, NOW);
    expect(ids(byMeta)).toEqual(['home']);
    expect((byMeta.alerts as Json[])[0]).toMatchObject({ severity: 'critical', problems: ['production_page_is_noindex'] });
    const byHeader = await tick('production', (p, r) => (p === '/referral/' ? page('production', { header: true }) : r), {}, NOW);
    expect(ids(byHeader)).toEqual(['referral']);
  });

  it('alerts at once when a staging page is indexable, naming what is missing', async () => {
    const out = await tick('staging', (p, r) => (p === '/locations/' ? page('staging', { header: false }) : r), {}, NOW);
    expect(ids(out)).toEqual(['locations']);
    expect(((out.alerts as Json[])[0] as Json).problems).toEqual(['staging_page_missing_noindex_header']);
    const both = await tick('staging', (p, r) => (p === '/' ? page('production') : r), {}, NOW);
    expect(((both.alerts as Json[])[0] as Json).problems).toEqual(['staging_page_missing_noindex_header_and_meta']);
  });

  it('alerts at once on the wrong robots.txt, a staging sitemap, a wrong API environment and invalid JSON', async () => {
    expect(ids(await tick('production', (p, r) => (p === '/robots.txt' ? { ...r, body: 'User-agent: *\nDisallow: /\n' } : r), {}, NOW))).toEqual(['robots-txt']);
    expect(ids(await tick('staging', (p, r) => (p === '/robots.txt' ? { ...r, body: 'User-agent: *\nAllow: /\n' } : r), {}, NOW))).toEqual(['robots-txt']);
    expect(ids(await tick('staging', (p, r) => (p === '/sitemap.xml' ? { statusCode: 200, headers: {}, body: '<urlset></urlset>' } : r), {}, NOW))).toEqual(['sitemap']);
    expect(ids(await tick('production', (p, r) => (p === '/api/v1/index.json' ? { ...r, body: JSON.stringify({ apiVersion: '1', environment: 'staging' }) } : r), {}, NOW))).toEqual(['api-index']);
    // invalid JSON is an availability-class failure: it alerts on the second failure in a row
    const staticData: Json = {};
    const broken = (p: string, r: Json) => (p === '/api/v1/index.json' ? { ...r, body: '<html>oops' } : r);
    expect((await tick('production', broken, staticData, NOW)).hasAlerts).toBe(false);
    const invalid = await tick('production', broken, staticData, new Date(NOW.getTime() + 30 * 60000));
    expect(((invalid.alerts as Json[])[0] as Json).problems).toContain('api_index_is_not_valid_json');
  });

  it('treats any 5xx as critical at once, like evaluateVitals()', async () => {
    const out = await tick('production', (p, r) => (p === '/' ? { ...r, statusCode: 503 } : r), {}, NOW);
    expect((out.alerts as Json[])[0]).toMatchObject({ id: 'home', severity: 'critical' });
  });

  it('alerts on the second failure in a row for a 404 or a timeout, like evaluateUptime()', async () => {
    const staticData: Json = {};
    const notFound = (p: string, r: Json) => (p === '/contact-us/' ? { ...r, statusCode: 404 } : r);
    const timeout = (p: string, r: Json) => (p === '/contact-us/' ? { error: 'timeout' } : r);
    const t0 = NOW;
    const first1 = await tick('production', notFound, staticData, t0);
    expect(first1.hasAlerts).toBe(false);
    const second = await tick('production', timeout, staticData, new Date(t0.getTime() + 30 * 60000));
    expect(ids(second)).toEqual(['contact']);
    expect((second.alerts as Json[])[0]).toMatchObject({ severity: 'warning', consecutiveFailures: 2 });
    // The reference rule for the same two checks
    expect(evaluateUptime([{ at: t0, status: 404 }, { at: new Date(t0.getTime() + 30 * 60000), status: null }]).alert).toBe(true);
    expect(evaluateUptime([{ at: t0, status: 404 }]).alert).toBe(false);
  });

  it('resets the failure count after a good check', async () => {
    const staticData: Json = {};
    const bad = (p: string, r: Json) => (p === '/contact-us/' ? { ...r, statusCode: 404 } : r);
    await tick('production', bad, staticData, NOW);
    await tick('production', same, staticData, new Date(NOW.getTime() + 30 * 60000));
    const out = await tick('production', bad, staticData, new Date(NOW.getTime() + 60 * 60000));
    expect(out.hasAlerts).toBe(false);
  });

  it('does not repeat an alert inside the 60 minute cooldown and repeats at exactly 60 minutes, like shouldNotify()', async () => {
    const staticData: Json = {};
    const down = (p: string, r: Json) => (p === '/' ? { ...r, statusCode: 500 } : r);
    const t0 = NOW;
    expect(ids(await tick('production', down, staticData, t0))).toEqual(['home']);
    const at = (min: number) => new Date(t0.getTime() + min * 60000);
    expect(shouldNotify({ lastNotifiedAt: t0, now: at(30) })).toBe(false);
    expect((await tick('production', down, staticData, at(30))).hasAlerts).toBe(false);
    expect(shouldNotify({ lastNotifiedAt: t0, now: at(59) })).toBe(false);
    expect((await tick('production', down, staticData, at(59))).hasAlerts).toBe(false);
    expect(shouldNotify({ lastNotifiedAt: t0, now: at(60) })).toBe(true);
    expect(ids(await tick('production', down, staticData, at(60)))).toEqual(['home']);
  });
});

// ---------------------------------------------------------------------------
// Documentation files that ship with the exports
// ---------------------------------------------------------------------------

describe('n8n README and credentials list', () => {
  const readme = readText(join(n8nDir, 'README.md'));
  const credentials = readText(join(n8nDir, 'credentials.md'));

  it('state honestly that nothing was imported or run', () => {
    expect(readme).toContain(NOT_TESTED_LINE);
    expect(readme).toMatch(/Not imported/i);
    expect(readme).toMatch(/Not run/i);
  });

  it('contain no email addresses or secret-looking strings', () => {
    for (const [name, text] of [['README.md', readme], ['credentials.md', credentials]] as const) {
      expect(EMAIL.test(text), name).toBe(false);
      for (const [label, re] of TOKEN_PATTERNS) expect(re.test(text), `${label} in ${name}`).toBe(false);
    }
  });

  it('list every credential name used in the exports', () => {
    for (const file of WORKFLOW_FILES) {
      for (const n of load(file).nodes) for (const cred of Object.values(n.credentials ?? {})) expect(credentials, cred.name).toContain(cred.name);
    }
  });
});

// ---------------------------------------------------------------------------
// CI helper files (.github and apps/web/lighthouserc.json). These do not run here: there is no repository.
// ---------------------------------------------------------------------------

describe('CI helper files', () => {
  const gh = (p: string) => readText(join(repoRoot, '.github', p));

  it('lighthouserc.json asserts the agreed budgets, uses the mobile form factor and does not assert SEO', () => {
    const rc = JSON.parse(readText(join(repoRoot, 'apps', 'web', 'lighthouserc.json'))) as Json;
    const assertions = rc.ci.assert.assertions as Json;
    expect(assertions['categories:performance'][1].minScore).toBe(0.9);
    expect(assertions['categories:accessibility'][1].minScore).toBe(1);
    expect(assertions['categories:best-practices'][1].minScore).toBe(0.95);
    expect(assertions['largest-contentful-paint'][1].maxNumericValue).toBe(2500);
    expect(assertions['cumulative-layout-shift'][1].maxNumericValue).toBe(0.1);
    expect(Object.keys(assertions).some((k) => /seo/i.test(k))).toBe(false);
    expect(rc.ci.assert.preset).toBeUndefined();
    expect(rc.ci.collect.settings.formFactor).toBe('mobile');
    expect(rc.ci.upload.target).toBe('filesystem');
    const urls = rc.ci.collect.url as string[];
    expect(urls.map((u) => new URL(u).pathname)).toEqual(expect.arrayContaining(['/', '/locations/', '/referral/']));
    expect(urls.length).toBeGreaterThanOrEqual(5);
    expect(urls.every((u) => new URL(u).hostname === 'localhost')).toBe(true);
  });

  it('lighthouse budgets match the engineering targets in monitoring.ts', () => {
    const rc = JSON.parse(readText(join(repoRoot, 'apps', 'web', 'lighthouserc.json'))) as Json;
    const a = rc.ci.assert.assertions as Json;
    expect(a['largest-contentful-paint'][1].maxNumericValue).toBe(VITALS_THRESHOLDS.lcpMs);
    expect(a['cumulative-layout-shift'][1].maxNumericValue).toBe(VITALS_THRESHOLDS.cls);
  });

  it('the lighthouse workflow is read-only, pins the LHCI version, and keeps staging reports private', () => {
    const text = gh('workflows/lighthouse.yml');
    expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(text).not.toMatch(/\bwrite\b\s*$/m);
    expect(text).not.toMatch(/secrets\./);
    expect(text).toMatch(/@lhci\/cli@\d+\.\d+\.\d+/);
    expect(text).toContain('pull_request');
    expect(text).not.toContain('temporary-public-storage');
    expect(text).toContain('serve-dist.mjs');
  });

  it('dependabot keeps TypeScript on 6.x and groups npm updates', () => {
    const text = gh('dependabot.yml');
    expect(text).toMatch(/package-ecosystem: "npm"/);
    expect(text).toMatch(/package-ecosystem: "github-actions"/);
    expect(text).toMatch(/dependency-name: "typescript"[\s\S]*version-update:semver-major/);
    expect(text).toMatch(/@astrojs\/check/);
    expect(text).toMatch(/dependency-name: "vitest"/);
  });

  it('the pull request template carries the safety checklist', () => {
    const text = gh('pull_request_template.md');
    for (const phrase of [/participant data/i, /unverified claims/i, /banned wording/i, /approval hash/i, /accessibility/i, /form pages/i]) expect(text).toMatch(phrase);
  });

  it('new workflows have at most read-only permissions and no secrets', () => {
    const text = gh('workflows/lighthouse.yml');
    expect(text.match(/permissions:/g)).toHaveLength(1);
    for (const [label, re] of TOKEN_PATTERNS) expect(re.test(text), label).toBe(false);
  });
});
