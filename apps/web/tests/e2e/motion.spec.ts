import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = ['/', '/services/', '/locations/', '/guides/', '/vacancies/', '/referral/', '/contact-us/', '/locations/central-coast/', '/guides/sil-vs-sda/', '/supported-independent-living/'];

/** Finite, time-based animations only (scroll-driven reading progress has no duration of its own). */
const timeAnimations = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline).map((a) => {
      const t = a.effect?.getComputedTiming();
      const props = (a.effect as KeyframeEffect | null)?.getKeyframes().flatMap((k) => Object.keys(k)).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)) ?? [];
      return { name: (a as CSSAnimation).animationName ?? 'wa', end: Number(t?.endTime ?? 0), iterations: t?.iterations ?? 1, props: [...new Set(props)] };
    }),
  );

test.describe('normal motion (WCAG 2.2.2, 2.3.1)', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const route of ROUTES) {
    test(`animations on ${route} are finite, short, and only move/fade`, async ({ page }) => {
      await page.goto(route);
      await page.waitForTimeout(150);
      const anims = await timeAnimations(page);
      for (const a of anims) {
        expect(a.iterations, `${a.name} loops`).not.toBe(Infinity);
        expect(a.end, `${a.name} lasts ${a.end} ms`).toBeLessThanOrEqual(2200);
        for (const p of a.props) expect(['opacity', 'transform', 'cssOffset', 'translate', 'scale', 'rotate']).toContain(p);
      }
      // nothing may still be running after 5 s (WCAG 2.2.2 threshold)
      await page.waitForTimeout(2600);
      const running = await page.evaluate(() => document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline && a.playState === 'running').length);
      expect(running).toBe(0);
    });
  }

  test('scroll reveal never leaves content hidden: everything becomes visible after scrolling the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/reveal-ready/);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => getComputedStyle(e).opacity === '0' && !e.closest('svg')).map((e) => e.className).slice(0, 5));
    expect(hidden).toEqual([]);
  });

  test('reveal fails open: with the observer script blocked, nothing stays hidden after 3.5 s', async ({ page }) => {
    await page.route('**/_astro/Base.astro_astro_type_script_*.js', (r) => r.abort());
    await page.goto('/');
    await page.waitForTimeout(3600);
    await expect(page.locator('html')).not.toHaveClass(/reveal-ready/);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('main .section *')].filter((e) => getComputedStyle(e).opacity === '0' && !e.closest('svg')).length);
    expect(hidden).toBe(0);
  });

  test('settled page with normal motion passes axe', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  test('hover lift on cards works and keeps the card clickable', async ({ page }) => {
    await page.goto('/services/');
    const card = page.locator('.card--link').first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    await card.hover();
    await page.waitForTimeout(450);
    const t = await card.evaluate((e) => getComputedStyle(e).transform);
    expect(t).not.toBe('none');
    await card.locator('a.stretched').click();
    await expect(page).not.toHaveURL(/\/services\/$/);
  });
});

test.describe('reduced motion: final static state, zero animations', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const route of ROUTES) {
    test(`no time-based animations on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForTimeout(200);
      expect(await timeAnimations(page)).toEqual([]);
      await expect(page.locator('html')).not.toHaveClass(/reveal-ready/);
    });
  }
  test('no view-transition or hover movement', async ({ page }) => {
    await page.goto('/services/');
    const card = page.locator('.card--link').first();
    await card.hover();
    await page.waitForTimeout(300);
    expect(await card.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
  });
});
