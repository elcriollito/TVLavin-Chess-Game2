import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));
async function completed(page) {
    await page.goto('/play/beta'); await page.locator('[data-games-primary]').click();
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4', 'e5']);
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    return page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
}

test('exit inventory and hierarchy are complete, explicit, and recommendation-free', async ({ page }) => {
    const recordId = await completed(page); const panel = page.locator('[data-play-v2-post-game-core]');
    await expect(panel.locator('[data-post-game-action]')).toHaveText(['Analyze This Game', 'Rematch', 'New Game',
        'Review with Mentor', 'Copy PGN', 'Download PGN', 'Save PGN Locally']);
    await expect(panel.locator('[data-post-game-action="analyze"]')).toHaveClass(/--primary/);
    await expect(panel.locator('[data-post-game-action="rematch"]')).toHaveClass(/--secondary/);
    await expect(panel.locator('[data-post-game-action="new-game"]')).toHaveClass(/--secondary/);
    await expect(panel).not.toContainText(/academy|puzzle|endgame|course|upgrade|rating|reward|fics|legacy/i);
    expect(await page.evaluate(() => ({ contract: window.CaissaPlayV2PostGameExitPolicy.contractId,
        automatic: window.CaissaPlayV2PostGameExitPolicy.automaticNavigation,
        recordId: window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId })))
        .toEqual({ contract: 'PlayV2PostGameExitPolicy@1.0.0', automatic: 'prohibited', recordId });
});

test('Analyze rejects concurrent activation and inline Back preserves one completed record', async ({ page }) => {
    const recordId = await completed(page);
    const result = await page.evaluate(async () => {
        const first = window.CaissaPostGameExperienceInstance.execute('analyze');
        const second = window.CaissaPostGameExperienceInstance.execute('analyze');
        return { first: await first, second };
    });
    expect(result.first.ok).toBe(true); expect(result.second.reasonCode).toBe('ACTION_BUSY');
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/); expect(page.url()).not.toMatch(/(?:pgn|fen)=/i);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(recordId);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Back to game result' }).click();
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
});

test('Mentor rejects concurrent activation, consumes its session, and restores exact PostGame', async ({ page }) => {
    const recordId = await completed(page);
    const result = await page.evaluate(async () => {
        const first = window.CaissaPostGameExperienceInstance.execute('mentor-review');
        const second = window.CaissaPostGameExperienceInstance.execute('mentor-review');
        return { first: await first, second };
    });
    expect(result.first.ok).toBe(true); expect(result.second.reasonCode).toBe('ACTION_BUSY'); expect(page.url()).not.toMatch(/(?:pgn|fen|token)=/i);
    await page.getByRole('button', { name: 'Back to PostGame' }).click();
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
    expect(await page.evaluate(() => ({ recordId: window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId,
        handoff: window.CaissaNativeMentorReviewWorkspace.getSnapshot() }))).toEqual({ recordId, handoff: null });
    await page.goForward(); await expect(page.locator('[data-native-mentor-review]')).toHaveCount(0);
    await expect(page.locator('[data-post-game-result]')).toBeVisible();
});

test('busy exit blocks New Game while preserving accessibility and safe return', async ({ page }) => {
    const recordId = await completed(page); const proof = await page.evaluate(async () => {
        const instance = window.CaissaPostGameExperienceInstance;
        const pending = instance.execute('mentor-review'); const blocked = instance.execute('new-game');
        const opened = await pending; return { blocked, opened };
    });
    expect(proof.blocked.reasonCode).toBe('ACTION_BUSY'); expect(proof.opened.ok).toBe(true);
    await page.getByRole('button', { name: 'Back to PostGame' }).click(); await expect(page.locator('[data-post-game-result]')).toBeVisible();
    expect(await page.evaluate(() => window.CaissaPostGameExperienceInstance.getSnapshot())).toMatchObject({ visible: true, gameRecordId: recordId, busyAction: null });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const axe = await new AxeBuilder({ page }).include('[data-play-v2-post-game-core]').analyze();
    expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});
