import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function analyzeFirstMove(page, { from, to, scores = [0, 80], bestMoves = ['d2d4', 'e7e5'] }) {
    await page.goto('/play/beta/games');
    await page.locator('[data-games-primary]').click();
    await playMove(page, from, to);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await page.locator('[data-post-game-action="analyze"]').click();
    await page.evaluate(({ scores, bestMoves }) => __caissaPlayHarness.configure({
        autoReply: true, emitInfo: true, delayMs: 10, scores, bestMoves
    }), { scores, bestMoves });
    await page.locator('#analyzeStartBtn').click();
    await expect(page.locator('#analyzeStatus')).toContainText('Analysis complete', { timeout: 15000 });
    return page.locator('.move-white[data-index="0"]');
}

for (const fixture of [
    { san: 'e4', from: 'e2', to: 'e4' }, { san: 'd4', from: 'd2', to: 'd4' },
    { san: 'c4', from: 'c2', to: 'c4' }, { san: 'Nf3', from: 'g1', to: 'f3' }
]) test(`${fixture.san} is Book from attributed same-origin opening evidence`, async ({ page }) => {
    const move = await analyzeFirstMove(page, fixture);
    await expect(move).toHaveAttribute('aria-label', `${fixture.san}, Book`);
    await move.click();
    await expect(page.locator('.analyze-evidence__classification')).toHaveText('Book');
    await expect(page.locator('#analyzeMoveEvidence')).toContainText(fixture.san);
    await expect(page.locator('#analyzeMoveEvidence')).toContainText('Opening');
    await expect(page.locator('#analyzeMoveEvidence')).not.toContainText(/Engine recommends|\?!|\?\?|Mistake|Blunder/);
    await expect(page.locator('.analyze-evidence .analyze-review-opening__explore')).toHaveAttribute('href', /^\/eco\/[A-E]\d{2}$/);
    expect(await page.evaluate(() => AnalyzeSection.analysisResults[0].accuracyIncluded)).toBe(false);
});

test('unsupported early move resumes engine classification and catastrophic loss overrides Book', async ({ page }) => {
    let move = await analyzeFirstMove(page, { from: 'h2', to: 'h3' });
    await expect(move).toHaveAttribute('aria-label', 'h3, Inaccuracy');
    move = await analyzeFirstMove(page, { from: 'd2', to: 'd4', scores: [0, 300], bestMoves: ['e2e4', 'e7e5'] });
    await expect(move).toHaveAttribute('aria-label', 'd4, Blunder');
    expect(await page.evaluate(() => AnalyzeSection.analysisResults[0].book)).toBe(false);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }])
    test(`Book presentation remains contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const move = await analyzeFirstMove(page, { from: 'c2', to: 'c4' });
        await move.click();
        await expect(page.getByRole('button', { name: 'Back to game result' })).toBeVisible();
        const geometry = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            boards: [...document.querySelectorAll('.board-b72b1')].filter(node => {
                const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
                return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            }).length
        }));
        expect(geometry).toEqual({ overflow: 0, boards: 1 });
        await page.getByRole('button', { name: 'Back to game result' }).click();
        await expect(page.locator('.caissa-post-game')).toBeVisible();
    });
