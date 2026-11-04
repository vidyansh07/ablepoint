import { expect, test } from '@playwright/test';

test.describe('find support widget', () => {
  test('shows honest, accessible results from the site’s own API and sends nothing elsewhere', async ({ page }) => {
    const external: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4331')) external.push(r.url()); });
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await page.selectOption('#finder-region', 'dubbo');
    await page.selectOption('#finder-service', 'core-support');
    await page.getByRole('button', { name: 'Find support' }).click();
    const heading = page.getByRole('heading', { name: 'Support in Dubbo' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.locator('#finder-results')).toContainText('call us to check availability');
    await expect(page.locator('#finder-results a[href="/locations/dubbo/"]')).toBeVisible();
    await expect(page.locator('#finder-results a[href="/core-support/"]')).toBeVisible();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
  test('vacancy results say so plainly when there are none, with a referral path', async ({ page }) => {
    await page.goto('/locations/');
    await page.selectOption('#finder-region', 'orange');
    await page.selectOption('#finder-service', 'supported-independent-living');
    await page.getByRole('button', { name: 'Find support' }).click();
    await expect(page.locator('#finder-results')).toContainText('no matching vacancies');
    await expect(page.locator('#finder-results a[href="/referral/"]').first()).toBeVisible();
  });
  test('services without vacancies do not show a vacancies block', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#finder-service', 'support-coordinator');
    await page.getByRole('button', { name: 'Find support' }).click();
    await expect(page.locator('#finder-results')).not.toContainText('Vacancies');
  });
  test('works without JavaScript as a link to the locations page', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4331/');
    await expect(page.locator('#finder-form')).toHaveAttribute('action', '/locations/');
    await ctx.close();
  });
});

test.describe('help centre', () => {
  test('filters questions and announces the count', async ({ page }) => {
    await page.goto('/faq/');
    const total = await page.locator('details[data-faq]:visible').count();
    expect(total).toBeGreaterThan(5);
    await page.fill('#faq-filter', 'complaint');
    await expect(page.locator('#faq-count')).toContainText('matching');
    expect(await page.locator('details[data-faq]:visible').count()).toBeLessThan(total);
    await page.fill('#faq-filter', 'zzzzzz');
    await expect(page.locator('#faq-count')).toContainText('0 matching');
    await expect(page.locator('#faq-groups section:visible')).toHaveCount(0);
  });
});

test('home shows claim blocks only as marked drafts in staging, and the footer lists every region', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your safety and privacy come first' })).toBeVisible();
  await expect(page.locator('.notice--draft').first()).toBeVisible();
  const footerLinks = await page.locator('footer nav[aria-label="Where we work"] a').allTextContents();
  expect(footerLinks).toEqual(['Central Coast', 'Newcastle', 'Dubbo', 'Orange', 'Tamworth', 'Gunnedah']);
});

test.describe('glossary and region facts', () => {
  test('glossary lists plain-English terms as a definition list, marked draft on staging, with no eligibility claims', async ({ page }) => {
    await page.goto('/glossary/');
    await expect(page.locator('.notice--draft').first()).toBeVisible();
    const terms = await page.locator('dl.glossary dt').allTextContents();
    expect(terms.length).toBeGreaterThanOrEqual(10);
    expect(terms.join(' ')).toContain('Supported Independent Living');
    await expect(page.locator('dl.glossary abbr[title]').first()).toBeVisible();
    await expect(page.getByText('does not say who is eligible')).toBeVisible();
  });
  test('region pages with no verified facts show no invented local sections', async ({ page }) => {
    await page.goto('/locations/dubbo/');
    await expect(page.getByRole('heading', { name: /Towns and areas we support/ })).toHaveCount(0);
    await expect(page.getByText('Local details last checked')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /What is available in Dubbo/ })).toBeVisible();
  });
  test('API exposes localFacts as null until operations supply them', async ({ request }) => {
    const res = await request.get('/api/v1/regions.json');
    const body = await res.json();
    expect(body.data.length).toBe(6);
    for (const r of body.data) expect(r.localFacts, r.id).toBeNull();
  });
});
