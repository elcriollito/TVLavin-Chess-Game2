import { test, expect } from '@playwright/test';
import { BOT_CALIBRATION_FIXTURES, BOT_CALIBRATION_SUITE_VERSION } from '../play/bots/calibration-fixtures.js';
import { aggregateCalibration, inspectRelativeOrdering } from '../play/bots/calibration-harness.js';

const bots = [
    ['caissa-seed', 'seed-depth-2', 2],
    ['caissa-trail', 'trail-depth-5', 5],
    ['caissa-grove', 'grove-depth-9', 9],
    ['caissa-summit', 'summit-depth-14', 14]
];

test('real repository Stockfish position suite produces legal bounded bot calibration', async ({ page }, testInfo) => {
    test.setTimeout(150000);
    await page.route('**/api/public-auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ publishableKey: '' })
    }));
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.goto('/play/bots?simplified=1');
    await page.evaluate(() => {
        const config = window.EngineRegistry?.get('stockfish');
        if (!config || !window.EngineAdapter) throw new Error('Production engine adapter is unavailable');
        window.App.engine?.terminate?.();
        window.App.engine = new window.EngineAdapter({
            ...config,
            workerPath: '/engine/stockfish-working.js'
        });
        window.App.engine.start();
    });
    await expect.poll(() => page.evaluate(() => window.App?.engine?.ready === true), { timeout: 20000 }).toBe(true);

    const reports = [];
    for (const [botId, presetId, depth] of bots) {
        const observations = [];
        for (const item of BOT_CALIBRATION_FIXTURES) {
            const observation = await page.evaluate(({ fen, depth, timeoutMs }) => new Promise(resolve => {
                const startedAt = performance.now();
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled) return; settled = true;
                    window.App.engine.cancelAttributedSearch?.();
                    resolve({ completed: false, timeout: true, move: null,
                        latencyMs: Math.round(performance.now() - startedAt) });
                }, timeoutMs);
                window.App.engine.getBestMoveAttributed(fen, move => {
                    if (settled) return; settled = true; clearTimeout(timer);
                    resolve({ completed: true, timeout: false, move,
                        latencyMs: Math.round(performance.now() - startedAt) });
                }, { depth });
            }), { fen: item.fen, depth, timeoutMs: item.timeoutMs });
            observations.push(observation);
        }
        reports.push(aggregateCalibration(botId, presetId, observations));
    }
    const ordering = inspectRelativeOrdering(reports);
    const machineReport = {
        suiteVersion: BOT_CALIBRATION_SUITE_VERSION, profilesTested: bots.map(item => item[0]),
        presetsTested: bots.map(item => item[1]), reports, ordering,
        gamesReset: await page.evaluate(() => {
            window.CaissaBotSession.select('caissa-summit'); window.CaissaBotSession.beginGame();
            window.CaissaBotSession.resetToFullPower();
            return window.CaissaBotSession.getSnapshot();
        }),
        workerCount: await page.evaluate(() => document.querySelectorAll('#chessboard .board-b72b1').length)
    };
    await testInfo.attach('bot-calibration-report.json', {
        body: JSON.stringify(machineReport, null, 2), contentType: 'application/json'
    });
    for (const report of reports) {
        expect(report.legalFailures, `${report.botId} legal failures`).toBe(0);
        expect(report.timeouts, `${report.botId} timeouts`).toBe(0);
        expect(report.averageLatencyMs, `${report.botId} latency`).toBeLessThan(8000);
    }
    expect(ordering.supported).toBe(true);
    expect(machineReport.gamesReset.fullPower).toBe(true);
    expect(machineReport.gamesReset.search).toBe(null);
    console.log(`BOT_CALIBRATION_REPORT ${JSON.stringify(machineReport)}`);
});
