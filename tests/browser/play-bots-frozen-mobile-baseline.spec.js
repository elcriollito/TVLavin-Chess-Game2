import { test, expect } from '@playwright/test';
import { PLAY_BOTS_FROZEN_MOBILE_BASELINE as baseline } from './fixtures/play-bots-frozen-mobile-baseline.js';

const BOX_TOLERANCE_PX = 1;
const viewports = Object.freeze([
    Object.freeze({ width: 390, height: 844 }),
    Object.freeze({ width: 430, height: 932 }),
    Object.freeze({ width: 844, height: 390 }),
    Object.freeze({ width: 932, height: 430 })
]);

function expectBox(actual, expected, label) {
    for (const [index, property] of ['x', 'y', 'width', 'height'].entries()) {
        expect(Math.abs(actual[property] - expected[index]), `${label}.${property}`).toBeLessThanOrEqual(BOX_TOLERANCE_PX);
    }
}

async function waitForFrozenGeometry(page, expected) {
    await expect.poll(async () => page.locator('#chessboard').evaluate(node => {
        const rect = node.getBoundingClientRect(); return Math.round(rect.width);
    })).toBe(Math.round(expected.board[2]));
    await page.evaluate(() => document.fonts?.ready);
    await page.locator('img:visible').evaluateAll(images => Promise.all(images.map(image => image.complete
        ? true : new Promise(resolve => image.addEventListener('load', resolve, { once: true })) )));
}

async function readFrozenLayout(page, surface) {
    return page.evaluate(product => {
        const query = selector => document.querySelector(selector);
        const box = selector => {
            const rect = query(selector)?.getBoundingClientRect();
            return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                right: rect.right, bottom: rect.bottom } : null;
        };
        const isPlay = product === 'play';
        const panelSelector = isPlay ? '[data-caissa-games-panel]' : '[data-caissa-bots-panel]';
        const bodySelector = isPlay ? '[data-caissa-games-body]' : '[data-caissa-bots-body]';
        const footSelector = isPlay ? '[data-caissa-games-foot]' : '[data-caissa-bots-foot]';
        const playAsSelector = isPlay ? '.caissa-games-panel__color' : '.caissa-bots-panel__color';
        const primarySelector = isPlay ? '[data-games-primary]' : '[data-bot-primary]';
        const colorSelector = isPlay ? '[data-games-color]' : '[data-bot-color]';
        const visible = selector => [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length).length;
        const panel = query(panelSelector); const body = query(bodySelector); const foot = query(footSelector);
        const primary = query(primarySelector); const board = query('#chessboard');
        return {
            mode: query('[data-caissa-simplified-shell]')?.dataset.mode || null,
            layout: query('[data-caissa-simplified-shell]')?.dataset.layout || null,
            boxes: { board: box('#chessboard'), tabs: box('.caissa-simplified-shell__modes'),
                panel: box(panelSelector), playAs: box(playAsSelector), primary: box(primarySelector) },
            ownership: {
                boardCount: document.querySelectorAll('#chessboard').length,
                boardStage: board?.parentElement?.closest('.caissa-simplified-shell__board-stage')?.className || null,
                bodyClass: body?.className || null,
                bodyParentIsPanel: body?.parentElement === panel,
                footClass: foot?.className || null,
                footParentIsPanel: foot?.parentElement === panel,
                primaryParentClass: primary?.parentElement?.className || null,
                primaryOwnedByFoot: !!foot?.contains(primary),
                menuCount: document.querySelectorAll('[data-caissa-floating-controls]').length,
                visibleMenuCount: visible('[data-caissa-floating-controls]'),
                coachNodeCount: document.querySelectorAll('[data-caissa-coach-shell], [data-caissa-native-coach-panel]').length,
                mobileReviewNavigationCount: document.querySelectorAll('[data-mobile-review-navigation]').length,
                visibleNavigationCount: visible('[data-mobile-review-navigation], .analyze-board-navigation')
            },
            order: [...panel.children].map(node => node === body ? 'body' : node === foot ? 'foot'
                : node.matches(isPlay ? '[data-caissa-games-head]' : '[data-caissa-bots-head]') ? 'head' : 'other'),
            colorTargets: [...document.querySelectorAll(colorSelector)].map(input => {
                const rect = input.nextElementSibling?.getBoundingClientRect();
                return { value: input.value, width: rect?.width || 0, height: rect?.height || 0 };
            })
        };
    }, surface);
}

for (const [surface, contract] of Object.entries({ play: baseline.play, bots: baseline.bots })) {
    for (const viewport of viewports) {
        const key = `${viewport.width}x${viewport.height}`;
        test(`COACH-GUARD-001 freezes ${surface} setup at ${key}`, async ({ page, browserName }, testInfo) => {
            test.skip(browserName === 'firefox', 'COACH-GUARD-001 is certified against Chromium and iPhone-equivalent WebKit.');
            const expected = browserName === 'webkit' ? contract.webkitBoxes[key] : contract.boxes[key];
            await page.setViewportSize(viewport);
            await page.goto(contract.route, { waitUntil: 'networkidle' });
            await expect(page.locator(contract.panel)).toBeVisible();
            await waitForFrozenGeometry(page, expected);
            const actual = await readFrozenLayout(page, surface);

            expect(actual.mode).toBe(contract.mode);
            expect(actual.layout).toBe(expected.layout);
            for (const region of ['board', 'tabs', 'panel', 'playAs', 'primary'])
                expectBox(actual.boxes[region], expected[region], `${surface}.${key}.${region}`);

            expect(actual.ownership).toMatchObject({
                boardCount: 1,
                boardStage: 'caissa-simplified-shell__board-stage',
                bodyParentIsPanel: true,
                footParentIsPanel: true,
                primaryOwnedByFoot: true,
                menuCount: 1,
                visibleMenuCount: 0,
                coachNodeCount: 0,
                mobileReviewNavigationCount: 0,
                visibleNavigationCount: 0
            });
            expect(actual.order).toEqual(['head', 'body', 'foot']);
            expect(actual.colorTargets.map(item => item.value)).toEqual(['white', 'random', 'black']);
            expect(actual.colorTargets.every(item => item.height >= 44 && item.width >= 44)).toBe(true);

            if (expected.layout === 'phone-standard') {
                expect(actual.boxes.tabs.y).toBeGreaterThan(actual.boxes.board.bottom);
                expect(actual.boxes.panel.y).toBeGreaterThan(actual.boxes.tabs.bottom);
            } else {
                expect(actual.boxes.tabs.x).toBeGreaterThan(actual.boxes.board.right);
                expect(actual.boxes.panel.y).toBeGreaterThanOrEqual(actual.boxes.tabs.bottom);
            }

            await testInfo.attach(`${surface}-${key}-${browserName}`, {
                body: await page.screenshot({ fullPage: true }), contentType: 'image/png'
            });
        });
    }
}
