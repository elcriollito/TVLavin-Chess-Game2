import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const ordinaryPgn = `[Event "Browser QA"]
[White "Alexander"]
[Black "CAISSA"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 1-0`;

const terminalPgn = `[Event "Terminal QA"]
[White "White"]
[Black "Black"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

const memoryPuzzles = [
    { id: 'memory-a', fen: '7k/8/8/3r4/3R4/8/8/K7 w - - 0 1', moves: 'd4d5 h8g8', themes: ['endgame'] },
    { id: 'memory-b', fen: '7k/8/8/8/8/3r4/3R4/K7 w - - 0 1', moves: 'd2d3 h8g8', themes: ['endgame'] }
];

const openingStart = JSON.parse(fs.readFileSync(new URL('../fixtures/mentor-openingdb-start.json', import.meta.url), 'utf8'));
const openingStartHash = '66be37feb35e7d6a';

const pieceNames = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

async function reconstructCurrentMemoryPosition(page) {
    const fen = await page.evaluate(() => window.CaissaMentorPage.inspect().memory.exercise.fen);
    const [placement] = fen.split(' ');
    const ranks = placement.split('/');
    const pieces = [];
    for (let rankIndex = 0; rankIndex < ranks.length; rankIndex += 1) {
        let fileIndex = 0;
        for (const symbol of ranks[rankIndex]) {
            if (/\d/.test(symbol)) { fileIndex += Number(symbol); continue; }
            pieces.push({
                square: `${String.fromCharCode(97 + fileIndex)}${8 - rankIndex}`,
                label: `${symbol === symbol.toUpperCase() ? 'White' : 'Black'} ${pieceNames[symbol.toUpperCase()]}`
            });
            fileIndex += 1;
        }
    }
    for (const piece of pieces) {
        await page.getByRole('button', { name: piece.label, exact: true }).click();
        await page.locator(`#mentor-board .caissa-board__square[data-square="${piece.square}"]`).click();
    }
}

async function importPgn(page, pgn) {
    await page.getByRole('tab', { name: 'My account' }).click();
    await page.getByRole('button', { name: 'Local PGN' }).click();
    await page.getByLabel('Or paste your games').fill(pgn);
    await page.getByRole('button', { name: 'Load PGN Games' }).click();
    await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true');
}

test('Mentor page keeps one responsive board workspace with five readable tabs', async ({ page }, testInfo) => {
    const runtimeErrors = [];
    page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto('/mentor.html');
    await expect(page.getByRole('heading', { name: 'CAISSA Mentor', level: 1 })).toBeVisible();
    await expect(page.locator('.workspace-head [role=tab]')).toHaveText([/Mentor/, 'Moves', 'Training', 'Opening', 'My account']);

    for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 1366, height: 768 },
        { width: 885, height: 611 },
        { width: 390, height: 844 }
    ]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyOverflow: getComputedStyle(document.querySelector('.workspace-body')).overflowY,
            workspaceOverflow: getComputedStyle(document.querySelector('.right-workspace')).overflow,
            tabRects: [...document.querySelectorAll('.workspace-head [role=tab]')].map(node => node.getBoundingClientRect().toJSON()),
            workspaceRect: document.querySelector('.right-workspace').getBoundingClientRect().toJSON(),
            footerRect: document.querySelector('.workspace-foot').getBoundingClientRect().toJSON()
        }));
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(layout.bodyOverflow).toBe('auto');
        expect(layout.workspaceOverflow).toBe('hidden');
        for (const rect of layout.tabRects) {
            expect(rect.left).toBeGreaterThanOrEqual(layout.workspaceRect.left);
            expect(rect.right).toBeLessThanOrEqual(layout.workspaceRect.right + 1);
        }
        expect(layout.footerRect.bottom).toBeLessThanOrEqual(layout.workspaceRect.bottom + 1);
        expect(layout.footerRect.top).toBeGreaterThan(layout.workspaceRect.top);
        await page.screenshot({ path: testInfo.outputPath(`mentor-chat-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }

    await page.getByRole('tab', { name: 'Training' }).click();
    await expect(page.locator('#panel-learn .training-tabs [role=tab]')).toHaveText(['Position', 'Opening', 'Choose a lesson']);
    const positionTab = page.locator('#panel-learn .training-tabs').getByRole('tab', { name: 'Position' });
    await positionTab.focus();
    await positionTab.press('ArrowRight');
    await expect(page.locator('#training-opening-tab')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#training-opening-tab').press('End');
    await expect(page.locator('#training-lesson-tab')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#training-lesson-tab').press('Home');
    await expect(positionTab).toHaveAttribute('aria-selected', 'true');
    for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 1366, height: 768 },
        { width: 885, height: 611 },
        { width: 390, height: 844 }
    ]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyOverflow: getComputedStyle(document.querySelector('.workspace-body')).overflowY,
            trainingTabRects: [...document.querySelectorAll('#panel-learn .training-tabs [role=tab]')].map(node => node.getBoundingClientRect().toJSON()),
            workspaceRect: document.querySelector('.right-workspace').getBoundingClientRect().toJSON(),
            footerRect: document.querySelector('.workspace-foot').getBoundingClientRect().toJSON()
        }));
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(layout.bodyOverflow).toBe('auto');
        for (const rect of layout.trainingTabRects) {
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.left).toBeGreaterThanOrEqual(layout.workspaceRect.left);
            expect(rect.right).toBeLessThanOrEqual(layout.workspaceRect.right + 1);
        }
        expect(layout.footerRect.bottom).toBeLessThanOrEqual(layout.workspaceRect.bottom + 1);
        await page.screenshot({ path: testInfo.outputPath(`mentor-training-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
    expect(runtimeErrors).toEqual([]);
});

test('Local PGN drives Moves, real Stockfish 19 evidence and explicit Mentor review', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const engineAssets = [], mentorRequests = [];
    page.on('request', request => {
        if (/stockfish-19-lite-single\.(?:js|wasm)$/.test(new URL(request.url()).pathname)) engineAssets.push(request.url());
        if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url());
    });
    await page.goto('/mentor.html');
    expect(engineAssets).toEqual([]);

    await importPgn(page, ordinaryPgn);
    await expect(page.locator('.move-row')).toHaveCount(2);
    await expect(page.locator('#learn-game-meta')).not.toContainText('????.??.??');
    await page.getByRole('button', { name: 'Show position after 2. Nf3' }).click();
    await expect(page.locator('#learn-game-position')).toContainText('Position 3 of 4');
    await page.getByRole('button', { name: 'Engine', exact: true }).click();
    await expect(page.locator('#engine-status')).toContainText('Analysis complete', { timeout: 20_000 });
    await expect(page.locator('.evaluation-point')).toHaveCount(5);
    await expect(page.locator('.evaluation-point').nth(3)).toHaveAttribute('aria-label', /depth 12/);
    expect(engineAssets.filter(url => url.endsWith('.js'))).toHaveLength(1);
    expect(engineAssets.filter(url => url.endsWith('.wasm'))).toHaveLength(1);
    await page.locator('.evaluation-point').nth(1).click();
    await expect(page.locator('#learn-game-position')).toContainText('Position 1 of 4');
    await page.getByRole('button', { name: 'Show position after 2. Nf3' }).click();
    await page.locator('#evaluation-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('mentor-moves-evaluated.png'), fullPage: true });

    await page.getByRole('button', { name: 'Game review · Shared AI' }).click();
    await expect(page.getByRole('tab', { name: 'Mentor' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Ask Mentor')).toHaveValue(/Local Stockfish 19 evaluated the selected position.*depth 12.*White’s perspective/s);
    await page.getByRole('tab', { name: 'Training' }).click();
    await page.locator('.training-tabs').getByRole('tab', { name: 'Choose a lesson' }).click();
    await expect(page.locator('#learn-footer')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('mentor-learn.png'), fullPage: true });
    await page.getByLabel('Ask Mentor').evaluate(input => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Try it yourself' }).click();
    await page.getByRole('tab', { name: 'Moves' }).click();
    await page.getByRole('button', { name: 'Game review · Shared AI' }).click();
    await expect(page.getByLabel('Ask Mentor')).not.toHaveValue(/Local Stockfish 19 evaluated/);
    expect(mentorRequests).toEqual([]);
});

test('shared Explorer and global Flip preserve the imported PGN cursor and main line', async ({ page }, testInfo) => {
    const explorerRequests = [];
    await page.route('**/openingdb/manifest.json', async route => {
        const request = route.request();
        explorerRequests.push({ url: request.url(), headers: request.headers() });
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ activeVersion: 'v3_p60', hash: { algo: 'sha1', len: 16 }, maxPlies: 60 })
        });
    });
    await page.route('**/openingdb/shards/**', async route => {
        const request = route.request();
        explorerRequests.push({ url: request.url(), headers: request.headers() });
        const isStartShard = new URL(request.url()).pathname.endsWith('/66.json');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(isStartShard ? { [openingStartHash]: openingStart } : {})
        });
    });
    await page.context().addCookies([{ name: 'caissa-private-test', value: 'must-not-leave', url: 'http://127.0.0.1:8000' }]);
    await page.goto('/mentor.html');
    await importPgn(page, ordinaryPgn);
    const imported = await page.evaluate(() => window.CaissaMentorPage.inspect());

    for (const tabName of ['Mentor', 'Moves', 'Training', 'Opening', 'My account']) {
        await page.locator('.workspace-head').getByRole('tab', { name: tabName, exact: true }).click();
        await expect(page.getByRole('button', { name: 'Flip board', exact: true })).toBeVisible();
    }

    await page.getByRole('tab', { name: 'Moves', exact: true }).click();
    await page.getByRole('button', { name: 'Explore this position' }).click();
    await expect(page.locator('.workspace-head').getByRole('tab', { name: 'Opening', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'CAISSA Explorer' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#explorer-opening')).toHaveText('CAISSA Opening Database · Statistics for this position');
    await expect(page.locator('#explorer-rows tr')).toHaveCount(20);
    await expect(page.locator('#explorer-rows tr').first()).toContainText('46.3% · 2,350,205 games');
    await expect(page.locator('#explorer-rows tr').first().locator('.explorer-results')).toHaveAttribute('aria-label', 'White 37.3%, draws 32%, Black 30.6%');
    await expect(page.locator('#explorer-summary')).toContainText('5,072,955 games across listed continuations');
    await expect(page.getByRole('button', { name: 'Explore d4' })).toBeVisible();
    await expect(page.locator('#opening-explorer-body a[href="/opening-database"]')).toBeVisible();
    await expect(page.locator('#explorer-source, #explorer-ratings, #explorer-speeds, #explorer-since, #explorer-until')).toHaveCount(0);
    expect(explorerRequests).toHaveLength(2);
    expect(explorerRequests.map(item => new URL(item.url).pathname)).toEqual(['/openingdb/manifest.json', '/openingdb/shards/v3_p60/66.json']);
    expect(explorerRequests.every(item => item.headers.authorization === undefined && item.headers.cookie === undefined)).toBe(true);

    const requestCountBeforeFlip = explorerRequests.length;
    await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    const flipped = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(flipped.board.renderer.orientation).toBe('black');
    expect(flipped.fen).toBe(imported.fen);
    expect(flipped.cursor).toBe(imported.cursor);
    expect(explorerRequests).toHaveLength(requestCountBeforeFlip);

    for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 1366, height: 768 },
        { width: 885, height: 611 },
        { width: 390, height: 844 }
    ]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyOverflow: getComputedStyle(document.querySelector('.workspace-body')).overflowY,
            table: document.querySelector('.explorer-table').getBoundingClientRect().toJSON(),
            workspace: document.querySelector('.right-workspace').getBoundingClientRect().toJSON(),
            footer: document.querySelector('.workspace-foot').getBoundingClientRect().toJSON(),
            flip: document.querySelector('#flip').getBoundingClientRect().toJSON()
        }));
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(layout.bodyOverflow).toBe('auto');
        expect(layout.table.left).toBeGreaterThanOrEqual(layout.workspace.left);
        expect(layout.table.right).toBeLessThanOrEqual(layout.workspace.right + 1);
        expect(layout.footer.bottom).toBeLessThanOrEqual(layout.workspace.bottom + 1);
        expect(layout.flip.width).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath(`mentor-explorer-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }

    await page.getByRole('button', { name: 'Explore d4' }).click();
    const alternative = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(alternative.practicing).toBe(true);
    expect(alternative.cursor).toBe(imported.cursor);
    expect(alternative.fen).not.toBe(imported.fen);
    await expect(page.locator('#explorer-status')).toContainText('No statistics for this position');

    await page.getByRole('button', { name: 'Return to main line' }).click();
    const restored = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(restored.practicing).toBe(false);
    expect(restored.fen).toBe(imported.fen);
    expect(restored.cursor).toBe(imported.cursor);
    expect(restored.importedGames).toBe(1);
    expect(restored.board.renderer.orientation).toBe('black');
    await expect(page.getByRole('button', { name: 'Explore d4' })).toBeVisible();

    await page.getByRole('button', { name: 'Next move' }).click();
    const advanced = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(advanced.cursor).toBe(imported.cursor + 1);
    expect(advanced.fen).not.toBe(alternative.fen);
    expect(advanced.board.renderer.orientation).toBe('black');

    const ecoTab = page.getByRole('tab', { name: 'Chess ECO Codes Database' });
    await ecoTab.click();
    await ecoTab.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'CAISSA Explorer' })).toHaveAttribute('aria-selected', 'true');
});

test('CAISSA Explorer distinguishes timeout, transport failure and exact-coverage miss', async ({ page }) => {
    await page.addInitScript(() => {
        const nativeSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 30000 ? 50 : delay, ...args);
    });
    let mode = 'timeout';
    await page.route('**/openingdb/manifest.json', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ activeVersion: 'v3_p60', hash: { algo: 'sha1', len: 16 }, maxPlies: 60 })
    }));
    await page.route('**/openingdb/shards/**', async route => {
        const current = mode;
        if (current === 'timeout') {
            await new Promise(resolve => setTimeout(resolve, 200));
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }).catch(() => {});
            return;
        }
        if (current === 'error') {
            await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' });
            return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/mentor.html');
    await page.locator('.workspace-head').getByRole('tab', { name: 'Opening', exact: true }).click();
    await page.getByRole('tab', { name: 'CAISSA Explorer' }).click();
    await expect(page.locator('#explorer-status')).toHaveText('Opening Database timed out. Try again.');

    mode = 'error';
    await page.getByRole('button', { name: 'Refresh statistics' }).click();
    await expect(page.locator('#explorer-status')).toHaveText('Opening Database unavailable (HTTP 503).');

    mode = 'miss';
    await page.getByRole('button', { name: 'Refresh statistics' }).click();
    await expect(page.locator('#explorer-status')).toContainText('No statistics for this position');
    await expect(page.locator('#explorer-rows tr')).toHaveCount(0);
});

test('Memory Training filters puzzle levels, retries unscored, advances only after success and restores study', async ({ page }, testInfo) => {
    await page.route('**/api/puzzles/select?**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ puzzles: memoryPuzzles, source: 'full-catalog', hasMore: false })
    }));
    await page.goto('/mentor.html');
    const before = await page.evaluate(() => window.CaissaMentorPage.inspect());
    await page.getByRole('tab', { name: 'Training' }).click();
    await page.getByLabel('Levels').selectOption('beginner');
    await page.getByLabel('Mode').selectOption('challenge');
    await page.getByRole('button', { name: 'Start Memory Training' }).click();
    await expect(page.locator('#memory-state')).toContainText('3 pieces');
    await expect(page.locator('#memory-state')).toContainText('First-exposure scored challenge');
    await expect(page.locator('#memory-state')).toContainText('Source: Puzzles catalog');
    const paletteAssets = await page.locator('#memory-palette img').evaluateAll(images => images.map(image => ({ src: image.getAttribute('src'), alt: image.getAttribute('alt'), complete: image.complete, width: image.naturalWidth })));
    expect(paletteAssets).toHaveLength(12);
    expect(paletteAssets.every(asset => /^\/img\/chesspieces\/wikipedia\/[wb][KQRBNP]\.png$/.test(asset.src) && asset.alt && asset.complete && asset.width > 0)).toBe(true);
    await expect(page.locator('#study-engine')).toBeDisabled();
    await page.getByRole('button', { name: 'Hide & rebuild' }).click();
    await expect(page.locator('#mentor-board .caissa-board__piece')).toHaveCount(0);
    await page.locator('#memory-palette').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('mentor-memory-reconstruct.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobilePalette = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('#memory-palette button')];
        const boxes = buttons.map(button => button.getBoundingClientRect().toJSON());
        return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            whiteTop: boxes.slice(0, 6).map(box => Math.round(box.top)),
            blackTop: boxes.slice(6, 12).map(box => Math.round(box.top)),
            pairedLeft: boxes.slice(0, 6).map((box, index) => [Math.round(box.left), Math.round(boxes[index + 6].left)]),
            eraseTop: Math.round(boxes[12].top)
        };
    });
    expect(mobilePalette.overflow).toBeLessThanOrEqual(1);
    expect(new Set(mobilePalette.whiteTop).size).toBe(1);
    expect(new Set(mobilePalette.blackTop).size).toBe(1);
    expect(mobilePalette.pairedLeft.every(([white, black]) => white === black)).toBe(true);
    expect(mobilePalette.eraseTop).toBeGreaterThan(mobilePalette.blackTop[0]);
    await page.screenshot({ path: testInfo.outputPath('mentor-memory-reconstruct-390x844.png'), fullPage: true });
    await page.getByRole('button', { name: 'Check reconstruction' }).click();
    await expect(page.locator('#memory-progress')).toContainText('1 scored / 0 practice attempts');
    await expect(page.locator('#memory-feedback')).toContainText('expected');
    const failedFen = await page.evaluate(() => window.CaissaMentorPage.inspect().memory.exercise.fen);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.locator('#memory-state')).toContainText('Unscored practice');
    expect(await page.evaluate(() => window.CaissaMentorPage.inspect().memory.exercise.fen)).toBe(failedFen);
    await page.getByRole('button', { name: 'Hide & rebuild' }).click();
    await reconstructCurrentMemoryPosition(page);
    await page.getByRole('button', { name: 'Check reconstruction' }).click();
    await expect(page.locator('#memory-state')).toContainText('Correct reconstruction');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('#memory-state')).toContainText('Observe the position');
    expect(await page.evaluate(() => window.CaissaMentorPage.inspect().memory.exercise.fen)).not.toBe(failedFen);
    await page.getByRole('tab', { name: 'Moves' }).click();
    const after = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(after.fen).toBe(before.fen);
    expect(after.cursor).toBe(before.cursor);
    expect(after.memory.phase).toBe('idle');
    await expect(page.locator('#study-engine')).toBeEnabled();
});

test('Opening training captures the full ECO line, hides future moves and restores the study', async ({ page }, testInfo) => {
    let puzzleRequests = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/puzzles/select') puzzleRequests += 1; });
    await page.goto('/mentor.html');
    await page.getByRole('tab', { name: 'Opening', exact: true }).click();
    await page.getByLabel('Find an opening or ECO code').fill('C60');
    await expect(page.locator('#opening-list .opening-card').first()).toBeVisible();
    await page.locator('#opening-list .opening-card').first().click();
    await page.getByRole('button', { name: 'First position' }).click();
    const before = await page.evaluate(() => window.CaissaMentorPage.inspect());
    await page.getByRole('tab', { name: 'Opening', exact: true }).click();
    await page.getByRole('button', { name: 'Send to Training Opening' }).click();
    await expect(page.getByRole('tab', { name: 'Training' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.training-tabs').getByRole('tab', { name: 'Opening', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#memory-panel')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Start Memory Training' })).toBeHidden();
    await expect(page.locator('#opening-training-footer')).toBeVisible();
    await expect(page.locator('#opening-training-notation button')).toHaveCount(5);
    const captured = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(captured.openingTraining.total).toBe(5);
    expect(captured.openingTraining.source).toBe('eco');
    expect(captured.cursor).toBe(0);
    expect(puzzleRequests).toBe(0);

    for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 1366, height: 768 },
        { width: 885, height: 611 },
        { width: 390, height: 844 }
    ]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            bodyOverflow: getComputedStyle(document.querySelector('.workspace-body')).overflowY,
            footer: document.querySelector('.workspace-foot').getBoundingClientRect().toJSON(),
            workspace: document.querySelector('.right-workspace').getBoundingClientRect().toJSON()
        }));
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(layout.bodyOverflow).toBe('auto');
        expect(layout.footer.bottom).toBeLessThanOrEqual(layout.workspace.bottom + 1);
        await page.screenshot({ path: testInfo.outputPath(`mentor-opening-training-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }

    await page.getByLabel('Guess the move').selectOption('white');
    await page.getByRole('button', { name: 'Guess the move', exact: true }).click();
    await expect(page.locator('#opening-training-notation')).toContainText('5 moves hidden');
    expect(await page.evaluate(() => window.CaissaMentorPage.getStudyLineSnapshot())).toBeNull();
    const root = await page.evaluate(() => window.CaissaMentorPage.inspect().fen);
    await page.locator('#mentor-board .caissa-board__square[data-square="d2"]').click();
    await page.locator('#mentor-board .caissa-board__square[data-square="d4"]').click();
    await expect(page.locator('#opening-training-status')).toHaveText('Not the move in this opening line. Try again.');
    expect(await page.evaluate(() => window.CaissaMentorPage.inspect().fen)).toBe(root);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('#mentor-board .caissa-board__square[data-square="e2"]').click();
    await page.locator('#mentor-board .caissa-board__square[data-square="e4"]').click();
    await expect(page.locator('#opening-training-status')).toContainText('e4 — correct for this line');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const afterReply = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(afterReply.openingTraining.step).toBe(2);
    expect(afterReply.openingTraining.visibleMoves.map(move => move.san)).toEqual(['e4', 'e5']);
    await page.getByRole('button', { name: 'Return to study' }).click();
    const after = await page.evaluate(() => window.CaissaMentorPage.inspect());
    expect(after.fen).toBe(before.fen);
    expect(after.cursor).toBe(before.cursor);
    expect(after.memory.phase).toBe('idle');
    expect(after.openingTrainingActive).toBe(false);
});

test('real terminal analysis keeps depth zero and restores mate-zero perspective', async ({ page }) => {
    await page.goto('/mentor.html');
    await importPgn(page, terminalPgn);
    await page.getByRole('button', { name: 'Engine', exact: true }).click();
    await expect(page.locator('#engine-status')).toContainText('Analysis complete', { timeout: 20_000 });
    await expect(page.locator('.evaluation-point').last()).toHaveAttribute('aria-label', 'Position 4: −M0 · depth 0');
    await expect(page.locator('.evaluation-point').last()).toHaveAttribute('data-side', 'black');
});

test('PGN file keeps multiple games selectable and changing game cancels active analysis', async ({ page }) => {
    const secondPgn = ordinaryPgn.replace('Browser QA', 'Second game').replace('Alexander', 'Second player');
    await page.goto('/mentor.html');
    await page.getByRole('tab', { name: 'My account' }).click();
    await page.getByRole('button', { name: 'Local PGN' }).click();
    await page.getByLabel('Choose a PGN file').setInputFiles({
        name: 'mentor-two-games.pgn',
        mimeType: 'application/x-chess-pgn',
        buffer: Buffer.from(`${ordinaryPgn}\n\n${secondPgn}`)
    });
    await page.getByRole('button', { name: 'Load PGN Games' }).click();
    await expect(page.getByLabel('Imported games').locator('option')).toHaveCount(2);

    await page.getByRole('button', { name: 'Engine', exact: true }).click();
    await page.getByLabel('Imported games').selectOption('1');
    await expect(page.getByRole('heading', { name: 'Second player vs CAISSA' })).toBeVisible();
    await expect(page.locator('#engine-status')).toHaveText('Use Engine to analyse this line. No evaluation has been calculated.');
    await expect(page.getByRole('button', { name: 'Engine', exact: true })).toHaveText('Engine');
    await page.waitForTimeout(300);
    await expect(page.locator('.evaluation-point')).toHaveCount(0);
});

test('missing Stockfish WASM fails visibly without inventing evaluations', async ({ page }) => {
    await page.route('**/stockfish-19-lite-single.wasm', route => route.abort());
    await page.goto('/mentor.html');
    await page.getByRole('button', { name: 'Engine', exact: true }).click();
    await expect(page.locator('#engine-status')).toContainText('Analysis unavailable', { timeout: 10_000 });
    await expect(page.locator('#evaluation-chart')).toHaveText('Evaluation timeline · Not analysed');
    await expect(page.locator('.evaluation-point')).toHaveCount(0);
});
