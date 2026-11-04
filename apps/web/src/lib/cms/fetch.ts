/**
 * Minimal GROQ-over-HTTP client for the Sanity Query API. Read-only, no dependencies.
 *
 * Documented endpoint (sanity.io/docs/http-reference/query, checked 3 Nov 2026):
 *   GET https://<projectId>.api.sanity.io/v<YYYY-MM-DD>/data/query/<dataset>?query=<GROQ>&perspective=published
 *   Parameters are sent as `$name=<JSON value>`. Authentication is `Authorization: Bearer <token>`.
 *
 * Choices made here, on purpose:
 *   - The API host (`api.sanity.io`) is used, never the CDN host (`apicdn.sanity.io`), because this client always carries a
 *     token and a content gate must read current data, not a cached copy.
 *   - The API version is fixed and dated. It never follows "today".
 *   - Only the `published` perspective is requested.
 *   - Redirects are refused, so the token can never be forwarded to another host.
 *   - Configuration comes only from the environment. There is no default project, dataset or token.
 *   - Errors use fixed wording. They never contain the token, the response body or the underlying error's message.
 *
 * Status: never run against a real Sanity project (none exists). Request shape and URL are checked by unit tests with an
 * injected `fetch`. The first real run may still reveal differences.
 */

/** Fixed, dated API version. `v2025-02-19` is the version Sanity documents as its current default. */
export const SANITY_API_VERSION = 'v2025-02-19' as const;
export const SANITY_PERSPECTIVE = 'published' as const;
export const DEFAULT_TIMEOUT_MS = 10_000;
/** Largest response body accepted (bytes). A bigger body is treated as an error, not truncated. */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
/** Sanity advises POST above about 11 KB of URL. This client is GET-only, so it refuses longer URLs instead. */
export const MAX_URL_LENGTH = 10_000;

/** Same formats as apps/studio/src/env.ts. */
const PROJECT_ID_RE = /^[a-z0-9]{6,16}$/;
const DATASET_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Printable ASCII with no spaces: a token in this form is always a valid header value, so it cannot reach an error message by way of a header-validation failure. */
const TOKEN_RE = /^[\x21-\x7e]{8,1024}$/;
const PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export class SanityConfigError extends Error {
  override readonly name = 'SanityConfigError';
}

export type SanityFetchErrorCode = 'request' | 'timeout' | 'network' | 'http' | 'too_large' | 'parse' | 'shape';

/** Every message is fixed text. The token, the URL's query and the response body are never included. */
export class SanityFetchError extends Error {
  override readonly name = 'SanityFetchError';
  constructor(
    readonly code: SanityFetchErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface SanityConfig {
  readonly projectId: string;
  readonly dataset: string;
  /** Non-enumerable: it does not appear in JSON.stringify, spread, Object.keys or console.log of the config. */
  readonly token: string;
}

/**
 * Reads SANITY_PROJECT_ID, SANITY_DATASET and SANITY_READ_TOKEN. Refuses (throws) if any is missing or malformed.
 * Error messages name the variable, never its value.
 */
export function readSanityConfig(env: Readonly<Record<string, string | undefined>>): SanityConfig {
  const projectId = env.SANITY_PROJECT_ID?.trim();
  const dataset = env.SANITY_DATASET?.trim();
  const token = env.SANITY_READ_TOKEN?.trim();
  const missing = [
    ['SANITY_PROJECT_ID', projectId],
    ['SANITY_DATASET', dataset],
    ['SANITY_READ_TOKEN', token],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new SanityConfigError(`Missing required environment variable(s): ${missing.join(', ')}. The CMS pull has no default project, dataset or token.`);
  }
  if (!PROJECT_ID_RE.test(projectId!)) throw new SanityConfigError('SANITY_PROJECT_ID looks invalid (expected 6 to 16 lowercase letters and digits).');
  if (!DATASET_RE.test(dataset!)) throw new SanityConfigError('SANITY_DATASET looks invalid (lowercase letters, digits, "-" or "_").');
  if (!TOKEN_RE.test(token!)) throw new SanityConfigError('SANITY_READ_TOKEN looks invalid (expected 8 to 1024 printable characters with no spaces).');
  const config = { projectId: projectId!, dataset: dataset! } as { projectId: string; dataset: string; token: string };
  Object.defineProperty(config, 'token', { value: token!, enumerable: false, writable: false });
  return Object.freeze(config);
}

const enc = encodeURIComponent;

/**
 * Builds the GET URL. `params` are GROQ parameters WITHOUT the `$`; each is sent as `$name=<JSON>` as documented.
 * Throws SanityFetchError('request') for a bad parameter name or a URL that is too long for GET.
 */
export function buildQueryUrl(config: Pick<SanityConfig, 'projectId' | 'dataset'>, groq: string, params: Readonly<Record<string, unknown>> = {}): string {
  if (typeof groq !== 'string' || !groq.trim()) throw new SanityFetchError('request', 'Query is empty.');
  const parts = [`query=${enc(groq)}`, `perspective=${SANITY_PERSPECTIVE}`];
  for (const name of Object.keys(params).sort()) {
    if (!PARAM_NAME_RE.test(name)) throw new SanityFetchError('request', 'A query parameter name is not valid.');
    const json = JSON.stringify(params[name]);
    if (json === undefined) throw new SanityFetchError('request', 'A query parameter value cannot be sent as JSON.');
    parts.push(`${enc(`$${name}`)}=${enc(json)}`);
  }
  const url = `https://${config.projectId}.api.sanity.io/${SANITY_API_VERSION}/data/query/${enc(config.dataset)}?${parts.join('&')}`;
  if (url.length > MAX_URL_LENGTH) throw new SanityFetchError('request', 'Request URL is too long for a GET query.');
  return url;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SanityClientOptions {
  /** Injected for tests. Defaults to the global `fetch`. */
  fetch?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface SanityClient {
  query<T = unknown>(groq: string, params?: Readonly<Record<string, unknown>>): Promise<T>;
}

const HTTP_HINTS: Record<number, string> = {
  400: 'the query or a parameter was rejected',
  401: 'authentication failed; check that the read token is valid',
  403: 'the token is not allowed to read this dataset',
  404: 'the project or dataset was not found',
  429: 'rate limited; try again later',
};

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new SanityFetchError('too_large', `Sanity response is larger than the ${maxBytes} byte limit.`);
  }
  if (!res.body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new SanityFetchError('too_large', `Sanity response is larger than the ${maxBytes} byte limit.`);
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SanityFetchError('too_large', `Sanity response is larger than the ${maxBytes} byte limit.`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  } catch {
    throw new SanityFetchError('parse', 'Sanity response was not valid UTF-8 text.');
  }
}

export function createSanityClient(config: SanityConfig, options: SanityClientOptions = {}): SanityClient {
  const doFetch: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  return {
    async query<T>(groq: string, params: Readonly<Record<string, unknown>> = {}): Promise<T> {
      const url = buildQueryUrl(config, groq, params);
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      // Raced against every await below, so a stalled fetch (or one that ignores the signal) still ends at the timeout.
      const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      aborted.catch(() => undefined);
      try {
        let res: Response;
        try {
          res = await Promise.race([
            doFetch(url, {
              method: 'GET',
              headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
              redirect: 'error',
              signal: controller.signal,
            }),
            aborted,
          ]);
        } catch (err) {
          throw failure(err, timedOut, timeoutMs);
        }
        if (!res.ok) {
          await res.body?.cancel().catch(() => undefined);
          const hint = HTTP_HINTS[res.status] ?? (res.status >= 500 ? 'Sanity reported a server error' : 'unexpected response');
          throw new SanityFetchError('http', `Sanity request failed with HTTP ${res.status}: ${hint}.`, res.status);
        }
        let text: string;
        try {
          text = await Promise.race([readCapped(res, maxBytes), aborted]);
        } catch (err) {
          if (err instanceof SanityFetchError) throw err;
          throw failure(err, timedOut, timeoutMs);
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new SanityFetchError('parse', 'Sanity response was not valid JSON.');
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !('result' in parsed)) {
          throw new SanityFetchError('shape', 'Sanity response did not have the expected shape.');
        }
        return (parsed as { result: T }).result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Maps any thrown value to a fixed-wording error. The original message is dropped on purpose (it could contain anything). */
function failure(err: unknown, timedOut: boolean, timeoutMs: number): SanityFetchError {
  if (timedOut) return new SanityFetchError('timeout', `Sanity request timed out after ${timeoutMs} ms.`);
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  const suffix = typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code) ? ` (${code})` : '';
  return new SanityFetchError('network', `Could not reach Sanity${suffix}.`);
}
