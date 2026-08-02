import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.describe('instrumented Native Bots Worker ownership', () => {
    test.beforeEach(async ({ page }) => instrumentPlay(page));

    test('passive entry, Bots selection, profile selection, and setup changes create zero Workers', async ({ page }) => {
        await page.goto('/play/beta');
        expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(0);
        await page.getByRole('tab', { name: /Bots/ }).click();
        await expect(page.locator('.caissa-bots-panel')).toBeVisible();
        await page.getByLabel(/Solid, Unrated/).check();
        await page.locator('[data-bot-color]').selectOption('black');
        await page.locator('[data-bot-time]').selectOption('300');
        const proof = await page.evaluate(() => ({ harness: window.__caissaPlayHarness.snapshot(),
            contract: window.CaissaPlayV2BotWorkerReadiness.getSnapshot() }));
        expect(proof.harness.workersCreated).toBe(0);
        expect(proof.contract.activeWorkerCount).toBe(0);
    });

    test('one Play creates one Worker and PostGame, mode switch, and Rematch replace ownership cleanly', async ({ page }) => {
        await page.goto('/play/beta/bots');
        await expect(page.locator('.caissa-bots-panel')).toBeVisible();
        await page.locator('[data-bot-primary]').click();
        await expect.poll(() => page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().state)).toBe('playing');
        expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);
        await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
        await expect(page.locator('.caissa-post-game')).toBeVisible();
        expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersTerminated)).toBe(1);
        expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
        await page.locator('[data-post-game-action="rematch"]').click();
        await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(2);
        expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);
        await page.getByRole('tab', { name: 'Games' }).click();
        expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersTerminated)).toBe(2);
    });

    test('initialization failure exposes one focused keyboard Retry and no orphan', async ({ page }) => {
        await page.goto('/play/beta/bots');
        await expect(page.locator('.caissa-bots-panel')).toBeVisible();
        await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReady: false }));
        await page.locator('[data-bot-primary]').click();
        await expect(page.locator('[data-bot-retry]')).toBeVisible({ timeout: 6000 });
        expect(await page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);
        await expect(page.locator('[data-bot-retry]')).toBeFocused();
        await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReady: true }));
        await page.locator('[data-bot-retry]').press('Enter');
        await expect.poll(() => page.evaluate(() => window.CaissaPlayV2BotWorkerReadiness.getSnapshot().state)).toBe('playing');
        const proof = await page.evaluate(() => ({ harness: window.__caissaPlayHarness.snapshot(),
            worker: window.CaissaPlayV2BotWorkerReadiness.getSnapshot() }));
        expect(proof.harness.workersCreated).toBe(2);
        expect(proof.harness.workersTerminated).toBe(1);
        expect(proof.worker.diagnostics.retries).toBe(1);
        expect(proof.worker.diagnostics.maximumActiveWorkers).toBe(1);
    });
});

test('production-equivalent response serves canonical Worker with narrow CSP and JavaScript MIME', async ({ page, request }) => {
    const entry = await request.get('/play/beta/bots');
    expect(entry.status()).toBe(200);
    const csp = entry.headers()['content-security-policy'];
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toMatch(/worker-src[^;]*(?:blob:|https?:|\*)/);
    const worker = await request.get('/engine/stockfish-working.js');
    expect(worker.status()).toBe(200);
    expect(worker.headers()['content-type']).toMatch(/(?:text|application)\/javascript/);
    expect(new URL(worker.url()).origin).toBe(new URL(entry.url()).origin);
    await page.goto('/play/beta/bots');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    expect(await page.evaluate(() => window.App.engine.engine === null)).toBe(true);
    await page.locator('[data-bot-primary]').click();
    await expect.poll(() => page.evaluate(() => window.App.engine.ready), { timeout: 10000 }).toBe(true);
    expect(await page.evaluate(() => window.App.engine.engine instanceof Worker)).toBe(true);
});

test('real production-equivalent Worker has bounded multi-run local timing observations', async ({ page }) => {
    await page.goto('/play/beta/bots');
    await expect(page.locator('.caissa-bots-panel')).toBeVisible();
    const observations = await page.evaluate(async () => {
        const rows = [];
        for (let run = 0; run < 3; run += 1) {
            window.App.engine.terminate('performance-reset');
            const readyStart = performance.now();
            await window.App.engine.start();
            const readyMs = performance.now() - readyStart;
            const searchStart = performance.now();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('search timeout')), 10000);
                window.App.engine.getCandidatesAttributed(
                    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                    () => { clearTimeout(timeout); resolve(); }, { depth: 2, candidateCount: 2 });
            });
            const searchMs = performance.now() - searchStart;
            const terminationStart = performance.now();
            window.App.engine.terminate('performance-complete');
            rows.push({ readyMs, searchMs, terminationMs: performance.now() - terminationStart });
        }
        return rows;
    });
    console.log(`BOT_WORKER_PERFORMANCE ${JSON.stringify(observations)}`);
    expect(observations).toHaveLength(3);
    expect(observations.every(row => row.readyMs < 8000 && row.searchMs < 10000)).toBe(true);
});
