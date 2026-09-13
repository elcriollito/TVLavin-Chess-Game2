import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, loadPosition, monitorRuntime, openPlay, startGame } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('M2-003 mounts one persistent shared Play board without runtime errors', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await page.goto('/play?simplified=1');
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
        api: window.CaissaPlayBoardProjection?.schemaVersion || null,
        app: !!window.App,
        projection: window.App?.boardProjection?.getSnapshot?.() || null,
        boards: document.querySelectorAll('#playSection #chessboard .caissa-board').length,
        squares: document.querySelectorAll('#playSection #chessboard .caissa-board__square').length,
        pieces: document.querySelectorAll('#playSection #chessboard .caissa-board__piece').length
    }));
    expect({ state, errors: runtime.errors, badResponses: runtime.badResponses }).toMatchObject({
        state: { api: '2.0.0', app: true, boards: 1, squares: 64, pieces: 32 },
        errors: [], badResponses: []
    });
});

test('M2-003 tap-first selection submits one canonical move and rejects illegal intent', async ({ page }) => {
    await openPlay(page);
    const started = await startGame(page);
    const inputState = await page.evaluate(() => {
        const square = document.querySelector('#chessboard .caissa-board__square[data-square="e2"]');
        return {
            disabled: square?.disabled,
            rootDisabled: square?.closest('.caissa-board')?.getAttribute('aria-disabled'),
            playInert: document.querySelector('#playSection')?.inert,
            gameActive: window.App.gameActive,
            snapshot: window.App.boardProjection.getSnapshot()
        };
    });
    expect({ started, inputState }).toMatchObject({
        started: true,
        inputState: { disabled: false, rootDisabled: 'false', playInert: false, gameActive: true }
    });
    await page.locator('#chessboard .caissa-board__square[data-square="e2"]').click();
    await expect(page.locator('#chessboard .square-e2')).toHaveClass(/caissa-board-selected/);
    await page.locator('#chessboard .caissa-board__square[data-square="e4"]').click();
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4']);
    const before = await page.evaluate(() => window.App.game.fen());
    await page.locator('#chessboard .caissa-board__square[data-square="e7"]').click();
    await page.locator('#chessboard .caissa-board__square[data-square="e4"]').click();
    expect(await page.evaluate(() => window.App.game.fen())).toBe(before);
});

test('M2-003 selection switching, clearing and keyboard intent share one canonical path', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const square = value => page.locator(`#chessboard .caissa-board__square[data-square="${value}"]`);
    await square('e2').click();
    await square('d2').click();
    await expect(page.locator('#chessboard .square-d2')).toHaveClass(/caissa-board-selected/);
    await expect(page.locator('#chessboard .square-e2')).not.toHaveClass(/caissa-board-selected/);
    await square('d2').click();
    await expect(page.locator('#chessboard .caissa-board-selected')).toHaveCount(0);
    await page.evaluate(() => window.App.boardProjection.focus('e2'));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.App.game.history())).toEqual(['e4']);
});

test('M2-003 mouse drag submits once, illegal drag snaps back, and touch drag policy remains disabled', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const drag = async (from, to) => {
        const sourceNode = page.locator(`#chessboard .caissa-board__square[data-square="${from}"]`);
        const targetNode = page.locator(`#chessboard .caissa-board__square[data-square="${to}"]`);
        await sourceNode.scrollIntoViewIfNeeded();
        const source = await sourceNode.boundingBox();
        const target = await targetNode.boundingBox();
        await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 });
        await page.mouse.up();
    };
    await drag('e2', 'e4');
    const dragState = await page.evaluate(() => ({
        history: window.App.game.history(),
        projection: window.App.boardProjection.inspect(),
        source: document.querySelector('#chessboard .caissa-board__piece[data-square="e2"]')?.dataset.piece,
        target: document.querySelector('#chessboard .caissa-board__piece[data-square="e4"]')?.dataset.piece
    }));
    expect(dragState.history, JSON.stringify(dragState, null, 2)).toEqual(['e4']);
    const before = await page.evaluate(() => window.App.game.fen());
    await drag('e7', 'e4');
    expect(await page.evaluate(() => window.App.game.fen())).toBe(before);
    const contract = await page.evaluate(() => window.App.boardProjection.getSnapshot());
    expect(contract.dragPolicy).toBe('mouse');
    expect(contract.renderer).toBe('CaissaPersistentRenderer');
});

test('M2-003 preserves the canonical Q/R/B/N promotion chooser flow', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const rootId = await page.locator('#chessboard .caissa-board').getAttribute('id');
    for (const piece of ['q', 'r', 'b', 'n']) {
        await loadPosition(page, '7k/P7/8/8/8/8/8/K7 w - - 0 1');
        const pawnId = await page.locator('#chessboard .caissa-board__piece[data-square="a7"]').getAttribute('data-piece-id');
        await page.locator('#chessboard .caissa-board__square[data-square="a7"]').click();
        await page.locator('#chessboard .caissa-board__square[data-square="a8"]').click();
        await expect(page.locator('#promotionModal')).toHaveClass(/show/);
        await page.locator(`.promotion-btn[data-piece="${piece}"]`).click();
        await expect.poll(() => page.evaluate(() => window.App.game.get('a8')?.type)).toBe(piece);
        const promotedId = await page.locator('#chessboard .caissa-board__piece[data-square="a8"]').getAttribute('data-piece-id');
        expect(promotedId).not.toBe(pawnId);
        expect(await page.locator('#chessboard .caissa-board').getAttribute('id')).toBe(rootId);
    }
});

test('M2-003 Undo, evaluation, ECO, Resign, reset and Black orientation retain one renderer', async ({ page }) => {
    await openPlay(page);
    await startGame(page);
    const rootId = await page.locator('#chessboard .caissa-board').getAttribute('id');
    await page.evaluate(() => window.updateEvalBar(75, null));
    const beforeMove = await page.evaluate(() => ({
        fen: window.App.game.fen(), rendererId: window.App.boardProjection.getSnapshot().rendererId
    }));
    expect(await page.evaluate(() => window.makeMoveFromSquares('e2', 'e4'))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App.currentOpening?.eco || window.App.openingName)).toBeTruthy();
    expect(await page.locator('#chessboard .caissa-board').getAttribute('id')).toBe(rootId);
    expect(await page.evaluate(() => window.App.boardProjection.getSnapshot().rendererId)).toBe(beforeMove.rendererId);

    await page.evaluate(() => window.undoMove());
    await expect.poll(() => page.evaluate(() => window.App.game.fen())).toBe(beforeMove.fen);
    expect(await page.evaluate(() => window.App.boardProjection.getSnapshot().lastMove)).toBeNull();

    await page.evaluate(() => window.makeMoveFromSquares('d2', 'd4'));
    const finalFen = await page.evaluate(() => window.App.game.fen());
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('#chessboard .caissa-board')).toHaveAttribute('aria-disabled', 'true');
    expect(await page.evaluate(() => window.App.game.fen())).toBe(finalFen);
    expect(await page.locator('#chessboard .caissa-board').getAttribute('id')).toBe(rootId);

    expect(await page.evaluate(() => window.newGame({
        mode: 'analysis', color: 'black', timeControl: 0, targetElo: 1500
    }))).toBe(true);
    await expect(page.locator('#chessboard .caissa-board')).toHaveAttribute('data-orientation', 'black');
    await expect(page.locator('#chessboard .caissa-board')).toHaveAttribute('aria-disabled', 'false');
    expect(await page.evaluate(() => window.App.game.history())).toEqual([]);
    expect(await page.locator('#chessboard .caissa-board').getAttribute('id')).toBe(rootId);
});

test('M2-003 quiet, capture, castling, en-passant, promotion and identical FEN preserve intended identities', async ({ page }) => {
    await openPlay(page);
    const outcome = await page.evaluate(async () => {
        const projection = window.App.boardProjection;
        const root = document.querySelector('#chessboard .caissa-board');
        const squares = [...root.querySelectorAll('.caissa-board__square')];
        const piece = square => root.querySelector(`.caissa-board__piece[data-square="${square}"]`);
        const load = fen => {
            if (fen === 'start') window.App.game.reset();
            else window.App.game.load(fen);
            projection.setPosition(window.App.game.fen(), { animate: false });
        };
        const move = value => {
            const accepted = window.App.game.move(value);
            projection.applyMove(accepted, { fen: window.App.game.fen(), animate: false });
            return accepted;
        };

        load('start');
        const initial = [...root.querySelectorAll('.caissa-board__piece')];
        const mover = piece('e2');
        move({ from: 'e2', to: 'e4' });
        const quiet = {
            root: root === document.querySelector('#chessboard .caissa-board'),
            squares: squares.every((node, index) => node === root.querySelectorAll('.caissa-board__square')[index]),
            mover: mover === piece('e4'),
            unaffected: initial.filter(node => node !== mover && node.isConnected).length
        };

        load('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
        const attacker = piece('e4'); const victim = piece('d5');
        move({ from: 'e4', to: 'd5' });
        const capture = { attacker: attacker === piece('d5'), victim: !victim.isConnected };

        load('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
        const king = piece('e1'); const rook = piece('h1');
        move({ from: 'e1', to: 'g1' });
        const castle = { king: king === piece('g1'), rook: rook === piece('f1') };

        load('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
        const epMover = piece('e5'); const epVictim = piece('d5');
        move({ from: 'e5', to: 'd6' });
        const enPassant = { mover: epMover === piece('d6'), victim: !epVictim.isConnected };

        load('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
        const pawn = piece('a7');
        move({ from: 'a7', to: 'a8', promotion: 'n' });
        const promoted = piece('a8');
        const promotion = { replaced: pawn !== promoted && !pawn.isConnected, code: promoted?.dataset.piece };

        const records = [];
        const observer = new MutationObserver(value => records.push(...value));
        observer.observe(root, { subtree: true, childList: true, attributes: true });
        const identical = projection.setPosition(window.App.game.fen(), { animate: false });
        await Promise.resolve(); records.push(...observer.takeRecords()); observer.disconnect();
        return { quiet, capture, castle, enPassant, promotion,
            identical: { reason: identical.reasonCode, mutations: records.length },
            metrics: projection.inspect().renderer };
    });
    expect(outcome.quiet).toEqual({ root: true, squares: true, mover: true, unaffected: 31 });
    expect(outcome.capture).toEqual({ attacker: true, victim: true });
    expect(outcome.castle).toEqual({ king: true, rook: true });
    expect(outcome.enPassant).toEqual({ mover: true, victim: true });
    expect(outcome.promotion).toEqual({ replaced: true, code: 'wN' });
    expect(outcome.identical).toEqual({ reason: 'IDENTICAL_POSITION', mutations: 0 });
});

test('M2-003 handles 20 moves, 50 coalesced updates and a 100-position canonical soak', async ({ page }) => {
    await openPlay(page);
    const result = await page.evaluate(async () => {
        const projection = window.App.boardProjection;
        const root = document.querySelector('#chessboard .caissa-board');
        const squares = [...root.querySelectorAll('.caissa-board__square')];
        const opening = [
            ['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','b5'],['a7','a6'],['b5','a4'],['g8','f6'],
            ['e1','g1'],['f8','e7'],['f1','e1'],['b7','b5'],['a4','b3'],['d7','d6'],['c2','c3'],['e8','g8'],
            ['h2','h3'],['c6','b8'],['d2','d4'],['b8','d7']
        ];
        window.App.game.reset(); projection.setPosition(window.App.game.fen(), { animate: false });
        for (const [from, to] of opening) {
            const move = window.App.game.move({ from, to });
            projection.applyMove(move, { fen: window.App.game.fen(), animate: false });
        }
        const twenty = { fen: window.App.game.fen(), root: root.isConnected,
            squares: squares.every((node, index) => node === root.querySelectorAll('.caissa-board__square')[index]) };

        const fenA = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
        const fenB = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1';
        for (let index = 0; index < 50; index += 1) {
            const fen = index === 49 ? fenB : (index % 2 ? fenA : fenB);
            window.App.game.load(fen);
            projection.setPosition(window.App.game.fen(), { animate: false, coalesce: true });
        }
        projection.flushPending();
        const burst = { fen: projection.getPosition(), pending: projection.getSnapshot().pending };

        window.App.game.load('6nk/8/8/8/8/8/8/1N5K w - - 0 1');
        projection.setPosition(window.App.game.fen(), { animate: false });
        const cycle = [['b1','c3'],['g8','f6'],['c3','b1'],['f6','g8']];
        for (let index = 0; index < 100; index += 1) {
            const [from, to] = cycle[index % cycle.length];
            const move = window.App.game.move({ from, to });
            projection.applyMove(move, { fen: window.App.game.fen(), animate: false });
        }
        return { twenty, burst, soak: { fen: projection.getPosition(), canonical: window.App.game.fen(),
            pending: projection.getSnapshot().pending, metrics: projection.inspect() } };
    });
    expect(result.twenty.root).toBe(true);
    expect(result.twenty.squares).toBe(true);
    expect(result.twenty.fen).toContain(' w ');
    expect(result.burst).toEqual({ fen: '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1', pending: false });
    expect(result.soak.fen).toBe(result.soak.canonical);
    expect(result.soak.pending).toBe(false);
    expect(result.soak.metrics.semanticMoves).toBeGreaterThanOrEqual(120);
});

test('M2-003 portrait, landscape and rotation retain one square board and persistent identity', async ({ page }) => {
    await openPlay(page);
    const id = await page.evaluate(() => window.App.boardProjection.getSnapshot().rendererId);
    let previousGeometryChanges = null;
    for (const viewport of [
        { width: 390, height: 844 }, { width: 430, height: 932 },
        { width: 844, height: 390 }, { width: 932, height: 430 },
        { width: 1366, height: 768 }, { width: 1600, height: 1000 }
    ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(180);
        const layout = await page.evaluate(() => {
            const board = document.querySelector('#playSection #chessboard .caissa-board').getBoundingClientRect();
            return { width: board.width, height: board.height,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                count: document.querySelectorAll('#playSection #chessboard .caissa-board').length,
                rendererId: window.App.boardProjection.getSnapshot().rendererId,
                geometryChanges: window.App.boardProjection.inspect().renderer.geometryChanges };
        });
        expect(layout.count).toBe(1);
        expect(Math.abs(layout.width - layout.height)).toBeLessThanOrEqual(1);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        expect(layout.rendererId).toBe(id);
        if (previousGeometryChanges !== null)
            expect(layout.geometryChanges - previousGeometryChanges).toBeLessThanOrEqual(1);
        previousGeometryChanges = layout.geometryChanges;
    }
});

test('M2-003 board remains accessible with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPlay(page);
    const board = page.locator('#playSection #chessboard .caissa-board');
    await expect(board).toHaveAttribute('role', 'grid');
    await expect(board).toHaveAttribute('data-reduced-motion', 'true');
    const results = await new AxeBuilder({ page }).include('#playSection').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
