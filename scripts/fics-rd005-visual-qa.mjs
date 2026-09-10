import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.FICS_QA_BASE_URL || 'http://localhost:8000/fics';
const outputDir = path.resolve('test-results/fics-rd005-visual');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function open(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
    return { context, page };
}

async function gameFixture(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        const moves = Array.from({ length: 80 }, (_, index) => ({
            moveNumber: Math.floor(index / 2) + 1,
            color: index % 2 ? 'black' : 'white',
            san: index % 2 ? 'e5' : 'e4'
        }));
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
            ficsUsername: 'Alexander', myColor: 'white', moveHistory: moves, latencyMs: 84,
            liveGame: {
                ...client.createEmptyLiveGameState('playing'), gameNumber: 505,
                whiteName: 'Alexander', blackName: 'FICS Opponent', userColor: 'white', relation: 1,
                sideToMove: 'w', whiteClock: 295, blackClock: 288, currentFen: 'start',
                gameActive: true, observedGame: false
            }
        });
        client.updateConnectionStatus(true);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    });
}

async function snap(page, name, target = '#ficsSection') {
    await page.locator(target).scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
}

const desktop = await open({ width: 1600, height: 1000 });
await snap(desktop.page, '01-desktop-disconnected');
await desktop.page.getByRole('button', { name: 'Open FICS settings' }).click();
await snap(desktop.page, '02-desktop-settings-open');
await desktop.page.getByRole('button', { name: 'Close FICS settings' }).click();
await snap(desktop.page, '03-desktop-settings-closed');
await gameFixture(desktop.page);
await snap(desktop.page, '04-desktop-game-mode');
await desktop.page.getByRole('button', { name: 'Open FICS settings' }).click();
await snap(desktop.page, '05-desktop-game-settings');
await desktop.page.getByRole('button', { name: 'Close FICS settings' }).click();
await desktop.page.locator('#ficsConsoleToggle').click();
await snap(desktop.page, '06-desktop-console-expanded');
await desktop.page.locator('#ficsConsoleToggle').click();
await snap(desktop.page, '07-desktop-console-collapsed');

const geometryAfter = await desktop.page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    return {
        workspace: Math.round(rect('.fics-rd2-workspace').height),
        head: Math.round(rect('.fics-rd2-workspace-head').height),
        body: Math.round(rect('.fics-rd2-workspace-body').height),
        foot: Math.round(rect('.fics-rd2-workspace-foot').height),
        notation: Math.round(rect('.fics-rd4-move-scroll').height)
    };
});
await desktop.context.close();

const tablet = await open({ width: 1024, height: 768 });
await tablet.page.getByRole('button', { name: 'Open FICS settings' }).click();
await snap(tablet.page, '08-tablet-settings');
await tablet.page.getByRole('button', { name: 'Close FICS settings' }).click();
await gameFixture(tablet.page);
await snap(tablet.page, '09-tablet-game-mode', '[data-fics-shell-region="workspace"]');
await tablet.context.close();

const mobile = await open({ width: 390, height: 844 });
await mobile.page.getByRole('button', { name: 'Open FICS settings' }).click();
await snap(mobile.page, '10-mobile-settings');
await mobile.page.getByRole('button', { name: 'Close FICS settings' }).click();
await snap(mobile.page, '11-mobile-console-collapsed', '#ficsConsoleToggle');
await gameFixture(mobile.page);
await snap(mobile.page, '12-mobile-game-mode', '[data-fics-shell-region="workspace"]');
const mobileOverflow = await mobile.page.evaluate(() => {
    const section = document.getElementById('ficsSection');
    return section.scrollWidth - section.clientWidth;
});
await mobile.context.close();

const comparison = await open({ width: 1600, height: 1000 });
await gameFixture(comparison.page);
await comparison.page.evaluate(() => window.CaissaFICSShell.setEnabled(false));
await comparison.page.locator('link[href*="fics-redesign-shell.css"]').evaluate(node => node.remove());
const oldStyles = execFileSync('git', ['show', 'HEAD:css/fics-redesign-shell.css'], { encoding: 'utf8' });
const oldShell = execFileSync('git', ['show', 'HEAD:js/fics-layout-shell.js'], { encoding: 'utf8' });
await comparison.page.addStyleTag({ content: oldStyles });
await comparison.page.evaluate(source => {
    window.CAISSA_FICS_REDESIGN_ENABLED = true;
    (0, eval)(source);
}, oldShell);
await comparison.page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
const geometryBefore = await comparison.page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    return {
        workspace: Math.round(rect('.fics-rd2-workspace').height),
        head: Math.round(rect('.fics-rd2-workspace-head').height),
        body: Math.round(rect('.fics-rd2-workspace-body').height),
        foot: Math.round(rect('.fics-rd2-workspace-foot').height),
        notation: Math.round(rect('.fics-rd4-move-scroll').height)
    };
});
await comparison.context.close();
await browser.close();

const report = { baseUrl, captures: 12, geometryBefore, geometryAfter,
    bodyRecovered: geometryAfter.body - geometryBefore.body,
    footReduced: geometryBefore.foot - geometryAfter.foot,
    notationRecovered: geometryAfter.notation - geometryBefore.notation,
    mobileOverflow, browserErrors: errors };
fs.writeFileSync(path.join(outputDir, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (errors.length || mobileOverflow > 1) process.exitCode = 1;
