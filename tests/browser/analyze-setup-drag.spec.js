import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { instrumentPlay, monitorRuntime } from '../play/playwright-helpers.js';

const ARTIFACTS = 'artifacts';

test.beforeEach(async ({ page }) => {
    await instrumentPlay(page, {
        bestMove: 'e2e4', candidateMoves: ['e2e4 e7e5', 'd2d4 d7d5'],
        cp: 24, continuousDepths: [4, 8], continuousDepthDelayMs: 120
    });
});

async function openSetup(page) {
    await page.goto('/analyze');
    await page.getByRole('tab', { name: 'Setup Position' }).click();
    await expect(page.locator('#analyzeV2PanelSetup')).toBeVisible();
}

async function dragPalettePiece(page, accessibleName, square) {
    const source = page.getByRole('button', { name: accessibleName });
    const target = page.locator(`#analyzeChessboard .square-${square}`);
    const [sourceBox, targetBox] = await Promise.all([source.boundingBox(), target.boundingBox()]);
    if (!sourceBox || !targetBox) throw new Error(`Could not resolve palette drag geometry for ${square}`);
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(page.locator('.caissa-analyze-v2__palette-ghost')).toBeVisible();
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await expect(target).toHaveClass(/caissa-analyze-v2__setup-drop-target/);
    await page.mouse.up();
    await expect(page.locator('.caissa-analyze-v2__palette-ghost')).toHaveCount(0);
}

async function dragBoardPiece(page, sourceSquare, target) {
    const sourceBox = await page.locator(`#analyzeChessboard .square-${sourceSquare} img`).boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error(`Could not resolve board drag geometry for ${sourceSquare}`);
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
    const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, { steps: 4 });
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
}

test('A2.1 palette drag updates the approved draft and commits through the existing session', async ({ page }) => {
    const runtime = monitorRuntime(page);
    await openSetup(page);
    const initial = await page.evaluate(() => {
        window.__a21Game = AnalyzeSection.loadedGame.game;
        window.__a21Board = AnalyzeSection.board;
        window.__a21Engine = AnalyzeSection.analysisEngine;
        window.__a21Boards = window.__caissaPlayHarness.snapshot().boardConstructions;
        window.__a21Workers = window.__caissaPlayHarness.snapshot().workersCreated;
        window.__a21ChessConstructions = 0;
        window.Chess = new Proxy(window.Chess, {
            construct(target, args, newTarget) {
                window.__a21ChessConstructions += 1;
                return Reflect.construct(target, args, newTarget);
            }
        });
        return { draftCreated: !!AnalyzeSection.setupDraft, fen: AnalyzeSection.loadedGame.game.fen() };
    });

    await dragPalettePiece(page, 'Select white queen', 'd4');
    expect(await page.evaluate(() => ({
        piece: AnalyzeSection.setupDraft.getPiece('d4'),
        fenMatches: document.getElementById('analyzeSetupFen').value === AnalyzeSection.setupDraft.toFen(),
        authorityUnchanged: AnalyzeSection.loadedGame.game === window.__a21Game,
        chessConstructions: window.__a21ChessConstructions
    }))).toEqual({ piece: 'wQ', fenMatches: true, authorityUnchanged: true, chessConstructions: 0 });

    await dragPalettePiece(page, 'Select black knight', 'c6');
    await dragPalettePiece(page, 'Select white queen', 'e5');
    expect(await page.evaluate(() => ({
        knight: AnalyzeSection.setupDraft.getPiece('c6'),
        firstQueen: AnalyzeSection.setupDraft.getPiece('d4'),
        secondQueen: AnalyzeSection.setupDraft.getPiece('e5')
    }))).toEqual({ knight: 'bN', firstQueen: 'wQ', secondQueen: 'wQ' });

    await dragBoardPiece(page, 'd4', page.locator('#analyzeChessboard .square-d5'));
    expect(await page.evaluate(() => ({
        from: AnalyzeSection.setupDraft.getPiece('d4'),
        to: AnalyzeSection.setupDraft.getPiece('d5'),
        fenMatches: document.getElementById('analyzeSetupFen').value === AnalyzeSection.setupDraft.toFen()
    }))).toEqual({ from: null, to: 'wQ', fenMatches: true });

    await dragBoardPiece(page, 'e5', page.locator('#analyzeSetupMessage'));
    expect(await page.evaluate(() => ({
        removed: AnalyzeSection.setupDraft.getPiece('e5'),
        fenMatches: document.getElementById('analyzeSetupFen').value === AnalyzeSection.setupDraft.toFen()
    }))).toEqual({ removed: null, fenMatches: true });

    const committedFen = await page.evaluate(() => AnalyzeSection.setupDraft.toFen());
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.locator('#analyzeV2PanelAnalysis')).toBeVisible();
    expect(await page.evaluate((expectedFen) => ({
        fen: AnalyzeSection.loadedGame.game.fen(),
        expectedFen,
        replacedGame: AnalyzeSection.loadedGame.game !== window.__a21Game,
        sessionOwnsGame: AnalyzeSection.session.game === AnalyzeSection.loadedGame.game,
        sameBoard: AnalyzeSection.board === window.__a21Board,
        sameEngine: AnalyzeSection.analysisEngine === window.__a21Engine,
        draftReleased: AnalyzeSection.setupDraft === null,
        chessConstructions: window.__a21ChessConstructions,
        boards: window.__caissaPlayHarness.snapshot().boardConstructions,
        workers: window.__caissaPlayHarness.snapshot().workersCreated
    }), committedFen)).toEqual({
        fen: committedFen,
        expectedFen: committedFen,
        replacedGame: true,
        sessionOwnsGame: true,
        sameBoard: true,
        sameEngine: true,
        draftReleased: true,
        chessConstructions: 1,
        boards: await page.evaluate(() => window.__a21Boards),
        workers: await page.evaluate(() => window.__a21Workers)
    });
    expect(initial.draftCreated).toBe(true);
    expect(runtime.errors).toEqual([]);
});

test('A2.1 drag cancel and click fallback do not mutate the authoritative game', async ({ page }) => {
    await openSetup(page);
    const initialFen = await page.evaluate(() => AnalyzeSection.loadedGame.game.fen());
    await dragPalettePiece(page, 'Select white queen', 'd4');
    await page.getByRole('button', { name: 'Cancel setup and return to Analysis' }).click();
    expect(await page.evaluate(() => AnalyzeSection.loadedGame.game.fen())).toBe(initialFen);

    await page.getByRole('tab', { name: 'Setup Position' }).click();
    await page.getByRole('button', { name: 'Select white queen' }).click();
    await page.locator('#analyzeChessboard .square-d4').click();
    expect(await page.evaluate(() => ({
        draftPiece: AnalyzeSection.setupDraft.getPiece('d4'),
        authoritativePiece: AnalyzeSection.loadedGame.game.get('d4')
    }))).toEqual({ draftPiece: 'wQ', authoritativePiece: null });
});

test('A2.1 mobile retains the click-to-place fallback', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSetup(page);
    await page.getByRole('button', { name: 'Select black knight' }).click();
    await page.locator('#analyzeChessboard .square-c6').click();
    expect(await page.evaluate(() => ({
        piece: AnalyzeSection.setupDraft.getPiece('c6'),
        fenMatches: document.getElementById('analyzeSetupFen').value === AnalyzeSection.setupDraft.toFen()
    }))).toEqual({ piece: 'bN', fenMatches: true });
});

for (const viewport of [
    { width: 1600, height: 1000, name: '1600x1000' },
    { width: 1366, height: 768, name: '1366x768' },
    { width: 390, height: 844, name: '390x844' }
]) {
    test(`A2.1 contrast and containment at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openSetup(page);
        const presentation = await page.evaluate(() => {
            const panel = document.getElementById('analyzeV2PanelSetup');
            const viewportNode = document.querySelector('.caissa-analyze-v2__viewport');
            const palette = document.querySelector('.caissa-analyze-v2__piece-palette');
            const pieceButton = document.querySelector('[data-setup-piece="bP"]');
            const footer = document.querySelector('.caissa-analyze-v2__footer');
            const action = document.querySelector('.caissa-analyze-v2__actions button');
            return {
                documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                panelOverflow: panel.scrollWidth - panel.clientWidth,
                nestedVerticalScroll: panel.scrollHeight > panel.clientHeight
                    && viewportNode.scrollHeight > viewportNode.clientHeight,
                paletteBackground: getComputedStyle(palette).backgroundImage,
                pieceBackground: getComputedStyle(pieceButton).backgroundColor,
                footerOpacity: getComputedStyle(footer).opacity,
                footerBackground: getComputedStyle(footer).backgroundImage,
                actionColor: getComputedStyle(action).color
            };
        });
        expect(presentation.documentOverflow).toBeLessThanOrEqual(1);
        expect(presentation.panelOverflow).toBeLessThanOrEqual(1);
        expect(presentation.nestedVerticalScroll).toBe(false);
        expect(presentation.paletteBackground).not.toBe('none');
        expect(presentation.pieceBackground).not.toBe('rgba(0, 0, 0, 0)');
        expect(presentation.footerOpacity).toBe('1');
        expect(presentation.footerBackground).not.toBe('none');
        expect(presentation.actionColor).not.toBe('rgba(0, 0, 0, 0)');
        mkdirSync(ARTIFACTS, { recursive: true });
        await page.screenshot({ path: `${ARTIFACTS}/analyze-v2-a21-setup-${viewport.name}.png`, fullPage: false });
    });
}
