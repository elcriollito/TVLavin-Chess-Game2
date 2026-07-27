import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const artifact = JSON.parse(await readFile(new URL(
    '../../public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json',
    import.meta.url
), 'utf8'));
const byTitle = new Map(artifact.positions.map((position) => [position.title, position]));

async function openV2(page) {
    await page.goto('/endgame-trainer');
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/is-v2/);
    await expect(page.locator('[data-v2-action="start"]')).toBeVisible();
}

async function currentPosition(page) {
    const label = await page.locator('[data-v2-item-label]').innerText();
    const title = label.split('·').at(-1).trim();
    const position = byTitle.get(title);
    expect(position, `Unknown browser position title: ${title}`).toBeTruthy();
    return position;
}

async function playLanWithPointer(page, lan) {
    await page.locator(`.square-${lan.slice(0, 2)}`).click();
    await page.locator(`.square-${lan.slice(2, 4)}`).click();
}

async function playLanWithKeyboard(page, lan, orientation) {
    const root = page.locator('[data-board]');
    await root.focus();
    let file = 0;
    let rank = 1;
    const moveFocus = async (target) => {
        const targetFile = target.charCodeAt(0) - 97;
        const targetRank = Number(target[1]);
        while (file !== targetFile) {
            const visualRight = file < targetFile;
            await page.keyboard.press(visualRight === (orientation === 'white') ? 'ArrowRight' : 'ArrowLeft');
            file += visualRight ? 1 : -1;
        }
        while (rank !== targetRank) {
            const visualUp = rank < targetRank;
            await page.keyboard.press(visualUp === (orientation === 'white') ? 'ArrowUp' : 'ArrowDown');
            rank += visualUp ? 1 : -1;
        }
    };
    await moveFocus(lan.slice(0, 2));
    await page.keyboard.press('Enter');
    await moveFocus(lan.slice(2, 4));
    await page.keyboard.press('Enter');
}

test('canonical default starts and completes a five-position curated challenge', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await openV2(page);
    const storageBefore = await page.evaluate(async () => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
        databases: indexedDB.databases ? (await indexedDB.databases()).map(({ name, version }) => ({ name, version })) : []
    }));
    await page.locator('[data-v2-action="start"]').click();
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-active');
    for (let index = 0; index < 5; index += 1) {
        const position = await currentPosition(page);
        await playLanWithPointer(page, position.expectedLan);
        await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-feedback');
        if (index < 4) await page.locator('[data-v2-action="continue"]').click();
        else await page.locator('[data-v2-action="continue"]').click();
    }
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-completed');
    await expect(page.locator('[data-v2-summary]')).toBeVisible();
    await expect(page.locator('[data-v2-summary-completed]')).toHaveText('5');
    await expect(page.locator('[data-v2-summary-score]')).toHaveText('500');
    const storageAfter = await page.evaluate(async () => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
        databases: indexedDB.databases ? (await indexedDB.databases()).map(({ name, version }) => ({ name, version })) : []
    }));
    expect(storageAfter).toEqual(storageBefore);
    expect(requests.filter(url => /\/api\/|analytics|collect|beacon/i.test(url) &&
        /score|streak|timer|endgame[-_/]?event/i.test(url))).toEqual([]);
    await expect(page.locator('[data-v2-exit]')).toHaveText('Return to Endgame Trainer');
    await page.locator('[data-v2-exit]').click();
    await expect(page).toHaveURL(/\/endgame-trainer$/);
    await expect(page.getByRole('heading', { name: 'CAISSA Endgame Trainer' })).toBeVisible();
});

test('incorrect move, hint, reveal answer, and Continue are truthful', async ({ page }) => {
    await openV2(page);
    await page.locator('[data-v2-action="start"]').click();
    await expect(page.locator('[data-v2-item-label]')).toContainText('1 of 5');
    const position = await currentPosition(page);
    const accepted = new Set([position.expectedLan, ...position.acceptedAlternatives.map(({ lan }) => lan)]);
    const source = position.expectedLan.slice(0, 2);
    const legalTargets = await page.locator(`.square-${source}`).click().then(async () =>
        page.locator('.et-board-legal,.et-board-capture').evaluateAll((nodes) =>
            nodes.map((node) => [...node.classList].find((name) => /^square-[a-h][1-8]$/.test(name)).slice(7))));
    const wrongTarget = legalTargets.find((target) => !accepted.has(`${source}${target}`));
    if (wrongTarget) {
        await page.locator(`.square-${wrongTarget}`).click();
        await expect(page.locator('[data-v2-feedback]')).toContainText(position.feedback.incorrect);
        await page.locator('[data-v2-action="continue"]').click();
    } else {
        await page.keyboard.press('Escape');
    }
    await page.locator('[data-v2-action="hint"]').click();
    await expect(page.locator('[data-v2-action="hint"]')).toHaveText('Reveal answer');
    await page.locator('[data-v2-action="hint"]').click();
    await expect(page.locator('[data-v2-feedback]')).toContainText('Answer revealed');
    await expect(page.locator('[data-v2-score]')).toHaveText('0');
});

test('keyboard board move, modal Escape, and focus return work', async ({ page }) => {
    await openV2(page);
    const start = page.locator('[data-v2-action="start"]');
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-v2-item-label]')).toContainText('1 of 5');
    const position = await currentPosition(page);
    await playLanWithKeyboard(page, position.expectedLan, position.sideToMove);
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-feedback');
    const modes = page.locator('[data-v2-open-modes]');
    await modes.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-v2-modes-dialog]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-v2-close-modes]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modes).toBeFocused();
});

test('adjudicated accepted alternative succeeds with truthful live feedback', async ({ page }) => {
    await openV2(page);
    await page.locator('[data-v2-action="start"]').click();
    await expect(page.locator('[data-v2-item-label]')).toContainText('1 of 5');
    for (let index = 0; index < 5; index += 1) {
        const position = await currentPosition(page);
        if (position.acceptedAlternatives.length) {
            await playLanWithPointer(page, position.acceptedAlternatives[0].lan);
            await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-feedback');
            await expect(page.locator('[data-v2-feedback]')).toContainText(position.feedback.correct);
            return;
        }
        await playLanWithPointer(page, position.expectedLan);
        await page.locator('[data-v2-action="continue"]').click();
    }
    throw new Error('selected session did not contain an approved alternative');
});

test('explicit legacy, redundant V2 alias, and Guided Study precedence remain intact', async ({ page }) => {
    await page.goto('/endgame-trainer');
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/is-v2/);
    await page.goto('/endgame-trainer?trainerV2=1');
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/is-v2/);
    await page.goto('/endgame-trainer?legacy=1');
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/is-legacy/);
    await expect(page.locator('[data-action="prepare"]')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.caissa-chess.org/endgame-trainer');
    await page.goto('/endgame-trainer?trainerV2=1&studyUnit=direct-opposition&release=rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84');
    await expect(page.locator('[data-endgame-trainer-page]')).not.toHaveClass(/is-v2/);
    await expect(page.locator('[data-library-study]')).toBeVisible();
});

test('invalid selectors fail closed without silently mounting legacy', async ({ page }) => {
    await page.goto('/endgame-trainer?legacy=1&trainerV2=1');
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'technical-unavailable');
    await expect(page.locator('[data-trainer-load-error]')).toBeVisible();
    await expect(page.locator('[data-trainer-load-error]')).toContainText('We could not load the trainer');
    await expect(page.locator('[data-trainer-load-error] a[href="/endgame-trainer?legacy=1"]')).toBeVisible();
    await expect(page.locator('[data-action="prepare"]')).not.toBeVisible();
});

test('historical run and objective inspector work without the redundant V2 alias', async ({ page }) => {
    await page.goto('/endgame-trainer?multiMovePilot=1&endgameRun=1');
    await expect(page.getByRole('region', { name: 'Endgame Run' })).toBeVisible();
    await page.goto('/endgame-trainer?multiMovePilot=1&objectiveArtifact=activate-king@1.0.0');
    await expect(page.getByRole('region', { name: 'Multi-Move Technical Pilot' })).toBeVisible();
    await page.getByRole('button', { name: 'Start Pilot' }).click();
    await expect(page.getByRole('heading', { name: 'Activate the king', exact: true })).toBeVisible();
});

test('V2 returns, refresh, Back and Forward never synthesize legacy', async ({ page }) => {
    await page.goto('/endgame-trainer?trainerV2=1');
    await expect(page.locator('[data-v2-exit]')).toHaveAttribute('href', '/endgame-trainer');
    await page.reload();
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveClass(/is-v2/);
    await page.goto('/endgame-trainer?multiMovePilot=1&endgameRun=1');
    await page.getByRole('button', { name: 'Exit Run' }).click();
    await expect(page).toHaveURL(/\/endgame-trainer$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/legacy=1/);
    await page.goForward();
    await expect(page).toHaveURL(/\/endgame-trainer$/);
});

test('no-JS load keeps a readable shell and functional navigation', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/endgame-trainer');
    await expect(page.locator('[data-endgame-trainer-page]')).toBeVisible();
    await expect(page.locator('.endgame-trainer-page__no-js')).toContainText(
        'CAISSA Endgame Trainer requires JavaScript to load the interactive board.'
    );
    await expect(page.locator('.endgame-trainer-page__no-js a[href="/endgame-practice"]')).toBeVisible();
    await expect(page.locator('[data-training-workspace]')).not.toBeVisible();
    await context.close();
});

test('mobile, 200 percent zoom, touch targets, and reduced motion remain bounded', async ({ page }) => {
    const matrix = [[320,568],[375,667],[390,844],[768,1024],[820,1180],[1024,768],[1280,720],[1440,900],[1920,1080]];
    for (const [width, height] of matrix) {
        await page.setViewportSize({ width, height });
        await openV2(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        const order = await page.evaluate(() => {
            const top = (selector) => document.querySelector(selector).getBoundingClientRect().top;
            return {
                metrics: top('.endgame-v2__metrics'),
                objective: top('.endgame-v2__objective'),
                board: top('.endgame-trainer-page__board-stage'),
                feedback: top('.endgame-v2__feedback'),
                actions: top('.endgame-v2__actions')
            };
        });
        if (width <= 1024) {
            expect(order.metrics).toBeLessThan(order.objective);
            expect(order.objective).toBeLessThan(order.board);
            expect(order.board).toBeLessThanOrEqual(order.feedback);
            expect(order.feedback).toBeLessThanOrEqual(order.actions);
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { document.body.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const box = await page.locator('[data-v2-action="start"]').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    const duration = await page.locator('[data-v2-action="start"]').evaluate((element) =>
        getComputedStyle(element).transitionDuration);
    expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.00001);
});

test('desktop is board-first with one primary action and only released mode destinations', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openV2(page);
    const geometry = await page.evaluate(() => {
        const board = document.querySelector('.endgame-trainer-page__board-stage').getBoundingClientRect();
        const objective = document.querySelector('.endgame-v2__objective').getBoundingClientRect();
        return { boardWidth: board.width, contentWidth: board.width + objective.width, aligned: Math.abs(board.top - document.querySelector('.endgame-v2__metrics').getBoundingClientRect().top) < 2 };
    });
    expect(geometry.boardWidth / geometry.contentWidth).toBeGreaterThanOrEqual(.55);
    expect(geometry.boardWidth / geometry.contentWidth).toBeLessThanOrEqual(.65);
    expect(geometry.aligned).toBe(true);
    expect(await page.locator('[data-action-priority="primary"]:visible').count()).toBe(1);
    await page.locator('[data-v2-open-modes]').click();
    await expect(page.locator('[data-v2-mode]')).toHaveCount(3);
    await expect(page.locator('[data-v2-modes-dialog]')).not.toContainText('Coming later');
});

test('V2 shell and Modes dialog have no automated axe violations', async ({ page }) => {
    await openV2(page);
    const shell = await new AxeBuilder({ page }).include('[data-endgame-v2-shell]').analyze();
    expect(shell.violations).toEqual([]);
    await page.locator('[data-v2-open-modes]').click();
    const dialog = await new AxeBuilder({ page }).include('[data-v2-modes-dialog]').analyze();
    expect(dialog.violations).toEqual([]);
});

test('digest mismatch blocks Start neutrally and permits retry', async ({ page }) => {
    await page.route('**/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.description += ' tampered';
        await route.fulfill({ response, json: body });
    });
    await openV2(page);
    const start = page.locator('[data-v2-action="start"]');
    await start.click();
    await expect(page.locator('[data-endgame-trainer-page]')).toHaveAttribute('data-state', 'v2-unavailable');
    await expect(page.locator('[data-v2-feedback]')).toContainText('unavailable');
    await expect(page.locator('[data-v2-score]')).toHaveText('0');
    await expect(start).toBeEnabled();
});

test('challenge reuses one board and starts no engine Worker', async ({ page, browserName }) => {
    await page.addInitScript(() => {
        const OriginalWorker = window.Worker;
        window.__caissaWorkerCount = 0;
        window.Worker = class extends OriginalWorker {
            constructor(...args) {
                window.__caissaWorkerCount += 1;
                super(...args);
            }
        };
    });
    await openV2(page);
    const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    const startAt = performance.now();
    await page.locator('[data-v2-action="start"]').click();
    await expect(page.locator('[data-v2-item-label]')).toContainText('1 of 5');
    const startMs = performance.now() - startAt;
    const position = await currentPosition(page);
    await playLanWithPointer(page, position.expectedLan);
    const transitionAt = performance.now();
    await page.locator('[data-v2-action="continue"]').click();
    await expect(page.locator('[data-v2-item-label]')).toContainText('2 of 5');
    const transitionMs = performance.now() - transitionAt;
    const runtime = await page.evaluate(() => ({
        boards: document.querySelectorAll('[data-board]').length,
        workers: window.__caissaWorkerCount,
        heapAfter: performance.memory?.usedJSHeapSize ?? null
    }));
    expect(runtime.boards).toBe(1);
    expect(runtime.workers).toBe(0);
    if (heapBefore !== null && runtime.heapAfter !== null)
        expect(runtime.heapAfter - heapBefore).toBeLessThan(20 * 1024 * 1024);
    console.log(JSON.stringify({
        browserName,
        challengeStartMs: Math.round(startMs),
        itemTransitionMs: Math.round(transitionMs),
        heapDeltaBytes: heapBefore === null ? null : runtime.heapAfter - heapBefore,
        boards: runtime.boards,
        workers: runtime.workers
    }));
});
