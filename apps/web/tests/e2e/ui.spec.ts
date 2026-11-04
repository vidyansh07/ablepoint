import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const axe = (page: import('@playwright/test').Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

test.describe('access tools (docs/17 §9)', () => {
  test('text size changes the whole interface, is remembered, and never overflows horizontally', async ({ page }) => {
    await page.goto('/');
    const base = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.getByRole('button', { name: 'Largest text size' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-text', '130');
    const big = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(big).toBeCloseTo(base * 1.3, 0);
    await expect(page.getByRole('button', { name: 'Largest text size' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-text', '130'); // applied before first paint by a11y-init.js
    for (const route of ['/', '/referral/', '/supported-independent-living/']) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} overflows horizontally at 130% text`).toBeLessThanOrEqual(1);
    }
    await page.getByRole('button', { name: 'Normal text size' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-text', /.+/);
  });

  test('high contrast toggles, persists, and passes axe on key pages', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'High contrast' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    for (const route of ['/', '/referral/', '/vacancies/', '/supported-independent-living/']) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
      expect((await axe(page)).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
    await page.getByRole('button', { name: 'High contrast' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-contrast', 'high');
  });

  test('preferences are stored locally only and no network request carries them', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4331')) external.push(r.url()); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Larger text size' }).click();
    await page.getByRole('button', { name: 'High contrast' }).click();
    expect(external).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('ap_prefs'))).toBe('{"text":"115","contrast":"high"}');
  });
});

test.describe('brand and layout', () => {
  test('the preserved logo is shown in the header and links home', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('link', { name: 'AblePoint Australia home' }).first();
    await expect(link).toHaveAttribute('href', '/');
    const img = link.locator('img');
    await expect(img).toBeVisible();
    const size = await img.evaluate((el: HTMLImageElement) => ({ nw: el.naturalWidth, w: el.getBoundingClientRect().width }));
    expect(size.nw).toBeGreaterThanOrEqual(size.w * 1.5); // sharp on high-density screens
  });

  test('favicons and touch icon resolve', async ({ page, request }) => {
    await page.goto('/');
    for (const sel of ['link[rel="icon"][href="/favicon.ico"]', 'link[rel="icon"][href="/favicon-32.png"]', 'link[rel="apple-touch-icon"]']) {
      await expect(page.locator(sel)).toHaveCount(1);
    }
    for (const url of ['/favicon.ico', '/favicon-32.png', '/apple-touch-icon.png']) expect((await request.get(url)).status()).toBe(200);
  });

  test('phone is one tap from every page header, with an accessible name', async ({ page }) => {
    for (const route of ['/', '/services/', '/referral/']) {
      await page.goto(route);
      const call = page.getByRole('link', { name: 'Call 1300 088 549' }).first();
      await expect(call).toHaveAttribute('href', 'tel:1300088549');
      await expect(call).toBeVisible();
    }
  });

  test('audience tiles route to real pages', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.locator('a.tile').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));
    expect(hrefs).toEqual(['/services/', '/referral/', '/for-support-coordinators/', '/referral/']);
  });

  test('landing page has no site navigation', async ({ page }) => {
    await page.goto('/lp/sil-central-coast/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.locator('.utility')).toHaveCount(0);
  });
});
