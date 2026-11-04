import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ContentStore, createServer, DistSource, type RawSource, type ResourceName, type ToolPayload } from '../src';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_SITE = path.join(here, 'fixtures', 'site');
/** Fixed "now" so vacancy ages are deterministic. Fixtures were written around this date. */
export const NOW = new Date('2026-11-03T12:00:00Z');

/** Serves the fixture files but rewrites the envelope's environment (to test the staging note). */
export class RewritingSource implements RawSource {
  readonly kind = 'dist' as const;
  private readonly inner = new DistSource(FIXTURE_SITE);
  constructor(private readonly rewrite: (resource: ResourceName, envelope: Record<string, unknown>) => Record<string, unknown>) {}
  async fetchText(resource: ResourceName): Promise<string> {
    const env = JSON.parse(await this.inner.fetchText(resource)) as Record<string, unknown>;
    return JSON.stringify(this.rewrite(resource, env));
  }
}

export async function connect(raw: RawSource = new DistSource(FIXTURE_SITE), opts: { now?: Date } = {}) {
  const store = new ContentStore(raw);
  const server = createServer({ store, now: () => opts.now ?? NOW });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, store, close: () => client.close() };
}

export type Client_ = Awaited<ReturnType<typeof connect>>['client'];

export interface Called {
  result: CallToolResult;
  /** Parsed from the text block. A test also checks it equals structuredContent. */
  payload: ToolPayload;
  text: string;
}

export async function call(client: Client_, name: string, args: Record<string, unknown> = {}): Promise<Called> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  if (result.isError) throw new Error(`Tool ${name} returned an error: ${JSON.stringify(result.content)}`);
  const first = result.content[0];
  if (!first || first.type !== 'text') throw new Error('Expected a text block');
  const payload = JSON.parse(first.text) as ToolPayload;
  return { result, payload, text: first.text };
}

/** For calls that are expected to fail as tool errors. */
export async function callError(client: Client_, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  expectErrorShape(result);
  const first = result.content[0];
  return first && first.type === 'text' ? first.text : '';
}

function expectErrorShape(result: CallToolResult) {
  if (!result.isError) throw new Error('Expected isError to be true but the call succeeded: ' + JSON.stringify(result.content).slice(0, 200));
}

export async function readFixture(resource: string): Promise<string> {
  return readFile(path.join(FIXTURE_SITE, 'api', 'v1', `${resource}.json`), 'utf8');
}

/** Builds a fetch that answers /api/v1/<resource>.json from the fixtures, recording every call. */
export function fixtureFetch(onCall?: (url: string, init: RequestInit | undefined) => void): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    onCall?.(url, init);
    const m = /\/api\/v1\/([a-z-]+)\.json$/.exec(new URL(url).pathname);
    if (!m) return new Response('not found', { status: 404 });
    return new Response(await readFixture(m[1] as string), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
