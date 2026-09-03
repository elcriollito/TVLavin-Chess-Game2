import fs from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

const modes = [
    { name: 'Play Game', route: '/play/games', start: '[data-games-primary]' },
    { name: 'Play Bots', route: '/play/bots', start: '[data-bot-primary]' },
    { name: 'Play Coach', route: '/play/coach', start: '[data-coach-primary]' }
];

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, { autoReply: false, bestMoves: ['e2e4'], scores: [20], depth: 12 });
});

for (const mode of modes) {
    test(`Settings Done closes in place and preserves the active ${mode.name} game`, async ({ page }) => {
        await page.goto(mode.route);
        await page.locator(mode.start).click();
        await expect(page.locator('[data-active-game-action="settings"]')).toBeVisible();

        const before = await page.evaluate(() => ({
            path: location.pathname,
            fen: window.App.game.fen(),
            pgn: window.App.game.pgn(),
            history: window.App.game.history(),
            gameActive: window.App.gameActive,
            whiteTimeMs: window.App.whiteTimeMs,
            blackTimeMs: window.App.blackTimeMs,
            evaluation: document.querySelector('.eval-score-badge')?.textContent || '',
            opening: document.querySelector('[data-active-opening]')?.textContent || '',
            narration: document.querySelector('[data-active-coach-speech]')?.textContent || '',
            annotations: JSON.stringify(window.App.coachMoveAnnotations || [])
        }));

        const settings = page.locator('[data-active-game-action="settings"]');
        await settings.click();
        const dialog = page.locator('[data-active-game-settings]');
        await expect(dialog).toBeVisible();
        const done = dialog.locator('[data-active-game-action="close-settings"]');
        await expect(done).toBeFocused();
        await done.click();

        await expect(dialog).toBeHidden();
        await expect(settings).toBeFocused();
        expect(new URL(page.url()).pathname).toBe(mode.route);
        const after = await page.evaluate(() => ({
            path: location.pathname,
            fen: window.App.game.fen(),
            pgn: window.App.game.pgn(),
            history: window.App.game.history(),
            gameActive: window.App.gameActive,
            whiteTimeMs: window.App.whiteTimeMs,
            blackTimeMs: window.App.blackTimeMs,
            evaluation: document.querySelector('.eval-score-badge')?.textContent || '',
            opening: document.querySelector('[data-active-opening]')?.textContent || '',
            narration: document.querySelector('[data-active-coach-speech]')?.textContent || '',
            annotations: JSON.stringify(window.App.coachMoveAnnotations || [])
        }));
        expect({ ...after, whiteTimeMs: before.whiteTimeMs, blackTimeMs: before.blackTimeMs }).toEqual(before);
        expect(after.whiteTimeMs).toBeLessThanOrEqual(before.whiteTimeMs);
        expect(after.whiteTimeMs).toBeGreaterThan(before.whiteTimeMs - 2_000);
        expect(after.blackTimeMs).toBeLessThanOrEqual(before.blackTimeMs);
        expect(after.blackTimeMs).toBeGreaterThan(before.blackTimeMs - 2_000);
    });
}

test('Download produces one non-empty active-game PGN before and after moves without leaving Coach', async ({ page }) => {
    await page.addInitScript(() => {
        window.__caissaDownloadDetails = [];
        window.addEventListener('caissa-play-download', event => {
            window.__caissaDownloadDetails.push(event.detail);
        });
    });
    await page.goto('/play/coach');
    await page.locator('[data-coach-primary]').click();
    const downloadButton = page.locator('[data-active-game-action="download"]');

    const firstDownloads = [];
    page.on('download', download => firstDownloads.push(download));
    const firstEvent = page.waitForEvent('download');
    await downloadButton.click();
    const first = await firstEvent;
    const firstPath = await first.path();
    const firstContent = await fs.readFile(firstPath, 'utf8');
    await expect.poll(() => firstDownloads.length).toBe(1);
    expect(first.suggestedFilename()).toMatch(/^caissa-play-coach-.+\.pgn$/);
    expect(firstContent.length).toBeGreaterThan(40);
    expect(firstContent).toContain('[Event "CAISSA Play Coach"]');
    expect(firstContent).toMatch(/\[Result "\*"\][\s\S]*\*\s*$/);
    expect(new URL(page.url()).pathname).toBe('/play/coach');

    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    const current = await page.evaluate(() => ({
        fen: window.App.game.fen(),
        pgn: window.App.game.pgn(),
        count: window.App.game.history().length
    }));
    const secondEvent = page.waitForEvent('download');
    await downloadButton.click();
    const second = await secondEvent;
    const secondPath = await second.path();
    const secondContent = await fs.readFile(secondPath, 'utf8');
    await expect.poll(() => firstDownloads.length).toBe(2);
    expect(second.suggestedFilename()).toMatch(/^caissa-play-coach-.+\.pgn$/);
    expect(secondContent.length).toBeGreaterThan(firstContent.length);
    expect(secondContent).toContain('1. e4');
    expect(new URL(page.url()).pathname).toBe('/play/coach');

    const details = await page.evaluate(() => window.__caissaDownloadDetails);
    expect(details).toHaveLength(2);
    expect(details[1]).toMatchObject({ fen: current.fen, moveCount: current.count });
    expect(details[1].pgn).toBe(secondContent);
    expect(details[1].pgn).toContain(current.pgn);
});
