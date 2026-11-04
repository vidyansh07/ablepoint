import { parseArgs } from 'node:util';
import path from 'node:path';
import { ConfigError } from './errors';

export type SourceConfig =
  | { kind: 'dist'; dir: string }
  | { kind: 'url'; baseUrl: string };

export type ParsedCommand =
  | { command: 'help' }
  | { command: 'version' }
  | { command: 'run'; source: SourceConfig };

export const USAGE = `ablepoint-mcp: read-only MCP server for AblePoint's public content API (stdio).

Choose exactly one data source. There is no default.

  --dist <dir>        Read <dir>/api/v1/<resource>.json from a built site on disk.
  --base-url <url>    Fetch <url>/api/v1/<resource>.json (https, or http for localhost / 127.0.0.1 only).

Environment variables (used only when the matching flag is not given):
  ABLEPOINT_API_DIST
  ABLEPOINT_API_BASE_URL

  --help              Show this text.
  --version           Show the version.

The server speaks MCP over stdin/stdout. Logs go to stderr and never contain content.
`;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/** True for https URLs, and for http URLs only when the host is localhost or 127.0.0.1. */
export function isAllowedProtocolAndHost(u: URL): boolean {
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return isLocalHost(u.hostname);
  return false;
}

/** Validates and normalises a base URL. The returned string has no trailing slash. */
export function normaliseBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ConfigError('The base URL is not a valid URL.');
  }
  if (!isAllowedProtocolAndHost(u)) {
    throw new ConfigError('The base URL must use https. Plain http is allowed only for localhost and 127.0.0.1.');
  }
  if (u.username || u.password) throw new ConfigError('The base URL must not contain a user name or password.');
  if (u.search || u.hash) throw new ConfigError('The base URL must not contain a query string or fragment.');
  return u.toString().replace(/\/+$/, '');
}

/**
 * Parses command-line arguments and the two permitted environment variables. Pure: it touches neither the file system nor
 * the network. A leading "--" (added by `pnpm run start -- ...`) is ignored.
 */
export function parseCommand(argv: readonly string[], env: Record<string, string | undefined> = {}, cwd: string = process.cwd()): ParsedCommand {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values: { dist?: string; 'base-url'?: string; help?: boolean; version?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      allowPositionals: false,
      strict: true,
      options: {
        dist: { type: 'string' },
        'base-url': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (e) {
    throw new ConfigError(e instanceof Error ? e.message.split('\n')[0] ?? 'Invalid arguments.' : 'Invalid arguments.');
  }
  if (values.help) return { command: 'help' };
  if (values.version) return { command: 'version' };

  const dist = values.dist ?? (values['base-url'] === undefined ? env.ABLEPOINT_API_DIST : undefined);
  const baseUrl = values['base-url'] ?? (values.dist === undefined ? env.ABLEPOINT_API_BASE_URL : undefined);
  const distSet = dist !== undefined && dist !== '';
  const urlSet = baseUrl !== undefined && baseUrl !== '';

  if (distSet && urlSet) throw new ConfigError('Give either a dist directory or a base URL, not both.');
  if (!distSet && !urlSet) {
    throw new ConfigError('No data source chosen. Pass --dist <dir> or --base-url <url> (or set ABLEPOINT_API_DIST / ABLEPOINT_API_BASE_URL). There is no default.');
  }
  if (distSet) return { command: 'run', source: { kind: 'dist', dir: path.resolve(cwd, dist) } };
  return { command: 'run', source: { kind: 'url', baseUrl: normaliseBaseUrl(baseUrl as string) } };
}
