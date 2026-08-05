import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { instrumentPlay, loadPosition, openPlay, playMove, snapshot } from '../play/playwright-helpers.js';
import { positions } from '../play/fixtures/positions.js';

const profiles = [
    { name: 'phone-320x568', width: 320, height: 568 },
    { name: 'phone-360x780', width: 360, height: 780 },
    { name: 'phone-390x844', width: 390, height: 844 },
    { name: 'iphone-393x852', width: 393, height: 852 },
    { name: 'phone-430x932', width: 430, height: 932 },
    { name: 'phone-landscape-844x390', width: 844, height: 390 },
    { name: 'tablet-768x1024', width: 768, height: 1024 },
    { name: 'tablet-landscape-1024x768', width: 1024, height: 768 },
    { name: 'desktop-1440x900', width: 1440, height: 900 },
    { name: 'desktop-1920x1080', width: 1920, height: 1080 },
    { name: 'desktop-2560x1440', width: 2560, height: 1440 },
    { name: 'desktop-3840x2160', width: 3840, height: 2160 },
    { name: 'toolbar-shortened', width: 390, height: 620 },
    { name: 'text-zoom-reduced-motion', width: 430, height: 740, zoom: true }
];
const evidenceDirectory = join(tmpdir(), 'caissa-play-v2-11.8.1c-evidence');

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

for (const profile of profiles) {
    test(`inline Analyze contains one board at ${profile.name}`, async ({ page, browserName }) => {
        await page.setViewportSize({ width: profile.width, height: profile.height });
        if (profile.zoom) {
            await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
            await page.addInitScript(() => {
                document.addEventListener('DOMContentLoaded', () => {
                    document.documentElement.style.fontSize = '200%';
                }, { once: true });
            });
        }
        await openPlay(page, 'play/beta');
        await loadPosition(page, positions.checkmateInOne.fen);
        await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
        const completed = await snapshot(page);
        const postGameBefore = await page.evaluate(() =>
            window.CaissaPostGameExperienceInstance?.getSnapshot?.());
        const workersBefore = completed.harness.workersCreated;
        await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
        await page.locator('[data-post-game-action="analyze"]').click();
        const dialog = page.getByRole('dialog', { name: 'Analyze completed game' });
        await expect(dialog).toBeVisible();
        await expect(page.locator('#analyzeChessboard .board-b72b1')).toBeVisible();

        const state = await page.evaluate(() => {
            const visible = element => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && rect.width > 0 && rect.height > 0;
            };
            const rect = selector => {
                const box = document.querySelector(selector).getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
                    width: box.width, height: box.height };
            };
            const viewport = window.visualViewport;
            return {
                visibleBoards: [...document.querySelectorAll('.board-b72b1')].filter(visible).length,
                playInert: document.getElementById('playSection').inert,
                playAriaHidden: document.getElementById('playSection').getAttribute('aria-hidden'),
                playVisible: visible(document.getElementById('playSection')),
                documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                dialog: rect('#analyzeSection'),
                close: rect('[data-play-v2-analyze-close]'),
                board: rect('#analyzeChessboard'),
                viewport: {
                    left: viewport?.offsetLeft || 0,
                    top: viewport?.offsetTop || 0,
                    width: viewport?.width || innerWidth,
                    height: viewport?.height || innerHeight
                },
                workers: window.__caissaPlayHarness.snapshot().workersCreated,
                controlsOutsideInlineBounds: [...document.querySelectorAll(
                    '#analyzeSection button, #analyzeSection input, #analyzeSection select, #analyzeSection textarea'
                )].filter(visible).map(element => element.getBoundingClientRect())
                    .filter(box => box.left < -1 || box.right > (viewport?.width || innerWidth) + 1).length
            };
        });
        expect(state.visibleBoards).toBe(1);
        expect(state).toMatchObject({ playInert: true, playAriaHidden: 'true', playVisible: false });
        expect(state.documentOverflow).toBeLessThanOrEqual(1);
        expect(state.controlsOutsideInlineBounds).toBe(0);
        expect(state.dialog.left).toBeGreaterThanOrEqual(state.viewport.left - 1);
        expect(state.dialog.right).toBeLessThanOrEqual(state.viewport.left + state.viewport.width + 1);
        expect(state.close.left).toBeGreaterThanOrEqual(state.viewport.left - 1);
        expect(state.close.right).toBeLessThanOrEqual(state.viewport.left + state.viewport.width + 1);
        expect(Math.abs(state.board.width - state.board.height), JSON.stringify(state)).toBeLessThanOrEqual(2);
        expect(state.workers).toBe(workersBefore);

        await mkdir(evidenceDirectory, { recursive: true });
        await page.screenshot({
            path: join(evidenceDirectory, `${browserName}-${profile.name}.png`),
            animations: 'disabled'
        });

        await page.getByRole('button', { name: 'Back to game result' }).click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
        await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
        const restored = await snapshot(page);
        const postGameAfter = await page.evaluate(() =>
            window.CaissaPostGameExperienceInstance?.getSnapshot?.());
        expect(restored.fen).toBe(completed.fen);
        expect(restored.history).toEqual(completed.history);
        expect(await page.locator('#playSection').getAttribute('aria-hidden')).toBeNull();
        expect(await page.locator('#playSection').evaluate(element => element.inert)).toBe(false);
        expect(restored.harness.workersCreated).toBe(workersBefore);
        expect(postGameAfter.record?.recordId).toBe(postGameBefore.record?.recordId);
        expect(postGameAfter.record?.result).toBe(postGameBefore.record?.result);
        expect(postGameAfter.record?.termination).toBe(postGameBefore.record?.termination);
        expect(postGameAfter.actions).toEqual(postGameBefore.actions);
    });
}

test('inline Analyze traps focus, closes with Escape, and restores PostGame', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlay(page, 'play/beta');
    await loadPosition(page, positions.checkmateInOne.fen);
    await playMove(page, positions.checkmateInOne.from, positions.checkmateInOne.to);
    await page.locator('[data-post-game-action="analyze"]').click();
    await expect(page.getByRole('button', { name: 'Back to game result' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#analyzeSection')).toContainText('Analyze Game');
    expect(await page.evaluate(() => document.getElementById('analyzeSection').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();
    await expect(page.locator('[data-post-game-action="analyze"]')).toBeFocused();
});
