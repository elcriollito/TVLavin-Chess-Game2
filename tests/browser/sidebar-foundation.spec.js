import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const gateways = [
  ['/play-online/playchess', 'Playchess'],
  ['/play-online/fritz', 'Fritz'],
  ['/watch/lichess-tv', 'Lichess TV'],
  ['/watch/live-blitz', 'Live Blitz'],
  ['/watch/live-tournaments', 'Live Tournaments']
];

for (const [route, label] of gateways) {
  test(`${label} preserves the modern shared sidebar contract`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const nav = page.getByRole('navigation', { name: 'CAISSA main navigation' });
    await expect(nav).toHaveCount(1);
    await expect(nav.locator('.nav-group-heading')).toHaveText([
      'Play & Compete', 'Learn & Improve', 'Analyze & Watch', 'Tools'
    ]);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label);
    await expect(page.getByRole('link', { name: 'CAISSA Chess — return to Play', exact: true })).toBeVisible();
    await expect(page.locator('#sidebarSignIn')).toHaveAttribute('href', /^\/signin(?:\?redirect_url=|$)/);
    await expect(page.locator('.nav-premium-btn')).toHaveText(/Premium/);
    expect(await nav.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(240);
    const contentBox = await page.locator('.caissa-standalone-content').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), width: Math.round(rect.width) };
    });
    expect(contentBox).toEqual({ x: 240, width: 1200 });
    const frameBox = await page.locator('iframe').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(frameBox.width).toBeGreaterThan(700);
    expect(frameBox.height).toBeGreaterThan(500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);
  });
}

test('desktop sidebar keeps HEAD and social FOOT fixed while only BODY scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto('/game-library', { waitUntil: 'domcontentloaded' });
  const nav = page.getByRole('navigation', { name: 'CAISSA main navigation' });
  const head = nav.locator('[data-caissa-sidebar-head]');
  const body = nav.locator('[data-caissa-sidebar-body]');
  const foot = nav.locator('[data-caissa-sidebar-foot]');
  await expect(head).toHaveCount(1);
  await expect(body).toHaveCount(1);
  await expect(foot).toHaveCount(1);

  const before = await nav.evaluate(element => {
    const head = element.querySelector('[data-caissa-sidebar-head]');
    const body = element.querySelector('[data-caissa-sidebar-body]');
    const foot = element.querySelector('[data-caissa-sidebar-foot]');
    const rect = node => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom });
    return {
      head: rect(head), foot: rect(foot), body: rect(body),
      navOverflowY: getComputedStyle(element).overflowY,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      horizontalOverflow: element.scrollWidth - element.clientWidth
    };
  });
  expect(before.navOverflowY).toBe('hidden');
  expect(before.bodyOverflowY).toBe('auto');
  expect(before.bodyScrollable).toBe(true);
  expect(before.horizontalOverflow).toBeLessThanOrEqual(1);

  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const after = await nav.evaluate(element => {
    const rect = node => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom });
    return {
      head: rect(element.querySelector('[data-caissa-sidebar-head]')),
      foot: rect(element.querySelector('[data-caissa-sidebar-foot]')),
      bodyScrollTop: element.querySelector('[data-caissa-sidebar-body]').scrollTop
    };
  });
  expect(after.bodyScrollTop).toBeGreaterThan(0);
  expect(after.head).toEqual(before.head);
  expect(after.foot).toEqual(before.foot);

  const more = nav.getByRole('button', { name: 'More', exact: true });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('link', { name: 'Support CAISSA' })).toBeVisible();
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');

  const social = nav.locator('.nav-social-link');
  await expect(social).toHaveCount(3);
  for (const link of await social.all()) {
    await expect(link).toHaveAttribute('aria-label', /.+/);
    await expect(link).toHaveAttribute('title', /.+/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener noreferrer/);
    expect((await link.textContent())?.trim()).toBe('');
  }
});

test('Interactive Diagrams routes are unsupported and do not redirect', async ({ request }) => {
  for (const route of ['/learn/interactive-diagrams', '/learn/interactive-diagrams/']) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status()).toBe(404);
    expect(response.headers().location).toBeUndefined();
  }
});

test('representative product routes keep the shared sidebar usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of [
    '/', '/play/games', '/play/bots', '/play/coach', '/analyze', '/puzzles',
    '/arena', '/fics', '/yahoo-classic', '/game-library'
  ]) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const nav = page.getByRole('navigation', { name: 'CAISSA main navigation' });
    await expect(nav, route).toHaveCount(1);
    await expect(nav.locator('.nav-social-link'), route).toHaveCount(3);
    await expect(nav.getByRole('button', { name: 'More', exact: true }), route).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), route)
      .toBeLessThanOrEqual(1);
  }
});

test('shared mobile drawer is inert when closed and returns focus after Escape and backdrop close', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play-online/fritz', { waitUntil: 'domcontentloaded' });

  const toggle = page.locator('.caissa-standalone-mobile-toggle');
  await expect(toggle).toHaveAccessibleName('Open navigation menu');
  const nav = page.getByRole('navigation', { name: 'CAISSA main navigation', includeHidden: true });
  await expect(toggle).toHaveAttribute('aria-controls', 'mainNav');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toHaveAttribute('inert', '');
  await expect(nav).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#mainNav a').first().evaluate(element => {
    element.focus();
    return document.activeElement === element;
  })).toBe(false);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(nav).not.toHaveAttribute('inert', '');
  await expect(nav).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByRole('link', { name: 'CAISSA Chess — return to Play', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(nav).toHaveAttribute('inert', '');

  await toggle.click();
  await page.locator('.caissa-standalone-backdrop').click({ position: { x: 380, y: 400 } });
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('desktop and mobile expose only one focusable navigation surface', async ({ page }) => {
  await page.goto('/puzzles', { waitUntil: 'domcontentloaded' });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(50);
    const result = await page.evaluate(() => ({
      landmarks: document.querySelectorAll('nav[aria-label="CAISSA main navigation"]').length,
      hiddenFocusable: [...document.querySelectorAll('nav[aria-hidden="true"]')]
        .filter(element => !element.inert).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));
    expect(result.landmarks).toBe(1);
    expect(result.hiddenFocusable).toBe(0);
    expect(result.overflow).toBeLessThanOrEqual(1);
  }
  const axe = await new AxeBuilder({ page }).exclude('iframe').analyze();
  expect(axe.violations.filter(violation => ['critical', 'serious'].includes(violation.impact))).toEqual([]);
});
