import { stat } from 'node:fs/promises';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigError } from './errors';
import { parseCommand, USAGE, type SourceConfig } from './config';
import { createLogger } from './log';
import { createServer } from './server';
import { ContentStore, DistSource, HttpSource, type RawSource } from './source';
import { VERSION } from './version';

/**
 * Entry point. stdout belongs to the MCP protocol, so everything else (usage text, errors, logs) is written to stderr.
 * The only environment variables read are ABLEPOINT_API_DIST and ABLEPOINT_API_BASE_URL.
 */
async function buildSource(cfg: SourceConfig): Promise<RawSource> {
  if (cfg.kind === 'url') return new HttpSource({ baseUrl: cfg.baseUrl });
  const apiDir = path.join(cfg.dir, 'api', 'v1');
  try {
    if (!(await stat(apiDir)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new ConfigError(`The dist directory does not contain api/v1/ (looked for ${apiDir}). Build the site first, or check the path.`);
  }
  return new DistSource(cfg.dir);
}

async function main(): Promise<void> {
  const logger = createLogger();
  let cmd;
  try {
    cmd = parseCommand(process.argv.slice(2), {
      ABLEPOINT_API_DIST: process.env.ABLEPOINT_API_DIST,
      ABLEPOINT_API_BASE_URL: process.env.ABLEPOINT_API_BASE_URL,
    });
  } catch (e) {
    process.stderr.write(`ablepoint-mcp: ${e instanceof ConfigError ? e.message : 'Invalid arguments.'}\n\n${USAGE}`);
    process.exit(2);
  }
  if (cmd.command === 'help') {
    process.stderr.write(USAGE);
    return;
  }
  if (cmd.command === 'version') {
    process.stderr.write(`ablepoint-mcp ${VERSION}\n`);
    return;
  }

  let raw: RawSource;
  try {
    raw = await buildSource(cmd.source);
  } catch (e) {
    process.stderr.write(`ablepoint-mcp: ${e instanceof ConfigError ? e.message : 'Could not set up the data source.'}\n`);
    process.exit(2);
  }

  const server = createServer({ store: new ContentStore(raw, { logger }), logger });
  const transport = new StdioServerTransport();
  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('end', shutdown);
  process.on('uncaughtException', (e) => {
    logger.error('uncaught_exception', { name: e.name });
    process.exit(1);
  });
  process.on('unhandledRejection', () => {
    logger.error('unhandled_rejection');
  });
  await server.connect(transport);
  logger.info('started', { source: cmd.source.kind, version: VERSION });
}

void main();
