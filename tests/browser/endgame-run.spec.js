import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const route = '/endgame-trainer?trainerV2=1&multiMovePilot=1&endgameRun=1';
const play = async (page, uci) => {
  await page.locator(`.square-${uci.slice(0,2)}`).click();
  await page.locator(`.square-${uci.slice(2,4)}`).click();
};
const completePromote = async page => {
  for (const move of ['e5f6','e4e5','e5e6','e6e7','e7e8']) await play(page,move);
};
const completeStop = async page => {
  for (const move of ['d1c2','c2b1','b1a1','a1a2']) await play(page,move);
};

test('hidden run completes two verified items with one board and zero Workers', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker; window.__workers = 0;
    window.Worker = class extends NativeWorker { constructor(...args) { window.__workers += 1; super(...args); } };
  });
  await page.goto(route);
  await expect(page.getByRole('heading',{name:'Endgame Run'})).toBeVisible();
  await page.getByRole('button',{name:'Start Run'}).click();
  await expect(page.locator('[data-v2-objective]')).toHaveText('Promote the e-pawn');
  await completePromote(page);
  await expect(page.getByRole('button',{name:'Continue'})).toBeVisible();
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page.locator('[data-v2-objective]')).toHaveText('Stop the a-pawn');
  await completeStop(page);
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page.getByRole('heading',{name:'Run complete'})).toBeVisible();
  await expect(page.locator('[data-v2-summary-independent]')).toHaveText('2');
  expect(await page.locator('[data-board]').count()).toBe(1);
  expect(await page.evaluate(() => window.__workers)).toBe(0);
});

test('Retry Item, drawing objective miss, Retry Run, and Exit remain distinct', async ({ page }) => {
  await page.goto(route); await page.getByRole('button',{name:'Start Run'}).click();
  await play(page,'e5d5');
  await page.getByRole('button',{name:'Retry Item'}).click();
  await completePromote(page); await page.getByRole('button',{name:'Continue'}).click();
  await play(page,'d1d2');
  await expect(page.locator('[data-v2-feedback]')).toContainText('may still draw');
  await page.getByRole('button',{name:'Continue'}).click();
  await expect(page.locator('[data-v2-summary-skipped]')).toHaveText('1');
  await page.getByRole('button',{name:'Retry Run'}).click();
  await expect(page.locator('[data-v2-objective]')).toHaveText('Promote the e-pawn');
  await page.getByRole('button',{name:'Exit Run'}).click();
  await expect(page).toHaveURL(/trainerV2=1$/);
});

test('technical artifact failure is neutral and malformed flags fail closed', async ({ page }) => {
  await page.route('**/data/endgame-runs/**', route => route.fulfill({ status: 500, body: '' }));
  await page.goto(route);
  await expect(page.locator('[data-v2-feedback]')).toContainText('not learner failure');
  await expect(page.getByRole('button',{name:'Exit Run'})).toBeVisible();
  await page.unroute('**/data/endgame-runs/**');
  await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1&endgameRun=true');
  await expect(page.getByRole('button',{name:'Start Challenge'})).toBeVisible();
});

test('run is accessible and responsive across the required matrix', async ({ page }) => {
  await page.goto(route); await page.getByRole('button',{name:'Start Run'}).click();
  for (const width of [320,375,390,768,820,1024,1280,1440,1920]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  expect((await new AxeBuilder({page}).include('[data-endgame-v2-shell]').analyze()).violations).toEqual([]);
});

test('V1, V2, Guided, and both standalone pilots retain precedence', async ({ page }) => {
  await page.goto('/endgame-trainer'); await expect(page.locator('[data-action="prepare"]')).toBeVisible();
  await page.goto('/endgame-trainer?trainerV2=1'); await expect(page.getByRole('button',{name:'Start Challenge'})).toBeVisible();
  await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1'); await expect(page.getByRole('button',{name:'Start Pilot'})).toBeVisible();
  await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1&pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0');
  await expect(page.locator('[data-v2-objective]')).toHaveText('Stop the a-pawn');
  await page.goto(`${route}&studyUnit=direct-opposition&release=rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84`);
  await expect(page.locator('[data-library-study]')).toBeVisible();
});
