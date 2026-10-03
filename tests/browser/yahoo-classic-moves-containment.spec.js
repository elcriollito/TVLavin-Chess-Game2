import { test, expect } from '@playwright/test';

const rect = locator => locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [bounds.x, bounds.y, bounds.width, bounds.height].map(value => Number(value.toFixed(3)));
});

async function openLongEngineGame(page) {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/yahoo-classic', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.CaissaYahooClassic?.elements?.shell);
    await page.evaluate(() => {
        const classic = window.CaissaYahooClassic;
        classic.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
        classic.render();
        classic.openTable('engine-long-game', {
            white: 'GuestAudit', black: 'IFDStock', whiteRating: 'Guest', blackRating: '2985',
            timeControl: '15+10', label: 'Unrated'
        }, 'playing');
    });
}

async function renderMoves(page, plies) {
    await page.evaluate((count) => {
        const classic = window.CaissaYahooClassic;
        classic.moveHistory = Array.from({ length: count }, (_, index) => ({
            moveNumber: Math.floor(index / 2) + 1,
            color: index % 2 ? 'black' : 'white',
            san: index % 7 === 0 ? 'Nxe5+' : index % 5 === 0 ? 'O-O' : 'Nf3'
        }));
        classic.renderGameExperience();
    }, plies);
    await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
    });
}

test.beforeEach(async ({ page }) => {
    await openLongEngineGame(page);
});

test('many moves stay inside the scrollable moves body', async ({ page }) => {
    const board = page.locator('#ycClassicBoard');
    const panel = page.locator('.yc-move-panel');
    const moves = page.locator('#ycMoveList');
    const initial = {
        board: await rect(board),
        panel: await rect(panel),
        moves: await rect(moves),
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };

    await renderMoves(page, 160);
    const final = {
        board: await rect(board),
        panel: await rect(panel),
        moves: await rect(moves),
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        scroll: await moves.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollTop: element.scrollTop,
            overflowY: getComputedStyle(element).overflowY
        })),
        panelStyle: await panel.evaluate(element => ({
            contain: getComputedStyle(element).contain,
            minHeight: getComputedStyle(element).minHeight,
            overflow: getComputedStyle(element).overflow
        }))
    };

    expect(final.board).toEqual(initial.board);
    expect(final.panel).toEqual(initial.panel);
    expect(final.moves).toEqual(initial.moves);
    expect(final.scroll.overflowY).toBe('auto');
    expect(final.scroll.scrollHeight).toBeGreaterThan(final.scroll.clientHeight);
    expect(final.scroll.scrollTop).toBe(final.scroll.scrollHeight - final.scroll.clientHeight);
    expect(final.panelStyle).toEqual({ contain: 'size', minHeight: '0px', overflow: 'hidden' });
    expect(final.horizontalOverflow).toBe(initial.horizontalOverflow);
});

test('right panel footer remains anchored when terminal status appears', async ({ page }) => {
    await renderMoves(page, 120);
    const board = page.locator('#ycClassicBoard');
    const footer = page.locator('.yc-move-panel-footer');
    const systemPanel = page.locator('.yc-game-system-panel');
    const before = {
        board: await rect(board),
        footer: await rect(footer),
        systemPanel: await rect(systemPanel)
    };

    await page.evaluate(() => {
        const classic = window.CaissaYahooClassic;
        classic.liveGame = {
            ...(classic.liveGame || {}),
            result: '1-0',
            resultModel: { terminal: true, summary: 'White wins' }
        };
        classic.renderGameExperience();
    });
    await expect(page.locator('.yc-game-over-status')).toBeVisible();
    const after = {
        board: await rect(board),
        footer: await rect(footer),
        systemPanel: await rect(systemPanel)
    };

    expect(after.board).toEqual(before.board);
    expect(after.footer).toEqual(before.footer);
    expect(after.systemPanel).toEqual(before.systemPanel);
});

test('board y-position stays fixed while move history grows', async ({ page }) => {
    const board = page.locator('#ycClassicBoard');
    const systemPanel = page.locator('.yc-game-system-panel');
    const samples = [];

    for (const plies of [0, 20, 40, 80, 120, 160, 200]) {
        await renderMoves(page, plies);
        samples.push({
            plies,
            board: await rect(board),
            systemPanel: await rect(systemPanel),
            rows: await page.locator('#ycMoveList .yc-move-row').count()
        });
    }

    expect(samples.at(-1).rows).toBe(100);
    expect(samples.every(sample => JSON.stringify(sample.board) === JSON.stringify(samples[0].board))).toBe(true);
    expect(samples.every(sample => JSON.stringify(sample.systemPanel) === JSON.stringify(samples[0].systemPanel))).toBe(true);
});
