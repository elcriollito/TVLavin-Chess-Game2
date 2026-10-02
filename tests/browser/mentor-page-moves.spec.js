import { test, expect } from '@playwright/test';

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

async function importPgn(page, pgn) {
    await page.getByRole('tab', { name: 'My account' }).click();
    await page.getByRole('button', { name: 'Local PGN' }).click();
    await page.getByLabel('Or paste your games').fill(pgn);
    await page.getByRole('button', { name: 'Load PGN Games' }).click();
    await expect(page.getByRole('tab', { name: 'Moves' })).toHaveAttribute('aria-selected', 'true');
}

test('Mentor page keeps one responsive board workspace with five readable tabs', async ({ page }, testInfo) => {
    await page.goto('/mentor.html');
    await expect(page.getByRole('heading', { name: 'CAISSA Mentor', level: 1 })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText([/Chat/, 'Moves', 'Learn', 'Opening', 'My account']);

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
            tabRects: [...document.querySelectorAll('[role=tab]')].map(node => node.getBoundingClientRect().toJSON()),
            workspaceRect: document.querySelector('.right-workspace').getBoundingClientRect().toJSON()
        }));
        expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(layout.bodyOverflow).toBe('auto');
        expect(layout.workspaceOverflow).toBe('hidden');
        for (const rect of layout.tabRects) {
            expect(rect.left).toBeGreaterThanOrEqual(layout.workspaceRect.left);
            expect(rect.right).toBeLessThanOrEqual(layout.workspaceRect.right + 1);
        }
        await page.screenshot({ path: testInfo.outputPath(`mentor-chat-${viewport.width}x${viewport.height}.png`), fullPage: true });
    }
});

test('Local PGN drives Moves, real Stockfish 19 evidence and explicit Chat review', async ({ page }, testInfo) => {
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
    await expect(page.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Ask Mentor')).toHaveValue(/Local Stockfish 19 evaluated the selected position.*depth 12.*White’s perspective/s);
    await page.getByRole('tab', { name: 'Learn' }).click();
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
