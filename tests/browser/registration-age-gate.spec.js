import { expect, test } from '@playwright/test';

async function enableCandidate(page) {
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      clerkPublishableKey: '', registrationTracking: false, identityOwnerHandoff: null,
      registrationCandidate: {
        enabled: true,
        policyVersion: 'caissa-account-16-plus-v1',
        input: 'birth_month_year',
        providerMode: 'restricted_invitations'
      }
    })
  }));
}

test('paused registration remains the default and never contacts Clerk', async ({ page }) => {
  const clerkRequests = [];
  page.on('request', request => {
    if (/clerk/i.test(request.url())) clerkRequests.push(request.url());
  });
  await page.goto('/signup?registration=enabled');
  await expect(page).toHaveTitle('Create Account – CAISSA Chess');
  await expect(page.getByRole('heading', { name: 'New registrations are temporarily paused' })).toBeVisible();
  await expect(page.locator('#registrationCandidate')).toBeHidden();
  expect(clerkRequests).toEqual([]);
});

test('neutral screen sends no email and an unavailable decision reveals no threshold', async ({ page }) => {
  await enableCandidate(page);
  let requestBody;
  await page.route('**/api/auth/registration/eligibility', async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 403, contentType: 'application/json', body: '{"code":"REGISTRATION_UNAVAILABLE"}' });
  });
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Check account availability' })).toBeVisible();
  await page.locator('#registrationBirthMonth').selectOption('12');
  await page.locator('#registrationBirthYear').selectOption('2012');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#registrationCandidateStatus')).toHaveText('Account registration is unavailable.');
  expect(requestBody).toEqual({ birthMonth: '12', birthYear: '2012' });
  expect(JSON.stringify(requestBody)).not.toContain('email');
  await expect(page.locator('#registrationAccountForm')).toBeHidden();
  await expect(page.locator('#registrationCandidate')).not.toContainText(/(?:at least|over|under) 16|16\+/i);
});

test('eligible candidate separates age and email requests and fits Mobile Safari', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Mobile Safari contract runs on WebKit');
  await page.setViewportSize({ width: 375, height: 812 });
  await enableCandidate(page);
  const calls = [];
  await page.route('**/api/auth/registration/eligibility', async route => {
    calls.push({ route: 'eligibility', body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"eligible":true,"policyVersion":"caissa-account-16-plus-v1"}' });
  });
  await page.route('**/api/auth/registration/invitation', async route => {
    calls.push({ route: 'invitation', body: route.request().postDataJSON() });
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true,"next":"check_email"}' });
  });
  await page.goto('/signup');
  await page.locator('#registrationBirthMonth').selectOption('1');
  await page.locator('#registrationBirthYear').selectOption('1990');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#registrationAccountForm')).toBeVisible();
  await page.locator('#registrationEmail').fill('adult@example.test');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#registrationCandidateStatus')).toContainText('Check your email');
  await expect(page.locator('#registrationCandidate')).not.toContainText(/invitation/i);
  expect(calls).toEqual([
    { route: 'eligibility', body: { birthMonth: '1', birthYear: '1990' } },
    { route: 'invitation', body: { emailAddress: 'adult@example.test' } }
  ]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
