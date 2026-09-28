import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';

const HARNESS = '/tests/fixtures/caissa-board/index.html';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function openHarness(page) {
    await page.goto(HARNESS);
    await page.waitForFunction(() => window.caissaBoardReady === true);
    await expect(page.locator('.caissa-board')).toBeVisible();
}

async function screenshotBoard(page, path) {
    // WebKit's clipped/element screenshot path can misplace an actively
    // composited transform layer. A viewport capture records the real frame.
    await page.screenshot({ path, fullPage: false, animations: 'allow' });
}

test('persistent root, 64 squares, quiet-move identity and identical-FEN zero mutations', async ({ page }) => {
    await openHarness(page);
    const outcome = await page.evaluate(async startFen => {
        const harness = window.caissaBoardHarness;
        harness.reset({ position: startFen, animation: false });
        const root = harness.root();
        const squares = [...root.querySelectorAll('.caissa-board__square')];
        const pieces = new Map([...root.querySelectorAll('.caissa-board__piece')].map(node => [node.dataset.pieceId, node]));
        const mover = harness.pieceNode('e2');
        const moverId = mover.dataset.pieceId;
        harness.startMutationCapture();
        const response = harness.applyMove({ from: 'e2', to: 'e4' }, { animate: false });
        const quietMutations = await harness.stopMutationCapture();
        const afterPieces = [...root.querySelectorAll('.caissa-board__piece')];
        const unaffectedStable = afterPieces
            .filter(node => node.dataset.pieceId !== moverId)
            .filter(node => pieces.get(node.dataset.pieceId) === node).length;
        const quiet = {
            response,
            rootStable: root === harness.root(),
            squareCount: squares.length,
            squaresStable: squares.every((node, index) => node === root.querySelectorAll('.caissa-board__square')[index]),
            moverStable: mover === harness.pieceNode('e4'),
            unaffectedStable,
            quietMutations
        };
        harness.startMutationCapture();
        const identicalResponse = harness.setPosition(harness.getPosition().placement, { animate: false });
        const identicalMutations = await harness.stopMutationCapture();
        return { quiet, identicalResponse, identicalMutations, metrics: harness.getMetrics() };
    }, START_FEN);

    expect(outcome.quiet.response.ok).toBe(true);
    expect(outcome.quiet.rootStable).toBe(true);
    expect(outcome.quiet.squareCount).toBe(64);
    expect(outcome.quiet.squaresStable).toBe(true);
    expect(outcome.quiet.moverStable).toBe(true);
    expect(outcome.quiet.unaffectedStable).toBe(31);
    expect(outcome.quiet.quietMutations.nodesAdded).toBe(0);
    expect(outcome.quiet.quietMutations.nodesRemoved).toBe(0);
    expect(outcome.identicalResponse.reasonCode).toBe('IDENTICAL_POSITION');
    expect(outcome.identicalMutations).toEqual({ records: 0, nodesAdded: 0, nodesRemoved: 0, attributes: 0, styles: 0 });
});

test('capture, en passant, castling and promotion mutate only intentional piece nodes', async ({ page }) => {
    await openHarness(page);
    const outcomes = await page.evaluate(async () => {
        const h = window.caissaBoardHarness;

        h.reset({ position: '8/8/8/3p4/4P3/8/8/8', animation: false });
        const captureRoot = h.root();
        const attacker = h.pieceNode('e4');
        const victim = h.pieceNode('d5');
        h.startMutationCapture();
        h.applyMove({ from: 'e4', to: 'd5', capture: true }, { animate: false });
        const captureMutations = await h.stopMutationCapture();
        const capture = {
            rootStable: captureRoot === h.root(),
            attackerStable: attacker === h.pieceNode('d5'),
            victimRemoved: !victim.isConnected,
            pieceCount: captureRoot.querySelectorAll('.caissa-board__piece').length,
            mutations: captureMutations
        };

        h.reset({ position: '8/8/8/3pP3/8/8/8/8', animation: false });
        const epMover = h.pieceNode('e5');
        const epVictim = h.pieceNode('d5');
        h.applyMove({ from: 'e5', to: 'd6', enPassant: true }, { animate: false });
        const enPassant = { moverStable: epMover === h.pieceNode('d6'), victimRemoved: !epVictim.isConnected };

        h.reset({ position: 'r3k2r/8/8/8/8/8/8/R3K2R', animation: false });
        const castleRoot = h.root();
        const king = h.pieceNode('e1');
        const rook = h.pieceNode('h1');
        h.applyMove({ from: 'e1', to: 'g1', castle: true }, { animate: false });
        const castling = {
            rootStable: castleRoot === h.root(),
            kingStable: king === h.pieceNode('g1'),
            rookStable: rook === h.pieceNode('f1')
        };

        h.reset({ position: '8/P7/8/8/8/8/8/8', animation: false });
        const pawn = h.pieceNode('a7');
        const pawnId = pawn.dataset.pieceId;
        h.startMutationCapture();
        h.applyMove({ from: 'a7', to: 'a8', promotion: 'Q' }, { animate: false });
        const promotionMutations = await h.stopMutationCapture();
        const promoted = h.pieceNode('a8');
        const promotion = {
            pawnRemoved: !pawn.isConnected,
            promotedCreated: promoted && promoted.dataset.piece === 'wQ',
            identityReplaced: promoted && promoted.dataset.pieceId !== pawnId,
            mutations: promotionMutations
        };
        return { capture, enPassant, castling, promotion };
    });

    expect(outcomes.capture).toMatchObject({ rootStable: true, attackerStable: true, victimRemoved: true, pieceCount: 1 });
    expect(outcomes.capture.mutations.nodesAdded).toBe(0);
    expect(outcomes.capture.mutations.nodesRemoved).toBe(1);
    expect(outcomes.enPassant).toEqual({ moverStable: true, victimRemoved: true });
    expect(outcomes.castling).toEqual({ rootStable: true, kingStable: true, rookStable: true });
    expect(outcomes.promotion.pawnRemoved).toBe(true);
    expect(outcomes.promotion.promotedCreated).toBe(true);
    expect(outcomes.promotion.identityReplaced).toBe(true);
    expect(outcomes.promotion.mutations.nodesAdded).toBe(1);
    expect(outcomes.promotion.mutations.nodesRemoved).toBe(1);
});

test('arbitrary FEN jumps and orientation flips preserve persistent structure', async ({ page }) => {
    await openHarness(page);
    const result = await page.evaluate(() => {
        const h = window.caissaBoardHarness;
        h.reset({ position: '8/8/8/8/8/8/PP6/R6R', animation: false });
        const root = h.root();
        const squares = [...root.querySelectorAll('.caissa-board__square')];
        const a2Pawn = h.pieceNode('a2');
        const b2Pawn = h.pieceNode('b2');
        const jump = h.setPosition('8/8/8/8/1P6/8/P7/R6R', { animate: false });
        const jumpResult = {
            ok: jump.ok,
            rootStable: root === h.root(),
            squaresStable: squares.every((node, index) => node === root.querySelectorAll('.caissa-board__square')[index]),
            exactPawnStable: a2Pawn === h.pieceNode('a2'),
            movedPawnStable: b2Pawn === h.pieceNode('b4')
        };
        const pieceNodes = [...root.querySelectorAll('.caissa-board__piece')];
        const flip = h.setOrientation('black');
        return {
            jumpResult,
            flipOk: flip.ok,
            orientation: h.getMetrics().renderer.orientation,
            rootStableAfterFlip: root === h.root(),
            squaresStableAfterFlip: squares.every((node, index) => node === root.querySelectorAll('.caissa-board__square')[index]),
            piecesStableAfterFlip: pieceNodes.every(node => root.querySelector(`[data-piece-id="${node.dataset.pieceId}"]`) === node),
            a8AtBottomRight: h.squareNode('a8').style.getPropertyValue('--caissa-x') === '7'
                && h.squareNode('a8').style.getPropertyValue('--caissa-y') === '7'
        };
    });
    expect(result.jumpResult).toEqual({ ok: true, rootStable: true, squaresStable: true, exactPawnStable: true, movedPawnStable: true });
    expect(result).toMatchObject({ flipOk: true, orientation: 'black', rootStableAfterFlip: true, squaresStableAfterFlip: true, piecesStableAfterFlip: true, a8AtBottomRight: true });
});

test('tap, drag, promotion request and board-scoped touch protections normalize intent', async ({ page }) => {
    await openHarness(page);
    await page.evaluate(() => window.caissaBoardHarness.reset({ position: window.caissaBoardHarness.START_FEN, animation: false }));
    await page.locator('.caissa-board__square[data-square="e2"]').click();
    await page.locator('.caissa-board__square[data-square="e4"]').click();
    let events = await page.evaluate(() => window.caissaBoardHarness.getEvents());
    expect(events.filter(event => event.type === 'moveAttempt').at(-1).payload).toMatchObject({ from: 'e2', to: 'e4', promotion: null, inputMethod: 'tap' });

    await page.evaluate(() => window.caissaBoardHarness.clearEvents());
    const source = await page.locator('.caissa-board__square[data-square="g1"]').boundingBox();
    const target = await page.locator('.caissa-board__square[data-square="f3"]').boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 4 });
    await page.mouse.up();
    events = await page.evaluate(() => window.caissaBoardHarness.getEvents());
    expect(events.filter(event => event.type === 'dragStart')).toHaveLength(1);
    expect(events.filter(event => event.type === 'dragEnd')).toHaveLength(1);
    expect(events.filter(event => event.type === 'moveAttempt')).toHaveLength(1);
    expect(events.find(event => event.type === 'moveAttempt').payload).toMatchObject({ from: 'g1', to: 'f3', inputMethod: 'drag' });
    await expect(page.locator('.caissa-board__piece[data-square="g1"]')).toHaveCount(1);

    const mobileSafety = await page.evaluate(() => {
        const root = window.caissaBoardHarness.root();
        const piece = window.caissaBoardHarness.pieceNode('e2');
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        piece.dispatchEvent(event);
        const rootStyle = getComputedStyle(root);
        const pieceStyle = getComputedStyle(piece);
        return {
            contextPrevented: event.defaultPrevented,
            draggable: piece.draggable,
            touchAction: rootStyle.touchAction,
            rootUserSelect: rootStyle.userSelect || rootStyle.webkitUserSelect,
            pieceUserSelect: pieceStyle.userSelect || pieceStyle.webkitUserSelect,
            piecePointerEvents: pieceStyle.pointerEvents
        };
    });
    expect(mobileSafety).toMatchObject({ contextPrevented: true, draggable: false, touchAction: 'none', rootUserSelect: 'none', pieceUserSelect: 'none', piecePointerEvents: 'none' });

    await page.evaluate(() => {
        window.caissaBoardHarness.reset({ position: '8/P7/8/8/8/8/8/8', animation: false });
        window.caissaBoardHarness.clearEvents();
    });
    await page.locator('.caissa-board__square[data-square="a7"]').click();
    await page.locator('.caissa-board__square[data-square="a8"]').click();
    events = await page.evaluate(() => window.caissaBoardHarness.getEvents());
    expect(events.some(event => event.type === 'promotionRequest')).toBe(true);
    expect(events.find(event => event.type === 'moveAttempt').payload.promotion).toBe('Q');
});

test('Quiet Drag preserves grab offset, coalesces frames, stays single-piece and cleans up synchronously', async ({ page }) => {
    await openHarness(page);
    const result = await page.evaluate(async startFen => {
        const h = window.caissaBoardHarness;
        h.reset({ position: startFen, animation: true });
        h.clearEvents();
        h.selectSquare('e2');
        const root = h.root();
        const piece = h.pieceNode('e2');
        const originalPiece = piece;
        const boardRect = root.getBoundingClientRect();
        const pieceRect = piece.getBoundingClientRect();
        const start = { x: pieceRect.left + pieceRect.width * 0.21, y: pieceRect.top + pieceRect.height * 0.74 };
        const end = { x: start.x + pieceRect.width * 1.65, y: start.y - pieceRect.height * 1.35 };
        const expectedOffset = { x: start.x - pieceRect.left, y: start.y - pieceRect.top };
        const reads = { board: 0, piece: 0 };
        const boardRectMethod = root.getBoundingClientRect.bind(root);
        const pieceRectMethod = piece.getBoundingClientRect.bind(piece);
        root.getBoundingClientRect = () => { reads.board += 1; return boardRectMethod(); };
        piece.getBoundingClientRect = () => { reads.piece += 1; return pieceRectMethod(); };
        const event = (type, point, extra = {}) => new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 91, pointerType: 'mouse', isPrimary: true,
            button: type === 'pointerdown' ? 0 : -1, buttons: type === 'pointerup' ? 0 : 1,
            clientX: point.x, clientY: point.y, ...extra
        });

        root.dispatchEvent(event('pointerdown', start));
        const readsAfterStart = { ...reads };
        for (let index = 1; index <= 40; index += 1) {
            const progress = index / 40;
            root.dispatchEvent(event('pointermove', {
                x: start.x + (end.x - start.x) * progress,
                y: start.y + (end.y - start.y) * progress
            }));
        }
        const readsAfterMoves = { ...reads };
        const beforeFrame = h.getMetrics().renderer.quietDrag;
        await new Promise(requestAnimationFrame);
        const movedRect = pieceRectMethod();
        const style = getComputedStyle(piece);
        const held = {
            sameNode: piece === originalPiece,
            pieceCount: root.querySelectorAll('.caissa-board__piece').length,
            draggingCount: root.querySelectorAll('.caissa-board__piece[data-dragging="true"]').length,
            sourceMarkerCount: root.querySelectorAll('[data-drag-source="true"]').length,
            offsetError: Math.hypot(end.x - movedRect.left - expectedOffset.x, end.y - movedRect.top - expectedOffset.y),
            opacity: style.opacity,
            filter: style.filter,
            boxShadow: style.boxShadow,
            textShadow: style.textShadow,
            transitionDuration: style.transitionDuration,
            animationName: style.animationName,
            scale: style.scale,
            events: h.getEvents(),
            beforeFrame,
            afterFrame: h.getMetrics().renderer.quietDrag
        };

        root.dispatchEvent(event('pointercancel', end));
        const immediatelyCancelled = {
            dragging: root.querySelectorAll('[data-dragging="true"]').length,
            sourceMarkers: root.querySelectorAll('[data-drag-source="true"]').length,
            activeAttribute: root.hasAttribute('data-quiet-drag-active'),
            inlineTransform: piece.style.transform,
            metrics: h.getMetrics().renderer.quietDrag
        };
        const writesAtCancel = immediatelyCancelled.metrics.scheduler.visualWrites;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const writesAfterCancel = h.getMetrics().renderer.quietDrag.scheduler.visualWrites;

        h.clearEvents();
        h.clearSelection();
        const e2 = h.squareNode('e2').getBoundingClientRect();
        const dropStart = { x: e2.left + 12, y: e2.top + 19 };
        const e4 = h.squareNode('e4').getBoundingClientRect();
        const dropEnd = { x: e4.left + 12, y: e4.top + 19 };
        root.dispatchEvent(event('pointerdown', dropStart, { pointerId: 92 }));
        root.dispatchEvent(event('pointermove', {
            x: dropStart.x + (dropEnd.x - dropStart.x) / 2,
            y: dropStart.y + (dropEnd.y - dropStart.y) / 2
        }, { pointerId: 92 }));
        root.dispatchEvent(event('pointermove', dropEnd, { pointerId: 92 }));
        await new Promise(requestAnimationFrame);
        root.dispatchEvent(event('pointerup', dropEnd, { pointerId: 92 }));
        const immediateDrop = {
            events: h.getEvents(),
            dragging: root.querySelectorAll('[data-dragging="true"]').length,
            sourceMarkers: root.querySelectorAll('[data-drag-source="true"]').length,
            inlineTransform: piece.style.transform,
            activeAnimations: piece.getAnimations().length,
            metrics: h.getMetrics().renderer.quietDrag
        };

        const oldRoots = [];
        for (let index = 0; index < 10; index += 1) {
            oldRoots.push(h.root());
            h.reset({ position: startFen, animation: false });
        }
        const destroyed = h.getLastDestroyedMetrics().renderer.quietDrag;
        return {
            boardRect: { width: boardRect.width, height: boardRect.height },
            readsAfterStart,
            readsAfterMoves,
            held,
            immediatelyCancelled,
            writesAtCancel,
            writesAfterCancel,
            immediateDrop,
            destroyed,
            oldRootsDisconnected: oldRoots.every(node => !node.isConnected)
        };
    }, START_FEN);

    expect(result.boardRect.width).toBeGreaterThan(0);
    expect(result.readsAfterStart).toEqual({ board: 1, piece: 1 });
    expect(result.readsAfterMoves).toEqual(result.readsAfterStart);
    expect(result.held.sameNode).toBe(true);
    expect(result.held.pieceCount).toBe(32);
    expect(result.held.draggingCount).toBe(1);
    expect(result.held.sourceMarkerCount).toBe(2);
    expect(result.held.offsetError).toBeLessThan(0.2);
    expect(result.held).toMatchObject({
        opacity: '1', filter: 'none', boxShadow: 'none', textShadow: 'none',
        transitionDuration: '0s', animationName: 'none'
    });
    expect(['1', 'none']).toContain(result.held.scale);
    expect(result.held.events.filter(event => event.type === 'dragStart')).toHaveLength(1);
    expect(result.held.events.filter(event => event.type === 'moveAttempt')).toHaveLength(0);
    expect(result.held.beforeFrame.pointerMoves).toBe(40);
    expect(result.held.beforeFrame.scheduler.inputEvents).toBeGreaterThanOrEqual(39);
    expect(result.held.beforeFrame.scheduler.visualWrites).toBe(0);
    expect(result.held.afterFrame.scheduler.visualWrites).toBe(1);
    expect(result.held.afterFrame.scheduler.framesRequested).toBe(1);
    expect(result.immediatelyCancelled).toMatchObject({
        dragging: 0, sourceMarkers: 0, activeAttribute: false, inlineTransform: ''
    });
    expect(result.immediatelyCancelled.metrics.active).toBe(false);
    expect(result.immediatelyCancelled.metrics.scheduler.pendingFrame).toBe(false);
    expect(result.writesAfterCancel).toBe(result.writesAtCancel);
    expect(result.immediateDrop.events.filter(event => event.type === 'moveAttempt')).toHaveLength(1);
    expect(result.immediateDrop.events.find(event => event.type === 'moveAttempt').payload)
        .toMatchObject({ from: 'e2', to: 'e4', inputMethod: 'drag' });
    expect(result.immediateDrop).toMatchObject({
        dragging: 0, sourceMarkers: 0, inlineTransform: '', activeAnimations: 0
    });
    expect(result.immediateDrop.metrics.active).toBe(false);
    expect(result.immediateDrop.metrics.scheduler.pendingFrame).toBe(false);
    expect(result.destroyed.listenerCount).toBe(0);
    expect(result.destroyed.scheduler.destroyed).toBe(true);
    expect(result.destroyed.scheduler.pendingFrame).toBe(false);
    expect(result.oldRootsDisconnected).toBe(true);
});

test('keyboard, highlights, arrows and reduced motion are accessible presentation state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHarness(page);
    const root = page.locator('.caissa-board');
    await root.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const keyboard = await page.evaluate(() => ({
        events: window.caissaBoardHarness.getEvents(),
        active: window.caissaBoardHarness.root().getAttribute('aria-activedescendant'),
        selected: window.caissaBoardHarness.root().querySelector('[aria-selected="true"]')?.dataset.square || null
    }));
    expect(keyboard.events.find(event => event.type === 'moveAttempt').payload).toMatchObject({ from: 'a1', to: 'b1', inputMethod: 'keyboard' });
    expect(keyboard.active).toContain('square-b1');
    expect(keyboard.selected).toBeNull();

    await page.evaluate(() => {
        const h = window.caissaBoardHarness;
        h.selectSquare('e2');
        h.highlightSquares([{ square: 'e4', type: 'legal' }, { square: 'e5', type: 'last' }, { square: 'c3', type: 'hint' }, { square: 'd4', type: 'error' }]);
        h.drawArrow('e2', 'e4');
    });
    await expect(page.locator('.caissa-board__highlight--selected')).toHaveCount(1);
    await expect(page.locator('.caissa-board__highlight--legal')).toHaveCount(1);
    await expect(page.locator('.caissa-board__arrow-line')).toHaveCount(1);
    const reducedMotion = await page.evaluate(() => {
        const h = window.caissaBoardHarness;
        h.applyMove({ from: 'e2', to: 'e4' }, { animate: true });
        const piece = h.pieceNode('e4');
        return {
            attribute: h.root().dataset.reducedMotion,
            transitionDuration: getComputedStyle(piece).transitionDuration,
            sameNodePosition: piece.dataset.square
        };
    });
    expect(reducedMotion).toEqual({ attribute: 'true', transitionDuration: '0s', sameNodePosition: 'e4' });
    await page.keyboard.press('Escape');
    await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
});

test('20 moves, 50-update burst and 100-update soak retain final state in both engines', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHarness(page);
    const portraitBefore = await page.evaluate(() => window.caissaBoardHarness.geometry());
    const sequence = await page.evaluate(() => window.caissaBoardHarness.run20Moves());
    const portraitAfter = await page.evaluate(() => window.caissaBoardHarness.geometry());
    expect(sequence.responses.every(response => response.ok)).toBe(true);
    expect(sequence.rootStable).toBe(true);
    expect(sequence.squaresStable).toBe(true);
    expect(sequence.retainedInitialPieces).toBe(32);
    expect(sequence.position.renderedPlacement).toBe('r1bq1rk1/2pnbppp/p2p1n2/1p2p3/3PP3/1BP2N1P/PP3PP1/RNBQR1K1');
    expect(Math.abs(portraitAfter.width - portraitBefore.width)).toBeLessThan(0.1);
    expect(Math.abs(portraitAfter.height - portraitBefore.height)).toBeLessThan(0.1);

    const burst = await page.evaluate(() => window.caissaBoardHarness.runBurst(50));
    expect(burst.position.renderedPlacement).toBe('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R');
    expect(burst.position.pending).toBe(false);
    expect(burst.metrics.renderer.coalescedUpdates).toBeGreaterThanOrEqual(49);

    const soak = await page.evaluate(() => window.caissaBoardHarness.runSoak(100));
    expect(soak.position.renderedPlacement).toBe('8/8/8/8/8/8/8/1N6');
    expect(soak.metrics.renderer.semanticMoves).toBe(100);
    expect(soak.metrics.renderer.pieceCount).toBe(1);
    expect(soak.metrics.renderer.nodesAdded).toBe(0);
    expect(soak.metrics.renderer.nodesRemoved).toBe(0);
});

test('portrait and landscape updates have no board geometry or page-scroll drift', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await openHarness(page);
        await page.evaluate(() => window.scrollTo(0, 80));
        const before = await page.evaluate(() => window.caissaBoardHarness.geometry());
        await page.evaluate(() => window.caissaBoardHarness.run20Moves());
        const after = await page.evaluate(() => window.caissaBoardHarness.geometry());
        expect(Math.abs(after.width - before.width)).toBeLessThan(0.1);
        expect(Math.abs(after.height - before.height)).toBeLessThan(0.1);
        expect(after.scrollX).toBe(before.scrollX);
        expect(after.scrollY).toBe(before.scrollY);
    }
});

test('harness has no serious or critical Axe violations', async ({ page }) => {
    await openHarness(page);
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
    expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
});

test('WebKit portrait and landscape BEFORE/MID/AFTER visual evidence', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit', 'WebKit-specific visual evidence');
    const artifactDirectory = `test-results/caissa-board-005/${testInfo.project.name}`;
    await mkdir(artifactDirectory, { recursive: true });
    for (const viewport of [{ name: 'portrait', width: 390, height: 844 }, { name: 'landscape', width: 844, height: 390 }]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openHarness(page);
        await page.evaluate(startFen => window.caissaBoardHarness.reset({ position: startFen, animation: true, animationDuration: 600 }), START_FEN);
        await screenshotBoard(page, `${artifactDirectory}/${viewport.name}-before.png`);
        await page.evaluate(() => window.caissaBoardHarness.applyMove({ from: 'e2', to: 'e4' }, { animate: true }));
        await page.waitForTimeout(90);
        await screenshotBoard(page, `${artifactDirectory}/${viewport.name}-mid.png`);
        await page.waitForTimeout(650);
        await screenshotBoard(page, `${artifactDirectory}/${viewport.name}-after.png`);
        const final = await page.evaluate(() => window.caissaBoardHarness.getPosition().renderedPlacement);
        expect(final).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    }
});
