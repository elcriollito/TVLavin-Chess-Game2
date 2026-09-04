import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const widths = [320, 360, 375, 390, 393, 412, 430, 768, 1024, 1280, 1440, 1920];
const localized = {
  en: { title: 'Support CAISSA', nav: 'Support CAISSA', unavailable: 'PayPal is temporarily unavailable. Please try again later.' },
  es: { title: 'Apoya a CAISSA', nav: 'Apoya a CAISSA', unavailable: 'PayPal no está disponible temporalmente. Inténtalo de nuevo más tarde.' },
  pt: { title: 'Apoie a CAISSA', nav: 'Apoie a CAISSA', unavailable: 'O PayPal está temporariamente indisponível. Tente novamente mais tarde.' }
};

async function isolateAuth(context) {
  await context.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ clerkPublishableKey: '', registrationTracking: true })
  }));
}

async function mockHostedButton(context) {
  await context.route('https://www.paypal.com/sdk/js?**', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: `window.paypal={HostedButtons:({hostedButtonId})=>({render:async selector=>{
      const iframe=document.createElement('iframe');
      iframe.title='PayPal Hosted Button '+hostedButtonId;
      iframe.style.cssText='display:block;width:100%;max-width:420px;height:72px;border:0;margin:auto';
      document.querySelector(selector).appendChild(iframe);
    }})};`
  }));
}

test('Hosted Button renders once and surrounding UI switches EN ES PT', async ({ page, context }) => {
  await isolateAuth(context);
  await mockHostedButton(context);
  await page.addInitScript(() => localStorage.setItem('caissa.locale', 'en'));
  await page.goto('/support');

  await expect(page.locator('#paypal-support-region')).toHaveAttribute('data-paypal-state', 'ready');
  await expect(page.locator('#paypal-container-CV3QSCB3RPGVL iframe')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(localized.en.title);
  await expect(page.locator('[data-nav-key="support"] .nav-label')).toHaveText(localized.en.nav);

  for (const locale of ['es', 'pt', 'en']) {
    await page.locator('[data-caissa-locale-select]').selectOption(locale);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('h1')).toHaveText(localized[locale].title);
    await expect(page.locator('[data-nav-key="support"] .nav-label')).toHaveText(localized[locale].nav);
    await expect(page).toHaveTitle(new RegExp(`^${localized[locale].title}`));
    await expect(page.locator('#paypal-container-CV3QSCB3RPGVL iframe')).toHaveCount(1);
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#paypal-container-CV3QSCB3RPGVL iframe')).toHaveCount(1);
});

test('PayPal failure is localized without breaking the first-party page', async ({ page, context }) => {
  await isolateAuth(context);
  await context.route('https://www.paypal.com/sdk/js?**', route => route.abort('failed'));
  await page.addInitScript(() => localStorage.setItem('caissa.locale', 'es'));
  await page.goto('/support');

  const region = page.locator('#paypal-support-region');
  const status = page.locator('#paypal-support-status');
  await expect(region).toHaveAttribute('data-paypal-state', 'unavailable');
  await expect(status).toHaveText(localized.es.unavailable);
  await expect(page.locator('h1')).toHaveText(localized.es.title);
  await page.locator('[data-caissa-locale-select]').selectOption('pt');
  await expect(status).toHaveText(localized.pt.unavailable);
  await expect(page.locator('.support-back')).toBeVisible();
});

test('Support remains bounded and usable from 320 to 1920 pixels', async ({ page, context }) => {
  await isolateAuth(context);
  await mockHostedButton(context);
  await page.addInitScript(() => localStorage.setItem('caissa.locale', 'pt'));

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto('/support');
    await expect(page.locator('#paypal-support-region')).toHaveAttribute('data-paypal-state', 'ready');
    const geometry = await page.evaluate(() => {
      const region = document.querySelector('#paypal-support-region').getBoundingClientRect();
      const frame = document.querySelector('#paypal-container-CV3QSCB3RPGVL iframe').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        region: { left: region.left, right: region.right, width: region.width },
        frame: { left: frame.left, right: frame.right, width: frame.width },
        viewport: innerWidth
      };
    });
    expect(geometry.overflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
    expect(geometry.region.left, `${width}px region left`).toBeGreaterThanOrEqual(-1);
    expect(geometry.region.right, `${width}px region right`).toBeLessThanOrEqual(width + 1);
    expect(geometry.frame.left, `${width}px frame left`).toBeGreaterThanOrEqual(geometry.region.left - 1);
    expect(geometry.frame.right, `${width}px frame right`).toBeLessThanOrEqual(geometry.region.right + 1);
    expect(geometry.frame.width, `${width}px frame width`).toBeGreaterThanOrEqual(44);

    if (width <= 430) {
      const toggle = page.locator('.caissa-standalone-mobile-toggle');
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.locator('[data-nav-key="support"]')).toBeVisible();
      await expect(page.locator('[data-nav-key="support"] .nav-label')).toHaveText(localized.pt.nav);
      await expect(page.locator('[data-nav-key="support"] i')).toBeVisible();
    }
  }
});

test('First-party Support content has no detectable accessibility violations', async ({ page, context }) => {
  await isolateAuth(context);
  await mockHostedButton(context);
  await page.goto('/support');
  await expect(page.locator('#paypal-support-region')).toHaveAttribute('data-paypal-state', 'ready');

  const skipLink = page.locator('.support-skip-link');
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#support-main')).toBeFocused();
  const results = await new AxeBuilder({ page })
    .include('#support-main')
    .exclude('#paypal-container-CV3QSCB3RPGVL')
    .analyze();
  expect(results.violations).toEqual([]);
});

test('PayPal is absent from Play and certified routes return no unexpected 4xx', async ({ page, context }) => {
  await isolateAuth(context);
  const paypalRequests = [];
  page.on('request', request => {
    if (/paypal|venmo/i.test(request.url())) paypalRequests.push(request.url());
  });
  const routes = ['/play', '/play/games', '/play/bots', '/play/coach', '/game-library', '/pgn-replayer', '/polyglot.html', '/yahoo-classic'];
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response.status(), route).toBeLessThan(400);
  }
  expect(paypalRequests).toEqual([]);
  await expect(page.locator('script[src*="paypal"], [id^="paypal-container"]')).toHaveCount(0);
});

test('live PayPal Hosted Button reaches the safe rendered boundary', async ({ page, context }) => {
  test.skip(process.env.CAISSA_PAYPAL_LIVE !== '1', 'opt-in external PayPal verification');
  test.setTimeout(60_000);
  await isolateAuth(context);
  const paypalResponses = [];
  page.on('response', response => {
    if (/paypal|paypalobjects|venmo/i.test(response.url())) {
      paypalResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto('/support', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#paypal-support-region')).toHaveAttribute('data-paypal-state', 'ready', { timeout: 45_000 });
  await expect.poll(() => page.locator('#paypal-container-CV3QSCB3RPGVL iframe').count()).toBeGreaterThan(0);
  expect(paypalResponses.some(response => response.url.startsWith('https://www.paypal.com/sdk/js') && response.status === 200)).toBe(true);
  expect(paypalResponses.filter(response => response.status >= 400)).toEqual([]);
});
