import { test, expect } from '@playwright/test';

test.setTimeout(300_000);

const widths = [320, 360, 375, 390, 393, 412, 430, 768, 1024, 1280, 1440, 1920];
const expectedTabs = {
    en: ['Play Game', 'Play Bots', 'Play Coach'],
    es: ['Jugar partida', 'Jugar contra bots', 'Jugar con Coach'],
    pt: ['Jogar partida', 'Jogar contra bots', 'Jogar com Coach']
};

async function prepare(page, locale) {
    const context = page.context();
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: 'pk_test_gl0021_contract_123456789', registrationTracking: true })
    }));
    await context.route('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js', route => route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: 'window.Clerk={user:null,session:null,load:async()=>{},addListener:()=>{},signOut:async()=>{}};'
    }));
    await page.addInitScript(value => {
        Object.defineProperty(HTMLScriptElement.prototype, 'integrity', {
            configurable: true, get: () => '', set: () => {}
        });
        localStorage.setItem('caissa_onboarding_completed', 'true');
        localStorage.setItem('caissa.locale', value);
    }, locale);
}

async function wordPresentation(locator) {
    return locator.evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        const words = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            for (const match of node.nodeValue.matchAll(/\S+/gu)) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
                words.push({ word: match[0], lineFragments: rects.length,
                    tops: [...new Set(rects.map(rect => Math.round(rect.top)))].length });
            }
        }
        return {
            text: element.textContent.trim(),
            overflowWrap: style.overflowWrap,
            wordBreak: style.wordBreak,
            hyphens: style.hyphens,
            overflowX: element.scrollWidth - element.clientWidth,
            overflowY: element.scrollHeight - element.clientHeight,
            fragmented: words.filter(word => word.lineFragments > 1 || word.tops > 1)
        };
    }));
}

function expectNaturalWords(presentation, context) {
    for (const item of presentation) {
        expect(item.overflowWrap, `${context}: ${item.text}`).toBe('normal');
        expect(item.wordBreak, `${context}: ${item.text}`).toBe('normal');
        expect(item.hyphens, `${context}: ${item.text}`).toBe('none');
        expect(item.fragmented, `${context}: ${item.text}`).toEqual([]);
        expect(item.overflowX, `${context}: ${item.text} horizontal clipping`).toBeLessThanOrEqual(1);
        expect(item.overflowY, `${context}: ${item.text} vertical clipping`).toBeLessThanOrEqual(1);
    }
}

test('EN, ES, and PT Play tabs wrap only at word boundaries', async ({ page }) => {
    for (const locale of Object.keys(expectedTabs)) {
        await prepare(page, locale);
        for (const width of widths) {
            await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 });
            await page.goto('/play');
            const tabs = page.locator('.caissa-simplified-shell__mode');
            await expect(tabs).toHaveText(expectedTabs[locale]);
            expectNaturalWords(await wordPresentation(tabs), `${locale} ${width}px`);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
                `${locale} ${width}px document overflow`).toBeLessThanOrEqual(1);
        }
    }
});

test('narrow effective desktop panels and 40 percent expansion keep whole words', async ({ page }) => {
    await prepare(page, 'pt');
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const effectiveWidth of [260, 300, 340, 420]) {
        await page.goto('/play');
        const modes = page.locator('.caissa-simplified-shell__modes');
        await modes.evaluate((node, value) => { node.style.width = `${value}px`; }, effectiveWidth);
        await modes.locator('[data-shell-mode]').evaluateAll(tabs => tabs.forEach(tab => {
            const source = tab.textContent.trim();
            const words = source.split(/\s+/u);
            let suffix = '';
            for (let index = 0; suffix.length < Math.ceil(source.length * .4); index += 1) {
                suffix += ` ${words[index % words.length]}`;
            }
            tab.textContent = `${source}${suffix}`;
        }));
        expectNaturalWords(await wordPresentation(modes.locator('[data-shell-mode]')), `effective ${effectiveWidth}px`);
        expect(await modes.evaluate(node => node.scrollWidth - node.clientWidth), `effective ${effectiveWidth}px modes overflow`).toBeLessThanOrEqual(1);
    }
});

test('mobile sidebar Premium, upgrade, and auth labels keep whole words with UX-012 state', async ({ page }) => {
    await prepare(page, 'pt');
    await page.addInitScript(() => localStorage.setItem('caissa_nav_state', JSON.stringify({
        currentSection: 'play', isNavCollapsed: true
    })));
    for (const width of [320, 360, 375, 390, 393, 412, 430]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/play', { waitUntil: 'domcontentloaded' });
        await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toBe('anonymous');
        await page.locator('#mobileNavToggle').click();
        await expect(page.locator('#mainNav')).not.toHaveAttribute('inert', '');
        const labels = page.locator('#mainNav').locator([
            '.nav-premium-btn .nav-label', '.nav-premium-badge',
            '#sidebarSignIn .nav-label', '#sidebarCreateAccount .nav-label'
        ].join(','));
        await expect(labels).toHaveText(['Entrar', 'Criar conta', 'Premium', 'Melhorar plano']);
        expectNaturalWords(await wordPresentation(labels), `sidebar ${width}px`);
    }
});
