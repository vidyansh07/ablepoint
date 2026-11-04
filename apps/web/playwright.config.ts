import { defineConfig } from '@playwright/test';

// PLAYWRIGHT_CHANNEL lets CI pick the browser; locally we use the installed Google Chrome.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  // Default: reduced motion, so a11y scans see the settled final state. tests/e2e/motion.spec.ts opts back in to normal motion.
  use: { baseURL: 'http://localhost:4331', channel, trace: 'retain-on-failure', reducedMotion: 'reduce' },
  webServer: [
    {
      // Default staging build: no analytics configured.
      command: 'pnpm run build:staging && node scripts/serve-dist.mjs dist',
      url: 'http://localhost:4331/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Second build with a FAKE GTM id to test the consent flow. GTM requests are intercepted in tests; nothing real is contacted.
      command: 'pnpm run build:analytics-test && PORT=4332 VERCEL_CONFIG=vercel.analytics.json node scripts/serve-dist.mjs dist-analytics',
      url: 'http://localhost:4332/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Local-only intake server wrapping the real handler with in-memory test doubles (synthetic data, no network).
      command: 'pnpm --filter @ablepoint/intake-core dev:server',
      env: { PORT: '4343', ALLOWED_ORIGINS: 'http://localhost:4333' },
      url: 'http://localhost:4343/__debug',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Build wired to that intake server and a FAKE Turnstile site key; Cloudflare requests are intercepted in tests.
      command: 'pnpm run build:intake-test && PORT=4333 VERCEL_CONFIG=vercel.intake.json node scripts/serve-dist.mjs dist-intake',
      url: 'http://localhost:4333/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
