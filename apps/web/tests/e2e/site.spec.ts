import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Routes are discovered from the built output so new pages are tested automatically.
const dist = new URL('../../dist', import.meta.url).pathname;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const routes = walk(dist).filter((f) => f.endsWith('index.html')).map((f) => '/' + f.slice(dist.length + 1).replace(/index\.html$/, ''));

test.describe('accessibility (axe, WCAG 2.2 AA tags)', () => {
  for (const route of routes) {
    test(`no axe violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
});

test('no third-party requests and no console errors on home', async ({ page }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4331')) external.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('skip link moves focus to main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('every page has exactly one h1 and a staging noindex', async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
});

test('main navigation is keyboard operable at every width', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) {
    const toggle = page.getByText('Menu', { exact: true });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.menu')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('details.menu')).not.toHaveAttribute('open', '');
    await expect(page.locator('.cta-bar')).toBeVisible();
    await expect(page.locator('.cta-bar a[href="tel:1300088549"]')).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
    await expect(page.locator('.cta-bar')).toBeHidden();
  }
});

test('touch targets of primary controls are at least 44px', async ({ page }) => {
  await page.goto('/referral/');
  for (const loc of [page.getByRole('button', { name: 'Send enquiry' }), page.locator('#name'), page.locator('#region')]) {
    const box = await loc.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test.describe('referral form (demo mode, nothing is sent)', () => {
  test('empty submit shows a focused error summary linking to fields', async ({ page }) => {
    await page.goto('/referral/');
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    const summary = page.locator('#error-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).not.toHaveCount(0);
    await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
    // axe with the error state showing
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('valid submission is checked locally, sends no request', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
    await page.goto('/referral/');
    await page.fill('#name', 'Sam Example');
    await page.check('#referrerType-family');
    await page.check('#services-sil');
    await page.selectOption('#region', 'central-coast');
    await page.fill('#phone', '0412 345 678');
    await page.check('#contactMethod-phone');
    await page.check('#consent');
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.locator('#form-status')).toContainText('not');
    await expect(page.locator('#form-status')).toContainText('sent anywhere');
    expect(posts).toEqual([]);
  });

  test('honeypot content is rejected', async ({ page }) => {
    await page.goto('/referral/');
    await page.fill('#name', 'Sam Example');
    await page.check('#referrerType-self');
    await page.check('#services-sil');
    await page.selectOption('#region', 'orange');
    await page.fill('#phone', '0412345678');
    await page.check('#contactMethod-phone');
    await page.check('#consent');
    await page.evaluate(() => { (document.getElementById('website') as HTMLInputElement).value = 'spam'; });
    await page.getByRole('button', { name: 'Send enquiry' }).click();
    await expect(page.locator('#form-status')).not.toContainText('sent anywhere');
  });
});
