import { test, expect } from '@playwright/test';

test.setTimeout(60_000);

const viewports = [
  { width: 390, height: 844, expectedHeight: 540 },
  { width: 430, height: 932, expectedHeight: 580 }
];

async function prepare(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
}

async function getPlaychessFrame(page) {
  const handle = await page.locator('.playchess-embed-shell iframe').elementHandle();
  const frame = await handle.contentFrame();
  await frame.getByRole('button', { name: 'More', exact: true })
    .waitFor({ state: 'visible', timeout: 20_000 });
  return frame;
}

for (const viewport of viewports) {
  test(`Playchess final compactness contract at ${viewport.width}px`, async ({ page }, testInfo) => {
    await prepare(page);
    await page.setViewportSize(viewport);
    await page.goto('/play-online/playchess', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-caissa-mobile2-destination-title]')).toHaveText('Playchess');
    await expect(page.locator('[data-caissa-mobile2-back]')).toHaveAttribute('href', '/play-hub');
    const frame = await getPlaychessFrame(page);
    await page.waitForTimeout(5_000);

    const shell = await page.locator('.playchess-embed-shell').boundingBox();
    const frameElement = await page.locator('.playchess-embed-shell iframe').boundingBox();
    const guest = await frame.getByText(/^Guest\d+$/).first().boundingBox();
    const users = await frame.getByText(/users online\./).first().boundingBox();
    const controls = {};
    for (const name of ['5min Blitz', 'More', 'Tools', 'Log in']) {
      const control = frame.getByRole('button', { name, exact: true });
      await expect(control).toBeVisible();
      await control.click({ trial: true });
      controls[name] = await control.boundingBox();
    }

    expect(shell.height).toBe(viewport.expectedHeight);
    expect(Math.abs(frameElement.height - shell.height)).toBeLessThanOrEqual(3);
    expect(users.y - (guest.y + guest.height)).toBeLessThanOrEqual(25);
    for (const box of Object.values(controls)) {
      expect(box.y).toBeGreaterThanOrEqual(shell.y);
      expect(box.y + box.height).toBeLessThanOrEqual(shell.y + shell.height + 1);
    }

    const parentGeometry = await page.evaluate(() => {
      const shellBox = document.querySelector('.playchess-embed-shell').getBoundingClientRect();
      const frameNode = document.querySelector('.playchess-embed-shell iframe');
      return {
        transform: getComputedStyle(frameNode).transform,
        hitTarget: document.elementFromPoint(shellBox.left + (shellBox.width / 2), shellBox.top + 200)?.tagName,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
      };
    });
    expect(parentGeometry.transform).toContain('1.15');
    expect(parentGeometry.hitTarget).toBe('IFRAME');
    expect(parentGeometry.overflow).toBeLessThanOrEqual(1);
    await frame.locator('.boardArea').click({ trial: true, position: { x: 190, y: 220 } });

    const more = frame.getByRole('button', { name: 'More', exact: true });
    await more.click();
    await expect(frame.getByText('Any Bullet', { exact: true })).toBeVisible();
    await more.click();

    const tools = frame.getByRole('button', { name: 'Tools', exact: true });
    await tools.click();
    await expect(frame.getByText('Rematch', { exact: true })).toBeVisible();
    await tools.click();

    const disclosure = page.locator('.playchess-mobile-disclosure');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).not.toHaveAttribute('open', '');

    if (testInfo.project.name === 'chromium') {
      await page.screenshot({
        path: `test-results/playchess-final-${viewport.width}.png`,
        fullPage: true
      });
    }

    await disclosure.locator('summary').click();
    await expect(disclosure.locator('a')).toBeVisible();
    await disclosure.locator('summary').click();
    await page.locator('[data-caissa-mobile2-back]').click();
    await expect(page).toHaveURL(/\/play-hub$/);
  });
}

test('desktop Playchess geometry remains unchanged', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/play-online/playchess', { waitUntil: 'domcontentloaded' });

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('.playchess-embed-shell').getBoundingClientRect();
    const frame = document.querySelector('.playchess-embed-shell iframe');
    const frameBox = frame.getBoundingClientRect();
    return {
      shellHeight: shell.height,
      shellWidth: shell.width,
      frameWidth: frameBox.width,
      transform: getComputedStyle(frame).transform,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.shellHeight).toBe(690);
  expect(Math.abs(geometry.frameWidth - geometry.shellWidth)).toBeLessThanOrEqual(2);
  expect(geometry.transform).toBe('none');
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.playchess-disclosure')).toBeVisible();
  await expect(page.locator('.playchess-mobile-disclosure')).toBeHidden();
});
