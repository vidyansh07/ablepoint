import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { isAllowedProtocolAndHost } from './config';
import { SourceError } from './errors';
import { silentLogger, type Logger } from './log';
import { envelopeSchema, resourceSchemas, RESOURCE_NAMES, type Environment, type ResourceData, type ResourceName } from './schemas';
import { USER_AGENT } from './version';

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 3;

/** Something that can return the raw text of one resource. The two implementations differ only in where the text comes from. */
export interface RawSource {
  readonly kind: 'dist' | 'url';
  fetchText(resource: ResourceName): Promise<string>;
}

function assertKnownResource(resource: string): asserts resource is ResourceName {
  // The resource name is never taken from a caller; this is a second line of defence against path or URL injection.
  if (!(RESOURCE_NAMES as readonly string[]).includes(resource)) throw new SourceError('not_found', 'Unknown resource.');
}

export class DistSource implements RawSource {
  readonly kind = 'dist' as const;
  private readonly root: string;
  constructor(dir: string, private readonly maxBytes: number = DEFAULT_MAX_BYTES) {
    this.root = path.resolve(dir, 'api', 'v1');
  }
  async fetchText(resource: ResourceName): Promise<string> {
    assertKnownResource(resource);
    const file = path.join(this.root, `${resource}.json`);
    let size: number;
    try {
      size = (await stat(file)).size;
    } catch {
      throw new SourceError('not_found', `The file for "${resource}" was not found in the dist directory.`);
    }
    if (size > this.maxBytes) throw new SourceError('too_large', `The file for "${resource}" is larger than the ${this.maxBytes} byte limit.`);
    try {
      return await readFile(file, 'utf8');
    } catch {
      throw new SourceError('not_found', `The file for "${resource}" could not be read.`);
    }
  }
}

export interface HttpSourceOptions {
  /** Already validated by normaliseBaseUrl (https, or http on localhost/127.0.0.1). */
  baseUrl: string;
  /** Injected in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Fetches https://<base>/api/v1/<resource>.json. Rules: one overall deadline per resource (default 10 s), body cap (default
 * 2 MB), redirects followed by hand and only within the same origin (or an http to https upgrade of the same host), no
 * cookies or credentials, plain User-Agent.
 */
export class HttpSource implements RawSource {
  readonly kind = 'url' as const;
  private readonly base: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(opts: HttpSourceOptions) {
    this.base = new URL(opts.baseUrl.replace(/\/+$/, '') + '/');
    if (!isAllowedProtocolAndHost(this.base)) throw new SourceError('redirect_refused', 'The base URL is not allowed.');
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async fetchText(resource: ResourceName): Promise<string> {
    assertKnownResource(resource);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SourceError('timeout', `Fetching "${resource}" took longer than ${Math.round(this.timeoutMs / 1000)} seconds.`));
      }, this.timeoutMs);
    });
    deadline.catch(() => {}); // avoid an unhandled rejection when the work finishes first
    const within = <T>(p: Promise<T>): Promise<T> => Promise.race([p, deadline]);

    try {
      let current = new URL(`api/v1/${resource}.json`, this.base);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let res: Response;
        try {
          res = await within(
            this.fetchImpl(current.toString(), {
              method: 'GET',
              redirect: 'manual',
              credentials: 'omit',
              signal: controller.signal,
              headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            }),
          );
        } catch (e) {
          if (e instanceof SourceError) throw e;
          if (controller.signal.aborted) throw new SourceError('timeout', `Fetching "${resource}" took longer than ${Math.round(this.timeoutMs / 1000)} seconds.`);
          throw new SourceError('network', `Fetching "${resource}" failed (network error).`);
        }

        if (res.status >= 300 && res.status < 400) {
          void res.body?.cancel().catch(() => {});
          const location = res.headers.get('location');
          if (!location) throw new SourceError('redirect_refused', `The server answered "${resource}" with a redirect that has no destination.`);
          let next: URL;
          try {
            next = new URL(location, current);
          } catch {
            throw new SourceError('redirect_refused', 'A redirect pointed to an invalid address.');
          }
          if (!this.redirectAllowed(current, next)) throw new SourceError('redirect_refused', 'A redirect to a different host (or to an unsafe address) was refused.');
          current = next;
          continue;
        }
        if (res.status !== 200) {
          void res.body?.cancel().catch(() => {});
          throw new SourceError(res.status === 404 ? 'not_found' : 'http_status', `The server answered "${resource}" with HTTP status ${res.status}.`);
        }
        return await within(this.readCapped(res, resource));
      }
      throw new SourceError('redirect_refused', 'Too many redirects.');
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
    }
  }

  private redirectAllowed(from: URL, to: URL): boolean {
    if (!isAllowedProtocolAndHost(to) || to.username || to.password) return false;
    if (to.origin === from.origin) return true;
    // Allow only the plain upgrade of the same host from http to https (for example a localhost proxy).
    return from.protocol === 'http:' && to.protocol === 'https:' && to.hostname === from.hostname;
  }

  private async readCapped(res: Response, resource: string): Promise<string> {
    const tooLarge = () => new SourceError('too_large', `The response for "${resource}" is larger than the ${this.maxBytes} byte limit.`);
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > this.maxBytes) {
      void res.body?.cancel().catch(() => {});
      throw tooLarge();
    }
    if (!res.body) {
      const t = await res.text();
      if (new TextEncoder().encode(t).byteLength > this.maxBytes) throw tooLarge();
      return t;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.byteLength;
    }
    return new TextDecoder('utf-8').decode(all);
  }
}

export interface SnapshotMeta {
  apiVersion: string;
  environment: Environment;
  generatedAt: string;
  publisher: string;
}
export interface Snapshot<T> {
  meta: SnapshotMeta;
  data: T;
}

export interface ContentStoreOptions {
  ttlMs?: number;
  /** Injected in tests. */
  now?: () => number;
  logger?: Logger;
}

/** Validates what a RawSource returns and caches the result in memory (default 5 minutes). Failures are not cached. */
export class ContentStore {
  private readonly cache = new Map<ResourceName, { at: number; value: Promise<Snapshot<unknown>> }>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly logger: Logger;

  constructor(private readonly raw: RawSource, opts: ContentStoreOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = opts.now ?? Date.now;
    this.logger = opts.logger ?? silentLogger;
  }

  get kind(): 'dist' | 'url' {
    return this.raw.kind;
  }

  get<K extends ResourceName>(resource: K): Promise<Snapshot<ResourceData[K]>> {
    const hit = this.cache.get(resource);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value as Promise<Snapshot<ResourceData[K]>>;
    const value = this.load(resource);
    this.cache.set(resource, { at: this.now(), value });
    value.catch(() => {
      if (this.cache.get(resource)?.value === value) this.cache.delete(resource);
    });
    return value as Promise<Snapshot<ResourceData[K]>>;
  }

  private async load<K extends ResourceName>(resource: K): Promise<Snapshot<ResourceData[K]>> {
    let text: string;
    try {
      text = await this.raw.fetchText(resource);
    } catch (e) {
      if (e instanceof SourceError) this.logger.error('source_error', { resource, code: e.code });
      throw e;
    }
    return parseSnapshot(resource, text, this.logger);
  }
}

/** Parses and validates one resource. Exported for tests. Error messages are fixed text and never echo the content. */
export function parseSnapshot<K extends ResourceName>(resource: K, text: string, logger: Logger = silentLogger): Snapshot<ResourceData[K]> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    logger.error('source_error', { resource, code: 'invalid_json' });
    throw new SourceError('invalid_json', `The response for "${resource}" is not valid JSON.`);
  }
  const env = envelopeSchema.safeParse(json);
  if (!env.success) {
    const versionProblem = env.error.issues.some((i) => i.path[0] === 'apiVersion');
    logger.error('source_error', { resource, code: versionProblem ? 'unsupported_api_version' : 'invalid_envelope' });
    if (versionProblem) throw new SourceError('unsupported_api_version', `The response for "${resource}" has an apiVersion this server does not support.`);
    throw new SourceError('invalid_envelope', `The response for "${resource}" is not a valid API envelope.`);
  }
  const data = resourceSchemas[resource].safeParse(env.data.data);
  if (!data.success) {
    logger.error('source_error', { resource, code: 'invalid_data' });
    throw new SourceError('invalid_data', `The "${resource}" data does not match the expected shape.`);
  }
  const { apiVersion, environment, generatedAt, publisher } = env.data;
  return { meta: { apiVersion, environment, generatedAt, publisher }, data: data.data as ResourceData[K] };
}
