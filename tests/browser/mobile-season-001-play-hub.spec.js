import { test, expect } from '@playwright/test';

const destinations = [
  { id: 'play', route: '/play/games', title: 'Play', ready: '[data-caissa-games-panel]' },
  { id: 'online', route: '/online', title: 'CAISSA Online', ready: '.online-main' },
  { id: 'playchess', route: '/play-online/playchess', title: 'Playchess', ready: '.playchess-embed-shell iframe' },
  { id: 'fics', route: '/fics', title: 'FICS', ready: '#ficsSection' }
];
const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 }
];
const capture = process.env.CAISSA_CAPTURE_PLAY_HUB_S001 === '1';

async function prepare(page) {
  await page.route('https://play.chessbase.com/**', route => route.abort());
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
  }));
  await page.route('**/js/auth-config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.route('**/js/caissa-auth.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: ''
  }));
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    window.CAISSA_AUTH = {
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      status: 'signed-out',
      whenReady: async function whenReady() { return this; },
      onAuthStateChange(callback) { callback(this); return () => {}; }
    };
  });
}

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll(elements => elements.filter(element => element.getClientRects().length).length);
}

for (const viewport of viewports) {
  test(`Play Hub is compact, isolated and complete at ${viewport.width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(viewport);
    await page.goto('/');

    await page.locator('[data-mobile-destination="play"]').click();
    await expect(page).toHaveURL(/\/play-hub$/);
    await expect(page.locator('[data-caissa-mobile2-destination-title]')).toHaveText('Play');
    await expect(page.getByRole('heading', { name: 'Choose how you want to play' })).toBeVisible();

    const cards = page.locator('[data-play-hub-destination]');
    await expect(cards).toHaveCount(4);
    expect(await cards.evaluateAll(items => items.map(item => item.dataset.playHubDestination)))
      .toEqual(destinations.map(destination => destination.id));
    expect(await cards.evaluateAll(items => items.map(item => item.getAttribute('href'))))
      .toEqual(destinations.map(destination => destination.route));

    const touchTargets = await cards.evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
    touchTargets.forEach(height => expect(height).toBeGreaterThanOrEqual(44));
    const backBox = await page.locator('[data-caissa-mobile2-back]').boundingBox();
    expect(backBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-caissa-mobile2-back]')).toHaveAttribute('href', '/');
    expect(await visibleCount(page, '#mobileNavToggle, #mainNav, .caissa-standalone-mobile-toggle, .online-menu-shell')).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
      .toBeLessThanOrEqual(1);

    if (capture) {
      await page.screenshot({
        path: `docs/mobile-home-season-001/screenshots/play-hub-${viewport.width}.png`,
        fullPage: true
      });
    }

    await page.locator('[data-caissa-mobile2-back]').click();
    await expect(page.locator('[data-mobile-home]')).toBeVisible();
  });

  test(`all Play Hub destinations preserve the Mobile 2.0 navigation contract at ${viewport.width}px`, async ({ page }) => {
    await prepare(page);
    await page.setViewportSize(viewport);

    for (const destination of destinations) {
      await page.goto('/play-hub');
      await page.locator(`[data-play-hub-destination="${destination.id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${destination.route.replaceAll('/', '\\/')}$`));
      await expect(page.locator(destination.ready).first()).toBeVisible();

      const header = page.locator('[data-caissa-mobile2-destination-header]');
      const back = header.locator('[data-caissa-mobile2-back]');
      await expect(header).toBeVisible();
      await expect(header.locator('[data-caissa-mobile2-destination-title]')).toHaveText(destination.title);
      await expect(back).toHaveAttribute('href', '/play-hub');
      await expect(back).toHaveAttribute('aria-label', `Back to Play Hub from ${destination.title}`);
      expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
      const headerBox = await header.boundingBox();
      const contentBox = await page.locator(destination.ready).first().boundingBox();
      expect(headerBox.y + headerBox.height).toBeLessThanOrEqual(contentBox.y + 1);

      expect(await visibleCount(page,
        '#mobileNavToggle, .caissa-standalone-mobile-toggle, .mobile-quick-actions [data-mobile-action="menu"], .online-menu-shell'))
        .toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);

      await back.click();
      await expect(page).toHaveURL(/\/play-hub$/);
      await expect(page.locator('[data-play-hub-destination]')).toHaveCount(4);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`${destination.route.replaceAll('/', '\\/')}$`));
      await page.goBack();
      await expect(page).toHaveURL(/\/play-hub$/);
    }
  });
}

test('desktop Home and destination navigation stay on the existing desktop surfaces', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto('/');
  await expect(page.locator('[data-mobile-home]')).toBeHidden();
  await expect(page.locator('.sidebar a[href="/play"]')).toBeVisible();
  await expect(page.locator('.sidebar a[href="/play-hub"]')).toHaveCount(0);

  await page.goto('/online');
  await expect(page.locator('.online-menu-shell')).toBeVisible();
  await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();

  await page.goto('/play-online/playchess');
  await expect(page.locator('#mainNav')).toBeVisible();
  await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();

  await page.goto('/fics');
  await expect(page.locator('#mainNav')).toBeVisible();
  await expect(page.locator('[data-caissa-mobile2-destination-header]')).toBeHidden();
});
