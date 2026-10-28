import { test, expect } from '@playwright/test';
import { scannerBoardImage } from './fixtures/scanner-board-image.js';

const contributionEndpoints = [
  '/api/scanner/public/scan',
  '/api/scanner/public/feedback',
  '/api/scanner/public/image-consent',
  '/api/scanner/public/image'
];

async function mockContributionEndpoints(page, requests) {
  await page.route('**/api/scanner/public/scan', async (route) => {
    requests.push({ endpoint: 'scan', method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { accepted: true, duplicate: false } });
  });
  await page.route('**/api/scanner/public/feedback', async (route) => {
    requests.push({ endpoint: 'feedback', method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ json: { accepted: true, duplicate: false, certificationStatus: 'raw-unverified' } });
  });
  await page.route('**/api/scanner/public/image-consent', async (route) => {
    requests.push({ endpoint: 'image-consent', method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 201, json: { accepted: true, duplicate: false, expiresAt: '2026-10-28T02:00:00Z' } });
  });
  await page.route('**/api/scanner/public/image', async (route) => {
    requests.push({ endpoint: 'image', method: route.request().method(), body: null });
    await route.fulfill({ json: { accepted: true, duplicate: false } });
  });
}

async function reachConsent(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/scanner');
  await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
  await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
  await page.locator('#applyEditBtn').click();
  await expect(page.locator('#feedbackSheet')).toBeVisible();
  await expect(page.locator('#feedbackSheetTitle')).toHaveText('Help Improve CAISSA Scanner');
}

function endpointNames(requests) {
  return requests.map((request) => request.endpoint);
}

test.describe('Scanner Privacy Consent v1.0', () => {
  test('declining both choices performs no improvement persistence and does not block analysis', async ({ page }, testInfo) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page);
    await expect(page.locator('#shareCorrectionConsent')).not.toBeChecked();
    await expect(page.locator('#shareImageConsent')).not.toBeChecked();
    await expect(page.locator('#submitFeedbackBtn')).toBeEnabled();
    await testInfo.attach('scanner-consent-390x844', {
      body: await page.locator('#feedbackSheet').screenshot(),
      contentType: 'image/png'
    });
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    await expect(page.locator('#handoffCard')).toBeVisible();
    expect(endpointNames(requests)).toEqual([]);
  });

  test('results-only stores raw-unverified feedback without uploading the photo', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page);
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    expect(endpointNames(requests)).toEqual(['scan', 'feedback']);
    const feedback = requests.find((request) => request.endpoint === 'feedback').body.feedback;
    expect(feedback.consent).toEqual({
      shareCorrectionForImprovement: true,
      shareImageForImprovement: false
    });
    expect(feedback.certificationStatus).toBe('raw-unverified');
  });

  test('photo-only creates a private purpose-bound upload without a feedback snapshot', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page, { width: 430, height: 932 });
    await page.locator('#shareImageConsent').check();
    await expect(page.locator('#sourceImageRightsRow')).toBeVisible();
    await expect(page.locator('#submitFeedbackBtn')).toBeDisabled();
    await page.locator('#sourceImageRightsConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    expect(endpointNames(requests)).toEqual(['image-consent', 'image']);
    const consent = requests.find((request) => request.endpoint === 'image-consent').body;
    expect(consent.feedbackId).toBeNull();
    expect(consent.purpose).toBe('scanner-photo-improvement-review');
    expect(consent.consentSource).toBe('scanner-review-consent-panel');
  });

  test('both choices stay independently recorded and bind one upload to raw feedback', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page);
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#shareImageConsent').check();
    await page.locator('#sourceImageRightsConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    expect(endpointNames(requests)).toEqual(['scan', 'image-consent', 'image', 'feedback']);
    const imageConsent = requests.find((request) => request.endpoint === 'image-consent').body;
    const feedback = requests.find((request) => request.endpoint === 'feedback').body;
    expect(imageConsent.feedbackId).toBe(feedback.feedback.feedbackId);
    expect(feedback.imageUploadId).toBe(imageConsent.uploadId);
    expect(feedback.feedback.consent).toEqual({
      shareCorrectionForImprovement: true,
      shareImageForImprovement: true
    });
  });

  test('photo upload failure preserves the reviewed board and safely retries the governed grant', async ({ page }) => {
    let reservedUploadId = null;
    const uploadedIds = [];
    let imageAttempts = 0;
    await page.route('**/api/scanner/public/image-consent', async (route) => {
      const body = route.request().postDataJSON();
      reservedUploadId ||= body.uploadId;
      await route.fulfill({
        status: 201,
        json: { accepted: true, duplicate: body.uploadId !== reservedUploadId, uploadId: reservedUploadId }
      });
    });
    await page.route('**/api/scanner/public/image', async (route) => {
      uploadedIds.push(route.request().headers()['x-caissa-upload-id']);
      imageAttempts += 1;
      if (imageAttempts === 1) await route.fulfill({ status: 503, json: { error: 'IMAGE_UPLOAD_INTERRUPTED' } });
      else await route.fulfill({ json: { accepted: true, duplicate: true } });
    });

    await reachConsent(page);
    const confirmedFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#shareImageConsent').check();
    await page.locator('#sourceImageRightsConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#feedbackStatus')).not.toBeEmpty();
    await expect(page.locator('#confirmedFen')).toHaveText(confirmedFen);

    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    await expect(page.locator('#handoffCard')).toBeVisible();
    expect(uploadedIds).toEqual([reservedUploadId, reservedUploadId]);
  });

  test('feedback response failure retries one stable feedback identity without losing corrections', async ({ page }) => {
    const feedbackIds = [];
    let feedbackAttempts = 0;
    await page.route('**/api/scanner/public/scan', async (route) => {
      await route.fulfill({ json: { accepted: true, duplicate: feedbackAttempts > 0 } });
    });
    await page.route('**/api/scanner/public/feedback', async (route) => {
      feedbackIds.push(route.request().postDataJSON().feedback.feedbackId);
      feedbackAttempts += 1;
      if (feedbackAttempts === 1) await route.fulfill({ status: 503, json: { error: 'SCANNER_PUBLIC_FEEDBACK_UNAVAILABLE' } });
      else await route.fulfill({ json: { accepted: true, duplicate: true, certificationStatus: 'raw-unverified' } });
    });

    await reachConsent(page);
    const confirmedFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#confirmedFen')).toHaveText(confirmedFen);

    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    await expect(page.locator('#handoffCard')).toBeVisible();
    expect(feedbackIds).toHaveLength(2);
    expect(new Set(feedbackIds).size).toBe(1);
  });

  test('the panel has no horizontal overflow and exposes keyboard-focusable independent choices', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page, { width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('#shareCorrectionConsent')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#shareCorrectionConsent')).toBeChecked();
    await expect(page.locator('#shareImageConsent')).not.toBeChecked();
  });
});

test('consent endpoint list remains narrow and explicit', () => {
  expect(contributionEndpoints).toHaveLength(4);
});
