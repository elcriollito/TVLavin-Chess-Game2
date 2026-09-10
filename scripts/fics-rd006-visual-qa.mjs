import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.FICS_QA_BASE_URL || 'http://localhost:8000/fics';
const outputDir = path.resolve('test-results/fics-rd006-visual');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const browserErrors = [];

async function open(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') browserErrors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
    return { context, page };
}

async function gameFixture(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
            ficsUsername: 'Alexander', myColor: 'white', latencyMs: 84,
            moveHistory: Array.from({ length: 80 }, (_, index) => ({
                moveNumber: Math.floor(index / 2) + 1,
                color: index % 2 ? 'black' : 'white', san: index % 2 ? 'e5' : 'e4'
            })),
            liveGame: {
                ...client.createEmptyLiveGameState('playing'), gameNumber: 606,
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

async function capture(page, name) {
    await page.locator('#ficsSection').scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
}

async function captureWorkspace(page, name) {
    const workspace = page.locator('[data-fics-shell-region="workspace"]');
    await workspace.scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await workspace.screenshot({ path: path.join(outputDir, `${name}.png`) });
}

async function measure(page) {
    return page.evaluate(() => {
        const height = selector => Math.round(document.querySelector(selector).getBoundingClientRect().height);
        return {
            workspace: height('.fics-rd2-workspace'),
            head: height('.fics-rd2-workspace-head'),
            body: height('.fics-rd2-workspace-body'),
            foot: height('.fics-rd2-workspace-foot'),
            notation: document.querySelector('.fics-rd4-move-scroll')
                ? height('.fics-rd4-move-scroll') : null
        };
    });
}

const desktop = await open({ width: 1600, height: 1000 });
const afterDisconnected = await measure(desktop.page);
await capture(desktop.page, '01-desktop-tables-disconnected');
await desktop.page.getByRole('tab', { name: 'Players' }).click();
await capture(desktop.page, '02-desktop-players-unsupported');
await desktop.page.getByRole('tab', { name: 'Seek' }).click();
await capture(desktop.page, '03-desktop-seek-disconnected');
await desktop.page.getByRole('button', { name: 'Open FICS settings' }).click();
await capture(desktop.page, '04-desktop-settings-open');
await desktop.page.getByRole('button', { name: 'Close FICS settings' }).click();
await capture(desktop.page, '05-desktop-console-collapsed');
await desktop.page.locator('#ficsConsoleToggle').click();
await capture(desktop.page, '06-desktop-console-expanded');
await desktop.page.locator('#ficsConsoleToggle').click();
await gameFixture(desktop.page);
const afterGame = await measure(desktop.page);
await capture(desktop.page, '07-desktop-game-mode');
await desktop.context.close();

const tablet = await open({ width: 768, height: 1024 });
await capture(tablet.page, '08-tablet-tables-disconnected');
await tablet.page.getByRole('button', { name: 'Open FICS settings' }).click();
await capture(tablet.page, '09-tablet-settings-open');
await tablet.page.getByRole('button', { name: 'Close FICS settings' }).click();
await gameFixture(tablet.page);
await capture(tablet.page, '10-tablet-game-mode');
await captureWorkspace(tablet.page, '11-tablet-workspace-game-mode');
const tabletOverflow = await tablet.page.evaluate(() => {
    const section = document.getElementById('ficsSection');
    return section.scrollWidth - section.clientWidth;
});
await tablet.context.close();

const mobile = await open({ width: 390, height: 844 });
await mobile.page.getByRole('tab', { name: 'Seek' }).click();
await capture(mobile.page, '12-mobile-seek-disconnected');
await captureWorkspace(mobile.page, '13-mobile-workspace-seek-disconnected');
await mobile.page.getByRole('button', { name: 'Open FICS settings' }).click();
await capture(mobile.page, '14-mobile-settings-open');
await mobile.page.getByRole('button', { name: 'Close FICS settings' }).click();
await gameFixture(mobile.page);
await capture(mobile.page, '15-mobile-game-mode');
await captureWorkspace(mobile.page, '16-mobile-workspace-game-mode');
const mobileOverflow = await mobile.page.evaluate(() => {
    const section = document.getElementById('ficsSection');
    return section.scrollWidth - section.clientWidth;
});
await mobile.context.close();

const comparison = await open({ width: 1600, height: 1000 });
await comparison.page.evaluate(() => window.CaissaFICSShell.setEnabled(false));
await comparison.page.locator('link[href*="fics-redesign-shell.css"]').evaluate(node => node.remove());
const previousStyles = execFileSync('git', ['show', 'HEAD:css/fics-redesign-shell.css'], { encoding: 'utf8' });
const previousShell = execFileSync('git', ['show', 'HEAD:js/fics-layout-shell.js'], { encoding: 'utf8' });
await comparison.page.addStyleTag({ content: previousStyles });
await comparison.page.evaluate(source => {
    window.CAISSA_FICS_REDESIGN_ENABLED = true;
    (0, eval)(source);
}, previousShell);
await comparison.page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
const beforeDisconnected = await measure(comparison.page);
await gameFixture(comparison.page);
const beforeGame = await measure(comparison.page);
await comparison.context.close();
await browser.close();

const report = {
    baseUrl,
    captures: 16,
    desktop: {
        disconnected: { before: beforeDisconnected, after: afterDisconnected },
        game: { before: beforeGame, after: afterGame }
    },
    tabletOverflow,
    mobileOverflow,
    browserErrors
};
fs.writeFileSync(path.join(outputDir, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (browserErrors.length || tabletOverflow > 1 || mobileOverflow > 1) process.exitCode = 1;
