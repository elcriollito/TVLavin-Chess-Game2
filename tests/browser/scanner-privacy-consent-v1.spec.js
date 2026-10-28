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
    requests.push({ endpoint: 'scan', method: route.request().method(), body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    await route.fulfill({ json: { accepted: true, duplicate: false } });
  });
  await page.route('**/api/scanner/public/feedback', async (route) => {
    requests.push({ endpoint: 'feedback', method: route.request().method(), body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    await route.fulfill({ json: { accepted: true, duplicate: false, certificationStatus: 'raw-unverified' } });
  });
  await page.route('**/api/scanner/public/image-consent', async (route) => {
    requests.push({ endpoint: 'image-consent', method: route.request().method(), body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    await route.fulfill({ status: 201, json: { accepted: true, duplicate: false, expiresAt: '2026-10-28T02:00:00Z' } });
  });
  await page.route('**/api/scanner/public/image', async (route) => {
    requests.push({ endpoint: 'image', method: route.request().method(), body: null, authorization: route.request().headers().authorization });
    await route.fulfill({ json: { accepted: true, duplicate: false } });
  });
}

async function setAuth(page, { signedIn = true, token = 'scanner-staging-test-token', userId = 'user_scanner_privacy_test' } = {}) {
  await page.evaluate(({ signedIn, token, userId }) => {
    Object.assign(window.CAISSA_AUTH, {
      isLoaded: true,
      isSignedIn: signedIn,
      userId: signedIn ? userId : null,
      status: signedIn ? 'authenticated' : 'anonymous',
      whenReady: async () => window.CAISSA_AUTH,
      getToken: async () => signedIn ? token : null
    });
    window.dispatchEvent(new CustomEvent('caissa-auth-change', { detail: { ...window.CAISSA_AUTH } }));
  }, { signedIn, token, userId });
}

async function reachConsent(page, viewport = { width: 390, height: 844 }, { signedIn = true } = {}) {
  await page.setViewportSize(viewport);
  await page.goto('/scanner');
  await setAuth(page, { signedIn });
  await page.locator('#galleryInput').setInputFiles(scannerBoardImage);
  await expect(page.locator('#reviewEditView')).toBeVisible({ timeout: 30_000 });
  await page.locator('#applyEditBtn').click();
  await expect(page.locator('#feedbackSheet')).toBeVisible();
  await expect(page.locator('#feedbackSheetTitle')).toHaveText('Help Improve CAISSA Scanner');
}

function endpointNames(requests) {
  return requests.map((request) => request.endpoint);
}

function expectAuthenticated(requests) {
  expect(requests.every(request => request.authorization === 'Bearer scanner-staging-test-token')).toBe(true);
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

  test('anonymous results-only feedback signs in, restores the board and choices, and waits for a fresh confirmation', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page, { width: 390, height: 844 }, { signedIn: false });
    const reviewedFen = await page.locator('#confirmedFen').textContent();
    await page.locator('#shareCorrectionConsent').check();
    await expect(page.locator('#submitFeedbackBtn')).toHaveText('Sign in to share feedback');
    await page.locator('#submitFeedbackBtn').click();
    await page.waitForURL(/\/signin\?redirect_url=/);
    const destination = new URL(page.url()).searchParams.get('redirect_url');
    expect(destination).toBe('/scanner?feedback_return=1');
    const serializedDraft = await page.evaluate(() => sessionStorage.getItem('caissa:scanner:feedback-auth-handoff:v1'));
    expect(serializedDraft).toContain(reviewedFen);
    expect(serializedDraft).not.toMatch(/data:image|accessToken|sourceFile|photoBytes/);
    expect(requests).toEqual([]);

    await page.goto('/scanner?feedback_return=1');
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#confirmedFen')).toHaveText(reviewedFen);
    await expect(page.locator('#shareCorrectionConsent')).toBeChecked();
    expect(requests).toEqual([]);
    await setAuth(page, { signedIn: true });
    await expect(page.locator('#submitFeedbackBtn')).toHaveText('Confirm and share feedback');
    expect(requests).toEqual([]);
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    expect(endpointNames(requests)).toEqual(['scan', 'feedback']);
    expectAuthenticated(requests);
  });

  test('cancelled login restores a retry path and Not now remains an escape without persistence', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page, { width: 390, height: 844 }, { signedIn: false });
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await page.waitForURL(/\/signin\?redirect_url=/);
    await page.goto('/scanner?feedback_return=1');
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#feedbackStatus')).toContainText('Sign-in was not completed');
    await expect(page.locator('#submitFeedbackBtn')).toHaveText('Sign in to share feedback');
    await page.locator('#cancelFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    await expect(page.locator('#handoffCard')).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('photo consent survives authentication only as a choice and requires matching photo reselection plus fresh rights attestation', async ({ page }) => {
    const requests = [];
    await mockContributionEndpoints(page, requests);
    await reachConsent(page, { width: 390, height: 844 }, { signedIn: false });
    await page.locator('#shareImageConsent').check();
    await page.locator('#sourceImageRightsConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await page.waitForURL(/\/signin\?redirect_url=/);
    const serializedDraft = await page.evaluate(() => sessionStorage.getItem('caissa:scanner:feedback-auth-handoff:v1'));
    expect(serializedDraft).not.toMatch(/data:image|sourceFile|photoBytes/);

    await page.goto('/scanner?feedback_return=1');
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await setAuth(page, { signedIn: true });
    await expect(page.locator('#shareImageConsent')).toBeChecked();
    await expect(page.locator('#sourceImageRightsConsent')).not.toBeChecked();
    await expect(page.locator('#sourceImageRightsConsent')).toBeDisabled();
    await expect(page.locator('#feedbackImageReselectBtn')).toBeVisible();
    await page.locator('#feedbackImageInput').setInputFiles(scannerBoardImage);
    await expect(page.locator('#sourceImageRightsConsent')).toBeEnabled();
    await page.locator('#sourceImageRightsConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeHidden();
    expect(endpointNames(requests)).toEqual(['image-consent', 'image']);
    expectAuthenticated(requests);
  });

  test('expired authenticated session preserves retry and never sends feedback without a new token', async ({ page }) => {
    const requests = [];
    await page.route('**/api/scanner/public/scan', async (route) => {
      requests.push({ endpoint: 'scan', authorization: route.request().headers().authorization });
      await route.fulfill({ status: 401, json: { error: 'AUTH_REQUIRED' } });
    });
    await page.route('**/api/scanner/public/feedback', async (route) => {
      requests.push({ endpoint: 'feedback', authorization: route.request().headers().authorization });
      await route.fulfill({ status: 500 });
    });
    await reachConsent(page);
    await page.locator('#shareCorrectionConsent').check();
    await page.locator('#submitFeedbackBtn').click();
    await expect(page.locator('#feedbackSheet')).toBeVisible();
    await expect(page.locator('#feedbackStatus')).toContainText('session expired');
    await expect(page.locator('#submitFeedbackBtn')).toHaveText('Sign in to share feedback');
    expect(endpointNames(requests)).toEqual(['scan']);
    expectAuthenticated(requests);
    await setAuth(page, { signedIn: true, userId: 'user_different_account' });
    await expect(page.locator('#feedbackStatus')).toContainText('different account');
    await expect(page.locator('#submitFeedbackBtn')).toBeDisabled();
    expect(endpointNames(requests)).toEqual(['scan']);
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
    expectAuthenticated(requests);
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
    expectAuthenticated(requests);
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
    expectAuthenticated(requests);
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
