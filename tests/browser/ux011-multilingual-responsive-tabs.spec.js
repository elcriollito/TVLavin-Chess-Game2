import { test, expect } from '@playwright/test';

test.setTimeout(240_000);

const routes = [
    ['/play', 'games'], ['/play/games', 'games'], ['/play/bots', 'bots'], ['/play/coach', 'coach']
];
const widths = [320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440, 1920];

async function prepare(page, locale) {
    await page.addInitScript(value => {
        localStorage.setItem('caissa.locale', value);
        localStorage.setItem('caissa_onboarding_completed', 'true');
    }, locale);
}

async function tabGeometry(page) {
    return page.locator('.caissa-simplified-shell__modes').evaluate(nav => {
        const box = node => {
            const rect = node.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                width: rect.width, height: rect.height };
        };
        const tabs = [...nav.querySelectorAll('[role="tab"]')];
        const navBox = box(nav);
        const tabBoxes = tabs.map(tab => ({ ...box(tab), text: tab.textContent.trim(),
            clippedX: tab.scrollWidth > tab.clientWidth + 1,
            clippedY: tab.scrollHeight > tab.clientHeight + 1 }));
        const overlaps = tabBoxes.some((left, index) => tabBoxes.slice(index + 1).some(right =>
            left.left < right.right - 1 && left.right > right.left + 1
            && left.top < right.bottom - 1 && left.bottom > right.top + 1));
        return {
            nav: navBox, tabs: tabBoxes, overlaps,
            overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    });
}

function expectBounded(geometry, context) {
    expect(geometry.overlaps, `${context}: tabs overlap`).toBe(false);
    expect(geometry.overflowX, `${context}: document overflow`).toBeLessThanOrEqual(1);
    for (const tab of geometry.tabs) {
        expect(tab.text, `${context}: empty label`).not.toBe('');
        expect(tab.left, `${context}: tab left bound`).toBeGreaterThanOrEqual(geometry.nav.left - 1);
        expect(tab.right, `${context}: tab right bound`).toBeLessThanOrEqual(geometry.nav.right + 1);
        expect(tab.clippedX, `${context}: ${tab.text} clipped horizontally`).toBe(false);
        expect(tab.clippedY, `${context}: ${tab.text} clipped vertically`).toBe(false);
        expect(tab.height, `${context}: touch target`).toBeGreaterThanOrEqual(44);
        expect(tab.height, `${context}: excessive tab height`).toBeLessThanOrEqual(84);
    }
}

test('EN, ES, and PT Play tabs remain bounded at the certified viewport matrix', async ({ page }) => {
    for (const locale of ['en', 'es', 'pt']) {
        await prepare(page, locale);
        for (const width of widths) {
            await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
            for (const [route, active] of routes) {
                await page.goto(route);
                const nav = page.locator('.caissa-simplified-shell__modes');
                await expect(nav).toBeVisible();
                await expect(nav.locator(`[data-shell-mode="${active}"]`)).toHaveAttribute('aria-selected', 'true');
                expectBounded(await tabGeometry(page), `${locale} ${route} ${width}px`);
            }
        }
    }
});

test('QA-only 40 percent text expansion remains readable at effective panel widths', async ({ page }) => {
    await prepare(page, 'en');
    for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
        await page.goto('/play');
        await page.locator('[data-shell-mode]').evaluateAll(tabs => tabs.forEach(tab => {
            const source = tab.textContent.trim();
            tab.textContent = `${source} ${'W'.repeat(Math.ceil(source.length * .4))}`;
            tab.dataset.qaExpandedLabel = 'true';
        }));
        expectBounded(await tabGeometry(page), `pseudo-expanded /play ${width}px`);
    }
});

test('desktop sidebar states preserve tabs and effective-panel containment', async ({ page }) => {
    await prepare(page, 'es');
    for (const width of [1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/play');
        for (const collapsed of [false, true]) {
            await page.locator('.app-container').evaluate((node, value) => node.classList.toggle('nav-collapsed', value), collapsed);
            expectBounded(await tabGeometry(page), `sidebar ${collapsed ? 'compact' : 'expanded'} ${width}px`);
        }
    }
});

test('representative Play controls and panels tolerate QA-only text expansion', async ({ page }) => {
    await prepare(page, 'es');
    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 769 ? 844 : 900 });
        for (const [route] of routes) {
            await page.goto(route);
            const root = page.locator('.caissa-simplified-shell__context');
            await expect(root).toBeVisible();
            await root.evaluate(element => {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                const nodes = [];
                while (walker.nextNode()) nodes.push(walker.currentNode);
                for (const node of nodes) {
                    const parent = node.parentElement;
                    const value = node.nodeValue.trim();
                    if (!value || value.length < 4 || value.length > 100
                        || parent.closest('[data-shell-mode], .caissa-bots-panel__bot-name, [data-pgn-notation]')) continue;
                    const style = getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
                        || parent.closest('[hidden]')) continue;
                    const words = value.split(/\s+/);
                    let suffix = '';
                    while (suffix.length < Math.ceil(value.length * .4)) suffix += ` ${words[suffix.length % words.length]}`;
                    node.nodeValue = `${node.nodeValue}${suffix}`;
                }
            });
            const geometry = await root.evaluate(element => ({
                rootOverflow: element.scrollWidth - element.clientWidth,
                documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                overflowing: [...element.querySelectorAll('*')]
                    .filter(node => node.getClientRects().length > 0 && node.scrollWidth > node.clientWidth + 2)
                    .map(node => ({ className: node.className, tag: node.tagName,
                        overflow: node.scrollWidth - node.clientWidth, text: node.textContent.trim().slice(0, 80) })),
                clippedControls: [...element.querySelectorAll('button, select, input, summary')]
                    .filter(node => node.getClientRects().length > 0)
                    .filter(node => node.scrollWidth > node.clientWidth + 2)
                    .map(node => node.textContent.trim() || node.getAttribute('aria-label') || node.tagName)
            }));
            expect(geometry.documentOverflow, `${route} ${width}px document overflow`).toBeLessThanOrEqual(1);
            expect(geometry.rootOverflow, `${route} ${width}px panel overflow: ${JSON.stringify(geometry.overflowing)}`).toBeLessThanOrEqual(2);
            expect(geometry.clippedControls, `${route} ${width}px clipped controls`).toEqual([]);
        }
    }
});

test('bot tooltips and the board-settings dialog stay contained with longer copy', async ({ page }) => {
    await prepare(page, 'es');
    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/play/bots');
        const botPanel = page.locator('.caissa-bots-panel');
        const cards = botPanel.locator('.caissa-bots-panel__bot:visible');
        const cardCount = await cards.count();
        for (const index of [0, 2, cardCount - 1]) {
            const card = cards.nth(index);
            await card.locator('.caissa-bots-panel__bot-meta').evaluate(node => { node.textContent += ` ${node.textContent} ${node.textContent}`; });
            await card.hover();
            const contained = await card.locator('.caissa-bots-panel__bot-meta').evaluate((node, rootSelector) => {
                const rect = node.getBoundingClientRect();
                const root = document.querySelector(rootSelector).getBoundingClientRect();
                return rect.left >= root.left - 1 && rect.right <= root.right + 1;
            }, '.caissa-bots-panel');
            expect(contained, `bot tooltip ${index} at ${width}px`).toBe(true);
        }

        await page.goto('/play');
        const dialog = page.locator('[data-active-game-settings]');
        await dialog.evaluate(node => {
            node.hidden = false;
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const value = walker.currentNode.nodeValue.trim();
                if (value.length >= 4) walker.currentNode.nodeValue += ` ${value.slice(0, Math.ceil(value.length * .4))}`;
            }
        });
        const geometry = await dialog.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return {
                inside: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
                overflow: node.scrollWidth - node.clientWidth,
                clipped: [...node.querySelectorAll('button, input')]
                    .filter(control => control.scrollWidth > control.clientWidth + 2).length
            };
        });
        expect(geometry.inside, `settings dialog viewport containment at ${width}px`).toBe(true);
        expect(geometry.overflow, `settings dialog overflow at ${width}px`).toBeLessThanOrEqual(2);
        expect(geometry.clipped, `settings dialog clipped controls at ${width}px`).toBe(0);
    }
});

test('keyboard, click, active state, and translated labels remain intact', async ({ page }) => {
    await prepare(page, 'es');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play');
    const tabs = page.locator('.caissa-simplified-shell__modes');
    await expect(tabs.locator('[data-shell-mode="games"]')).toHaveText('Jugar partida');
    await tabs.locator('[data-shell-mode="games"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/play\/bots$/);
    await expect(tabs.locator('[data-shell-mode="bots"]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page).toHaveURL(/\/play\/coach$/);
    await expect(tabs.locator('[data-shell-mode="coach"]')).toHaveAttribute('aria-selected', 'true');
    await tabs.locator('[data-shell-mode="games"]').click();
    await expect(page).toHaveURL(/\/play\/games$/);
    await expect(tabs.locator('[data-shell-mode="games"]')).toHaveAttribute('aria-selected', 'true');
});
