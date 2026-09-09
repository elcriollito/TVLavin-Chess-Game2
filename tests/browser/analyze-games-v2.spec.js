import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const URL_PGN = `[Event "A3 URL Import"]
[Site "https://lichess.org/8fuPHGyu"]
[Date "2026.09.09"]
[White "URL White"]
[Black "URL Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0`;

const CHESS_COM_DIRECT_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.04.19"]
[White "TVLAVIN"]
[Black "kopi_walet"]
[Result "0-1"]
[Termination "kopi_walet won on time"]

1. d4 d6 2. Nf3 Nf6 3. Nc3 g6 0-1`;

const CHESS_COM_PGN = `[Event "A3 Chess.com Account"]
[Site "Chess.com"]
[Date "2026.09.08"]
[White "Account White"]
[Black "Account Black"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;

const LICHESS_ACCOUNT_PGN = `[Event "A3 Lichess Account"]
[Site "Lichess"]
[Date "2026.09.07"]
[White "Lichess White"]
[Black "Lichess Black"]
[Result "1/2-1/2"]

1. c4 e5 2. Nc3 Nf6 1/2-1/2`;

const EXISTING_GAME_PGN = `[Event "Previous Analysis"]
[Site "CAISSA"]
[Date "2026.09.09"]
[White "Previous White"]
[Black "Previous Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *`;

async function openGames(page) {
    await page.goto('/analyze');
    await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'analyze');
    await expect.poll(() => page.evaluate(() => Boolean(window.AnalyzeSection?.getGame?.()))).toBe(true);
    await page.locator('#analyzeV2TabGames').click();
    await expect(page.locator('#analyzeV2PanelGames')).toBeVisible();
    await expect(page.locator('#analyzePanelGameUrl')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test('A3 Game URL imports through the authoritative session and fails atomically', async ({ page }) => {
    await page.route('https://lichess.org/game/export/**', async route => {
        const id = new URL(route.request().url()).pathname.split('/').pop();
        await route.fulfill({
            status: 200,
            contentType: 'application/x-chess-pgn',
            body: id === 'BADPGN12' ? 'not a PGN' : URL_PGN
        });
    });
    await openGames(page);
    await page.evaluate(() => {
        window.__a3InitialGame = window.AnalyzeSection.loadedGame.game;
        window.__a3InitialBoard = window.AnalyzeSection.board;
        window.__a3InitialEngine = window.AnalyzeSection.analysisEngine;
        window.__a3Refreshes = 0;
        window.AnalyzeSection.liveEngineEnabled = true;
        window.AnalyzeSection.refreshLiveEvaluation = () => { window.__a3Refreshes += 1; };
    });

    await page.locator('#analyzeGameUrl').fill('lichess.org/8fuPHGyuABCD/white?foo=bar#moves');
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('URL White');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('URL Black');
    await expect(page.locator('#analyzeMoveList')).toContainText('e4');
    const success = await page.evaluate(() => ({
        normalizedUrl: document.querySelector('#analyzeGameUrl').value,
        sameChessOwner: AnalyzeSection.loadedGame.game === AnalyzeSection.session.game,
        sameBoard: AnalyzeSection.board === window.__a3InitialBoard,
        sameEngine: AnalyzeSection.analysisEngine === window.__a3InitialEngine,
        currentMoveIndex: AnalyzeSection.currentMoveIndex,
        refreshes: window.__a3Refreshes,
        source: AnalyzeSection.loadedGame.source
    }));
    expect(success).toMatchObject({
        normalizedUrl: 'https://lichess.org/8fuPHGyu',
        sameChessOwner: true,
        sameBoard: true,
        sameEngine: true,
        currentMoveIndex: 4,
        refreshes: 1,
        source: 'Lichess Game URL'
    });

    await page.locator('#analyzeV2TabGames').click();
    await page.locator('#analyzeGameUrl').fill('https://lichess.org/BADPGN12');
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeGameUrlMessage')).toContainText('invalid game record');
    await expect(page.locator('#analyzeV2PanelGames')).toBeVisible();
    expect(await page.evaluate(() => AnalyzeSection.loadedGame.game === AnalyzeSection.session.game)).toBe(true);
    expect(await page.locator('#analyzeWhitePlayer').textContent()).toBe('URL White');

    await page.locator('#analyzeGameUrl').fill('https://example.com/8fuPHGyu');
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeGameUrlMessage')).toContainText('Only public Lichess and Chess.com');

});

test('V2.0.1 imports an exact Chess.com game URL through the authoritative PGN pipeline', async ({ page }) => {
    const requests = [];
    await page.route('https://api.chess.com/pub/player/tvlavin/games/**', async route => {
        const url = route.request().url();
        requests.push(url);
        if (url.endsWith('/archives')) return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ archives: [
                'https://api.chess.com/pub/player/tvlavin/games/2026/03',
                'https://api.chess.com/pub/player/tvlavin/games/2026/04',
                'https://api.chess.com/pub/player/tvlavin/games/2026/05'
            ] })
        });
        if (url.endsWith('/2026/05')) return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ games: [{
                url: 'https://www.chess.com/game/live/999999999999',
                pgn: CHESS_COM_DIRECT_PGN,
                white: { username: 'TVLAVIN' },
                black: { username: 'someone_else' }
            }] })
        });
        if (url.endsWith('/2026/04')) return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ games: [{
                url: 'https://www.chess.com/game/live/170875822747',
                pgn: CHESS_COM_DIRECT_PGN,
                white: { username: 'TVLAVIN' },
                black: { username: 'kopi_walet' }
            }] })
        });
        throw new Error(`unexpected request: ${url}`);
    });
    await openGames(page);
    await page.evaluate(() => {
        window.__v201InitialBoard = AnalyzeSection.board;
        window.__v201InitialEngine = AnalyzeSection.analysisEngine;
        window.__v201Refreshes = 0;
        AnalyzeSection.liveEngineEnabled = true;
        AnalyzeSection.refreshLiveEvaluation = () => { window.__v201Refreshes += 1; };
    });

    await page.locator('#analyzeGameUrl').fill(
        'https://chess.com/game/live/170875822747?utm_source=share&username=TVLAVIN'
    );
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('TVLAVIN');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('kopi_walet');
    await expect(page.locator('#analyzeGameResult')).toHaveText('0-1');
    await expect(page.locator('#analyzeMoveList')).toContainText('d4');
    expect(requests).toEqual([
        'https://api.chess.com/pub/player/tvlavin/games/archives',
        'https://api.chess.com/pub/player/tvlavin/games/2026/05',
        'https://api.chess.com/pub/player/tvlavin/games/2026/04'
    ]);
    expect(await page.evaluate(() => ({
        normalizedUrl: document.querySelector('#analyzeGameUrl').value,
        source: AnalyzeSection.loadedGame.source,
        recordId: AnalyzeSection.loadedGame.recordId,
        oneChessOwner: AnalyzeSection.loadedGame.game === AnalyzeSection.session.game,
        sameBoard: AnalyzeSection.board === window.__v201InitialBoard,
        sameEngine: AnalyzeSection.analysisEngine === window.__v201InitialEngine,
        refreshes: window.__v201Refreshes
    }))).toEqual({
        normalizedUrl: 'https://www.chess.com/game/live/170875822747?username=tvlavin',
        source: 'Chess.com Game URL',
        recordId: '170875822747',
        oneChessOwner: true,
        sameBoard: true,
        sameEngine: true,
        refreshes: 1
    });
});

test('V2.0.1 live golden Chess.com URL resolves through the public PubAPI', async ({ page }) => {
    test.skip(process.env.CAISSA_LIVE_CHESSCOM !== '1', 'Opt-in live provider contract');
    const apiRequests = [];
    page.on('request', request => {
        if (request.url().startsWith('https://api.chess.com/pub/player/tvlavin/games/')) {
            apiRequests.push(request.url());
        }
    });
    await openGames(page);
    await page.evaluate(() => { window.__v201LiveEngineOwner = AnalyzeSection.analysisEngine; });
    await page.locator('#analyzeGameUrl').fill(
        'https://www.chess.com/game/live/170875822747?username=tvlavin'
    );
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('TVLAVIN');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('kopi_walet');
    await expect(page.locator('#analyzeGameResult')).toHaveText('0-1');
    await expect(page.locator('#analyzeMoveList')).toContainText('d4');
    await expect.poll(() => page.evaluate(() => Boolean(AnalyzeSection.analysisEngine)), { timeout: 15_000 }).toBe(true);
    const liveState = await page.evaluate(() => ({
        date: AnalyzeSection.loadedGame.date,
        source: AnalyzeSection.loadedGame.source,
        pgnValid: AnalyzeSection.loadedGame.game === AnalyzeSection.session.game,
        engineOn: AnalyzeSection.liveEngineEnabled,
        oneEngineOwner: Boolean(AnalyzeSection.analysisEngine),
        previousEngineReused: !window.__v201LiveEngineOwner
            || AnalyzeSection.analysisEngine === window.__v201LiveEngineOwner
    }));
    expect(liveState).toEqual({
        date: '2026.04.19',
        source: 'Chess.com Game URL',
        pgnValid: true,
        engineOn: true,
        oneEngineOwner: true,
        previousEngineReused: true
    });
    expect(apiRequests[0]).toBe('https://api.chess.com/pub/player/tvlavin/games/archives');
    expect(apiRequests.at(-1)).toBe('https://api.chess.com/pub/player/tvlavin/games/2026/04');
    console.log(`[V2.0.1 live] Chess.com PubAPI requests: ${apiRequests.length}`);
});

test('V2.0.1 requests a missing Chess.com username inline and resolves with either player', async ({ page }) => {
    let requests = 0;
    await page.route('https://api.chess.com/pub/player/kopi_walet/games/**', async route => {
        requests += 1;
        if (route.request().url().endsWith('/archives')) return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ archives: ['https://api.chess.com/pub/player/kopi_walet/games/2026/04'] })
        });
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ games: [{
                url: 'https://www.chess.com/game/live/170875822747',
                pgn: CHESS_COM_DIRECT_PGN,
                white: { username: 'TVLAVIN' },
                black: { username: 'kopi_walet' }
            }] })
        });
    });
    await openGames(page);
    await page.locator('#analyzeGameUrl').fill('https://www.chess.com/game/live/170875822747');
    await expect(page.locator('#analyzeGameUrlChessComUsernameGroup')).toBeVisible();
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeGameUrlMessage')).toHaveText("Enter either player's Chess.com username.");
    await expect(page.locator('#analyzeGameUrlChessComUsername')).toBeFocused();
    expect(requests).toBe(0);
    await page.locator('#analyzeGameUrlChessComUsername').fill('KOPI_WALET');
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('TVLAVIN');
    await expect(page.locator('#analyzeBlackPlayer')).toHaveText('kopi_walet');
    expect(requests).toBe(2);
});

test('V2.0.1 reports a wrong player atomically and aborts a stale search when the URL changes', async ({ page }) => {
    await page.route('https://api.chess.com/pub/player/wrong_player/games/**', async route => {
        if (route.request().url().endsWith('/archives')) return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ archives: ['https://api.chess.com/pub/player/wrong_player/games/2026/04'] })
        });
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ games: [{
                url: 'https://www.chess.com/game/live/170875822747',
                pgn: CHESS_COM_DIRECT_PGN,
                white: { username: 'TVLAVIN' },
                black: { username: 'kopi_walet' }
            }] })
        });
    });
    await openGames(page);
    await page.evaluate(() => {
        window.__v201PreviousSession = AnalyzeSection.session;
        window.__v201PreviousGame = AnalyzeSection.loadedGame.game;
        window.__v201Aborted = false;
        const importer = window.CaissaAnalyzeGameImport;
        window.CaissaAnalyzeGameImport = Object.freeze({
            ...importer,
            resolve(rawUrl, options) {
                if (!rawUrl.includes('slow_player')) return importer.resolve(rawUrl, options);
                return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
                    window.__v201Aborted = true;
                    reject(Object.assign(new Error('aborted'), { code: 'ABORTED' }));
                }, { once: true }));
            }
        });
    });

    await page.locator('#analyzeGameUrl').fill('https://www.chess.com/game/live/170875822747?username=slow_player');
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeGameUrlMessage')).toContainText('Searching Chess.com games');
    await page.locator('#analyzeGameUrl').fill('https://www.chess.com/game/live/170875822747?username=wrong_player');
    await expect.poll(() => page.evaluate(() => window.__v201Aborted)).toBe(true);
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeGameUrlMessage')).toHaveText(
        "That game was not found in this player's public archives."
    );
    expect(await page.evaluate(() => ({
        sameSession: AnalyzeSection.session === window.__v201PreviousSession,
        sameGame: AnalyzeSection.loadedGame.game === window.__v201PreviousGame,
        controllerCleared: AnalyzeSection.gameUrlAbortController === null
    }))).toEqual({ sameSession: true, sameGame: true, controllerCleared: true });
});

test('A3.1 New opens a clean draft, cancel preserves the previous session, and Load commits', async ({ page }) => {
    await page.goto('/analyze');
    await expect.poll(() => page.evaluate(() => Boolean(window.AnalyzeSection?.getGame?.()))).toBe(true);
    await page.evaluate((pgn) => {
        window.AnalyzeSection.loadGameFromPgn(pgn, 'A3.1 fixture');
        window.__a31PreviousSession = window.AnalyzeSection.session;
        window.__a31PreviousGame = window.AnalyzeSection.loadedGame.game;
        window.__a31PreviousBoard = window.AnalyzeSection.board;
        window.__a31PreviousEngine = window.AnalyzeSection.analysisEngine;
        window.__a31PreviousFen = window.AnalyzeSection.getGame().fen();
    }, EXISTING_GAME_PGN);

    await page.locator('#analyzeNewBtn').click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    const cleanDraft = await page.evaluate(() => ({
        fen: AnalyzeSection.setupDraft.toFen(),
        fenInput: document.querySelector('#analyzeSetupFen').value,
        pgn: document.querySelector('#analyzePgnInput').value,
        turn: document.querySelector('#analyzeSetupTurn').value,
        castling: [...document.querySelectorAll('[data-setup-castling]')].map(input => [input.dataset.setupCastling, input.checked]),
        sessionPreserved: AnalyzeSection.session === window.__a31PreviousSession,
        gamePreserved: AnalyzeSection.loadedGame.game === window.__a31PreviousGame,
        boardPreserved: AnalyzeSection.board === window.__a31PreviousBoard,
        enginePreserved: AnalyzeSection.analysisEngine === window.__a31PreviousEngine
    }));
    expect(cleanDraft).toEqual({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenInput: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        turn: 'w',
        castling: [['K', true], ['Q', true], ['k', true], ['q', true]],
        sessionPreserved: true,
        gamePreserved: true,
        boardPreserved: true,
        enginePreserved: true
    });

    await page.locator('#analyzeSetupClear').click();
    await page.locator('#analyzeSetupBack').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    expect(await page.evaluate(() => ({
        sameSession: AnalyzeSection.session === window.__a31PreviousSession,
        sameGame: AnalyzeSection.loadedGame.game === window.__a31PreviousGame,
        fen: AnalyzeSection.getGame().fen(),
        white: AnalyzeSection.loadedGame.white,
        black: AnalyzeSection.loadedGame.black
    }))).toEqual({
        sameSession: true,
        sameGame: true,
        fen: await page.evaluate(() => window.__a31PreviousFen),
        white: 'Previous White',
        black: 'Previous Black'
    });

    await page.locator('#analyzeV2TabSetup').click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
    expect(await page.evaluate(() => AnalyzeSection.setupDraft.toFen())).toBe(
        await page.evaluate(() => window.__a31PreviousFen)
    );
    await page.locator('#analyzeSetupBack').click();

    await page.locator('#analyzeNewBtn').click();
    await page.locator('#analyzeSetupLoad').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    expect(await page.evaluate(() => ({
        fen: AnalyzeSection.getGame().fen(),
        initialFen: AnalyzeSection.loadedGame.initialFen,
        pgn: AnalyzeSection.loadedGame.pgn,
        source: AnalyzeSection.loadedGame.source,
        white: AnalyzeSection.loadedGame.white,
        black: AnalyzeSection.loadedGame.black,
        result: AnalyzeSection.loadedGame.result,
        newSession: AnalyzeSection.session !== window.__a31PreviousSession,
        newGame: AnalyzeSection.loadedGame.game !== window.__a31PreviousGame,
        sameBoard: AnalyzeSection.board === window.__a31PreviousBoard,
        oneChessOwner: AnalyzeSection.loadedGame.game === AnalyzeSection.session.game
    }))).toEqual({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        pgn: '',
        source: 'Setup Position',
        white: 'White',
        black: 'Black',
        result: '*',
        newSession: true,
        newGame: true,
        sameBoard: true,
        oneChessOwner: true
    });
});

test('A3 Chess.com and Lichess account tabs retain their supported history paths', async ({ page }) => {
    await page.route('https://api.chess.com/pub/player/hikaru/games/archives', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ archives: ['https://api.chess.com/pub/player/hikaru/games/2026/09'] })
    }));
    await page.route('https://api.chess.com/pub/player/hikaru/games/2026/09', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ games: [{ pgn: CHESS_COM_PGN }] })
    }));
    await page.route('https://lichess.org/api/games/user/DrNykterstein**', route => route.fulfill({
        status: 200,
        contentType: 'application/x-chess-pgn',
        body: LICHESS_ACCOUNT_PGN
    }));

    await openGames(page);
    await page.locator('#analyzeChessComTab').click();
    await expect(page.locator('#analyzePanelChessCom')).toBeVisible();
    await page.locator('#analyzeUsername').fill('hikaru');
    await page.locator('#analyzeFetchBtn').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('Account White');
    expect(await page.evaluate(() => AnalyzeSection.loadedGame.game === AnalyzeSection.session.game)).toBe(true);

    await page.locator('#analyzeV2TabGames').click();
    await page.locator('#analyzeLichessTab').click();
    await expect(page.locator('#analyzePanelLichess')).toBeVisible();
    await page.locator('#analyzeLichessUsername').fill('DrNykterstein');
    await page.locator('#analyzeLichessFetchBtn').click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    await expect(page.locator('#analyzeWhitePlayer')).toHaveText('Lichess White');
    expect(await page.evaluate(() => AnalyzeSection.loadedGame.game === AnalyzeSection.session.game)).toBe(true);
});

for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    test(`V2.0.1 Game URL layout is contained at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await openGames(page);
        await page.locator('#analyzeGameUrl').fill('https://www.chess.com/game/live/170875822747');
        await page.locator('#analyzeGameUrlLoad').click();
        await expect(page.locator('#analyzeGameUrlChessComUsernameGroup')).toBeVisible();
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('#analyzeChessboard').getBoundingClientRect();
            const workspace = document.querySelector('.caissa-analyze-v2__workspace').getBoundingClientRect();
            const gamePanel = document.querySelector('#analyzePanelGameUrl').getBoundingClientRect();
            return {
                board: { left: board.left, right: board.right, width: board.width },
                workspace: { left: workspace.left, right: workspace.right, width: workspace.width },
                gamePanel: { left: gamePanel.left, right: gamePanel.right },
                viewportWidth: window.innerWidth
            };
        });
        if (viewport.width > 800) {
            expect(geometry.board.width).toBeGreaterThan(geometry.workspace.width);
            expect(geometry.board.right).toBeLessThan(geometry.workspace.left);
        }
        expect(geometry.gamePanel.left).toBeGreaterThanOrEqual(geometry.workspace.left);
        expect(geometry.gamePanel.right).toBeLessThanOrEqual(geometry.workspace.right);
        expect(geometry.workspace.right).toBeLessThanOrEqual(geometry.viewportWidth);

        if (testInfo.project.name === 'chromium') {
            await mkdir('test-results/analyze-v2.0.1-chesscom-url', { recursive: true });
            await page.screenshot({
                path: `test-results/analyze-v2.0.1-chesscom-url/game-url-${viewport.width}x${viewport.height}.png`,
                animations: 'disabled'
            });
        }
    });
}
