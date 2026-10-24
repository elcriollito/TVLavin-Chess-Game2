import { test, expect } from '@playwright/test';
import { scannerBoardImage, scannerPerspectiveBoardImage } from './fixtures/scanner-board-image.js';

test.describe('CAISSA Scanner controlled public beta', () => {
  test('desktop is an intentional information and mobile handoff experience', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/scanner');
    await expect(page.locator('#scannerDesktopLanding')).toBeVisible();
    await expect(page.locator('#scannerApp')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Scan a chess position from your phone.' })).toBeVisible();
    await expect(page.locator('img[src="/scanner/public/scanner-qr.svg"]')).toBeVisible();
    await expect(page.locator('#scannerCanonicalUrl')).toHaveValue('https://www.caissa-chess.org/scanner');
    await expect(page.getByText('Physical 3D boards', { exact: false })).toBeVisible();
    await expect(page.getByText('Privacy by choice')).toBeVisible();
  });

  test('mobile remains the functional certified Scanner with mandatory review', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await expect(page.locator('#scannerDesktopLanding')).toBeHidden();
    await expect(page.locator('#scannerApp')).toBeVisible();
    await expect(page.locator('.public-beta-badge')).toBeVisible();
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#readingView')).toBeVisible();
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#workspaceView')).toBeHidden();
    await expect(page.locator('#scannerBoard .sq')).toHaveCount(64);
    await page.locator('#applyEditBtn').click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('#helpImproveBtn')).toBeVisible();
  });

  test('tablet-width layout keeps the functional Scanner rather than user-agent sniffing', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1024 });
    await page.goto('/scanner');
    await expect(page.locator('#scannerApp')).toBeVisible();
    await expect(page.locator('#scannerDesktopLanding')).toBeHidden();
  });

  test('feedback is optional, separates both consents, and is raw-unverified', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const requests = [];
    page.on('request', request => { if (request.url().includes('/api/scanner/public/')) requests.push({ url: request.url(), method: request.method() }); });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await page.locator('#applyEditBtn').click();
    await page.locator('#helpImproveBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#shareCorrectionConsent')).not.toBeChecked();
    await expect(page.locator('#shareImageConsent')).not.toBeChecked();
    await expect(page.locator('#submitFeedbackBtn')).toBeDisabled();
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#appToast')).toContainText('raw-unverified');
    expect(requests.some(item => item.url.endsWith('/feedback') && item.method === 'POST')).toBe(true);
    expect(requests.some(item => item.url.endsWith('/image'))).toBe(false);
  });

  test('HEIC and HEIF fail explicitly without calling recognition', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let recognitionCalls = 0;
    page.on('request', request => { if (request.url().endsWith('/api/scanner/public/recognize')) recognitionCalls += 1; });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles({ name: 'board.heic', mimeType: 'image/heic', buffer: Buffer.from('unsupported') });
    await expect(page.locator('#appToast')).toContainText('HEIC and HEIF are not supported');
    expect(recognitionCalls).toBe(0);
  });

  test('localization failure stays safe and offers opt-in failure evidence', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    await page.locator('#galleryInput').setInputFiles(scannerPerspectiveBoardImage);
    await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
    await page.locator('#publicLocalizationWrongBtn').click();
    await expect(page.locator('#feedbackSheetDescription')).toContainText('localization review');
    await expect(page.locator('#shareImageConsent')).not.toBeChecked();
  });

  test('mobile public beta has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/scanner');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
