import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createClerkClient } from '@clerk/backend';

if (process.env.EAE011_LIVE_PREVIEW !== '1' || !process.env.EAE011_BYPASS ||
    !process.env.CLERK_SECRET_KEY?.startsWith('sk_test_'))
  throw new Error('PREVIEW_BYPASS_REQUIRED');
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const requests = [];
let testUser, relayId, ownerToken;
await context.route(/^https:\/\/eae011-(main|engine)-elcriollitos-projects\.vercel\.app\//,
  route => route.continue({ headers: { ...route.request().headers(),
    'x-vercel-protection-bypass': process.env.EAE011_BYPASS } }));
context.on('request', request => requests.push(request.url()));
try {
  const main = await context.newPage();
  const mainResponse = await main.goto(
    'https://eae011-main-elcriollitos-projects.vercel.app/experiments/lc0-preview-relay/main/index.html',
    { waitUntil: 'domcontentloaded' });
  assert.equal(mainResponse.status(), 200);
  await main.waitForFunction(() => Boolean(window.CAISSA_AUTH), null, { timeout: 10000 });
  const mainState = await main.evaluate(() => ({ isolated: crossOriginIsolated,
    hasCaissaAuth: Boolean(window.CAISSA_AUTH),
    hasEngineCredentials: Boolean(sessionStorage.getItem('eae011-engine-credential')) }));
  assert.equal(mainState.hasCaissaAuth, true);
  assert.equal(mainState.hasEngineCredentials, false);
  const engine = await context.newPage();
  const engineResponse = await engine.goto(
    'https://eae011-engine-elcriollitos-projects.vercel.app/experiments/lc0-preview-relay/engine/index.html',
    { waitUntil: 'domcontentloaded' });
  assert.equal(engineResponse.status(), 200);
  const engineState = await engine.evaluate(() => ({ isolated: crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
    hasCaissaAuth: Boolean(window.CAISSA_AUTH),
    hasClerkToken: Object.keys(sessionStorage).some(key => /clerk|auth|token/i.test(key)) }));
  assert.equal(engineState.isolated, true);
  assert.equal(engineState.sharedArrayBuffer, true);
  assert.equal(engineState.hasCaissaAuth, false);
  assert.equal(engineState.hasClerkToken, false);
  assert.equal(requests.some(url => /lc0|onnxruntime|maia/i.test(url)
    && !url.includes('lc0-preview-relay')), false);
  testUser = await clerk.users.createUser({
    emailAddress: [`eae011-browser-${crypto.randomUUID()}@example.com`],
    skipPasswordRequirement: true
  });
  const clerkSession = await clerk.sessions.createSession({ userId: testUser.id });
  ownerToken = (await clerk.sessions.getToken(clerkSession.id)).jwt;
  const createdResponse = await fetch(
    'https://eae011-main-elcriollitos-projects.vercel.app/api/eae011?action=create', {
      method: 'POST', headers: { Origin: 'https://eae011-main-elcriollitos-projects.vercel.app',
        Authorization: `Bearer ${ownerToken}`, 'x-vercel-protection-bypass': process.env.EAE011_BYPASS,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ competitionId: `browser-${Date.now()}`, participantRole: 'white' })
    });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json(); relayId = created.sessionId;
  const isolated = new URL(
    'https://eae011-engine-elcriollitos-projects.vercel.app/experiments/lc0-preview-relay/engine/index.html');
  isolated.hash = new URLSearchParams({ sessionId: relayId,
    claimToken: created.claimToken }).toString();
  await engine.goto('about:blank');
  await engine.goto(isolated.href, { waitUntil: 'domcontentloaded' });
  try {
    await engine.waitForFunction(() => document.querySelector('#status')?.textContent
      .includes('Engine session'), null, { timeout: 10000 });
  } catch (error) {
    const state = await engine.evaluate(() => ({ status: document.querySelector('#status')?.textContent,
      log: document.querySelector('#log')?.textContent }));
    throw new Error(`ENGINE_BROWSER_CLAIM_FAILED ${JSON.stringify(state)}`, { cause: error });
  }
  assert.equal(new URL(engine.url()).hash, '');
  await engine.reload({ waitUntil: 'domcontentloaded' });
  await engine.waitForFunction(() => document.querySelector('#status')?.textContent
    .includes('Engine session'), null, { timeout: 10000 });
  const reloaded = await engine.evaluate(() => ({ hasScopedCredential:
    Boolean(sessionStorage.getItem('eae011-engine-credential')),
    hasClaimToken: Boolean(sessionStorage.getItem('eae011-claim-token')),
    isolated: crossOriginIsolated }));
  assert.equal(reloaded.hasScopedCredential, true);
  assert.equal(reloaded.hasClaimToken, false);
  assert.equal(reloaded.isolated, true);
  console.log(JSON.stringify({ main: mainState, engine: engineState,
    engineReload: reloaded, runtimeAssetsLoaded: false, distinctOrigins: new URL(main.url()).origin !==
      new URL(engine.url()).origin }));
} finally {
  await browser.close();
  if (relayId && ownerToken) await fetch(
    `https://eae011-main-elcriollitos-projects.vercel.app/api/eae011?action=terminate&sessionId=${relayId}`, {
      method: 'POST', headers: { Origin: 'https://eae011-main-elcriollitos-projects.vercel.app',
        Authorization: `Bearer ${ownerToken}`, 'x-vercel-protection-bypass': process.env.EAE011_BYPASS,
        'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  if (testUser) await clerk.users.deleteUser(testUser.id);
}
