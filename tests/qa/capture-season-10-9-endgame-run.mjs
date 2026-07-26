import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'tests/qa/season-10-9-endgame-run');
const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8000';
const route = `${base}/endgame-trainer?trainerV2=1&multiMovePilot=1&endgameRun=1`;
const play = async (page, uci) => {
  await page.locator(`.square-${uci.slice(0,2)}`).click();
  await page.locator(`.square-${uci.slice(2,4)}`).click();
};
const shot = async (page, name) => page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });

await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await desktop.goto(route); await desktop.getByRole('button',{name:'Start Run'}).waitFor();
await shot(desktop,'01-run-ready-desktop');
await desktop.getByRole('button',{name:'Start Run'}).click(); await shot(desktop,'02-item-1-active-desktop');
for (const move of ['e5f6','e4e5','e5e6','e6e7','e7e8']) await play(desktop,move);
await shot(desktop,'03-item-1-complete');
await desktop.getByRole('button',{name:'Continue'}).click(); await shot(desktop,'04-item-2-active-desktop');
for (const move of ['d1c2','c2b1','b1a1','a1a2']) await play(desktop,move);
await desktop.getByRole('button',{name:'Continue'}).click(); await shot(desktop,'05-run-summary-desktop');

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(route); await mobile.getByRole('button',{name:'Start Run'}).click(); await shot(mobile,'06-mobile-item-1');
for (const move of ['e5f6','e4e5','e5e6','e6e7','e7e8']) await play(mobile,move);
await shot(mobile,'07-mobile-transition');
await mobile.getByRole('button',{name:'Continue'}).click();
for (const move of ['d1c2','c2b1','b1a1','a1a2']) await play(mobile,move);
await mobile.getByRole('button',{name:'Continue'}).click(); await shot(mobile,'08-mobile-summary');

const tablet = await browser.newPage({ viewport: { width: 820, height: 1100 } });
await tablet.goto(route); await tablet.getByRole('button',{name:'Start Run'}).click(); await shot(tablet,'09-tablet-layout');
const unavailable = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await unavailable.route('**/data/endgame-runs/**', request => request.fulfill({ status: 500, body: '' }));
await unavailable.goto(route); await unavailable.getByText('The run could not be verified. This is not learner failure.').waitFor();
await shot(unavailable,'10-technical-unavailable');
await browser.close();
