import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const BASE = 'http://localhost:4332';
test.use({ baseURL: BASE });

async function trackGtm(page: Page) {
  const gtm: string[] = [];
  await page.route('https://www.googletagmanager.com/**', (route) => {
    gtm.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  return gtm;
}
const dataLayer = (page: Page) => page.evaluate(() => (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []);

test.describe('consent-gated analytics (fake GTM id, requests intercepted)', () => {
  test('banner shows by default and nothing third-party loads before a choice', async ({ page }) => {
    const gtm = await trackGtm(page);
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(gtm).toEqual([]);
    expect(await dataLayer(page)).toEqual([]);
  });

  test('banner state has no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#consent-banner')).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(r.violations).toEqual([]);
  });

  test('declining loads nothing, remembers the choice and stops asking', async ({ page }) => {
    const gtm = await trackGtm(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'No thanks' }).click();
    await expect(page.locator('#consent-banner')).toBeHidden();
    await page.getByRole('link', { name: /Call 1300 088 549/ }).first().click({ trial: true });
    await page.reload();
    await expect(page.locator('#consent-banner')).toBeHidden();
    expect(gtm).toEqual([]);
    expect(await dataLayer(page)).toEqual([]);
  });

  test('accepting loads GTM and pushes only allow-listed, personal-data-free events', async ({ page }) => {
    const gtm = await trackGtm(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Yes, allow statistics' }).click();
    await expect.poll(() => gtm.length).toBeGreaterThan(0);
    expect(gtm[0]).toContain('id=GTM-TEST123');
    // click the phone link without actually dialling
    await page.evaluate(() => document.querySelectorAll('a[href^="tel:"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault())));
    await page.locator('.hero a[data-event="phone_click"]').click();
    const layer = (await dataLayer(page)) as Record<string, unknown>[];
    const ev = layer.find((e) => e.event === 'phone_click');
    expect(ev).toEqual({ event: 'phone_click', page_path: '/', cta_location: 'hero' });
    expect(JSON.stringify(layer)).not.toMatch(/@|0412|1300088549/);
  });

  test('the referral form page never loads analytics, even after consent', async ({ page }) => {
    const gtm = await trackGtm(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Yes, allow statistics' }).click();
    await expect.poll(() => gtm.length).toBeGreaterThan(0);
    const before = gtm.length;
    await page.goto('/referral/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#consent-banner')).toHaveCount(0);
    expect(gtm.length).toBe(before);
    expect(await dataLayer(page)).toEqual([]);
  });

  test('thank-you page records the conversion only with consent', async ({ page }) => {
    await trackGtm(page);
    await page.goto('/thank-you/');
    await page.getByRole('button', { name: 'Yes, allow statistics' }).click();
    await expect.poll(async () => (await dataLayer(page)).some((e) => (e as { event?: string }).event === 'referral_submit')).toBe(true);
    const ev = (await dataLayer(page) as Record<string, unknown>[]).find((e) => e.event === 'referral_submit');
    expect(ev).toEqual({ event: 'referral_submit', page_path: '/thank-you/' });
  });

  test('withdrawing consent reloads without GTM', async ({ page }) => {
    const gtm = await trackGtm(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Yes, allow statistics' }).click();
    await expect.poll(() => gtm.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Statistics settings' }).click();
    await page.getByRole('button', { name: 'No thanks' }).click();
    await page.waitForLoadState('load');
    const count = gtm.length;
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(gtm.length).toBe(count);
  });
});
