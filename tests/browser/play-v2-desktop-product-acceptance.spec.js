import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const targets = [
    { width: 1440, height: 900, setup: 700, active: 650 },
    { width: 1920, height: 1080, setup: 880, active: 830 },
    { width: 2560, height: 1440, setup: 1240, active: 1190 },
    { width: 3840, height: 2160, setup: 1960, active: 1910 }
];
const captureRoot = process.env.CAISSA_CAPTURE_DIR ? resolve(process.env.CAISSA_CAPTURE_DIR) : null;
if (captureRoot) mkdirSync(captureRoot, { recursive: true });
const capture = async (page, name) => captureRoot && page.screenshot({ path: resolve(captureRoot, `${name}.png`), fullPage: true });

const geometry = page => page.evaluate(() => {
    const box = selector => { const rect = document.querySelector(selector).getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; };
    return { board: box('#chessboard'), owner: box('.caissa-simplified-shell__board-stage'),
        context: box('.caissa-simplified-shell__context'), actions: box('.caissa-simplified-shell__board-actions'),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('desktop owner meaningfully fills every target viewport and keeps active actions above fold', async ({ page }) => {
    for (const target of targets) {
        await page.setViewportSize(target); await page.goto('/play/beta');
        const setup = await geometry(page);
        expect(setup.board.width, `${target.width} setup board`).toBeGreaterThanOrEqual(target.setup);
        expect(setup.board.width).toBe(setup.board.height);
        expect(setup.owner.width - setup.board.width).toBeLessThanOrEqual(44);
        expect(setup.owner.bottom).toBeLessThanOrEqual(target.height);
        expect(setup.context.left).toBeGreaterThan(setup.owner.right);
        expect(setup.overflowX).toBeLessThanOrEqual(1);

        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
        const active = await geometry(page);
        expect(active.board.width, `${target.width} active board`).toBeGreaterThanOrEqual(target.active);
        expect(active.board.width).toBe(active.board.height);
        expect(active.actions.bottom).toBeLessThanOrEqual(target.height);
        expect(active.context.left).toBeGreaterThan(active.owner.right);
        expect(active.overflowX).toBeLessThanOrEqual(1);
        await expect(page.locator('[data-active-game-action="resign"]')).toBeVisible();
        await expect(page.locator('[data-active-game-action="coach-help"]')).toBeHidden();

        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('[data-active-game-action="resign"]').click();
        await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'active');
        await page.locator('[data-active-game-action="pgn"]').click();
        await expect(page.locator('.caissa-simplified-shell__pgn-dialog')).toBeVisible();
        await page.locator('[data-active-game-action="close-pgn"]').click();
    }
});

test('Games Resign is confirmed, then result-first PostGame and inline Analyze restore the same record', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/play/beta');
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await playMove(page, 'e2', 'e4');
    await page.locator('[data-active-game-action="pgn"]').click();
    await expect(page.locator('[data-active-game-pgn]')).toHaveValue(/e4/); await page.locator('[data-active-game-action="close-pgn"]').click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-caissa-simplified-shell]')).toHaveAttribute('data-ui-state', 'postgame');
    const recordId = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveAttribute('aria-modal', 'true'); expect(page.url()).not.toMatch(/[?&](?:pgn|fen|handoff)=/i);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
});

test('completed Games handoff runs one evidence-backed analysis and fails closed before completion', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/play/beta');
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await playMove(page, 'e2', 'e4');
    page.once('dialog', dialog => dialog.accept()); await page.locator('[data-active-game-action="resign"]').click();
    const recordId = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('You');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('CAISSA');
    await expect(page.locator('#analyzeGameResult')).toHaveText('0-1');
    await expect(page.locator('#analyzeStatus')).toHaveText('Ready to analyze');
    await expect(page.locator('#analyzeEvalScore')).toHaveText('\u2014');
    await expect(page.locator('#analyzeReviewSummary')).not.toContainText(/100\.0%|Good|Blunder|Mistake|Inaccuracy/);
    const idleWorkers = await page.evaluate(() => { const s=window.__caissaPlayHarness.snapshot();
        return s.workersCreated-s.workersTerminated; });
    expect(idleWorkers).toBe(0);

    await page.evaluate(() => window.__caissaPlayHarness.configure({ autoReply: true, delayMs: 80,
        scores: [0, 400], bestMoves: ['d2d4', 'e7e5'] }));
    await page.locator('#analyzeStartBtn').click();
    await expect(page.locator('#analyzeStatus')).toContainText(/Preparing local engine|Preparing analysis|Analysis complete/);
    await expect.poll(() => page.evaluate(() => { const s=window.__caissaPlayHarness.snapshot();
        return s.workersCreated-s.workersTerminated; })).toBeLessThanOrEqual(1);
    await expect(page.locator('#analyzeStatus')).toContainText('Analysis complete', { timeout: 15000 });
    expect(await page.evaluate(() => ({
        malformed: AnalyzeSection.uciToSan(AnalyzeSection.analysisResults[0].fenBefore, 'not-uci'),
        illegal: AnalyzeSection.uciToSan(AnalyzeSection.analysisResults[0].fenBefore, 'a1a8'),
        evidence: (({ recordId, ply, generation, depth, bestMoveSan }) =>
            ({ recordId, ply, generation, depth, bestMoveSan }))(AnalyzeSection.analysisResults[0])
    }))).toMatchObject({ malformed: null, illegal: null,
        evidence: { recordId, ply: 1, generation: 1, bestMoveSan: 'd4' } });
    await expect(page.locator('#analyzeReviewSummary')).toContainText('Blunder');
    await expect(page.locator('#analyzeReviewSummary')).not.toContainText('100.0%');
    await expect(page.locator('.move-white[data-index="0"]')).toContainText('??');
    await page.locator('.move-white[data-index="0"]').click();
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Played');
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Engine recommends');
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('d4');
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Evaluation');
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Loss');
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Position shown: before e4');
    await expect(page.locator('.move-white[data-index="0"]')).toHaveAttribute('aria-label', /Blunder/);
    const evidenceLayout = await page.evaluate(() => {
        const panel = document.querySelector('.analyze-evidence-panel').getBoundingClientRect();
        const board = document.querySelector('#analyzeChessboard').getBoundingClientRect();
        const visual = document.querySelector('.analyze-evidence__visual').getBoundingClientRect();
        return {
            panelWidth: panel.width, boardWidth: board.width, unused: panel.width - visual.width,
            order: [...document.querySelectorAll('.analyze-evidence__visual > *')].map(node => node.className),
            accessible: document.querySelector('.analyze-evidence').getAttribute('aria-label'),
            rawUci: document.querySelector('#analyzeMoveEvidence').textContent.includes('d2d4')
        };
    });
    expect(evidenceLayout.panelWidth).toBeGreaterThanOrEqual(evidenceLayout.boardWidth);
    expect(evidenceLayout.unused).toBeLessThanOrEqual(2);
    expect(evidenceLayout.order.join(' ')).toMatch(/classification.*played.*recommendation.*evaluation.*loss/);
    expect(evidenceLayout.accessible).toMatch(/Blunder\. Played.*Engine recommends.*Evaluation changed.*Evaluation loss.*board shows/i);
    expect(evidenceLayout.rawUci).toBe(false);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await capture(page, 'final-correction-blunder-comparison-1920x1080');
    expect(await page.evaluate(() => { const s=window.__caissaPlayHarness.snapshot();
        return s.workersCreated-s.workersTerminated; })).toBe(0);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);
    await capture(page, 'final-correction-back-postgame-1920x1080');
});

test('recognized book and acceptable moves remain quiet and book is excluded from accuracy', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/play/beta'); await page.getByRole('button', { name: 'Play', exact: true }).click();
    await playMove(page, 'e2', 'e4'); page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await page.evaluate(() => __caissaPlayHarness.configure({ autoReply: true, emitInfo: true, delayMs: 10,
        scores: [0, 0], bestMoves: ['e2e4', 'e7e5'] }));
    await page.locator('#analyzeStartBtn').click();
    await expect(page.locator('#analyzeStatus')).toContainText('Analysis complete', { timeout: 15000 });
    const move = page.locator('.move-white[data-index="0"]');
    await expect(move).toHaveText('e4');
    await expect(move).toHaveAttribute('aria-label', 'e4, Book');
    await expect(page.locator('#analyzeReviewSummary')).toContainText('Book');
    await expect(page.locator('#analyzeReviewSummary')).toContainText('White accuracy-');
    await move.click();
    await expect(page.locator('.analyze-evidence')).toHaveAttribute('aria-label', /Book move\. e4\./);
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Book');
    await expect(page.locator('#analyzeMoveEvidence')).not.toContainText('Engine recommends');
    await capture(page, 'final-correction-book-quiet-list-1920x1080');
});

test('Acceptable, Inaccuracy and Mistake evidence use concise or complete responsive states', async ({ page }) => {
    const cases = [
        { score: 0, quality: 'Acceptable', glyph: '' },
        { score: 72, quality: 'Inaccuracy', glyph: '?!' },
        { score: 140, quality: 'Mistake', glyph: '?' }
    ];
    for (const item of cases) {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('/play/beta'); await page.getByRole('button', { name: 'Play', exact: true }).click();
        await playMove(page, 'h2', 'h3'); page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-active-game-action="resign"]').click();
        await page.locator('[data-post-game-action="analyze"]').click();
        await page.evaluate(({ score }) => __caissaPlayHarness.configure({ autoReply: true, emitInfo: true,
            delayMs: 10, scores: [0, score], bestMoves: ['d2d4', 'e7e5'] }), item);
        await page.locator('#analyzeStartBtn').click();
        await expect(page.locator('#analyzeStatus')).toContainText('Analysis complete', { timeout: 15000 });
        const move = page.locator('.move-white[data-index="0"]'); await move.click();
        await expect(move).toHaveAttribute('aria-label', new RegExp(item.quality));
        await expect(page.locator('.analyze-evidence__classification')).toContainText(item.quality);
        if (item.glyph) {
            await expect(page.locator('.analyze-evidence__classification')).toContainText(item.glyph);
            await expect(page.locator('.analyze-evidence__visual > *')).toHaveCount(5);
            await expect(page.locator('#analyzeMoveEvidence')).toContainText('Engine recommends');
        } else {
            await expect(page.locator('.analyze-evidence__visual > *')).toHaveCount(1);
            await expect(page.locator('#analyzeMoveEvidence')).not.toContainText('Engine recommends');
        }
        if (item.quality === 'Mistake') {
            for (const viewport of [
                { width: 1440, height: 900, name: '1440x900' },
                { width: 1920, height: 1080, name: '1920x1080' },
                { width: 2560, height: 1440, name: '2560x1440' },
                { width: 3840, height: 2160, name: '3840x2160' },
                { width: 760, height: 900, name: 'narrow-760x900' }
            ]) {
                await page.setViewportSize(viewport);
                await page.locator('.analyze-evidence-panel').scrollIntoViewIfNeeded();
                await expect.poll(() => page.evaluate(() =>
                    document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
                await capture(page, `evidence-mistake-${viewport.name}`);
            }
        }
    }
});

test('trusted ECO continuation uses the canonical dataset route and opens focused detail safely', async ({ page, context }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/play/beta');
    await page.evaluate(() => __caissaPlayHarness.configure({ autoReply: true, emitInfo: true, delayMs: 10,
        scores: [0], bestMoves: ['e7e6'] }));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await playMove(page, 'e2', 'e4');
    await expect.poll(() => page.evaluate(() => App.game.history().length)).toBe(2);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await page.evaluate(() => __caissaPlayHarness.configure({ autoReply: true, emitInfo: true, delayMs: 10,
        scores: [0, 0, 0], bestMoves: ['e2e4', 'e7e6', 'd2d4'] }));
    await page.locator('#analyzeStartBtn').click();
    await expect(page.locator('#analyzeStatus')).toContainText('Analysis complete', { timeout: 15000 });
    await expect(page.locator('#analyzeReviewSummary')).toContainText('French Defense');
    const link = page.getByRole('link', { name: /Explore French Defense C00 in ECO Database.*new tab/i });
    await expect(link).toHaveAttribute('href', '/eco/C00');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    expect(await link.getAttribute('href')).not.toMatch(/pgn|fen|record|handoff|redirect|http/i);
    const [ecoPage] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await ecoPage.waitForLoadState('domcontentloaded');
    await expect(ecoPage.locator('#ecoDetailTitle')).toHaveText('C00 - French Defense');
    await capture(ecoPage, 'eco-database-C00-french-defense');
    expect(new URL(ecoPage.url()).pathname).toBe('/eco/C00');
    await ecoPage.close();
    await expect(page.locator('#analyzeSection')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#analyzeReviewSummary')).toContainText('French Defense');
    await capture(page, 'eco-return-analyze-unchanged');
    expect(await page.evaluate(() => ({
        mismatch: AnalyzeSection.getTrustedEcoOpening({ eco: 'C00', name: 'Injected name' }),
        malformed: AnalyzeSection.getTrustedEcoOpening({ eco: '../C00', name: 'French Defense' }),
        otherFamily: AnalyzeSection.getTrustedEcoOpening({ eco: 'D00', name: 'Wrong name' })
    }))).toEqual({ mismatch: null, malformed: null, otherFamily: null });
    expect(await page.evaluate(() => AnalyzeSection.getTrustedEcoOpening({ eco: 'D00', name: "Queen's Pawn Game" })))
        .toEqual({ eco: 'D00', name: "Queen's Pawn Game" });
});

test('ECO no-query and rejected path behavior remain safe', async ({ page }) => {
    await page.goto('/eco');
    await expect(page.locator('#ecoDetailTitle')).toHaveText('Select an opening');
    await page.goto('/eco/%2F%2Fevil.example');
    await expect(page.locator('#ecoDetailTitle')).toHaveText('Select an opening');
    await page.route('**/data/eco/eco_codes.json', async route => {
        const response = await route.fetch(); const rows = await response.json();
        await route.fulfill({ response, json: rows.filter(row => row.code !== 'C00') });
    });
    await page.goto('/eco/C00');
    await expect(page.locator('#ecoDetailTitle')).toHaveText('Select an opening');
    await expect(page.locator('.eco-row.is-selected')).toHaveCount(0);
});

test('Analyze failure and cancellation preserve PostGame without placeholder claims or orphan Workers', async ({ page }) => {
    const completeAndOpen = async () => {
        await page.goto('/play/beta'); await page.getByRole('button', { name: 'Play', exact: true }).click();
        await playMove(page, 'e2', 'e4'); page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-active-game-action="resign"]').click();
        const id = await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect(page.locator('#analyzeSection')).toHaveAttribute('aria-modal', 'true'); return id;
    };
    await page.setViewportSize({ width: 1920, height: 1080 });
    let recordId = await completeAndOpen();
    await page.evaluate(() => window.__caissaPlayHarness.configure({ workerConstructionFails: true }));
    await page.locator('#analyzeStartBtn').click();
    await expect(page.locator('#analyzeStatus')).toContainText('Analysis unavailable');
    await expect(page.locator('#analyzeStartBtn')).toContainText('Retry analysis');
    await expect(page.locator('#analyzeReviewSummary')).not.toContainText(/100\.0%|Good|Inaccuracy|Mistake|Blunder/);
    expect(await page.evaluate(() => { const s=__caissaPlayHarness.snapshot(); return s.workersCreated-s.workersTerminated; })).toBe(0);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    expect(await page.evaluate(() => CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);

    recordId = await completeAndOpen();
    await page.evaluate(() => window.__caissaPlayHarness.configure({ workerConstructionFails: false, autoReply: true,
        emitInfo: false, delayMs: 10 }));
    await page.locator('#analyzeStartBtn').click();
    await expect(page.locator('#analyzeStatus')).toContainText('Analysis unavailable', { timeout: 15000 });
    await expect(page.locator('#analyzeReviewSummary')).not.toContainText(/100\.0%|Good|Inaccuracy|Mistake|Blunder/);
    await expect(page.locator('#analyzeCriticalMoments')).toContainText('unavailable');
    expect(await page.evaluate(() => { const s=__caissaPlayHarness.snapshot(); return s.workersCreated-s.workersTerminated; })).toBe(0);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    expect(await page.evaluate(() => CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);

    recordId = await completeAndOpen();
    await page.evaluate(() => window.__caissaPlayHarness.configure({ emitInfo: true, autoReply: true, delayMs: 1000 }));
    await page.locator('#analyzeStartBtn').dblclick({ delay: 10 });
    await expect.poll(() => page.evaluate(() => { const s=__caissaPlayHarness.snapshot();
        return s.workersCreated-s.workersTerminated; })).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect.poll(() => page.evaluate(() => { const s=__caissaPlayHarness.snapshot();
        return s.workersCreated-s.workersTerminated; })).toBe(0);
    expect(await page.evaluate(() => CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);
});

test('Bots and Coach hand off truthful completed identities to isolated Analyze ownership', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const mode of ['bots', 'coach']) {
        await page.goto(`/play/beta/${mode}`); await page.getByRole('button', { name: 'Play', exact: true }).click();
        await playMove(page, 'e2', 'e4'); page.once('dialog', dialog => dialog.accept());
        await page.locator('[data-active-game-action="resign"]').click();
        const id=await page.evaluate(()=>CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
        await page.locator('[data-post-game-action="analyze"]').click();
        await expect(page.locator('#analyzeWhitePlayer')).toHaveText('You');
        await expect(page.locator('#analyzeBlackPlayer')).toHaveText(mode === 'bots' ? 'Beginner Bot' : 'Coach-assisted game');
        expect(await page.evaluate(()=>{const s=__caissaPlayHarness.snapshot();return s.workersCreated-s.workersTerminated;})).toBe(0);
        await page.evaluate(()=>__caissaPlayHarness.configure({autoReply:true,emitInfo:true,delayMs:10,scores:[0,80],bestMoves:['e2e4','e7e5']}));
        await page.locator('#analyzeStartBtn').click();
        await expect(page.locator('#analyzeStatus')).toContainText('Analysis complete',{timeout:15000});
        expect(await page.evaluate(()=>{const s=__caissaPlayHarness.snapshot();return s.workersCreated-s.workersTerminated;})).toBe(0);
        await page.getByRole('button',{name:'Back to game result'}).click();
        expect(await page.evaluate(()=>CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(id);
    }
});

test('Bots and Coach expose only truthful active actions at 1920 and 3840', async ({ page }) => {
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
        await page.setViewportSize(viewport); await page.goto('/play/beta/bots');
        expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(0);
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);
        await expect(page.locator('.caissa-simplified-shell__board-actions')).toContainText('Resign');
        await expect(page.locator('[data-active-game-action="coach-help"]')).toBeHidden();
        page.once('dialog', dialog => dialog.accept()); await page.locator('[data-active-game-action="resign"]').click();
        await expect(page.locator('[data-post-game-result]')).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.CaissaWorkerLifecycle?.inspect?.().activeWorkers || 0)).toBe(0);

        await page.goto('/play/beta/coach'); await page.getByRole('button', { name: 'Play', exact: true }).click();
        const help = page.locator('[data-active-game-action="coach-help"]'); await expect(help).toBeVisible(); await help.click();
        await expect(page.locator('[data-active-game-status]')).not.toContainText(/best move|principal variation|\bPV\b/i);
        expect(await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel
            && window.CaissaNativeCoachAssistance?.schemaVersion)).toBeTruthy();
    }
});

test('Assistance admits only owned options and changes Coach configuration without restarting play', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/play/beta');
    await expect(page.locator('[data-play-assistance]')).toBeHidden();

    await page.goto('/play/beta/bots');
    const botsAssistance = page.locator('[data-play-assistance]');
    await expect(botsAssistance).toBeVisible();
    await expect(botsAssistance).not.toHaveAttribute('open', '');
    await botsAssistance.locator('summary').click();
    await expect(botsAssistance.locator('[data-assistance-empty]')).toContainText('No optional live assistance');
    await expect(botsAssistance.locator('input, select')).toHaveCount(0);
    await expect(botsAssistance).not.toContainText(/Evaluation Bar|Threat Indicators|Move Feedback|best move|centipawn|PV/i);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(botsAssistance).toBeVisible();
    expect(await page.evaluate(() => window.__caissaPlayHarness.snapshot().workersCreated)).toBe(1);

    await page.goto('/play/beta/coach');
    const assistance = page.locator('[data-play-assistance]');
    await assistance.locator('summary').click();
    const level = assistance.locator('[data-assistance-level]');
    const focus = assistance.locator('[data-assistance-focus]');
    const timing = assistance.locator('[data-assistance-timing]');
    await expect(level).toHaveValue('standard'); await expect(focus).toHaveValue('balanced');
    await expect(timing).toHaveValue('on-request');
    await expect(assistance.locator('select')).toHaveCount(3);
    await level.selectOption('more-help'); await focus.selectOption('safety');
    expect(await page.evaluate(() => window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.configuration))
        .toMatchObject({ level: 'more-help', focus: 'safety', timing: 'on-request' });

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const before = await page.evaluate(() => ({
        boardCount: document.querySelectorAll('#chessboard').length,
        history: window.App.game.history().length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }));
    await expect(assistance).toBeVisible();
    await focus.selectOption('time-awareness');
    const after = await page.evaluate(() => ({
        boardCount: document.querySelectorAll('#chessboard').length,
        history: window.App.game.history().length,
        workers: window.__caissaPlayHarness.snapshot().workersCreated,
        configuration: window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.configuration
    }));
    expect(after).toMatchObject({ boardCount: before.boardCount, history: before.history,
        workers: before.workers, configuration: { focus: 'time-awareness' } });
    await expect(page.locator('[data-active-game-action="resign"]')).toBeVisible();
    await expect(page.locator('[data-active-game-action="coach-help"]')).toBeVisible();
    expect(await page.evaluate(() => ({
        trainingMemoryWrites: window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.assistance.trainingMemoryWrites,
        masteryWrites: window.CaissaSimplifiedPlayShellInstance.getSnapshot().coachPanel.assistance.masteryWrites
    }))).toEqual({ trainingMemoryWrites: 0, masteryWrites: 0 });
});

test('Assistance disclosure preserves certified desktop geometry and keyboard reflow', async ({ page }) => {
    for (const target of targets) {
        await page.setViewportSize(target); await page.goto('/play/beta/coach');
        const assistance = page.locator('[data-play-assistance]');
        const summary = assistance.locator('summary');
        await summary.focus(); await page.keyboard.press('Enter');
        await expect(assistance).toHaveAttribute('open', '');
        const expanded = await geometry(page);
        expect(expanded.board.width).toBeGreaterThanOrEqual(target.setup);
        expect(expanded.overflowX).toBeLessThanOrEqual(1);
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await expect(assistance).toBeVisible();
        const active = await geometry(page);
        expect(active.board.width).toBeGreaterThanOrEqual(target.active);
        expect(active.actions.bottom).toBeLessThanOrEqual(target.height);
        expect(active.overflowX).toBeLessThanOrEqual(1);
    }
});

test('desktop reflow, forced colors, reduced motion and Axe retain usable controls', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', ...(browserName === 'chromium' ? { forcedColors: 'active' } : {}) });
    await page.goto('/play/beta'); await page.addStyleTag({ content: 'html { zoom: 2; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page }).include('.caissa-simplified-shell').disableRules(['color-contrast']).analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('piece movement has one visible owner and programmatic navigation is immediate', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/play/beta');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const source = page.locator('#chessboard .square-e2');
    const target = page.locator('#chessboard .square-e4');
    await expect(source).toBeVisible(); await expect(target).toBeVisible();
    await page.waitForTimeout(400); // board's bounded initialization resize cycle
    const from = await source.boundingBox(); const to = await target.boundingBox();
    expect(from && to).toBeTruthy();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
    const duringDrag = await page.evaluate(() => ({
        sourceOpacity: getComputedStyle(document.querySelector('#chessboard .square-e2 .piece-417db')).opacity,
        floating: [...document.querySelectorAll('body > .piece-417db')].filter(node => getComputedStyle(node).display !== 'none').length
    }));
    expect(duringDrag).toEqual({ sourceOpacity: '0', floating: 1 });
    await capture(page, 'final-correction-drag-single-owner-frame');
    await page.mouse.up();
    await expect(page.locator('#chessboard .square-e4 .piece-417db')).toHaveCount(1);
    await expect(page.locator('body > .piece-417db:visible')).toHaveCount(0);

    const programmatic = await page.evaluate(() => {
        App.board.position('rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
        return {
            pieces: document.querySelectorAll('#chessboard .piece-417db').length,
            floating: [...document.querySelectorAll('body > .piece-417db')].filter(node => getComputedStyle(node).display !== 'none').length,
            destination: document.querySelectorAll('#chessboard .square-e3 .piece-417db').length
        };
    });
    expect(programmatic).toEqual({ pieces: 32, floating: 0, destination: 1 });
    await capture(page, 'final-correction-immediate-placement');
});
