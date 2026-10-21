import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTE = '/opening-trainer';

async function openTrainer(page, { mobile = false } = {}) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        localStorage.setItem('caissa.opening-trainer.engine-enabled', 'false');
        localStorage.removeItem('caissa.opening-trainer.repertoires.v1');
    });
    await page.route('**/w/api.php**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ query: { pages: { 1: {
            pageid: 1,
            title: 'Chess Opening Theory/1. e4',
            fullurl: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4',
            extract: 'Control the center and prepare rapid development.\n\nKeep the king safe before beginning operations.'
        } } } })
    }));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    else await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
    await expect(page.locator('#openingTrainerBoard .caissa-board')).toBeVisible();
}

async function tapMove(page, from, to) {
    await page.locator(`.caissa-board__square[data-square="${from}"]`).click();
    await page.locator(`.caissa-board__square[data-square="${to}"]`).click();
}

test('five-tab workspace keeps board geometry stable and Auto WikiBook returns to analysis', async ({ page }) => {
    await openTrainer(page);
    const tabs = page.locator('[data-trainer-tab]');
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(['Analysis', 'Practice', 'Games', 'Opening', 'WikiBook']);
    const boardBefore = await page.locator('#openingTrainerBoard').boundingBox();
    const rootStable = await page.evaluate(() => {
        window.__openingTrainerBoardRoot = document.querySelector('#openingTrainerBoard .caissa-board');
        window.__openingTrainerPawn = document.querySelector('.caissa-board__piece[data-square="e2"]');
        return Boolean(window.__openingTrainerBoardRoot && window.__openingTrainerPawn);
    });
    expect(rootStable).toBe(true);

    await tapMove(page, 'e2', 'e4');
    await expect(page.locator('#trainerTabWikibook')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#trainerWikiContent')).toContainText('Control the center');
    await page.locator('#trainerWikiReturn').click();
    await expect(page.locator('#trainerVariationTree')).toContainText('e4');

    const stability = await page.evaluate(() => ({
        sameRoot: window.__openingTrainerBoardRoot === document.querySelector('#openingTrainerBoard .caissa-board'),
        samePawn: window.__openingTrainerPawn === document.querySelector('.caissa-board__piece[data-square="e4"]'),
        pieces: document.querySelectorAll('#openingTrainerBoard .caissa-board__piece').length,
        squares: document.querySelectorAll('#openingTrainerBoard .caissa-board__square').length
    }));
    expect(stability).toEqual({ sameRoot: true, samePawn: true, pieces: 32, squares: 64 });
    const boardAfter = await page.locator('#openingTrainerBoard').boundingBox();
    expect(Math.abs(boardAfter.width - boardBefore.width)).toBeLessThan(1);
    expect(Math.abs(boardAfter.height - boardBefore.height)).toBeLessThan(1);
    await expect(page.locator('.opening-trainer-workspace__foot')).toBeVisible();
});

test('Save & Train creates a protected memory session with retry, hint, reveal and next', async ({ page }) => {
    await openTrainer(page);
    await tapMove(page, 'e2', 'e4');
    await page.locator('#trainerWikiReturn').click();
    await tapMove(page, 'e7', 'e5');
    await page.locator('#trainerWikiReturn').click();
    await page.locator('#trainerSaveTrainButton').click();
    await expect(page.locator('#trainerSaveTrainDialog')).toBeVisible();
    await expect(page.locator('#trainerSaveTrainDialog')).toContainText('Would you like to train this opening?');
    await page.locator('#trainerConfirmPractice').click();
    await expect(page.locator('#trainerTabPractice')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#trainerSessionLock')).toBeVisible();
    await expect(page.locator('#trainerEnginePv')).toHaveText('Paused during protected practice');
    await expect(page.locator('#openingTrainerBoard .caissa-board__arrow-line')).toHaveCount(0);

    await page.locator('#trainerHintButton').click();
    await expect(page.locator('#trainerPracticeHints')).toHaveText('1');
    await page.locator('#trainerRevealButton').click();
    await expect(page.locator('#trainerPracticeReveals')).toHaveText('1');
    await expect(page.locator('#trainerPracticePrompt')).toHaveText('Line complete');
    await page.locator('#trainerRetryPractice').click();
    await tapMove(page, 'e2', 'e4');
    await expect(page.locator('#trainerPracticePrompt')).toHaveText('Line complete');
    await page.locator('#trainerNextLine').click();
    await expect(page.locator('#trainerPracticeFeedback')).toContainText('Repeating this line');
    const state = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(state.repertoires).toHaveLength(1);
    expect(state.training.userColor).toBe('w');
});

test('Games caps results at ten, loads the real public PGN and navigates without mutating Analysis', async ({ page }) => {
    await page.route('**/gamesearch/manifest.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ maxPlies: 10 }) }));
    await page.route('**/gamesearch/line?**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            ok: true,
            games: 25,
            top: Array.from({ length: 12 }, (_, index) => ({
                gameId: index === 0 ? 'g_2413f2ecc7c12314' : `g_${String(index).padStart(16, '0')}`,
                event: index === 0 ? 'Russia vs Rest of World' : `Event ${index}`,
                site: index === 0 ? 'Moscow' : 'Site',
                date: index === 0 ? '2002.09.08' : '2020.01.01',
                year: index === 0 ? 2002 : 2020,
                white: index === 0 ? 'Polgar, Judit' : `White ${index}`,
                black: index === 0 ? 'Kasparov, Garry' : `Black ${index}`,
                result: '1-0',
                eco: index === 0 ? 'C67' : 'C20'
            }))
        })
    }));
    await openTrainer(page);
    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']));
    await page.locator('#trainerTabGames').click();
    await expect(page.locator('.opening-trainer-game')).toHaveCount(10);
    const analysisNodeCount = await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes.length);
    await page.locator('.opening-trainer-game').first().getByRole('button', { name: 'Load game' }).click();
    await expect(page.locator('#trainerGameNotation')).toContainText('[White "Polgar, Judit"]');
    await expect(page.locator('#trainerGameNotationStatus')).toContainText('Source validation warning');
    const gameState = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(gameState.selectedGame.totalPlies).toBeGreaterThan(10);
    expect(gameState.analysis.nodes).toHaveLength(analysisNodeCount);
    const before = gameState.selectedGame.ply;
    await page.locator('#trainerNextMove').click();
    const after = await page.evaluate(() => window.CaissaOpeningTrainer.getState().selectedGame.ply);
    expect(after).toBe(before + 1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('Quiet Drag remains single-piece and responsive layout has no serious accessibility violations', async ({ page, browserName }) => {
    await openTrainer(page, { mobile: true });
    const board = page.locator('#openingTrainerBoard');
    const source = await page.locator('.caissa-board__square[data-square="e2"]').boundingBox();
    const target = await page.locator('.caissa-board__square[data-square="e4"]').boundingBox();
    await page.evaluate(() => { window.__dragPawn = document.querySelector('.caissa-board__piece[data-square="e2"]'); });
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
    const drag = await page.evaluate(() => ({
        stable: window.__dragPawn === document.querySelector('.caissa-board__piece[data-square="e4"]'),
        pieces: document.querySelectorAll('#openingTrainerBoard .caissa-board__piece').length,
        dragging: document.querySelectorAll('#openingTrainerBoard [data-dragging="true"]').length,
        width: document.querySelector('#openingTrainerBoard').getBoundingClientRect().width,
        viewport: innerWidth
    }));
    expect(drag.stable).toBe(true);
    expect(drag.pieces).toBe(32);
    expect(drag.dragging).toBe(0);
    expect(drag.width).toBeLessThanOrEqual(drag.viewport);
    await expect(board).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations, `${browserName}: ${JSON.stringify(accessibility.violations)}`).toEqual([]);
});

test('real Stockfish publishes evaluation, principal variation and a best-move arrow', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'One real WASM engine smoke is sufficient; cross-browser flows use deterministic UI coverage.');
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        localStorage.setItem('caissa.opening-trainer.engine-enabled', 'true');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ROUTE);
    await page.waitForFunction(() => Boolean(window.CaissaOpeningTrainer));
    await expect(page.locator('#trainerEngineStrip')).toHaveAttribute('data-engine-state', 'ready', { timeout: 30_000 });
    await expect(page.locator('#trainerEngineDepth')).toContainText('Depth', { timeout: 30_000 });
    await expect.poll(async () => page.locator('#trainerEnginePv').textContent(), { timeout: 30_000 })
        .not.toMatch(/Starting|Calculating|unavailable/i);
    await expect(page.locator('#trainerEngineLines li')).toHaveCount(3, { timeout: 30_000 });
    await expect(page.locator('#openingTrainerBoard .caissa-board__arrow-line')).toHaveCount(1, { timeout: 30_000 });
});
