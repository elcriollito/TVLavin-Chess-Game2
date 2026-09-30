import { test, expect } from '@playwright/test';

const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test.afterEach(async ({ page }) => {
    expect(pageErrors.get(page)).toEqual([]);
});

async function openFicsAnalysis(page, pgn, payload = {}) {
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaNavigation?.currentSection === 'fics');
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.disconnect?.();
        client.pendingMove = null;
        client.liveGame.whiteClock = 321000;
        client.liveGame.blackClock = 318000;
        window.__ficsIsolation = {
            counts: { send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 },
            before: null
        };
        for (const name of ['send', 'sendMove', 'sendCommand']) {
            client[name] = () => {
                window.__ficsIsolation.counts[name] += 1;
                return { ok: false, code: 'QA_BLOCKED_SEND' };
            };
        }
        const nativeSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function isolatedSend(...args) {
            window.__ficsIsolation.counts.webSocket += 1;
            return nativeSend.apply(this, args);
        };
    });

    await page.evaluate(async ({ fixturePgn, overrides }) => {
        const transport = window.CaissaAnalyzeHandoff.createTransport();
        const created = transport.create({
            source: 'fics', intent: 'analyze-game',
            payload: {
                recordId: overrides.recordId || 'fics-game:local-analysis-qa',
                pgn: fixturePgn,
                selectedPly: overrides.selectedPly ?? 999,
                playerColor: 'white', boardOrientation: 'white',
                result: overrides.result || '*', termination: overrides.termination || null,
                whiteLabel: 'FICS White', blackLabel: 'FICS Black',
                recordStatus: 'complete', mode: 'fics-played'
            },
            provenance: { sourceSection: 'fics', transport: 'sessionStorage' }
        });
        if (!created.ok || !transport.store(created.value).ok) throw new Error('FICS handoff fixture failed');
        const navigated = await window.CaissaNavigation.navigateToSection('analyze', {
            handoffToken: created.value.token, source: 'fics-game-over'
        });
        if (navigated === false) throw new Error('Analyze navigation failed');
    }, { fixturePgn: pgn, overrides: payload });
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect(page.locator('#analyzeChessboard .caissa-board')).toHaveAttribute('aria-readonly', 'false');
    await page.waitForFunction(() => window.AnalyzeSection?.ficsLocalAnalysis?.inspect?.().active === true);
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        window.__ficsIsolation.before = {
            pendingMove: client.pendingMove,
            liveGame: JSON.stringify(client.liveGame),
            whiteClock: client.liveGame.whiteClock,
            blackClock: client.liveGame.blackClock
        };
    });
}

async function isolationSnapshot(page) {
    return page.evaluate(() => ({
        counts: { ...window.__ficsIsolation.counts },
        pendingMove: window.CaissaFICSClient.pendingMove,
        liveGame: JSON.stringify(window.CaissaFICSClient.liveGame),
        whiteClock: window.CaissaFICSClient.liveGame.whiteClock,
        blackClock: window.CaissaFICSClient.liveGame.blackClock,
        before: window.__ficsIsolation.before
    }));
}

async function dragSquare(page, from, to) {
    const points = await page.locator('#analyzeChessboard .caissa-board').evaluate((board, squares) => {
        const rect = board.getBoundingClientRect();
        const point = square => ({
            x: rect.left + ((square.charCodeAt(0) - 97) + 0.5) * rect.width / 8,
            y: rect.top + (8 - Number(square[1]) + 0.5) * rect.height / 8
        });
        return { from: point(squares.from), to: point(squares.to) };
    }, { from, to });
    await page.mouse.move(points.from.x, points.from.y);
    await page.mouse.down();
    await page.mouse.move(points.to.x, points.to.y, { steps: 5 });
    await page.mouse.up();
}

async function clickSquare(page, square) {
    await page.locator(`#analyzeChessboard .caissa-board__square[data-square="${square}"]`).click();
}

test('historical FICS position forks into a local-only line and rejects illegal moves', async ({ page }) => {
    await openFicsAnalysis(page, '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    const before = await page.evaluate(() => {
        AnalyzeSection.jumpToMove(1);
        return { fen: AnalyzeSection.getGame().fen(), sourceMoves: AnalyzeSection.getLoadedMoves() };
    });
    const outcome = await page.evaluate(() => ({
        legal: AnalyzeSection.playStudyMove('d2', 'd4'),
        illegal: AnalyzeSection.playStudyMove('e7', 'e5'),
        fen: AnalyzeSection.getGame().fen(),
        moves: AnalyzeSection.getLoadedMoves(),
        cursor: AnalyzeSection.currentMoveIndex,
        local: AnalyzeSection.ficsLocalAnalysis.inspect()
    }));
    expect(outcome.legal).toBe(true);
    expect(outcome.illegal).toBe(false);
    expect(outcome.fen).not.toBe(before.fen);
    expect(outcome.moves).toEqual(['e4', 'e5', 'd4']);
    expect(outcome.cursor).toBe(2);
    expect(outcome.local.localNodeCount).toBe(1);
    expect(outcome.local.originalLineIds).toHaveLength(6);
    expect(outcome.local.nodes.filter(node => node.source === 'original').map(node => node.san))
        .toEqual([null, 'e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    expect(outcome.local.networkPolicy).toBe('local-only');
    await expect(page.locator('#analyzeMoveList [data-node-id="local-1"]')).toHaveClass(/active/);
    const isolated = await isolationSnapshot(page);
    expect(isolated.counts).toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });
    expect(isolated.pendingMove).toBe(isolated.before.pendingMove);
    expect(isolated.liveGame).toBe(isolated.before.liveGame);
    expect(isolated.whiteClock).toBe(isolated.before.whiteClock);
    expect(isolated.blackClock).toBe(isolated.before.blackClock);
});

test('persistent Analyze board accepts drag capture and multiple local moves without FICS sends', async ({ page }) => {
    await openFicsAnalysis(page, '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
    await dragSquare(page, 'b5', 'c6');
    await page.waitForFunction(() => window.AnalyzeSection.getLoadedMoves().at(-1) === 'Bxc6');
    expect(await page.evaluate(() => AnalyzeSection.playStudyMove('d7', 'c6'))).toBe(true);
    const state = await page.evaluate(() => ({
        moves: AnalyzeSection.getLoadedMoves().slice(-2),
        boardFen: AnalyzeSection.board.getPosition().renderedFen,
        gameFen: AnalyzeSection.getGame().fen(),
        strategy: AnalyzeSection.board.inspect().strategy
    }));
    expect(state.moves).toEqual(['Bxc6', 'dxc6']);
    expect(state.boardFen).toBe(state.gameFen);
    expect(state.strategy).toBe('move');
    expect((await isolationSnapshot(page)).counts)
        .toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });
});

test('click-to-move stays local and Reset restores the immutable source game', async ({ page }) => {
    await openFicsAnalysis(page, '1. e4 e5 2. Nf3 Nc6');
    await page.evaluate(() => AnalyzeSection.jumpToMove(1));
    await clickSquare(page, 'd2');
    await clickSquare(page, 'd4');
    await page.waitForFunction(() => window.AnalyzeSection.getLoadedMoves().at(-1) === 'd4');
    await page.evaluate(() => AnalyzeSection.resetStudyBoard({ explicit: true, silent: true }));
    const reset = await page.evaluate(() => ({
        local: AnalyzeSection.ficsLocalAnalysis.inspect(),
        activeHandoffId: AnalyzeSection.activeHandoffId,
        sourceMarker: document.getElementById('analyzeSection').dataset.caissaAnalyzeSource || null,
        fen: AnalyzeSection.getGame().fen(),
        moves: AnalyzeSection.getLoadedMoves()
    }));
    expect(reset.local.localNodeCount).toBe(0);
    expect(reset.local.active).toBe(true);
    expect(reset.activeHandoffId).toBeTruthy();
    expect(reset.sourceMarker).toBe('fics');
    expect(reset.fen).toBe('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    expect(reset.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect((await isolationSnapshot(page)).counts)
        .toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });

    await openFicsAnalysis(page, '1. d4 d5 2. c4 e6', { recordId: 'fics-game:new-source' });
    const replacement = await page.evaluate(() => ({
        moves: AnalyzeSection.getLoadedMoves(),
        local: AnalyzeSection.ficsLocalAnalysis.inspect()
    }));
    expect(replacement.moves).toEqual(['d4', 'd5', 'c4', 'e6']);
    expect(replacement.local.localNodeCount).toBe(0);
    expect(replacement.local.recordId).toBe('fics-game:new-source');
});

test('main line stays visible while a reusable multi-ply variation supports branch navigation', async ({ page }) => {
    const pgn = `[Result "1-0"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6
6. Be3 g6 7. Be2 Bg7 8. O-O O-O 9. Qd2 Ng4 10. Rfd1 1-0`;
    await openFicsAnalysis(page, pgn, { result: '1-0' });
    await page.evaluate(() => {
        for (const key of Object.keys(window.__ficsIsolation.counts)) {
            window.__ficsIsolation.counts[key] = 0;
        }
    });
    const immutableBefore = await page.evaluate(() => ({
        pgn: AnalyzeSection.loadedGame.pgn,
        result: AnalyzeSection.loadedGame.result,
        sans: [...AnalyzeSection.loadedGame.movesSan],
        verbose: AnalyzeSection.loadedGame.movesVerbose.map(move => ({ ...move }))
    }));

    await page.evaluate(() => AnalyzeSection.jumpToMove(17));
    expect(await page.evaluate(() => AnalyzeSection.playStudyMove('e3', 'f4'))).toBe(true);
    expect(await page.evaluate(() => AnalyzeSection.playStudyMove('e7', 'e5'))).toBe(true);
    expect((await isolationSnapshot(page)).counts)
        .toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });

    await expect(page.locator('#analyzeMoveList [data-node-id="original-19"]')).toHaveText('Rfd1');
    await expect(page.locator('#analyzeMoveList .fics-analysis-variation')).toContainText('(10.');
    await expect(page.locator('#analyzeMoveList .fics-analysis-variation')).toContainText(/Bf4.*e5/);
    await expect(page.locator('#analyzeMoveList [data-node-id="local-2"]')).toHaveClass(/active/);

    const presentation = await page.locator('#analyzeMoveList .fics-analysis-variation').first().evaluate(element => {
        const move = element.querySelector('.move-white, .move-black');
        const style = getComputedStyle(move);
        return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            marginLeft: getComputedStyle(element).marginLeft,
            overflow: element.scrollWidth > element.clientWidth
        };
    });
    expect(presentation).toMatchObject({ fontSize: '18px', fontWeight: '600', overflow: false });
    expect(Number.parseFloat(presentation.marginLeft)).toBeGreaterThan(0);

    await page.locator('#analyzeMoveList [data-node-id="original-19"]').click();
    expect(await page.evaluate(() => AnalyzeSection.getLoadedMoves())).toEqual(
        ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6',
            'Be3', 'g6', 'Be2', 'Bg7', 'O-O', 'O-O', 'Qd2', 'Ng4', 'Rfd1']);
    await page.locator('#analyzeMoveList [data-node-id="local-1"]').click();
    expect(await page.evaluate(() => AnalyzeSection.getLoadedMoves().slice(-2))).toEqual(['Bf4', 'e5']);

    await page.locator('#analyzeNavPrev').click();
    expect(await page.evaluate(() => AnalyzeSection.ficsLocalAnalysis.inspect().currentNodeId))
        .toBe('original-18');
    await page.locator('#analyzeNavNext').click();
    expect(await page.evaluate(() => AnalyzeSection.ficsLocalAnalysis.getCurrentNode().san)).toBe('Bf4');
    await page.locator('#analyzeNavLast').click();
    expect(await page.evaluate(() => AnalyzeSection.ficsLocalAnalysis.getCurrentNode().san)).toBe('e5');
    await page.locator('#analyzeNavFirst').click();
    expect(await page.evaluate(() => AnalyzeSection.currentMoveIndex)).toBe(-1);

    await page.evaluate(() => AnalyzeSection.jumpToFicsAnalysisNode('original-18'));
    await page.evaluate(() => {
        for (const key of Object.keys(window.__ficsIsolation.counts)) {
            window.__ficsIsolation.counts[key] = 0;
        }
    });
    expect(await page.evaluate(() => AnalyzeSection.playStudyMove('e3', 'f4'))).toBe(true);
    const afterReuse = await page.evaluate(() => AnalyzeSection.ficsLocalAnalysis.inspect());
    expect(afterReuse.localNodeCount).toBe(2);
    expect((await isolationSnapshot(page)).counts)
        .toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });

    const immutableAfter = await page.evaluate(() => ({
        pgn: AnalyzeSection.loadedGame.pgn,
        result: AnalyzeSection.loadedGame.result,
        sans: [...AnalyzeSection.loadedGame.movesSan],
        verbose: AnalyzeSection.loadedGame.movesVerbose.map(move => ({ ...move }))
    }));
    expect(immutableAfter).toEqual(immutableBefore);
});

test('castling, en passant, and promotion stay legal and local in FICS Analysis', async ({ page }) => {
    const cases = [
        {
            pgn: '[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]\n[Result "*"]\n\n*',
            move: ['e1', 'g1'], expected: 'O-O'
        },
        {
            pgn: '[SetUp "1"]\n[FEN "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2"]\n[Result "*"]\n\n*',
            move: ['e5', 'd6'], expected: 'exd6'
        }
    ];
    for (const entry of cases) {
        await openFicsAnalysis(page, entry.pgn);
        const moved = await page.evaluate(([from, to]) => AnalyzeSection.playStudyMove(from, to), entry.move);
        expect(moved).toBe(true);
        expect((await page.evaluate(() => AnalyzeSection.getLoadedMoves().at(-1)))).toContain(entry.expected);
        expect((await isolationSnapshot(page)).counts)
            .toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });
    }

    await openFicsAnalysis(page,
        '[SetUp "1"]\n[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n[Result "*"]\n\n*');
    const promotion = await page.evaluate(() => {
        const requested = AnalyzeSection.handleAnalyzeBoardMoveAttempt({ from: 'a7', to: 'a8', inputMethod: 'drag' });
        const options = [...document.querySelectorAll('.promotion-btn')].map(button => button.dataset.piece).filter(Boolean);
        const completed = AnalyzeSection.completePromotion('q');
        return { requested, options, completed, move: AnalyzeSection.getLoadedMoves().at(-1),
            piece: AnalyzeSection.getGame().get('a8') };
    });
    expect(promotion.requested).toBe(false);
    expect(new Set(promotion.options)).toEqual(new Set(['q', 'r', 'b', 'n']));
    expect(promotion.completed).toBe(true);
    expect(promotion.move).toContain('=Q');
    expect(promotion.piece).toMatchObject({ type: 'q', color: 'w' });
    expect((await isolationSnapshot(page)).counts)
        .toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });
});

test('leaving FICS Analysis disposes the local branch and restores untouched FICS state', async ({ page }) => {
    await openFicsAnalysis(page, '1. e4 e5 2. Nf3 Nc6');
    expect(await page.evaluate(() => AnalyzeSection.playStudyMove('f1', 'b5'))).toBe(true);
    await page.evaluate(() => CaissaNavigation.navigateToSection('fics'));
    await expect(page.locator('#ficsSection')).toHaveClass(/active/);
    const after = await page.evaluate(() => ({
        local: AnalyzeSection.ficsLocalAnalysis,
        loadedGame: AnalyzeSection.loadedGame,
        pendingPromotion: AnalyzeSection.pendingPromotion,
        sourceMarker: document.getElementById('analyzeSection').dataset.caissaAnalyzeSource || null
    }));
    expect(after).toEqual({ local: null, loadedGame: null, pendingPromotion: null, sourceMarker: null });
    const isolated = await isolationSnapshot(page);
    expect(isolated.counts).toEqual({ send: 0, sendMove: 0, sendCommand: 0, webSocket: 0 });
    expect(isolated.pendingMove).toBe(isolated.before.pendingMove);
    expect(isolated.liveGame).toBe(isolated.before.liveGame);
});
