import { test, expect } from '@playwright/test';
import { BOT_CALIBRATION_FIXTURES, BOT_CALIBRATION_SUITE_VERSION } from '../play/bots/calibration-fixtures.js';
import { aggregateCalibration, inspectRelativeOrdering } from '../play/bots/calibration-harness.js';

const bots = [
    ['beginner', 3, 5],
    ['casual', 7, 4],
    ['tactical', 9, 5],
    ['solid', 9, 5]
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
    for (const [botId, depth, candidateCount] of bots) {
        const observations = [];
        for (const item of BOT_CALIBRATION_FIXTURES) {
            const observation = await page.evaluate(({ botId, fen, depth, candidateCount, timeoutMs }) => new Promise(resolve => {
                const startedAt = performance.now();
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled) return; settled = true;
                    window.App.engine.cancelAttributedSearch?.();
                    resolve({ completed: false, timeout: true, move: null,
                        latencyMs: Math.round(performance.now() - startedAt) });
                }, timeoutMs);
                window.App.engine.getCandidatesAttributed(fen, candidates => {
                    if (settled) return; settled = true; clearTimeout(timer);
                    const selected = window.CaissaBotPersonalityPolicy.select({
                        profileId: botId, fen, candidates, seed: `calibration:${botId}:${fen}`
                    });
                    resolve({ completed: selected.ok, timeout: false, move: selected.move,
                        latencyMs: Math.round(performance.now() - startedAt) });
                }, { depth, candidateCount });
            }), { botId, fen: item.fen, depth, candidateCount, timeoutMs: item.timeoutMs });
            observations.push(observation);
        }
        reports.push(aggregateCalibration(botId, `personality-${botId}`, observations));
    }
    const ordering = inspectRelativeOrdering(reports, ['beginner', 'casual', 'tactical', 'solid']);
    const machineReport = {
        suiteVersion: BOT_CALIBRATION_SUITE_VERSION, profilesTested: bots.map(item => item[0]),
        presetsTested: bots.map(item => item[1]), reports, ordering,
        gamesReset: await page.evaluate(() => {
            window.CaissaBotSession.select('solid'); window.CaissaBotSession.beginGame({ seed: 'calibration-reset' });
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
