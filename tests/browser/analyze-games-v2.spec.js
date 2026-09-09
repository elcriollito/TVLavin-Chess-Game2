import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const URL_PGN = `[Event "A3 URL Import"]
[Site "https://lichess.org/8fuPHGyu"]
[Date "2026.09.09"]
[White "URL White"]
[Black "URL Black"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0`;

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

    await page.locator('#analyzeGameUrl').fill('https://www.chess.com/game/live/123456789');
    await page.locator('#analyzeGameUrlLoad').click();
    await expect(page.locator('#analyzeGameUrlMessage')).toHaveText(
        "Direct Chess.com game links cannot currently be imported through Chess.com's public API. Search by username instead."
    );
    await expect(page.locator('#analyzeGameUrlChessComAction')).toBeVisible();
    await page.locator('#analyzeGameUrlChessComAction').click();
    await expect(page.locator('#analyzePanelChessCom')).toBeVisible();
    await expect(page.locator('#analyzeUsername')).toBeFocused();
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

for (const viewport of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }]) {
    test(`A3 Game URL layout is contained at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await openGames(page);
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
        expect(geometry.board.width).toBeGreaterThan(geometry.workspace.width);
        expect(geometry.board.right).toBeLessThan(geometry.workspace.left);
        expect(geometry.gamePanel.left).toBeGreaterThanOrEqual(geometry.workspace.left);
        expect(geometry.gamePanel.right).toBeLessThanOrEqual(geometry.workspace.right);
        expect(geometry.workspace.right).toBeLessThanOrEqual(geometry.viewportWidth);

        if (testInfo.project.name === 'chromium') {
            await mkdir('test-results/analyze-v2-a3', { recursive: true });
            await page.screenshot({
                path: `test-results/analyze-v2-a3/game-url-${viewport.width}x${viewport.height}.png`,
                animations: 'disabled'
            });
        }
    });
}
