import { expect, test } from '@playwright/test';

async function enableCandidate(page) {
  await page.route('**/api/public-auth-config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      clerkPublishableKey: 'pk_test_YXV0aC5sb2NhbC50ZXN0JA', registrationTracking: false, identityOwnerHandoff: null,
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

test('Clerk invitation ticket bypasses duplicate age and invitation requests and is preserved for SignIn', async ({ page }) => {
  await enableCandidate(page);
  const registrationRequests = [];
  page.on('request', request => {
    if (/\/api\/auth\/registration\/(?:eligibility|invitation)$/.test(new URL(request.url()).pathname)) {
      registrationRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    window.__mountedInvitation = null;
    window.__internal_ClerkUICtor = function ClerkUI() {};
    window.Clerk = {
      user: null,
      load: async () => {},
      mountSignIn: (container, props) => {
        window.__mountedInvitation = { href: window.location.href, props };
        container.textContent = 'Secure invitation accepted by Clerk';
      }
    };
  });
  const ticket = 'ticket.synthetic_1234567890';
  await page.goto(`/signup?__clerk_ticket=${ticket}&redirect_url=%2Fscanner`);
  await expect(page.getByRole('heading', { name: 'Finish creating your account' })).toBeVisible();
  await expect(page.locator('#clerk-sign-up')).toHaveText('Secure invitation accepted by Clerk');
  await expect(page.locator('#registrationCandidate')).toBeHidden();
  expect(registrationRequests).toEqual([]);
  const mounted = await page.evaluate(() => window.__mountedInvitation);
  expect(mounted.href).toContain(`__clerk_ticket=${ticket}`);
  expect(mounted.props.forceRedirectUrl).toBe('/auth/complete?redirect_url=%2Fscanner');
  expect(mounted.props.signUpForceRedirectUrl).toBe('/auth/complete?redirect_url=%2Fscanner');
  expect(mounted.props.signUpUrl).toBe('/signup');
});

test('malformed or repeated invitation tickets do not open Clerk and remain on the age gate', async ({ page }) => {
  await enableCandidate(page);
  await page.addInitScript(() => {
    window.__clerkMounted = false;
    window.Clerk = { load: async () => {}, mountSignIn: () => { window.__clerkMounted = true; } };
  });
  await page.goto('/signup?__clerk_ticket=short&__clerk_ticket=second_ticket_123456789');
  await expect(page.getByRole('heading', { name: 'Check account availability' })).toBeVisible();
  expect(await page.evaluate(() => window.__clerkMounted)).toBe(false);
});
