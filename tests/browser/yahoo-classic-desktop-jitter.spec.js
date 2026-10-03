import { test, expect } from '@playwright/test';

const DESKTOP_VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1600, height: 900 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 }
];

const getBoardRect = page => page.locator('#ycClassicBoard').evaluate((board) => {
    const rect = board.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height].map(value => Number(value.toFixed(3)));
});

async function waitForAnimationFrames(page, count = 3) {
    await page.evaluate(async (frameCount) => {
        for (let index = 0; index < frameCount; index += 1) {
            await new Promise(requestAnimationFrame);
        }
    }, count);
}

async function openClassicTable(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/yahoo-classic', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.CaissaYahooClassic?.elements?.shell);
    return page.evaluate(() => {
        window.CaissaYahooClassic.openTable('42', {
            white: 'Alpha', black: 'Beta', whiteRating: '1800', blackRating: '1900',
            timeControl: '5+0', label: 'Rated'
        }, 'watching');
        const rect = document.getElementById('ycClassicBoard').getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map(value => Number(value.toFixed(3)));
    });
}

test('Classic desktop board has zero drift across rooms, updates, idle, and resize', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    const runtimeProblems = [];
    page.on('console', (message) => {
        const text = message.text();
        if (/ResizeObserver loop/i.test(text) || (/yahoo-classic-section/i.test(text) && message.type() === 'error')) {
            runtimeProblems.push(text);
        }
    });
    page.on('pageerror', (error) => {
        if (/ResizeObserver loop|yahoo-classic-section/i.test(error.message)) runtimeProblems.push(error.message);
    });

    for (const viewport of DESKTOP_VIEWPORTS) {
        const firstPaintRect = await openClassicTable(page, viewport);
        await waitForAnimationFrames(page);
        const settledRect = await getBoardRect(page);
        expect(settledRect, `${viewport.width}x${viewport.height} changed after its sizing frame`).toEqual(firstPaintRect);

        for (const room of ['Tournament Hall', 'CAISSA Lobby', 'Tournament Hall', 'CAISSA Lobby']) {
            await page.locator(`.yc-tab[data-room="${room}"]`).click();
            await waitForAnimationFrames(page, 2);
            expect(await getBoardRect(page), `${viewport.width}x${viewport.height} drifted in ${room}`).toEqual(settledRect);
        }

        await page.evaluate(() => {
            const classic = window.CaissaYahooClassic;
            classic.elements.blackPlayerBar.querySelector('.yc-player-clock').textContent = '0:59';
            classic.elements.whitePlayerBar.querySelector('.yc-player-state').textContent = 'Thinking';
            classic.addSystemMessage('Synthetic table update for desktop layout stability.');
            classic.addActivity('Synthetic room event for desktop layout stability.', 'notify');
            classic.renderGameExperience();
        });
        await waitForAnimationFrames(page, 3);
        expect(await getBoardRect(page), `${viewport.width}x${viewport.height} drifted after dynamic updates`).toEqual(settledRect);

        const idleRects = [];
        for (let sample = 0; sample < 10; sample += 1) {
            await waitForAnimationFrames(page);
            idleRects.push(await getBoardRect(page));
        }
        expect(idleRects.every(rect => JSON.stringify(rect) === JSON.stringify(settledRect))).toBe(true);

        const narrowerWidth = Math.max(821, viewport.width - 160);
        await page.setViewportSize({ width: narrowerWidth, height: viewport.height - 80 });
        await waitForAnimationFrames(page, 4);
        await page.setViewportSize(viewport);
        await waitForAnimationFrames(page, 4);
        expect(await getBoardRect(page), `${viewport.width}x${viewport.height} did not converge after resize`).toEqual(settledRect);
    }

    expect(runtimeProblems).toEqual([]);
});

test('Classic Engine Room applies navigation geometry in one pass', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.goto('/yahoo-classic', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.CaissaYahooClassic?.elements?.shell);

    await page.evaluate(() => {
        const classic = window.CaissaYahooClassic;
        classic.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
        classic.render();
        classic.openTable('engine-room-geometry', {
            white: 'GuestAudit', black: 'IFDStock', whiteRating: 'Guest', blackRating: '2985',
            timeControl: '3+2', label: 'Unrated'
        }, 'playing');
    });

    const measurement = await page.evaluate(async () => {
        const board = document.getElementById('ycClassicBoard');
        const panel = board.closest('.yc-game-board-panel');
        const sidebar = document.querySelector('.caissa-standalone-sidebar-host');
        const app = document.getElementById('app');
        const rect = element => {
            const bounds = element.getBoundingClientRect();
            return [bounds.x, bounds.y, bounds.width, bounds.height].map(value => Number(value.toFixed(3)));
        };
        const before = { panel: rect(panel), board: rect(board) };
        const transitions = {
            app: getComputedStyle(app).transitionDuration,
            sidebar: sidebar ? getComputedStyle(sidebar).transitionDuration : 'absent',
            panel: getComputedStyle(panel).transitionDuration,
            board: getComputedStyle(board).transitionDuration
        };

        document.getElementById('navCollapseBtn').click();
        const frames = [];
        for (let frame = 0; frame < 20; frame += 1) {
            await new Promise(requestAnimationFrame);
            frames.push({ panel: rect(panel), board: rect(board) });
        }
        return { before, transitions, frames };
    });

    expect(measurement.transitions.app).toBe('0s');
    expect(['absent', '0s']).toContain(measurement.transitions.sidebar);
    expect(measurement.transitions.panel).toBe('0s');
    expect(measurement.transitions.board).toBe('0s');
    expect(measurement.frames[0]).not.toEqual(measurement.before);
    expect(measurement.frames.every(frame => JSON.stringify(frame) === JSON.stringify(measurement.frames[0]))).toBe(true);

    await page.evaluate(() => window.CaissaYahooClassic.closeTable(false));
    await expect(page.locator('.yc-shell')).not.toHaveClass(/yc-table-open/);
    await expect(page.locator('#ycGameWindow')).toHaveAttribute('aria-hidden', 'true');
});

test('Classic Engine Room remains stable at browser zoom-equivalent viewports', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));

    for (const zoom of [0.9, 1, 1.1, 1.25]) {
        await page.setViewportSize({
            width: Math.round(1440 / zoom),
            height: Math.round(900 / zoom)
        });
        await page.goto('/yahoo-classic', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.CaissaYahooClassic?.elements?.shell);
        const measurement = await page.evaluate(async () => {
            const classic = window.CaissaYahooClassic;
            classic.currentRoom = { name: 'Computer Hall', description: 'Computer play.' };
            classic.render();
            classic.openTable('engine-room-zoom', {
                white: 'GuestAudit', black: 'IFDStock', timeControl: '3+2', label: 'Unrated'
            }, 'playing');

            const board = document.getElementById('ycClassicBoard');
            const panel = board.closest('.yc-game-board-panel');
            const rect = element => {
                const bounds = element.getBoundingClientRect();
                return [bounds.x, bounds.y, bounds.width, bounds.height].map(value => Number(value.toFixed(3)));
            };
            const first = { board: rect(board), panel: rect(panel) };
            const samples = [];
            for (let frame = 0; frame < 30; frame += 1) {
                await new Promise(requestAnimationFrame);
                samples.push({ board: rect(board), panel: rect(panel) });
            }
            return {
                first,
                samples,
                cssZoom: getComputedStyle(board).zoom,
                transform: getComputedStyle(board).transform,
                visualViewportScale: visualViewport?.scale || 1
            };
        });

        expect(measurement.cssZoom, `CSS zoom changed at ${zoom * 100}%`).toBe('1');
        expect(measurement.transform, `board transform changed at ${zoom * 100}%`).toBe('none');
        expect(measurement.visualViewportScale, `responsive emulation leaked at ${zoom * 100}%`).toBe(1);
        expect(measurement.samples.every(sample => JSON.stringify(sample) === JSON.stringify(measurement.first)),
            `board drifted at ${zoom * 100}%`).toBe(true);
    }
});
