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
