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

function proxyCatalog(primary = { id: 'opening-kings-pawn', title: "King's Pawn Game", file: 'KingsPawn.zip' }) {
    return {
        schemaVersion: 1,
        access: 'free',
        sourceUpdated: 'January 2026',
        pageSize: 100,
        count: 233,
        openings: [primary, ...Array.from({ length: 232 }, (_, index) => ({
            id: `opening-filler-${index}`,
            title: `Filler ${index}`,
            file: `Filler${index}.zip`
        }))]
    };
}

function proxyPgn(count = 12) {
    return Array.from({ length: count }, (_, index) => [
        `[Event "${index ? `Event ${index}` : 'Russia vs Rest of World'}"]`,
        '[Site "Moscow"]',
        `[Date "2002.09.${String(index + 1).padStart(2, '0')}"]`,
        `[White "${index ? `White ${index}` : 'Polgar, Judit'}"]`,
        `[Black "${index ? `Black ${index}` : 'Kasparov, Garry'}"]`,
        '[Result "1-0"]',
        '[ECO "C67"]',
        '',
        '1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 1-0'
    ].join('\n')).join('\n\n');
}

async function installSyntheticAuth(page) {
    await page.route('**/js/caissa-auth.js*', route => route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: `(() => {
            const listeners = new Set();
            const auth = {
                isLoaded: true,
                isSignedIn: true,
                userId: 'user_A',
                status: 'authenticated',
                getToken: async () => auth.isSignedIn ? 'token-' + auth.userId : null,
                whenReady: async () => auth,
                onAuthStateChange(callback) {
                    listeners.add(callback);
                    queueMicrotask(() => callback(auth));
                    return () => listeners.delete(callback);
                },
                __switch(userId) {
                    auth.isSignedIn = Boolean(userId);
                    auth.userId = userId || null;
                    auth.status = userId ? 'authenticated' : 'anonymous';
                    for (const callback of listeners) callback(auth);
                    window.dispatchEvent(new CustomEvent('caissa-auth-change', { detail: { ...auth } }));
                }
            };
            window.CAISSA_AUTH = auth;
        })();`
    }));
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
    const footer = page.locator('.opening-trainer-workspace__foot');
    await expect(footer).toBeVisible();
    await page.locator('#trainerTabOpening').click();
    const footerBeforeScroll = await footer.boundingBox();
    const bodyScrollable = await page.evaluate(() => {
        const body = document.querySelector('.opening-trainer-workspace__body');
        const scrollable = body.scrollHeight > body.clientHeight;
        body.scrollTop = body.scrollHeight;
        return scrollable;
    });
    expect(bodyScrollable).toBe(true);
    const footerAfterScroll = await footer.boundingBox();
    expect(Math.abs(footerAfterScroll.y - footerBeforeScroll.y)).toBeLessThan(1);
});

test('Analysis groups paired moves, keeps each ply selectable and nests white and black variations', async ({ page }) => {
    await openTrainer(page);
    await page.evaluate(() => { document.querySelector('#trainerWikiAuto').checked = false; });
    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4']));

    const rows = page.locator('.opening-trainer-tree-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('e4');
    await expect(rows.nth(0)).toContainText('c6');
    await expect(rows.nth(2)).toContainText('Nc3');
    await expect(rows.nth(2)).toContainText('dxe4');

    const nodeState = await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes
        .filter(node => ['Nc3', 'dxe4'].includes(node.san))
        .map(node => ({ id: node.id, san: node.san, fen: node.fen })));
    const whiteNode = nodeState.find(node => node.san === 'Nc3');
    const blackNode = nodeState.find(node => node.san === 'dxe4');
    const whiteButton = page.locator(`[data-node-id="${whiteNode.id}"]`);
    await whiteButton.focus();
    await whiteButton.press('Enter');
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.currentFen))).toBe(whiteNode.fen);
    await page.locator(`[data-node-id="${blackNode.id}"]`).click();
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.currentFen))).toBe(blackNode.fen);

    const d5Id = await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes.find(node => node.san === 'd5').id);
    await page.locator(`[data-node-id="${d5Id}"]`).click();
    await tapMove(page, 'e4', 'e5');
    await tapMove(page, 'g8', 'f6');
    await tapMove(page, 'g1', 'f3');

    await page.locator(`[data-node-id="${whiteNode.id}"]`).click();
    await tapMove(page, 'g7', 'g6');
    await expect(page.locator('.opening-trainer-tree-row')).toHaveCount(6);
    const whiteVariation = page.locator('.opening-trainer-tree-row.is-variation').filter({ hasText: 'e5' });
    await expect(whiteVariation).toContainText('Nf6');
    const blackVariation = page.locator('.opening-trainer-tree-row.is-variation').filter({ hasText: 'g6' });
    await expect(blackVariation).toContainText('3…');
    await expect(blackVariation.locator('.opening-trainer-tree-empty-move')).toHaveCount(1);

    const footer = page.locator('.opening-trainer-workspace__foot');
    const footerBefore = await footer.boundingBox();
    await page.evaluate(() => { document.querySelector('.opening-trainer-workspace__body').scrollTop = 9999; });
    const footerAfter = await footer.boundingBox();
    expect(Math.abs(footerAfter.y - footerBefore.y)).toBeLessThan(1);

    await page.locator('#trainerRepertoireColor').selectOption('black');
    await page.locator('#trainerSaveTrainButton').click();
    await expect(page.locator('#trainerSaveTrainSummary')).toContainText('3 variations');
    await expect(page.locator('#trainerDialogPlayBlack')).toBeChecked();
    await page.locator('#trainerConfirmPractice').click();
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().training.userColor))).toBe('b');
});

test('Practice can train a White-default repertoire as Black through a complete protected session', async ({ page }) => {
    await openTrainer(page);
    await page.evaluate(() => {
        document.querySelector('#trainerWikiAuto').checked = false;
        window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4']);
    });
    await page.locator('#trainerRepertoireColor').selectOption('white');
    await page.locator('#trainerSaveButton').click();
    await page.locator('#trainerTabPractice').click();
    await page.locator('#trainerPracticePlayBlack').check();
    await page.locator('#trainerStartPractice').click();

    await expect(page.locator('#trainerPracticePlayBlack')).toBeChecked();
    await expect(page.locator('#openingTrainerBoard .caissa-board')).toHaveAttribute('data-orientation', 'black');
    await expect(page.locator('.caissa-board__piece[data-square="e4"]')).toHaveCount(1);
    let state = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(state.training).toMatchObject({ userColor: 'b', cursor: 1, completed: false });
    expect(state.repertoires[0].color).toBe('white');

    await tapMove(page, 'c7', 'c5');
    await expect(page.locator('#trainerPracticeFeedback')).toContainText('Repertoire deviation');
    await expect(page.locator('#trainerPracticeErrors')).toHaveText('1');
    await page.locator('#trainerHintButton').click();
    await expect(page.locator('#trainerPracticeFeedback')).toContainText('c6');
    await page.locator('#trainerRevealButton').click();
    await expect.poll(async () => (await page.evaluate(() => window.CaissaOpeningTrainer.getState().training.cursor))).toBe(3);

    await page.locator('#trainerRetryPractice').click();
    await tapMove(page, 'c7', 'c6');
    await expect.poll(async () => (await page.evaluate(() => window.CaissaOpeningTrainer.getState().training.cursor))).toBe(3);
    await tapMove(page, 'd7', 'd5');
    await expect.poll(async () => (await page.evaluate(() => window.CaissaOpeningTrainer.getState().training.cursor))).toBe(5);
    await tapMove(page, 'd5', 'e4');
    await expect(page.locator('#trainerPracticePrompt')).toHaveText('Line complete');
    state = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(state.training).toMatchObject({ userColor: 'b', cursor: 6, completed: true });
    expect(state.training.stats).toMatchObject({ attempts: 3, correct: 3, errors: 0 });

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#trainerPracticePlayWhite').check();
    await expect(page.locator('#openingTrainerBoard .caissa-board')).toHaveAttribute('data-orientation', 'white');
    state = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(state.training).toMatchObject({ userColor: 'w', cursor: 0, completed: false });
    expect(state.repertoires[0].color).toBe('white');

    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#trainerPracticePlayBlack').click();
    await expect(page.locator('#trainerPracticePlayWhite')).toBeChecked();
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().training.userColor))).toBe('w');
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

test('persistent Save and Save & Train work from every primary tab without losing the selected line', async ({ page }) => {
    await openTrainer(page);
    await tapMove(page, 'e2', 'e4');
    await page.locator('#trainerWikiReturn').click();
    await page.locator('#trainerRepertoireColor').selectOption('black');
    const tabs = ['Analysis', 'Practice', 'Games', 'Opening', 'WikiBook'];
    for (const name of tabs) {
        await page.getByRole('tab', { name, exact: true }).click();
        await expect(page.locator('#trainerSaveButton')).toBeEnabled();
        await page.locator('#trainerSaveButton').click();
        await page.locator('#trainerSaveTrainButton').click();
        await expect(page.locator('#trainerSaveTrainDialog')).toBeVisible();
        await page.locator('#trainerContinueAnalysis').click();
        const state = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
        expect(state.analysis.nodes).toHaveLength(2);
        expect(state.repertoires.at(-1).color).toBe('black');
    }
});

test('NEW supports cancel, discard, clean reset and preserves saved repertoires and preferences', async ({ page }) => {
    await openTrainer(page);
    await tapMove(page, 'e2', 'e4');
    await page.locator('#trainerWikiReturn').click();
    await page.locator('#trainerSaveButton').click();
    await tapMove(page, 'e7', 'e5');
    await page.locator('#trainerWikiReturn').click();
    const before = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(before.unsavedStudy).toBe(true);
    await page.locator('#trainerNewStudy').click();
    await expect(page.locator('#trainerNewStudyDialog')).toBeVisible();
    await page.locator('#trainerNewStudyDialog button[value="cancel"]').click();
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState())).analysis.nodes).toHaveLength(3);
    await page.locator('#trainerNewStudy').click();
    await page.locator('#trainerNewStudyDialog button[value="discard"]').click();
    await expect(page.locator('#trainerTabOpening')).toHaveAttribute('aria-selected', 'true');
    const reset = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(reset.analysis.nodes).toHaveLength(1);
    expect(reset.repertoires).toHaveLength(1);
    expect(reset.engineEnabled).toBe(false);
    expect(reset.unsavedStudy).toBe(false);
    await page.locator('#trainerNewStudy').click();
    await expect(page.locator('#trainerNewStudyDialog')).toBeHidden();
    await expect(page.locator('#trainerEcoSearch')).toBeFocused();

    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['d4']));
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState())).unsavedStudy).toBe(true);
    await page.locator('#trainerNewStudy').click();
    await page.locator('#trainerNewStudyDialog button[value="save"]').click();
    await expect(page.locator('#trainerTabOpening')).toHaveAttribute('aria-selected', 'true');
    const savedReset = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(savedReset.analysis.nodes).toHaveLength(1);
    expect(savedReset.repertoires).toHaveLength(2);
    expect(savedReset.unsavedStudy).toBe(false);
});

test('Games uses the PGN Reader proxy, caps pages at ten and navigates notation without mutating Analysis', async ({ page }) => {
    const pgn = proxyPgn();
    await page.route('**/api/pgn/opening**', route => {
        const url = new URL(route.request().url());
        if (!url.searchParams.has('file')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(proxyCatalog()) });
        return route.fulfill({ status: 200, contentType: 'application/x-chess-pgn', body: pgn, headers: {
            'content-length': String(pgn.length),
            'X-CAISSA-PGN-Source': 'pgnmentor-opening-paged',
            'X-CAISSA-Opening-Page': '1',
            'X-CAISSA-Opening-Pages': '1',
            'X-CAISSA-Opening-Games': '12',
            'X-CAISSA-Opening-Page-Games': '12'
        } });
    });
    await openTrainer(page);
    await page.evaluate(() => window.CaissaOpeningTrainer.loadOpeningLine(['e4', 'e5']));
    await page.locator('#trainerTabGames').click();
    await expect(page.locator('.opening-trainer-game')).toHaveCount(10);
    await expect(page.locator('#trainerGamesStatus')).toContainText('CAISSA PGN Reader proxy');
    const analysisNodeCount = await page.evaluate(() => window.CaissaOpeningTrainer.getState().analysis.nodes.length);
    await page.locator('.opening-trainer-game').first().getByRole('button', { name: 'Load game' }).click();
    await expect(page.locator('#trainerGameNotation')).toContainText('[White "Polgar, Judit"]');
    await expect(page.locator('#trainerGameNotationStatus')).toContainText('complete board navigation');
    const gameState = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(gameState.selectedGame.totalPlies).toBe(10);
    expect(gameState.analysis.nodes).toHaveLength(analysisNodeCount);
    const before = gameState.selectedGame.ply;
    await page.locator('#trainerNextMove').click();
    const after = await page.evaluate(() => window.CaissaOpeningTrainer.getState().selectedGame.ply);
    expect(after).toBe(before + 1);
    await page.locator('[data-games-view="games"]').click();
    await page.locator('#trainerGamesNextPage').click();
    await expect(page.locator('.opening-trainer-game')).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('NEW invalidates a late PGN proxy response from the previous workspace generation', async ({ page }) => {
    let releaseCatalog;
    const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
    await page.route('**/api/pgn/opening', async route => {
        await catalogGate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(proxyCatalog({ id: 'opening-vienna', title: 'Vienna', file: 'Vienna.zip' })) });
    });
    await openTrainer(page);
    await page.locator('#trainerTabGames').click();
    await page.locator('#trainerGamesQuery').fill('Vienna');
    await page.locator('#trainerSearchGames').click();
    await expect(page.locator('#trainerGamesStatus')).toContainText('Searching');
    const generation = await page.evaluate(() => window.CaissaOpeningTrainer.getState().workspaceGeneration);
    await page.locator('#trainerNewStudy').click();
    await expect(page.locator('#trainerTabOpening')).toHaveAttribute('aria-selected', 'true');
    releaseCatalog();
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => window.CaissaOpeningTrainer.getState());
    expect(state.workspaceGeneration).toBe(generation + 1);
    expect(state.selectedGame).toBeNull();
    await expect(page.locator('#trainerGamesList')).toBeEmpty();
    await expect(page.locator('#trainerGamesStatus')).toContainText('PGN Reader');
});

test('Clerk account switches isolate localStorage, visible practice data and cloud ownership', async ({ page }) => {
    await installSyntheticAuth(page);
    const apiCalls = [];
    let releaseAccountA;
    const accountAGate = new Promise(resolve => { releaseAccountA = resolve; });
    let firstAccountAGet = true;
    await page.route('**/api/opening-trainer/repertoires', async route => {
        const request = route.request();
        const authorization = request.headers().authorization || '';
        const method = request.method();
        const body = method === 'PUT' ? JSON.parse(request.postData() || '{}') : null;
        apiCalls.push({ method, authorization, body });
        if (method === 'GET') {
            if (authorization === 'Bearer token-user_A' && firstAccountAGet) {
                firstAccountAGet = false;
                await accountAGate;
                try {
                    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repertoires: [{
                        schemaVersion: 'CaissaOpeningRepertoire@1.0.0',
                        id: 'stale-account-a', name: 'Stale Account A', color: 'white', eco: 'B00', opening: 'King Pawn',
                        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                        lines: [[{ uci: 'e2e4', san: 'e4', color: 'w' }]],
                        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', progress: {}
                    }] }) });
                } catch {
                    // The identity switch is expected to abort this request.
                }
                return;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repertoires: [] }) });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ repertoire: body }) });
    });
    await openTrainer(page);
    await expect.poll(() => page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoireIdentity?.id)).toBe('user_A');
    await page.evaluate(() => {
        document.querySelector('#trainerWikiAuto').checked = false;
        window.CaissaOpeningTrainer.loadOpeningLine(['e4']);
    });
    await page.locator('#trainerSaveButton').click();
    const accountAId = await page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoires[0].id);
    await expect.poll(() => apiCalls.filter(call => call.method === 'PUT' && call.authorization === 'Bearer token-user_A').length).toBe(1);

    await page.evaluate(() => window.CAISSA_AUTH.__switch('user_B'));
    await expect.poll(() => page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoireIdentity?.id)).toBe('user_B');
    releaseAccountA();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoires)).toEqual([]);
    await expect(page.locator('#trainerRepertoireSelect')).toContainText('No saved repertoires');
    await page.locator('#trainerSaveButton').click();
    const accountBId = await page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoires[0].id);
    expect(accountBId).not.toBe(accountAId);

    await page.evaluate(() => window.CAISSA_AUTH.__switch(null));
    await expect.poll(() => page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoireIdentity?.kind)).toBe('guest');
    expect(await page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoires)).toEqual([]);
    const cloudCallsBeforeGuestSave = apiCalls.length;
    await page.locator('#trainerSaveButton').click();
    await page.waitForTimeout(100);
    expect(apiCalls.length).toBe(cloudCallsBeforeGuestSave);

    await page.evaluate(() => window.CAISSA_AUTH.__switch('user_A'));
    await expect.poll(() => page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoireIdentity?.id)).toBe('user_A');
    expect((await page.evaluate(() => window.CaissaOpeningTrainer.getState().repertoires.map(item => item.id)))).toEqual([accountAId]);
    const storageKeys = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('caissa.opening-trainer.repertoires.v2')).sort());
    expect(storageKeys).toEqual([
        'caissa.opening-trainer.repertoires.v2:clerk:user_A',
        'caissa.opening-trainer.repertoires.v2:clerk:user_B',
        'caissa.opening-trainer.repertoires.v2:guest'
    ]);
    expect(apiCalls.filter(call => call.method === 'PUT').every(call => !('user_id' in call.body))).toBe(true);
    expect(apiCalls.every(call => !call.authorization.includes('guest'))).toBe(true);
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
    await page.locator('.opening-trainer-workspace__foot').scrollIntoViewIfNeeded();
    await expect(page.locator('#trainerNewStudy')).toBeVisible();
    await expect(page.locator('#trainerSaveTrainButton')).toBeVisible();
    await expect(page.locator('#trainerFirstMove')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.locator('#trainerTabOpening').click();
    const mobileFooter = page.locator('.opening-trainer-workspace__foot');
    const mobileFooterBeforeScroll = await mobileFooter.boundingBox();
    const mobileBodyScrollable = await page.evaluate(() => {
        const body = document.querySelector('.opening-trainer-workspace__body');
        const scrollable = body.scrollHeight > body.clientHeight;
        body.scrollTop = body.scrollHeight;
        return scrollable;
    });
    expect(mobileBodyScrollable).toBe(true);
    const mobileFooterAfterScroll = await mobileFooter.boundingBox();
    expect(Math.abs(mobileFooterAfterScroll.y - mobileFooterBeforeScroll.y)).toBeLessThan(1);
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
