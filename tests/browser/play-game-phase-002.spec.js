import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const ARTIFACT_DIR = 'artifacts/play-game-v1-phase-002';

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function openActiveGame(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.evaluate(() => { window.__phase002Head = document.querySelector('[data-caissa-games-head]'); });
    await page.locator('[data-games-primary]').click();
    await expect(page.locator('.caissa-games-panel[data-games-phase="active-game"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Play Chess' })).toBeVisible();
}

async function setLongNotation(page) {
    await page.evaluate(() => {
        const history = Array.from({ length: 96 }, (_, index) => index % 2 === 0 ? `Nf${index + 1}` : `e${index + 1}`);
        window.App.currentOpening = { name: 'Scandinavian Defense', eco: 'B01' };
        window.App.game.history = () => history;
        window.dispatchEvent(new CustomEvent('caissa-turn-change'));
    });
}

async function geometry(page) {
    return page.evaluate(() => {
        const round = value => Math.round(value * 100) / 100;
        const rect = selector => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return Object.fromEntries(['top', 'right', 'bottom', 'left', 'width', 'height']
                .map(key => [key, round(box[key])]));
        };
        const body = document.querySelector('[data-caissa-games-body]');
        const head = document.querySelector('[data-caissa-games-head]');
        const foot = document.querySelector('[data-caissa-games-foot]');
        return {
            viewport: [innerWidth, innerHeight],
            layout: document.querySelector('.caissa-simplified-shell').dataset.layout,
            board: rect('.caissa-simplified-shell__board-stage'),
            context: rect('.caissa-simplified-shell__context'),
            panel: rect('.caissa-games-panel'), head: rect('[data-caissa-games-head]'),
            body: { ...rect('[data-caissa-games-body]'), clientHeight: body.clientHeight,
                scrollHeight: body.scrollHeight, scrollTop: body.scrollTop,
                overflowY: getComputedStyle(body).overflowY },
            foot: rect('[data-caissa-games-foot]'),
            headPersistent: head === window.__phase002Head,
            footAnchored: Math.abs(foot.getBoundingClientRect().bottom
                - document.querySelector('.caissa-games-panel').getBoundingClientRect().bottom) <= 1,
            bodyOwnsNotation: !!body.querySelector('[data-active-game-notation]'),
            bodyOwnsActions: !!body.querySelector('[data-active-game-action]'),
            footActions: [...foot.querySelectorAll('[data-active-game-action]:not([hidden])')]
                .map(node => node.dataset.activeGameAction),
            nestedMoveOverflow: getComputedStyle(document.querySelector('[data-active-game-moves]')).overflowY,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

test('setup transitions into one persistent Game HEAD with BODY notation and FOOT actions', async ({ page }) => {
    await openActiveGame(page, { width: 1600, height: 1000 });
    await expect(page.locator('[data-caissa-games-head] [data-games-phase-label]')).toHaveText('Game in progress');
    await expect(page.locator('[data-caissa-games-head]')).toContainText("Use the board to play your moves. I'm with you.");
    await expect(page.locator('[data-caissa-games-head] img')).toHaveAttribute('src', '/assets/play/caissa-coach-goddess.png');
    await expect(page.locator('[data-caissa-games-body] > [data-active-game-context]')).toBeVisible();
    await expect(page.locator('[data-caissa-games-body] > [data-active-game-context] > h3')).toBeHidden();
    await expect(page.locator('[data-caissa-games-body] > [data-active-game-context] > [data-active-game-status]')).toBeHidden();
    await expect(page.locator('[data-caissa-games-foot] [data-active-game-action]:visible')).toHaveCount(6);
    await expect(page.locator('[data-caissa-games-body] [data-active-game-action]')).toHaveCount(0);
    const state = await geometry(page);
    expect(state.headPersistent).toBe(true);
    expect(state.bodyOwnsNotation).toBe(true);
    expect(state.bodyOwnsActions).toBe(false);
    expect(state.footActions).toEqual(['resign', 'pgn', 'menu', 'share', 'download', 'settings']);
    expect(state.footAnchored).toBe(true);
});

test('existing active-game action callbacks remain functional in the Game FOOT', async ({ page }) => {
    await openActiveGame(page, { width: 1366, height: 768 });
    await page.locator('[data-active-game-action="pgn"]').click();
    await expect(page.locator('.caissa-simplified-shell__pgn-dialog')).toHaveAttribute('open', '');
    await page.locator('[data-active-game-action="close-pgn"]').click();
    await page.locator('[data-active-game-action="menu"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menuModal')).toBeVisible();
    await page.locator('#menuModal [data-modal="menuModal"]').click();
    await expect(page.locator('#menuModal')).toBeHidden();
    await page.locator('[data-active-game-action="share"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Share game' })).toBeVisible();
    await page.keyboard.press('Escape');
    const download = page.waitForEvent('download');
    await page.locator('[data-active-game-action="download"]').focus();
    await page.keyboard.press('Enter');
    await download;
    await page.locator('[data-active-game-action="settings"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-active-game-settings]')).toBeVisible();
    await page.locator('[data-active-game-action="close-settings"]').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-active-game-action="resign"]').click();
    await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
});

test('certifies stable active geometry and BODY-only scrolling at required sizes and zoom equivalents', async ({ page }) => {
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const results = {};
    for (const [width, height, label] of [
        [1600, 1000, 'active-1600x1000'], [1366, 768, 'active-1366x768'],
        [1778, 1111, 'active-zoom-90'], [1455, 909, 'active-zoom-110'],
        [1280, 800, 'active-zoom-125'], [390, 844, 'active-mobile-390x844']
    ]) {
        await openActiveGame(page, { width, height });
        const short = await geometry(page);
        await page.screenshot({ path: `${ARTIFACT_DIR}/${label}-short.png`, fullPage: false });
        await setLongNotation(page);
        const body = page.locator('[data-caissa-games-body]');
        await body.evaluate(node => { node.scrollTop = node.scrollHeight; });
        const long = await geometry(page);
        if (width === 390) await page.locator('.caissa-simplified-shell__context').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${ARTIFACT_DIR}/${label}-long.png`, fullPage: false });
        results[label] = { short, long };
        expect(long.horizontalOverflow, label).toBeLessThanOrEqual(1);
        expect(long.head, label).toEqual(short.head);
        expect(long.foot, label).toEqual(short.foot);
        expect(long.board, label).toEqual(short.board);
        expect(long.context, label).toEqual(short.context);
        expect(long.body.scrollHeight, label).toBeGreaterThan(long.body.clientHeight);
        expect(long.body.scrollTop, label).toBeGreaterThan(0);
        expect(long.body.overflowY, label).toBe('auto');
        expect(long.nestedMoveOverflow, label).toBe('visible');
        expect(long.footAnchored && long.bodyOwnsNotation && !long.bodyOwnsActions, label).toBe(true);
    }
    console.log(`PHASE_002_GEOMETRY=${JSON.stringify(results)}`);
});
