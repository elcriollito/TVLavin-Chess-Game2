import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ publishableKey: '' })
  }));
});

test('/analyze exposes and activates the application-shell skip link', async ({ page }) => {
  await page.goto('/analyze');
  const skip = page.locator('.caissa-global-skip-link');
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mainContent')).toBeFocused();
});

for (const [locale, expected] of [
  ['en', 'Skip to main content'],
  ['es', 'Ir al contenido principal'],
  ['pt', 'Ir para o conteúdo principal']
]) {
  test(`skip link and Premium name remain truthful in ${locale}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('caissa.locale', value), locale);
    await page.goto('/analyze');
    await expect(page.locator('.caissa-global-skip-link')).toHaveText(expected);
    const premium = page.locator('.nav-premium-btn');
    const visibleText = (await premium.innerText()).replace(/\s+/g, ' ').trim();
    const name = await premium.getAttribute('aria-label');
    expect(name.toLocaleLowerCase(locale)).toContain(visibleText.toLocaleLowerCase(locale));
    const results = await new AxeBuilder({ page }).include('#mainNav').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
  });
}

test('mobile Scanner and Chess Gym layouts retain focusable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/scanner');
  await expect(page.getByRole('button', { name: 'Start a new scan' })).toBeVisible();
  await page.goto('/chess-gym');
  await expect(page.getByRole('tab', { name: 'Training', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flip board' })).toBeVisible();
});
