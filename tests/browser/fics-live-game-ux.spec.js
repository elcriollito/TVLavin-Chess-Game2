import { test, expect } from '@playwright/test';

const viewports = [
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 }
];

for (const viewport of viewports) {
    test(`Classic live board fits at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto('http://127.0.0.1:8000/yahoo-classic');
        await page.waitForFunction(() => !!window.CaissaYahooClassic);
        await page.evaluate(() => {
            const section = window.CaissaYahooClassic;
            document.getElementById('yahooClassicSection')?.classList.add('active');
            section.onEnter();
            window.CaissaFICSClient = {
                authenticated: true, gameActive: true, myColor: 'black', ficsUsername: 'GuestBGCP',
                canSubmitGraphicalMove: () => true, formatClock: seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            };
            section.tableOpen = true;
            section.tableMode = 'playing';
            section.currentTableId = 10;
            section.currentTableMeta = { number: 10, timeControl: '3+2', label: 'unrated', white: 'rusalka', black: 'GuestBGCP' };
            section.liveGame = {
                gameNumber: 10, whiteName: 'rusalka', blackName: 'GuestBGCP', userColor: 'black', relation: -1,
                sideToMove: 'w', whiteClock: 39, blackClock: 0, initialTime: 3, increment: 2, rated: false,
                currentFen: 'r6r/8/8/8/8/8/8/R6R w - - 0 1', gameActive: true, observedGame: false, status: 'playing'
            };
            section.lastRenderedFen = null;
            section.render();
            document.getElementById('ycGameWindow')?.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(150);

        const geometry = await page.evaluate(() => {
            const rect = element => {
                const value = element.getBoundingClientRect();
                return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
            };
            const board = document.querySelector('#ycClassicBoard .board-b72b1');
            const pieces = [...document.querySelectorAll('#ycClassicBoard .piece-417db')];
            const boardRect = rect(board);
            return {
                board: boardRect,
                pieces: pieces.map(rect),
                topSide: document.getElementById('ycBlackPlayerBar')?.dataset.side,
                bottomSide: document.getElementById('ycWhitePlayerBar')?.dataset.side,
                mode: document.getElementById('ycGameHeaderRated')?.textContent,
                ratedOptionChecked: document.getElementById('ycTableRatedStatus')?.checked,
                ratedOptionLabel: document.getElementById('ycTableRatedLabel')?.textContent,
                controlsVisible: !!document.getElementById('ycResignBtn')?.offsetParent,
                movePanelVisible: !!document.getElementById('ycMoveList')?.offsetParent
            };
        });
        expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(2);
        expect(geometry.board.width).toBeLessThanOrEqual(620);
        expect(geometry.board.bottom).toBeLessThanOrEqual(viewport.height + 1);
        expect(geometry.topSide).toBe('white');
        expect(geometry.bottomSide).toBe('black');
        expect(geometry.mode).toBe('Unrated');
        expect(geometry.ratedOptionChecked).toBe(false);
        expect(geometry.ratedOptionLabel).toBe('Unrated Game');
        expect(geometry.controlsVisible).toBe(true);
        expect(geometry.movePanelVisible).toBe(true);
        for (const piece of geometry.pieces) {
            expect(piece.left).toBeGreaterThanOrEqual(geometry.board.left - 1);
            expect(piece.top).toBeGreaterThanOrEqual(geometry.board.top - 1);
            expect(piece.right).toBeLessThanOrEqual(geometry.board.right + 1);
            expect(piece.bottom).toBeLessThanOrEqual(geometry.board.bottom + 1);
        }

        await page.evaluate(() => {
            const section = window.CaissaYahooClassic;
            section.liveGame.userColor = 'white';
            window.CaissaFICSClient.myColor = 'white';
            section.lastRenderedFen = null;
            section.renderGameExperience();
        });
        await expect(page.locator('#ycBlackPlayerBar')).toHaveAttribute('data-side', 'black');
        await expect(page.locator('#ycWhitePlayerBar')).toHaveAttribute('data-side', 'white');
        const whiteEdgeContainment = await page.evaluate(() => {
            const board = document.querySelector('#ycClassicBoard .board-b72b1').getBoundingClientRect();
            return [...document.querySelectorAll('#ycClassicBoard .piece-417db')].every(piece => {
                const rect = piece.getBoundingClientRect();
                return rect.left >= board.left - 1 && rect.top >= board.top - 1
                    && rect.right <= board.right + 1 && rect.bottom <= board.bottom + 1;
            });
        });
        expect(whiteEdgeContainment).toBe(true);
    });
}

test('disconnect-forfeit advisory does not expose terminal Computer Hall UI', async ({ page }) => {
    await page.goto('http://127.0.0.1:8000/yahoo-classic');
    await page.waitForFunction(() => !!window.CaissaYahooClassic && !!window.CaissaFICSClient);
    const result = await page.evaluate(() => {
        const section = window.CaissaYahooClassic;
        const client = window.CaissaFICSClient;
        document.getElementById('yahooClassicSection')?.classList.add('active');
        section.onEnter();
        client.authenticated = true;
        client.gameActive = true;
        client.liveGame = {
            ...client.liveGame, gameNumber: 25, whiteName: 'GuestSMND', blackName: 'inemuri',
            userColor: 'white', relation: 1, sideToMove: 'w', whiteClock: 180, blackClock: 180,
            initialTime: 3, increment: 2, currentFen: 'start', gameActive: true,
            observedGame: false, rated: false, result: null, resultModel: null, status: 'playing'
        };
        section.tableOpen = true;
        section.tableMode = 'playing';
        section.currentTableId = 25;
        section.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
        section.liveGame = { ...client.liveGame };
        section.render();
        let gameEnded = 0;
        window.addEventListener('caissa:fics:game-ended', () => { gameEnded += 1; });
        client.parseGameLine('Game 25: A disconnection will be considered a forfeit.');
        section.liveGame = { ...client.liveGame };
        section.renderGameExperience();
        return {
            gameEnded,
            gameActive: client.gameActive,
            status: client.liveGame.status,
            result: client.liveGame.result,
            resultModel: client.liveGame.resultModel,
            gameOverVisible: !!document.querySelector('.yc-game-over:not([hidden])'),
            resignVisible: !!document.getElementById('ycResignBtn')?.offsetParent,
            canExitTable: section.canExitTable(),
            exitDisabled: document.getElementById('ycLeaveTableBtn')?.disabled,
            gameText: document.getElementById('ycGameWindow')?.textContent || ''
        };
    });
    expect(result.gameEnded).toBe(0);
    expect(result.gameActive).toBe(true);
    expect(result.status).toBe('playing');
    expect(result.result).toBeNull();
    expect(result.resultModel).toBeNull();
    expect(result.gameOverVisible).toBe(false);
    expect(result.resignVisible).toBe(true);
    expect(result.canExitTable).toBe(false);
    expect(result.exitDisabled).toBe(true);
    expect(result.gameText).not.toContain('Game finished: *');
});
