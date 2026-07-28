import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay } from '../play/playwright-helpers.js';

const viewports = [
    [320, 568], [375, 667], [390, 844], [412, 915], [768, 1024],
    [1024, 768], [1366, 768], [1440, 900], [1920, 1080]
];

test('blocking: Play board and controls remain bounded across the required viewport matrix', async ({ page }) => {
    await instrumentPlay(page);
    for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        await openPlay(page);
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('#playSection #chessboard').getBoundingClientRect();
            const squares = [...document.querySelectorAll('#playSection #chessboard .square-55d63')]
                .map(element => element.getBoundingClientRect());
            const rail = document.querySelector('#evalBar').getBoundingClientRect();
            const controls = [...document.querySelectorAll('#playSection .ctrl-btn, .mobile-quick-btn')].filter(element => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            }).map(element => element.getBoundingClientRect());
            const overlap = !(rail.right <= board.left || rail.left >= board.right || rail.bottom <= board.top || rail.top >= board.bottom);
            return {
                board: { width: board.width, height: board.height, top: board.top, bottom: board.bottom },
                squares: squares.length,
                squareSize: squares[0] ? Math.min(squares[0].width, squares[0].height) : 0,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                railOverlap: overlap,
                controls: controls.length,
                reachableControl: controls.some(rect => rect.width > 0 && rect.height > 0)
            };
        });
        expect(geometry.board.width, `${width}x${height} board width`).toBeGreaterThan(180);
        expect(geometry.board.height, `${width}x${height} board height`).toBeGreaterThan(180);
        expect(geometry.squares, `${width}x${height} square count`).toBe(64);
        expect(geometry.squareSize, `${width}x${height} square size`).toBeGreaterThan(0);
        expect(geometry.overflow, `${width}x${height} horizontal overflow`).toBeLessThanOrEqual(1);
        expect(geometry.railOverlap, `${width}x${height} rail overlap`).toBe(false);
        expect(geometry.controls).toBeGreaterThan(0);
        expect(geometry.reachableControl).toBe(true);
    }
});

test('mobile primary controls meet the current minimum touch-target geometry', async ({ page }) => {
    await instrumentPlay(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlay(page);
    const boxes = await page.locator('.mobile-quick-btn:visible').evaluateAll(elements =>
        elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { name: element.getAttribute('aria-label'), width: rect.width, height: rect.height };
        })
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
        expect(box.width, `${box.name} width`).toBeGreaterThanOrEqual(40);
        expect(box.height, `${box.name} height`).toBeGreaterThanOrEqual(40);
    }
});
