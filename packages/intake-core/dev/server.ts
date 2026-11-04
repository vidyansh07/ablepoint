/**
 * LOCAL DEVELOPMENT SERVER ONLY. Never deploy.
 *
 * Wraps the real `handleEnquirySubmission` with in-memory test doubles so the website's enquiry form can be exercised
 * end to end on a developer machine (contract, CORS, bot-check wiring, idempotency, privacy-safe logging).
 * - Records live in process memory and vanish on exit. Synthetic data only.
 * - The "Turnstile" verifier accepts tokens shaped `TEST-TOKEN` or `TEST-TOKEN-<suffix>` (the handler still enforces single use). It is NOT Cloudflare.
 * - GET /__debug returns counts only (never contents) so tests can assert behaviour without reading personal data.
 */
import { createServer } from 'node:http';
import {
  DEFAULT_HANDLER_CONFIG,
  FixedWindowRateLimiter,
  InMemoryIdempotencyStore,
  InMemoryReplayCache,
  InMemoryRepository,
  assertSafeConfig,
  createSafeLogger,
  handleEnquirySubmission,
  type HandlerConfig,
  type LogLine,
} from '../src/index';

const port = Number(process.env.PORT ?? 4343);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4333').split(',').map((s) => s.trim());
const noticeVersion = process.env.NOTICE_VERSION ?? 'draft-0';

const config: HandlerConfig = {
  ...DEFAULT_HANDLER_CONFIG,
  allowedOrigins,
  acceptedNoticeVersions: [noticeVersion],
  requireTurnstile: process.env.REQUIRE_TURNSTILE !== 'false',
};
assertSafeConfig(config);

const repository = new InMemoryRepository();
const logs: LogLine[] = [];
const logger = createSafeLogger((line) => {
  logs.push(line);
  console.log(JSON.stringify(line)); // already allow-listed and redacted by the logger
});
const clock = () => Date.now();
const deps = {
  config,
  turnstile: { verify: async (token: string) => ({ success: /^TEST-TOKEN(-[A-Za-z0-9]{1,32})?$/.test(token) }) },
  replayCache: new InMemoryReplayCache(clock),
  rateLimiter: new FixedWindowRateLimiter(clock),
  idempotency: new InMemoryIdempotencyStore(),
  repository,
  logger,
  clock,
};

const readBody = (req: import('node:http').IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/__debug') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ devOnly: true, logLines: logs.length }));
    return;
  }
  if (url.pathname !== '/enquiry') { res.writeHead(404).end(); return; }
  try {
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(',') : v;
    // Trusted client IP: the TCP peer of this local server. A real deployment must take it from the platform.
    const out = await handleEnquirySubmission({ method: req.method ?? 'GET', headers, body, ip: req.socket.remoteAddress ?? 'unknown' }, deps);
    res.writeHead(out.status, out.headers).end(out.body === null ? undefined : JSON.stringify(out.body));
  } catch {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, code: 'internal_error' }));
  }
}).listen(port, () => console.log(JSON.stringify({ event: 'dev_intake_listening', port, allowedOrigins })));
