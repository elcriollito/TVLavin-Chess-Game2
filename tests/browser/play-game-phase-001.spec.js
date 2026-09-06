import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const ARTIFACT_DIR = 'artifacts/play-game-v1-phase-001';

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function capture(page, width, height, label) {
    await page.setViewportSize({ width, height });
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: `${ARTIFACT_DIR}/${label}.png`, fullPage: false });
    const result = await page.evaluate(() => {
        const box = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const value = node.getBoundingClientRect();
            return Object.fromEntries(['top', 'right', 'bottom', 'left', 'width', 'height']
                .map(key => [key, Math.round(value[key] * 100) / 100]));
        };
        const body = document.querySelector('[data-caissa-games-body]');
        const panel = document.querySelector('.caissa-games-panel');
        const context = document.querySelector('.caissa-simplified-shell__context');
        const modes = document.querySelector('.caissa-simplified-shell__modes');
        const head = document.querySelector('[data-caissa-games-head]');
        const board = document.querySelector('.caissa-simplified-shell__board-stage');
        return {
            viewport: { width: innerWidth, height: innerHeight },
            layout: document.querySelector('.caissa-simplified-shell').dataset.layout,
            board: box('.caissa-simplified-shell__board-stage'),
            context: box('.caissa-simplified-shell__context'),
            panel: box('.caissa-games-panel'),
            modes: box('.caissa-simplified-shell__modes'),
            head: box('[data-caissa-games-head]'),
            body: { ...box('[data-caissa-games-body]'), clientHeight: body.clientHeight,
                scrollHeight: body.scrollHeight, overflowY: getComputedStyle(body).overflowY },
            foot: box('[data-caissa-games-foot]'),
            tabToHeadGap: Math.round((head.getBoundingClientRect().top - modes.getBoundingClientRect().bottom) * 100) / 100,
            boardContextTopDelta: Math.round((context.getBoundingClientRect().top - board.getBoundingClientRect().top) * 100) / 100,
            boardContextBottomDelta: Math.round((context.getBoundingClientRect().bottom - board.getBoundingClientRect().bottom) * 100) / 100,
            boardPanelBottomDelta: Math.round((panel.getBoundingClientRect().bottom - board.getBoundingClientRect().bottom) * 100) / 100,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            panelOverflow: getComputedStyle(panel).overflowY,
            contextOverflow: getComputedStyle(context).overflowY,
            shell: window.CaissaSimplifiedPlayShellInstance.getSnapshot().geometry,
            workspaceRows: getComputedStyle(document.querySelector('.caissa-simplified-shell__workspace')).gridTemplateRows
        };
    });
    if (width === 390) {
        await page.locator('.caissa-simplified-shell__context').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${ARTIFACT_DIR}/${label}-panel.png`, fullPage: false });
    }
    return result;
}

test('certifies Phase 001 target viewports and records geometry', async ({ page }) => {
    const results = {};
    for (const [width, height, label] of [
        [1600, 1000, 'play-game-1600x1000'],
        [1366, 768, 'play-game-1366x768'],
        [390, 844, 'play-game-390x844']
    ]) results[label] = await capture(page, width, height, label);
    console.log(`PHASE_001_GEOMETRY=${JSON.stringify(results)}`);
    expect(results['play-game-1600x1000'].horizontalOverflow).toBeLessThanOrEqual(1);
    expect(results['play-game-1366x768'].horizontalOverflow).toBeLessThanOrEqual(1);
    expect(results['play-game-390x844'].horizontalOverflow).toBeLessThanOrEqual(1);
    for (const key of ['play-game-1600x1000', 'play-game-1366x768']) {
        expect(Math.abs(results[key].boardContextBottomDelta)).toBeLessThanOrEqual(3);
        expect(results[key].body.overflowY).toBe('auto');
        expect(results[key].panelOverflow).toBe('hidden');
        expect(results[key].contextOverflow).toBe('hidden');
    }
});

test('characterizes responsive equivalents for 90, 110, and 125 percent zoom', async ({ page }) => {
    const results = {};
    for (const [zoom, width, height] of [[90, 1778, 1111], [110, 1455, 909], [125, 1280, 800]])
        results[zoom] = await capture(page, width, height, `play-game-zoom-${zoom}`);
    console.log(`PHASE_001_ZOOM=${JSON.stringify(results)}`);
    for (const result of Object.values(results)) {
        expect(result.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(result.foot).not.toBeNull();
        expect(result.head).not.toBeNull();
    }
});

async function productGeometry(page, origin, mode, width, height) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/play/${mode}`);
    const panelSelector = mode === 'bots' ? '[data-caissa-bots-shell]' : '[data-caissa-coach-shell]';
    await expect(page.locator(panelSelector)).toBeVisible();
    return page.evaluate(({ mode, panelSelector }) => {
        const round = value => Math.round(value * 100) / 100;
        const rect = selector => {
            const value = document.querySelector(selector).getBoundingClientRect();
            return [value.top, value.bottom, value.width, value.height].map(round);
        };
        const prefix = mode === 'bots' ? 'bots' : 'coach';
        return {
            layout: document.querySelector('.caissa-simplified-shell').dataset.layout,
            board: rect('.caissa-simplified-shell__board-stage'), context: rect('.caissa-simplified-shell__context'),
            panel: rect(panelSelector), head: rect(`[data-caissa-${prefix}-head]`),
            body: rect(`[data-caissa-${prefix}-body]`), foot: rect(`[data-caissa-${prefix}-foot]`),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    }, { mode, panelSelector });
}

test('Play Bots and Play Coach geometry is identical to certified production', async ({ page }) => {
    const comparisons = {};
    for (const mode of ['bots', 'coach']) {
        comparisons[mode] = {};
        for (const [width, height] of [[1600, 1000], [1366, 768]]) {
            const key = `${width}x${height}`;
            const baseline = await productGeometry(page, 'http://127.0.0.3:8000', mode, width, height);
            const feature = await productGeometry(page, 'http://127.0.0.2:8000', mode, width, height);
            comparisons[mode][key] = { baseline, feature };
            expect(feature).toEqual(baseline);
        }
    }
    console.log(`PHASE_001_ISOLATION=${JSON.stringify(comparisons)}`);
});
