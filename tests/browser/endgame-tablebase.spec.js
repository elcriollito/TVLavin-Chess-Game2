import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Chess } from 'chess.js';

function tablebasePayload(fen) {
    const game = new Chess(fen);
    const terminal = game.isGameOver();
    const fiftyFen = fen.includes(' w - - 100 ');
    const uncertainFen = fen.includes(' w - - 97 ');
    const category = game.isCheckmate() ? 'loss' : uncertainFen ? 'maybe-win' : fiftyFen ? 'cursed-win' : game.isDraw() ? 'draw' : 'win';
    return {
        fen,
        category,
        dtz: terminal ? 0 : 1,
        preciseDtz: terminal ? 0 : 1,
        dtm: game.isCheckmate() ? null : game.isDraw() ? 0 : 17,
        checkmate: game.isCheckmate(),
        stalemate: game.isStalemate(),
        insufficientMaterial: game.isInsufficientMaterial(),
        source: 'lichess-syzygy',
        moves: game.moves({ verbose: true }).map(move => ({
            uci: move.lan,
            san: move.san,
            category: category === 'maybe-win' ? 'maybe-loss' : category === 'cursed-win' ? 'blessed-loss' : category === 'draw' ? 'draw' : 'loss',
            dtz: move.isCapture() || move.piece === 'p' ? -1 : -2,
            preciseDtz: move.isCapture() || move.piece === 'p' ? -1 : -2,
            dtm: category === 'draw' ? 0 : -16,
            zeroing: move.isCapture() || move.piece === 'p'
        }))
    };
}

async function mockTablebase(target) {
    await target.route('**/api/tablebase/standard?**', async route => {
        const fen = new URL(route.request().url()).searchParams.get('fen');
        if (fen.includes(' w - - 66 ')) {
            await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Tablebase is temporarily busy. Try again shortly.' }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tablebasePayload(fen)) });
    });
}

async function dragSquare(page, from, to) {
    const source = await page.locator(`.caissa-board__square[data-square="${from}"]`).boundingBox();
    const target = await page.locator(`.caissa-board__square[data-square="${to}"]`).boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    await page.mouse.up();
}

test('desktop flow keeps board, result, training, history controls, setup, and clipboard coherent', async ({ page }) => {
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await mockTablebase(page);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/endgame-tablebase');
    await expect(page.locator('#result-label')).toHaveText('White wins');
    await expect(page.locator('.tb-workspace')).toBeVisible();

    const boardBefore = await page.locator('#tablebase-board').boundingBox();
    await dragSquare(page, 'a5', 'a6');
    await expect(page.locator('#undo-move')).toBeEnabled();
    await expect(page).toHaveURL(/fen=/);
    await page.locator('#undo-move').click();
    await expect(page.locator('#fen-input')).toHaveValue('6r1/3k4/8/KP6/8/8/2R5/8 w - - 0 1');
    const boardAfter = await page.locator('#tablebase-board').boundingBox();
    expect(Math.abs(boardAfter.width - boardBefore.width)).toBeLessThan(1);

    await page.locator('#flip-board').click();
    await expect(page.locator('.caissa-board')).toHaveAttribute('data-orientation', 'black');
    await page.locator('#copy-fen').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('#fen-input').inputValue());

    await page.locator('#tab-result').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-moves')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-train')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#train-solution')).toBeHidden();
    await page.locator('#reveal-answer').click();
    await expect(page.locator('#train-solution')).toBeVisible();
    await expect(page.locator('#train-solution .tb-move')).not.toHaveCount(0);

    await page.locator('#tab-setup').click();
    await page.locator('#setup-kings').click();
    await page.getByRole('button', { name: 'Place white queen' }).click();
    await page.locator('.caissa-board__square[data-square="d1"]').click();
    await page.locator('#setup-halfmove').fill('42');
    await page.locator('#setup-load').click();
    await expect(page.locator('#tab-result')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#fen-input')).toHaveValue('4k3/8/8/8/8/8/8/3QK3 w - - 42 1');
    await expect(page.locator('#undo-move')).toBeDisabled();

    const accessibility = await new AxeBuilder({ page }).include('.tb-main').analyze();
    expect(accessibility.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    expect(errors).toEqual([]);
});

test('promotion choice, en passant, linked FEN, and invalid setup are explicit', async ({ page }) => {
    await mockTablebase(page);
    const promotion = '4k3/6KP/8/8/8/8/7p/8 w - - 0 1';
    await page.goto(`/endgame-tablebase?fen=${encodeURIComponent(promotion)}`);
    await expect(page.locator('#result-label')).toHaveText('White wins');
    await page.locator('.caissa-board__square[data-square="h7"]').click();
    await page.locator('.caissa-board__square[data-square="h8"]').click();
    await expect(page.locator('#promotion-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Knight', exact: true }).click();
    await expect(page.locator('#fen-input')).toHaveValue(/^4k2N\//);

    const enPassant = '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1';
    await page.locator('#fen-input').fill(enPassant);
    await page.getByRole('button', { name: 'Load position' }).click();
    await page.locator('.caissa-board__square[data-square="e5"]').click();
    await page.locator('.caissa-board__square[data-square="d6"]').click();
    await expect(page.locator('#fen-input')).toHaveValue('7k/8/3P4/8/8/8/8/K7 b - - 0 1');

    await page.locator('#fen-input').fill('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
    await page.getByRole('button', { name: 'Load position' }).click();
    await expect(page.locator('#result-label')).toHaveText('White wins');
    await page.locator('#tab-moves').click();
    await expect(page.locator('#move-groups')).toContainText('Checkmate');

    await page.locator('#fen-input').fill('8/4K2k/5Q1P/6P1/8/8/q7/8 w - - 100 148');
    await page.getByRole('button', { name: 'Load position' }).click();
    await expect(page.locator('#result-label')).toHaveText('Draw with the 50-move rule');
    await expect(page.locator('#result-note')).toContainText('without the 50-move rule');

    await page.locator('#fen-input').fill('6r1/3k4/8/KP6/8/8/2R5/8 w - - 97 1');
    await page.getByRole('button', { name: 'Load position' }).click();
    await expect(page.locator('#result-label')).toHaveText('Outcome uncertain');
    await page.locator('#tab-train').click();
    await expect(page.locator('#reveal-answer')).toBeDisabled();
    await expect(page.locator('#train-feedback')).toContainText('No exact training grade');

    await page.locator('#fen-input').fill('6r1/3k4/8/KP6/8/8/2R5/8 w - - 66 1');
    await page.getByRole('button', { name: 'Load position' }).click();
    await expect(page.locator('#result-label')).toHaveText('Result unavailable');
    await expect(page.locator('#result-note')).toContainText('temporarily busy');

    await page.locator('#tab-setup').click();
    await page.locator('#setup-clear').click();
    await page.locator('#setup-load').click();
    await expect(page.locator('#setup-error')).toContainText('valid chess FEN');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
});

test('mobile touch layout has no horizontal overflow and preserves tap-to-move without jitter', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mockTablebase(context);
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/endgame-tablebase');
    await expect(page.locator('#result-label')).toHaveText('White wins');
    const boardBefore = await page.locator('#tablebase-board').boundingBox();
    await page.locator('.caissa-board__square[data-square="a5"]').tap();
    await page.locator('.caissa-board__square[data-square="a6"]').tap();
    await expect(page.locator('#undo-move')).toBeEnabled();
    const boardAfter = await page.locator('#tablebase-board').boundingBox();
    expect(Math.abs(boardAfter.width - boardBefore.width)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#tab-setup').tap();
    await expect(page.locator('#panel-setup')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('.tb-panel-body').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.body.getBoundingClientRect().height > window.innerHeight)).toBe(true);
    await page.locator('#setup-kings').tap();
    await page.locator('#setup-load').tap();
    await expect(page.locator('#tab-result')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
    await context.close();
});
