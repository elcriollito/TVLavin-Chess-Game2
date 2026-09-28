import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Chess } from 'chess.js';

function inverseCategory(category) {
    return {
        win: 'loss', loss: 'win', draw: 'draw',
        'cursed-win': 'blessed-loss', 'blessed-loss': 'cursed-win',
        'maybe-win': 'maybe-loss', 'maybe-loss': 'maybe-win',
        'syzygy-win': 'syzygy-loss', 'syzygy-loss': 'syzygy-win'
    }[category] || 'unknown';
}

function tablebasePayload(fen, categoryOverride = null) {
    const game = new Chess(fen);
    const terminal = game.isGameOver();
    const fiftyFen = fen.includes(' w - - 100 ');
    const uncertainFen = fen.includes(' w - - 97 ');
    const category = categoryOverride || (game.isCheckmate() ? 'loss' : uncertainFen ? 'maybe-win'
        : fiftyFen ? 'cursed-win' : game.isDraw() ? 'draw' : game.turn() === 'w' ? 'win' : 'loss');
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
            category: inverseCategory(category),
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

async function beginLatencyProbe(page, { pieceSquare, resultText }) {
    await page.evaluate(({ pieceSquare: square, resultText: expected }) => {
        const probe = { started: null, piece: null, result: null, moves: null };
        window.__tablebaseLatencyProbe = probe;
        const check = () => {
            const elapsed = performance.now() - probe.started;
            if (probe.piece === null && document.querySelector(`.caissa-board__piece[data-square="${square}"]`)) {
                probe.piece = elapsed;
            }
            const labelMatches = document.querySelector('#result-label')?.textContent === expected;
            if (probe.result === null && labelMatches) probe.result = elapsed;
            const note = document.querySelector('#result-note')?.textContent || '';
            const moves = document.querySelector('#move-groups')?.textContent || '';
            if (probe.moves === null && labelMatches && !/Loading|Waiting/i.test(note) && !/Loading/i.test(moves)) {
                probe.moves = elapsed;
            }
            if (probe.piece === null || probe.result === null || probe.moves === null) requestAnimationFrame(check);
        };
        document.addEventListener('pointerup', () => {
            probe.started = performance.now();
            requestAnimationFrame(check);
        }, { capture: true, once: true });
    }, { pieceSquare, resultText });
}

async function latencyProbe(page) {
    await expect.poll(() => page.evaluate(() => window.__tablebaseLatencyProbe?.moves)).not.toBeNull();
    return page.evaluate(() => ({ ...window.__tablebaseLatencyProbe }));
}

test('click, drag, undo, and rapid navigation separate board, result, and move-list latency', async ({ page }, testInfo) => {
    const requests = [];
    await page.route('**/api/tablebase/standard?**', async route => {
        const fen = new URL(route.request().url()).searchParams.get('fen');
        requests.push(fen);
        if (requests.length === 1) {
            const payload = tablebasePayload(fen);
            payload.moves.find(move => move.uci === 'a5a6').category = 'draw';
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 450));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tablebasePayload(fen, 'draw')) });
    });
    await page.goto('/endgame-tablebase');
    await expect(page.locator('#result-label')).toHaveText('White wins');

    await page.locator('.caissa-board__square[data-square="a5"]').click();
    await expect(page.locator('[data-uci="a5a6"]')).toHaveClass(/tb-draw/);
    await beginLatencyProbe(page, { pieceSquare: 'a6', resultText: 'Theoretical draw' });
    await page.locator('.caissa-board__square[data-square="a6"]').click();
    await expect(page.locator('#result-label')).toHaveText('Theoretical draw');
    const click = await latencyProbe(page);
    expect(click.piece).toBeLessThan(100);
    expect(click.result).toBeLessThan(100);
    expect(click.moves).toBeGreaterThanOrEqual(400);
    expect(click.moves).toBeLessThan(1000);
    expect(requests).toHaveLength(2);

    await beginLatencyProbe(page, { pieceSquare: 'a5', resultText: 'White wins' });
    await page.locator('#undo-move').click();
    const undo = await latencyProbe(page);
    expect(Math.max(undo.piece, undo.result, undo.moves)).toBeLessThan(100);
    await expect(page.locator('#result-label')).toHaveText('White wins');
    await expect(page.locator('#result-note')).not.toContainText('Contacting the tablebase');

    await beginLatencyProbe(page, { pieceSquare: 'a6', resultText: 'Theoretical draw' });
    await page.locator('#line-next').click();
    const forward = await latencyProbe(page);
    expect(Math.max(forward.piece, forward.result, forward.moves)).toBeLessThan(100);
    await expect(page.locator('#result-note')).not.toContainText('Contacting the tablebase');

    for (let index = 0; index < 4; index += 1) {
        await page.locator('#line-first').click();
        await page.locator('#line-next').click();
    }
    await expect(page.locator('#fen-input')).toHaveValue(/^6r1\/3k4\/K7\/1P6/);
    await expect(page.locator('#result-label')).toHaveText('Theoretical draw');
    expect(requests).toHaveLength(2);

    await page.locator('#line-first').click();
    await beginLatencyProbe(page, { pieceSquare: 'a6', resultText: 'Theoretical draw' });
    await dragSquare(page, 'a5', 'a6');
    const drag = await latencyProbe(page);
    expect(Math.max(drag.piece, drag.result, drag.moves)).toBeLessThan(100);
    await expect(page.locator('.caissa-board')).toHaveAttribute('data-animate', 'false');

    console.info('[tablebase-latency-ms]', JSON.stringify({ click, undo, forward, drag }));

    await testInfo.attach('tablebase-latency.json', {
        body: JSON.stringify({ click, undo, forward, drag }, null, 2),
        contentType: 'application/json'
    });
});

test('shared one-second pacing keeps the known result and retries only the CAISSA gateway', async ({ page }) => {
    const requests = [];
    await page.route('**/api/tablebase/standard?**', async route => {
        const fen = new URL(route.request().url()).searchParams.get('fen');
        requests.push(fen);
        if (requests.length === 1) {
            const payload = tablebasePayload(fen);
            payload.moves.find(move => move.uci === 'a5a6').category = 'draw';
            payload.moves.find(move => move.uci === 'b5b6').category = 'win';
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
            return;
        }
        if (requests.length === 2 || requests.length === 4) {
            await route.fulfill({ status: 503, headers: { 'Retry-After': '1' }, contentType: 'application/json',
                body: JSON.stringify({ code: 'TABLEBASE_PROVIDER_BUSY', error: 'Tablebase is temporarily busy. Try again shortly.' }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tablebasePayload(fen, 'draw')) });
    });
    await page.goto('/endgame-tablebase');
    await expect(page.locator('#result-label')).toHaveText('White wins');

    await expect(page.locator('[data-uci="a5a6"]')).toHaveClass(/tb-draw/);
    await page.locator('.caissa-board__square[data-square="a5"]').click();
    const started = Date.now();
    await page.locator('.caissa-board__square[data-square="a6"]').click();
    await expect(page.locator('#result-label')).toHaveText('Theoretical draw');
    const knownResultMs = Date.now() - started;
    await expect(page.locator('#result-note')).toContainText('Waiting briefly');
    await expect(page.locator('#result-note')).not.toContainText('Waiting briefly');
    const legalMovesMs = Date.now() - started;
    expect(legalMovesMs).toBeGreaterThanOrEqual(900);
    expect(requests).toHaveLength(3);
    expect(requests[2]).toBe(requests[1]);
    console.info('[tablebase-shared-pacing-ms]', JSON.stringify({ knownResultMs, legalMovesMs }));

    await page.locator('#undo-move').click();
    await page.locator('.caissa-board__square[data-square="b5"]').click();
    await page.locator('.caissa-board__square[data-square="b6"]').click();
    await expect(page.locator('#result-label')).toHaveText('Black wins');
    await expect(page.locator('#result-note')).toContainText('Waiting briefly');
    await page.locator('#undo-move').click();
    await page.waitForTimeout(1100);
    await expect(page.locator('#fen-input')).toHaveValue('6r1/3k4/8/KP6/8/8/2R5/8 w - - 0 1');
    await expect(page.locator('#result-label')).toHaveText('White wins');
    expect(requests).toHaveLength(4);
});

test('desktop flow keeps board, result, history controls, setup, and clipboard coherent', async ({ page }) => {
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
    await expect(page.locator('#line-prev')).toBeEnabled();
    await page.locator('#undo-move').click();
    await expect(page.locator('#fen-input')).toHaveValue('6r1/3k4/8/KP6/8/8/2R5/8 w - - 0 1');
    await expect(page.locator('#line-next')).toBeEnabled();
    await page.locator('#line-next').click();
    await expect(page.locator('#fen-input')).toHaveValue(/^6r1\/3k4\/K7\/1P6/);
    await page.locator('#line-first').click();
    await expect(page.locator('#fen-input')).toHaveValue('6r1/3k4/8/KP6/8/8/2R5/8 w - - 0 1');
    const boardAfter = await page.locator('#tablebase-board').boundingBox();
    expect(Math.abs(boardAfter.width - boardBefore.width)).toBeLessThan(1);

    await page.locator('#flip-board').click();
    await expect(page.locator('.caissa-board')).toHaveAttribute('data-orientation', 'black');
    await page.locator('#copy-fen').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await page.locator('#fen-input').inputValue());

    await page.locator('#tab-moves').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-game')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#game-line')).toContainText('Ka6');
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-moves')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-game')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.tb-practice, #reveal-answer, #train-solution')).toHaveCount(0);

    await page.locator('#tab-setup').click();
    await expect(page.locator('#setup-load')).toBeVisible();
    await expect(page.locator('#reset-position')).toBeHidden();
    expect(await page.locator('#setup-load').evaluate(element => element.parentElement.classList.contains('tb-panel-foot'))).toBe(true);
    const whiteKing = page.getByRole('button', { name: 'Place white king' });
    const blackKing = page.getByRole('button', { name: 'Place black king' });
    await expect(whiteKing.locator('img')).toHaveAttribute('src', /wK\.png$/);
    await expect(blackKing.locator('img')).toHaveAttribute('src', /bK\.png$/);
    await page.locator('#setup-kings').click();
    await page.locator('#setup-restart').click();
    await expect(page.locator('#setup-restart')).toBeVisible();
    await page.locator('#setup-kings').click();
    await page.getByRole('button', { name: 'Place white queen' }).click();
    await page.locator('.caissa-board__square[data-square="d1"]').click();
    await page.locator('#setup-halfmove').fill('42');
    await page.locator('#setup-load').click();
    await expect(page.locator('#tab-moves')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#setup-load')).toBeHidden();
    await expect(page.locator('#reset-position')).toBeVisible();
    await expect(page.locator('#fen-input')).toHaveValue('4k3/8/8/8/8/8/8/3QK3 w - - 42 1');
    await expect(page.locator('#undo-move')).toBeDisabled();
    await expect(page.locator('#line-next')).toBeDisabled();

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
    await page.locator('#tab-game').click();
    await expect(page.locator('.tb-practice')).toHaveCount(0);

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
    await expect(page.locator('#tab-moves')).toHaveAttribute('aria-selected', 'true');
    expect(errors).toEqual([]);
    await context.close();
});
