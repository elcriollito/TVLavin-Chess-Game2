import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('Scanner image sharing requires a distinct source-rights attestation', async ({ page }) => {
  await page.goto('/scanner');

  await page.evaluate(() => {
    const sheet = document.querySelector('#feedbackSheet');
    sheet.hidden = false;
    sheet.removeAttribute('inert');
    sheet.setAttribute('aria-hidden', 'false');
  });

  const correction = page.locator('#shareCorrectionConsent');
  const image = page.locator('#shareImageConsent');
  const rights = page.locator('#sourceImageRightsConsent');
  const submit = page.locator('#submitFeedbackBtn');

  await expect(image).not.toBeChecked();
  await expect(rights).toBeDisabled();
  await expect(rights.locator('xpath=..')).toContainText('I have the right to share this image');
  await expect(image.locator('xpath=..')).toContainText('private improvement review only, not model training');

  await correction.check();
  await expect(submit).toBeEnabled();

  await image.check();
  await expect(rights).toBeEnabled();
  await expect(submit).toBeDisabled();

  await rights.check();
  await expect(submit).toBeEnabled();

  await image.uncheck();
  await expect(rights).toBeDisabled();
  await expect(rights).not.toBeChecked();
  await expect(submit).toBeEnabled();
});
