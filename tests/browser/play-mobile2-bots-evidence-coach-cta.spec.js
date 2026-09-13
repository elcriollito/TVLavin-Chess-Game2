import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const PORTRAITS = [
    { width: 390, height: 844 },
    { width: 430, height: 932 }
];

test.use({ hasTouch: true });
test.beforeEach(async ({ page }) => instrumentPlay(page));

const settleLayout = page => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function playCoachToGameOver(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/coach', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-caissa-native-coach-panel] button:has-text("Play")').click();
    await page.locator('#chessboard .caissa-board__square[data-square="e2"]').click();
    await page.locator('#chessboard .caissa-board__square[data-square="e4"]').click();
    await expect.poll(() => page.evaluate(() => window.App.game.history().length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-post-game-action="analyze"]')).toHaveText('Analyze Game');
    await settleLayout(page);
}

async function visibilityProof(locator) {
    return locator.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const centerX = Math.min(innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
        const centerY = Math.min(innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
        const hit = document.elementFromPoint(centerX, centerY);
        const menu = document.getElementById('mobileNavToggle');
        const menuRect = menu?.getBoundingClientRect();
        const overlapsMenu = !!menuRect && rect.left < menuRect.right && rect.right > menuRect.left
            && rect.top < menuRect.bottom && rect.bottom > menuRect.top;
        const clippingAncestors = [];
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
                const box = parent.getBoundingClientRect();
                clippingAncestors.push({ className: parent.className, overflowY: style.overflowY,
                    top: box.top, bottom: box.bottom, scrollTop: parent.scrollTop,
                    clientHeight: parent.clientHeight, scrollHeight: parent.scrollHeight });
            }
        }
        return {
            rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
                width: rect.width, height: rect.height },
            fullyInViewport: rect.top >= 0 && rect.bottom <= innerHeight
                && rect.left >= 0 && rect.right <= innerWidth,
            tappable: hit === node || node.contains(hit),
            overlapsMenu,
            clippingAncestors
        };
    });
}

test.fixme('M2-003F Coach Mobile 2.0 CTA composition is held from this release', async ({ page }) => {
    test.setTimeout(120_000);
    for (const [viewportIndex, viewport] of PORTRAITS.entries()) {
        await playCoachToGameOver(page, viewport);
        const analyze = page.getByRole('button', { name: 'Analyze Game', exact: true });
        await expect(analyze).toBeVisible();
        await expect(page.getByRole('button', { name: 'Start Review', exact: true })).toHaveCount(0);
        const gameOverProof = await visibilityProof(analyze);
        console.log(`M2_003F_COACH_ANALYZE_CTA ${viewport.width}x${viewport.height} ${JSON.stringify(gameOverProof)}`);
        expect(gameOverProof.fullyInViewport).toBe(true);
        expect(gameOverProof.tappable).toBe(true);
        expect(gameOverProof.overlapsMenu).toBe(false);

        if (viewportIndex === 0) await analyze.tap();
        else await analyze.press('Enter');
        await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.analysisPhase || 'loading'),
            { timeout: 30_000 }).toBe('complete');
        const review = page.getByRole('button', { name: 'Start Review', exact: true });
        await expect(review).toBeVisible();
        await expect(page.getByRole('button', { name: 'Analyze Game', exact: true })).toHaveCount(0);
        await settleLayout(page);
        const summaryBeforeScroll = await visibilityProof(review);
        await page.locator('.content-area').evaluate(node => node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }));
        await settleLayout(page);
        const summaryProof = await visibilityProof(review);
        console.log(`M2_003F_COACH_REVIEW_CTA ${viewport.width}x${viewport.height} ${JSON.stringify({
            beforeScroll: summaryBeforeScroll, afterNormalScroll: summaryProof
        })}`);
        expect(summaryProof.fullyInViewport).toBe(true);
        expect(summaryProof.tappable).toBe(true);
        expect(summaryProof.overlapsMenu).toBe(false);
        expect(viewport.height - summaryProof.rect.bottom).toBeGreaterThanOrEqual(44);

        if (viewportIndex === 0) await review.tap();
        else await review.press('Enter');
        await expect(page.locator('[data-coach-guided-move-comparison]')).toBeVisible();
        const evidence = await page.evaluate(() => {
            const index = window.AnalyzeSection.currentMoveIndex;
            const item = window.AnalyzeSection.analysisResults[index];
            return {
                played: document.querySelector('[data-coach-guided-played]').textContent,
                expectedPlayed: window.AnalyzeSection.getLoadedMoves()[index],
                best: document.querySelector('[data-coach-guided-best]').textContent,
                expectedBest: item.recommendationAvailable === true && item.bestMoveSan
                    ? item.bestMoveSan : 'Not available'
            };
        });
        expect(evidence).toMatchObject({ played: evidence.expectedPlayed, best: evidence.expectedBest });
        const axe = await new AxeBuilder({ page }).include('#playSection').analyze();
        expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    }
});

async function playBotsToReview(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/bots?simplified=1', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /^.*Advanced/ }).click();
    await page.getByLabel(/Vera, 1500 Elo target/).check();
    await page.locator('[data-bot-primary]').click();
    for (let turn = 0; turn < 3; turn += 1) {
        const before = await page.evaluate(() => window.App.game.history().length);
        const move = await page.evaluate(() => window.App.game.moves({ verbose: true })[0]);
        expect(await playMove(page, move.from, move.to)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.App.game.history().length),
            { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 2);
    }
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await page.locator('[data-bots-primary-post-game-action]').click();
    const shell = page.locator('[data-caissa-bots-shell]');
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'analysis-summary');
    await expect(shell.locator('.caissa-bots-analysis-summary__review')).toBeEnabled({ timeout: 30_000 });
    await shell.locator('.caissa-bots-analysis-summary__review').click();
    await expect(shell).toHaveAttribute('data-bot-shell-phase', 'guided-review');
    await expect(page.locator('[data-bots-guided-review]')).toBeVisible();
}

async function botsEvidence(page, action) {
    await page.locator(`[data-mobile-review-navigation] [data-bots-guided-nav="${action}"]`).click();
    await settleLayout(page);
    return page.evaluate(() => {
        const analyze = window.AnalyzeSection;
        const index = analyze.currentMoveIndex;
        const item = index >= 0 ? analyze.analysisResults[index] : null;
        const model = window.CaissaBotsGuidedReviewPresentation.createGuidedModel({
            analyze, handoff: window.CaissaAnalyzeHandoff?.getCurrent?.() || null
        });
        const projection = analyze.getCoachReviewProjection?.();
        const board = window.App.boardProjection?.getSnapshot?.();
        const comparison = document.querySelector('[data-games-guided-move-comparison]');
        return {
            index,
            comparisonVisible: index < 0 || (comparison && !comparison.hidden && comparison.getClientRects().length > 0),
            played: document.querySelector('[data-games-guided-played]')?.textContent || null,
            expectedPlayed: index >= 0 ? analyze.getLoadedMoves()[index] : null,
            best: document.querySelector('[data-games-guided-best]')?.textContent || null,
            expectedBest: index < 0 ? null : (item.recommendationAvailable === true && item.bestMoveSan
                ? item.bestMoveSan : 'Not available'),
            classification: document.querySelector('.caissa-bots-guided__classification')?.textContent || null,
            expectedClassification: model.quality.toUpperCase(),
            evaluation: document.querySelector('.caissa-bots-guided__evaluation')?.textContent || null,
            expectedEvaluation: model.evaluation,
            commentary: document.querySelector('.caissa-bots-guided__message')?.textContent || null,
            expectedCommentary: model.message,
            projectionFen: projection?.fen || null,
            boardFen: board?.positionFen || null,
            explorationVisible: document.querySelector('[data-bots-analysis-exploration]')?.getClientRects().length > 0
        };
    });
}

test('M2-003F Bots First/Previous/Next/Last keep Played, Best, classification, evaluation, commentary, and FEN on one ply', async ({ page }) => {
    test.setTimeout(120_000);
    for (const viewport of PORTRAITS) {
        await playBotsToReview(page, viewport);
        const samples = [];
        for (const action of ['last', 'previous', 'first', 'next', 'next', 'last']) {
            const sample = await botsEvidence(page, action);
            samples.push({ action, ...sample });
            expect(sample.explorationVisible).toBe(false);
            expect(sample.projectionFen).toBe(sample.boardFen);
            expect(sample.classification).toBe(sample.expectedClassification);
            expect(sample.evaluation).toBe(sample.expectedEvaluation);
            expect(sample.commentary).toBe(sample.expectedCommentary);
            if (sample.index >= 0) {
                expect(sample.comparisonVisible).toBe(true);
                expect(sample.played).toBe(sample.expectedPlayed);
                expect(sample.best).toBe(sample.expectedBest);
            }
        }
        console.log(`M2_003F_BOTS_EVIDENCE ${viewport.width}x${viewport.height} ${JSON.stringify(samples)}`);
        expect(new Set(samples.filter(sample => sample.index >= 0).map(sample => sample.index)).size).toBeGreaterThanOrEqual(2);
        expect(await page.locator('#chessboard .caissa-board__square').count()).toBe(64);
    }
});
