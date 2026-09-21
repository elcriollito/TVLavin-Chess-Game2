import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

if (process.env.EAE011_LIVE_PREVIEW !== '1' || !process.env.EAE011_BYPASS)
  throw new Error('PREVIEW_BYPASS_REQUIRED');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const requests = [];
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
  console.log(JSON.stringify({ main: mainState, engine: engineState,
    runtimeAssetsLoaded: false, distinctOrigins: new URL(main.url()).origin !==
      new URL(engine.url()).origin }));
} finally {
  await browser.close();
}
