import { test, expect } from '@playwright/test';

const payloads = [
  '<img src=x onerror="window.__CAISSA_XSS_TRIGGERED__=true">',
  '<svg onload="window.__CAISSA_XSS_TRIGGERED__=true"></svg>',
  '<iframe srcdoc="<script>parent.__CAISSA_XSS_TRIGGERED__=true<\/script>"></iframe>',
  '<details open ontoggle="window.__CAISSA_XSS_TRIGGERED__=true">x</details>',
  '</div><script>window.__CAISSA_XSS_TRIGGERED__=true<\/script>',
  '&lt;img src=x onerror=&quot;window.__CAISSA_XSS_TRIGGERED__=true&quot;&gt;'
];

async function openClassic(page, suffix = '') {
  await page.goto(`/yahoo-classic${suffix}`, { waitUntil: 'domcontentloaded' });
  for (const [globalName, url] of [
    ['MentorAI', '/mentor-ai.js'],
    ['AnalyzeSection', '/js/analyze-section.js'],
    ['CaissaFICSClient', '/js/fics-client.js']
  ]) {
    if (!await page.evaluate(name => typeof window[name] !== 'undefined', globalName)) await page.addScriptTag({ url });
  }
  await page.evaluate(() => {
    window.__CAISSA_XSS_TRIGGERED__ = false;
    MentorAI.cacheElements();
  });
}

for (const [index, payload] of payloads.entries()) {
  test(`LLM taint payload ${index + 1} remains inert`, async ({ page }) => {
    await openClassic(page);
    await page.evaluate(value => MentorAI.addMessage('assistant', value), payload);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
    await expect(page.locator('#mentorMessages script, #mentorMessages iframe, #mentorMessages svg, #mentorMessages img, #mentorMessages details')).toHaveCount(0);
  });
}

test('LLM javascript link remains plain inert text', async ({ page }) => {
  await openClassic(page);
  await page.evaluate(() => MentorAI.addMessage('assistant', '[click](javascript:window.__CAISSA_XSS_TRIGGERED__=true)'));
  await expect(page.locator('#mentorMessages a')).toHaveCount(0);
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
});

test('hostile PGN header and imported metadata remain inert', async ({ page }) => {
  await openClassic(page);
  await page.evaluate(value => {
    AnalyzeSection.elements.fetchedGames = document.createElement('div');
    document.body.appendChild(AnalyzeSection.elements.fetchedGames);
    AnalyzeSection.fetchedGames = [{ white: value, black: value, source: value, result: '*', date: '', pgn: '' }];
    AnalyzeSection.renderFetchedGames();
  }, payloads[0]);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
  await expect(page.locator('.analyze-fetched-game img, .analyze-fetched-game svg')).toHaveCount(0);
});

test('hostile PGN comment formatting remains inert Mentor text', async ({ page }) => {
  await openClassic(page);
  await page.evaluate(value => MentorAI.addMessage('user', `{ ${value} }`), payloads[1]);
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
  await expect(page.locator('#mentorMessages svg')).toHaveCount(0);
});

test('FICS multiline status is rendered as text with line breaks', async ({ page }) => {
  await openClassic(page);
  await page.evaluate(value => {
    CaissaFICSClient.elements.gameStatus = document.createElement('div');
    document.body.appendChild(CaissaFICSClient.elements.gameStatus);
    CaissaFICSClient.updateGameStatus(`Ready\n${value}`);
  }, payloads[0]);
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
  await expect(page.locator('.fics-game-status img')).toHaveCount(0);
  await expect(page.locator('.fics-game-status br')).toHaveCount(1);
});

test('query-string taint is not reflected as executable DOM', async ({ page }) => {
  await openClassic(page, `?q=${encodeURIComponent(payloads[0])}`);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
});

test('fragment taint is not reflected as executable DOM', async ({ page }) => {
  await openClassic(page, `#${encodeURIComponent(payloads[1])}`);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__)).toBe(false);
});

test('stored-like hostile Mentor settings remain inert after reload', async ({ page }) => {
  await openClassic(page);
  await page.evaluate(value => localStorage.setItem('caissa_mentor_settings', JSON.stringify({ provider: 'together', model: value, hostile: value })), payloads[3]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => window.__CAISSA_XSS_TRIGGERED__ === true)).toBe(false);
  await page.evaluate(() => localStorage.removeItem('caissa_mentor_settings'));
});

test('BYO sentinel is private while tainted content remains inert', async ({ page }) => {
  await openClassic(page);
  const proof = await page.evaluate(value => {
    MentorAI.elements.providerSelect.value = 'openai';
    MentorAI.elements.modelSelect.value = 'gpt-4o-mini';
    MentorAI.elements.apiKeyInput.value = 'TEST_BYO_SECRET_SENTINEL';
    MentorAI.initializeProvider();
    MentorAI.addMessage('assistant', value);
    return {
      triggered: window.__CAISSA_XSS_TRIGGERED__,
      config: LLMProvider.getConfig(),
      publicConfigKey: Object.prototype.hasOwnProperty.call(LLMProvider.config, 'apiKey'),
      domContainsSecret: document.documentElement.textContent.includes('TEST_BYO_SECRET_SENTINEL'),
      inputCleared: MentorAI.elements.apiKeyInput.value === ''
    };
  }, payloads[0]);
  expect(proof).toEqual({ triggered: false, config: expect.objectContaining({ provider: 'openai', hasApiKey: true }), publicConfigKey: false, domContainsSecret: false, inputCleared: true });
});

test('pagehide clears the BYO key and a reload cannot restore it', async ({ page }) => {
  await openClassic(page);
  expect(await page.evaluate(() => { LLMProvider.setApiKey('synthetic-key'); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); return LLMProvider.getConfig().hasApiKey; })).toBe(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => LLMProvider.getConfig().hasApiKey)).toBe(false);
});
