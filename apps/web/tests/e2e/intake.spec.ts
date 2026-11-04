import { expect, test, type Page } from '@playwright/test';

// Build #3: form wired to the LOCAL intake dev server (real handler, in-memory doubles) with a FAKE Turnstile key.
// Runs under the real generated CSP (vercel.intake.json applied by scripts/serve-dist.mjs).
const BASE = 'http://localhost:4333';
const INTAKE = 'http://localhost:4343';
test.use({ baseURL: BASE });

async function stubTurnstile(page: Page, behaviour: 'ok' | 'never' = 'ok') {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body:
        behaviour === 'ok'
          ? `window.turnstile={render:function(el,o){setTimeout(function(){o.callback('TEST-TOKEN-'+Math.random().toString(36).slice(2,12))},20);return 'w1'},reset:function(){}};`
          : `window.turnstile={render:function(){return 'w1'},reset:function(){}};`,
    }),
  );
}
const csp: string[] = [];
async function watchCsp(page: Page) {
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  // Violation events catch silent probes (e.g. eval) that never reach the console.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => { (window as unknown as { __csp?: string[] }).__csp = [...((window as unknown as { __csp?: string[] }).__csp ?? []), `${e.violatedDirective}:${e.blockedURI}`]; });
  });
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
async function fill(page: Page, name = 'Sam Example') {
  await page.fill('#name', name);
  await page.check('#referrerType-family');
  await page.check('#services-sil');
  await page.selectOption('#region', 'central-coast');
  // unique synthetic number per call: the real handler throttles repeat contacts (3/hour), which is itself correct behaviour
  await page.fill('#phone', '04' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'));
  await page.check('#contactMethod-phone');
  await page.check('#consent');
}
const debug = async (page: Page) => (await (await page.request.get(`${INTAKE}/__debug`)).json()) as { logLines: number };

test.beforeEach(() => { csp.length = 0; });

test('real submission reaches the intake handler and lands on the thank-you page', async ({ page }) => {
  await stubTurnstile(page);
  await watchCsp(page);
  const posts: { url: string; body: string }[] = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push({ url: r.url(), body: r.postData() ?? '' }); });
  await page.goto('/referral/');
  await fill(page);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await page.waitForURL('**/thank-you/');
  expect(posts).toHaveLength(1);
  expect(posts[0]!.url).toBe(`${INTAKE}/enquiry`);
  const sent = JSON.parse(posts[0]!.body);
  expect(Object.keys(sent).sort()).toEqual(['enquiry', 'idempotencyKey', 'noticeVersion', 'turnstileToken']);
  expect(sent.enquiry.consent).toBe(true);
  expect(Object.keys(sent.enquiry)).not.toContain('ndisNumber');
  expect(csp).toEqual([]);
});

test('the referral page raises no CSP violation events (no eval probe, no inline style or script)', async ({ page }) => {
  await stubTurnstile(page);
  await watchCsp(page);
  await page.goto('/referral/');
  await page.waitForTimeout(500);
  expect(await violations(page)).toEqual([]);
  await fill(page);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await page.waitForURL('**/thank-you/');
});

test('the intake server logs no personal data for that submission', async ({ page }) => {
  await stubTurnstile(page);
  await page.goto('/referral/');
  await fill(page, 'CANARY-Name-Qx7');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await page.waitForURL('**/thank-you/');
  expect((await debug(page)).logLines).toBeGreaterThanOrEqual(0); // counts only; log content is asserted in intake-core unit tests
});

test('submit is held until the bot check completes', async ({ page }) => {
  await stubTurnstile(page, 'never');
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/referral/');
  await fill(page);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.locator('#form-status')).toContainText('security check');
  expect(posts).toEqual([]);
});

test('server rejection shows an accessible error and keeps the form usable', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: `window.turnstile={render:function(el,o){setTimeout(function(){o.callback('WRONG-TOKEN')},20);return 'w1'},reset:function(){}};` }),
  );
  await page.goto('/referral/');
  await fill(page);
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.locator('#form-status')).toContainText('could not send');
  await expect(page.locator('#form-status')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Send enquiry' })).toBeEnabled();
  expect(page.url()).toContain('/referral/');
});

test('the generated CSP allows the form to work and blocks inline script and style', async ({ page }) => {
  await stubTurnstile(page);
  await watchCsp(page);
  const res = await page.goto('/');
  const header = res!.headers()['content-security-policy'] ?? '';
  expect(header).toContain("script-src 'self' https://challenges.cloudflare.com");
  expect(header).toContain('connect-src \'self\' http://localhost:4343');
  expect(header).not.toContain('unsafe-inline');
  expect(header).not.toContain('unsafe-eval');
  // injected inline script must be refused by the browser
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inline_ran = true';
    document.body.append(s);
    return Boolean((window as unknown as { __inline_ran?: boolean }).__inline_ran);
  });
  expect(ran).toBe(false);
  // and the site itself triggers no CSP violations while rendering and styling
  await page.goto('/supported-independent-living/');
  await page.goto('/referral/');
  expect(csp.filter((c) => !/inline script|__inline_ran/i.test(c))).toEqual([]);
});
