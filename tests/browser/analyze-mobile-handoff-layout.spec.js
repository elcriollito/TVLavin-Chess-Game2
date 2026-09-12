import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Chess } from 'chess.js';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const START_FEN = new Chess().fen();
const EVIDENCE_DIRECTORY = join(tmpdir(), 'caissa-analyze-mobile-handoff-001');

function gameLine(sans) {
    const game = new Chess();
    return sans.map((san, index) => {
        const played = game.move(san);
        return {
            moveNumber: Math.floor(index / 2) + 1,
            color: played.color === 'w' ? 'white' : 'black',
            san: played.san,
            fen: game.fen()
        };
    });
}

async function openCompletedFicsHandoff(page, viewport) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
    const moves = gameLine(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']);
    await page.evaluate(({ moves, initialFen }) => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true,
            authenticated: true,
            connectionState: 'connected',
            loginMode: 'guest',
            ficsUsername: 'GuestMobile',
            sessionGeneration: 18,
            gameActive: false,
            myColor: null,
            moveHistory: moves.map(move => ({ ...move })),
            pgnStartFen: initialFen,
            pgnResult: '1-0',
            pendingMove: null,
            pendingPromotionMove: null,
            pendingGameActions: { resign: false, draw: false },
            liveGame: {
                ...client.createEmptyLiveGameState('ended'),
                gameNumber: 901,
                whiteName: 'GuestMobile',
                blackName: 'Opponent',
                userColor: null,
                relation: 0,
                sideToMove: moves.at(-1).fen.split(' ')[1],
                whiteClock: 280,
                blackClock: 276,
                currentFen: moves.at(-1).fen,
                gameActive: false,
                observedGame: false,
                status: 'ended',
                result: '1-0',
                resultModel: {
                    result: '1-0',
                    winner: 'GuestMobile',
                    loser: 'Opponent',
                    terminationReason: 'CHECKMATE',
                    terminal: true,
                    summary: 'GuestMobile won by checkmate.'
                }
            }
        });
        client.chess?.load?.(client.liveGame.currentFen);
        client.updatePlayerBars();
        window.CaissaFICSShell.refresh();
    }, { moves, initialFen: START_FEN });

    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => window.AnalyzeSection?.loadedGame?.source))
        .toBe('FICS handoff');
    return moves;
}

async function compactLayoutSnapshot(page) {
    return page.evaluate(() => {
        let floatingHost = document.querySelector('.caissa-floating-controls');
        if (!floatingHost) {
            floatingHost = document.createElement('div');
            floatingHost.className = 'caissa-floating-controls';
            document.body.appendChild(floatingHost);
        }
        for (const [className, label] of [
            ['caissa-mentor-launcher', 'Mentor'],
            ['caissa-manual-qa-launcher', 'Report an Issue']
        ]) {
            if (!floatingHost.querySelector(`.${className}`)) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = className;
                button.textContent = label;
                floatingHost.appendChild(button);
            }
        }
        const visible = element => {
            if (!element) return false;
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
                && box.width > 0 && box.height > 0;
        };
        const rect = selector => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, left: box.left, right: box.right,
                width: box.width, height: box.height };
        };
        const selectors = {
            board: '#analyzeChessboard',
            nav: '.analyze-board-controls',
            tabs: '.caissa-analyze-v2__tabs',
            engine: '.caissa-analyze-v2__engine-strip',
            notation: '#analyzeMoveList'
        };
        const nodes = Object.fromEntries(Object.entries(selectors)
            .map(([name, selector]) => [name, document.querySelector(selector)]));
        const follows = (first, second) => Boolean(nodes[first].compareDocumentPosition(nodes[second])
            & Node.DOCUMENT_POSITION_FOLLOWING);
        const quickActions = [...document.querySelectorAll('.mobile-quick-btn')];
        const floating = [...document.querySelectorAll(
            '.caissa-mentor-launcher, .caissa-manual-qa-launcher'
        )];
        const previouslyFocused = document.activeElement;
        const focusableHiddenQuickActions = quickActions.filter(element => {
            if (!element.hidden) return false;
            element.focus();
            return document.activeElement === element;
        }).length;
        const focusableFloating = floating.filter(element => {
            element.focus();
            return document.activeElement === element;
        }).length;
        previouslyFocused?.focus?.();
        return {
            layout: document.querySelector('[data-caissa-analyze-v2]').dataset.analyzeMobileLayout,
            rectangles: Object.fromEntries(Object.entries(selectors)
                .map(([name, selector]) => [name, rect(selector)])),
            domOrder: follows('board', 'nav') && follows('nav', 'tabs')
                && follows('tabs', 'engine') && follows('engine', 'notation'),
            navigationParent: nodes.nav.parentElement.className,
            visibleBoards: [...document.querySelectorAll('.board-b72b1')].filter(visible).length,
            quickActionLabels: quickActions.filter(visible).map(button => button.textContent.trim()),
            focusableHiddenQuickActions,
            floatingCount: floating.length,
            visibleFloating: floating.filter(visible).length,
            focusableFloating,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            handoff: {
                source: window.AnalyzeSection.loadedGame.source,
                status: window.AnalyzeSection.loadedGame.recordStatus,
                moves: window.AnalyzeSection.loadedGame.movesSan.length,
                result: window.AnalyzeSection.loadedGame.result,
                fen: window.AnalyzeSection.loadedGame.game.fen(),
                sessionOwnsGame: window.AnalyzeSection.session?.game === window.AnalyzeSection.loadedGame.game,
                boardCount: document.querySelectorAll('#analyzeChessboard').length
            }
        };
    });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    test(`FICS handoff uses compact mobile Analyze hierarchy at ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
        const moves = await openCompletedFicsHandoff(page, viewport);
        const state = await compactLayoutSnapshot(page);
        const { board, nav, tabs, engine, notation } = state.rectangles;

        expect(state.layout).toBe('compact');
        expect(state.domOrder).toBe(true);
        expect(state.navigationParent).toContain('caissa-analyze-v2__workspace');
        expect(board.top).toBeLessThan(nav.top);
        expect(nav.bottom).toBeLessThanOrEqual(tabs.top + 1);
        expect(tabs.bottom).toBeLessThanOrEqual(engine.top + 1);
        expect(engine.bottom).toBeLessThanOrEqual(notation.top + 1);
        expect(state.visibleBoards).toBe(1);
        expect(state.quickActionLabels).toEqual(['Engine', 'Menu']);
        expect(state.focusableHiddenQuickActions).toBe(0);
        expect(state.floatingCount).toBeGreaterThanOrEqual(2);
        expect(state.visibleFloating).toBe(0);
        expect(state.focusableFloating).toBe(0);
        expect(state.overflow).toBeLessThanOrEqual(1);
        expect(state.handoff).toEqual({
            source: 'FICS handoff', status: 'complete', moves: moves.length,
            result: '1-0', fen: moves.at(-1).fen, sessionOwnsGame: true, boardCount: 1
        });

        const beforeIndex = await page.evaluate(() => window.AnalyzeSection.currentMoveIndex);
        await page.getByRole('button', { name: 'Previous move' }).click();
        expect(await page.evaluate(() => window.AnalyzeSection.currentMoveIndex)).toBe(beforeIndex - 1);

        const axe = await new AxeBuilder({ page }).include('#analyzeSection').analyze();
        expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);

        await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
        await page.screenshot({
            path: join(EVIDENCE_DIRECTORY, `after-${browserName}-${viewport.width}x${viewport.height}.png`),
            fullPage: true,
            animations: 'disabled'
        });
    });
}

test('responsive transition restores desktop ownership and landscape has no horizontal overflow', async ({ page }) => {
    await openCompletedFicsHandoff(page, { width: 390, height: 844 });
    await compactLayoutSnapshot(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect.poll(() => page.evaluate(() =>
        document.querySelector('[data-caissa-analyze-v2]').dataset.analyzeMobileLayout)).toBe('desktop');
    expect(await page.evaluate(() => {
        const visible = element => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
                && box.width > 0 && box.height > 0;
        };
        return [...document.querySelectorAll('.caissa-mentor-launcher, .caissa-manual-qa-launcher')]
            .filter(visible).length;
    })).toBe(2);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => page.evaluate(() =>
        document.querySelector('[data-caissa-analyze-v2]').dataset.analyzeMobileLayout)).toBe('desktop');
    const desktop = await page.evaluate(() => ({
        parent: document.querySelector('.analyze-board-controls').parentElement.className,
        firstFooterChild: document.querySelector('.caissa-analyze-v2__footer').firstElementChild.className,
        boardLeft: document.getElementById('analyzeChessboard').getBoundingClientRect().left,
        workspaceLeft: document.querySelector('.caissa-analyze-v2__workspace').getBoundingClientRect().left,
        moves: window.AnalyzeSection.loadedGame.movesSan.length
    }));
    expect(desktop.parent).toContain('caissa-analyze-v2__footer');
    expect(desktop.firstFooterChild).toContain('analyze-board-controls');
    expect(desktop.boardLeft).toBeLessThan(desktop.workspaceLeft);
    expect(desktop.moves).toBe(10);

    await page.setViewportSize({ width: 844, height: 390 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
});
