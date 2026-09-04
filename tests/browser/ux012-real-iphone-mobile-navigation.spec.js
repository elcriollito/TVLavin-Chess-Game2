import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(300_000);

const widths = [320, 360, 375, 390, 393, 412, 430];
const locales = ['en', 'es', 'pt'];
const requiredCopy = {
    en: { signIn: 'Sign In', createAccount: 'Create Account', play: 'Play', learn: 'Learn & Improve', help: 'Help', about: 'About', language: 'Language' },
    es: { signIn: 'Iniciar sesión', createAccount: 'Crear cuenta', play: 'Jugar', learn: 'Aprender y mejorar', help: 'Ayuda', about: 'Acerca de', language: 'Idioma' },
    pt: { signIn: 'Entrar', createAccount: 'Criar conta', play: 'Jogar', learn: 'Aprender e melhorar', help: 'Ajuda', about: 'Sobre', language: 'Idioma' }
};

async function prepare(page, locale) {
    const context = page.context();
    await context.route('**/api/public-auth-config', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ clerkPublishableKey: 'pk_test_ux012_contract_123456789', registrationTracking: true })
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
        localStorage.setItem('caissa_nav_state', JSON.stringify({
            currentSection: 'play',
            isNavCollapsed: true
        }));
    }, locale);
}

async function drawerPresentation(page) {
    return page.locator('#mainNav').evaluate(nav => {
        const drawer = nav.getBoundingClientRect();
        const candidates = [
            nav.querySelector('.nav-logo-text'),
            ...nav.querySelectorAll('.nav-group-heading'),
            ...nav.querySelectorAll('.nav-item[data-nav-key] .nav-label'),
            nav.querySelector('#sidebarSignIn .nav-label'),
            nav.querySelector('#sidebarCreateAccount .nav-label'),
            nav.querySelector('.nav-premium-btn .nav-label'),
            nav.querySelector('.nav-premium-badge'),
            nav.querySelector('.nav-connect-label'),
            nav.querySelector('.nav-language-label'),
            nav.querySelector('[data-caissa-locale-select]')
        ].filter(Boolean);
        const failures = candidates.flatMap(node => {
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            const owner = node.closest('a, button, h2, .nav-connect-label, .nav-language-field') || node;
            const ownerBox = owner.getBoundingClientRect();
            const hiddenByState = node.closest('[hidden], [aria-hidden="true"]')
                || style.display === 'none' || style.visibility === 'hidden'
                || Number(style.opacity) === 0;
            const invalid = hiddenByState || box.width <= 0 || box.height <= 0
                || box.left < drawer.left - 1 || box.right > drawer.right + 1
                || ownerBox.left < drawer.left - 1 || ownerBox.right > drawer.right + 1
                || owner.scrollWidth > owner.clientWidth + 1;
            return invalid ? [{ text: node.textContent.trim(), display: style.display,
                visibility: style.visibility, opacity: style.opacity,
                box: { left: box.left, right: box.right, width: box.width, height: box.height },
                ownerOverflow: owner.scrollWidth - owner.clientWidth }] : [];
        });
        const destinationPairs = [...nav.querySelectorAll('.nav-item[data-nav-key]')].flatMap(item => {
            const icon = item.querySelector('i:first-child')?.getBoundingClientRect();
            const label = item.querySelector('.nav-label')?.getBoundingClientRect();
            return !icon || !label || label.left < icon.right - 1
                ? [item.dataset.navKey] : [];
        });
        return {
            drawer: { left: drawer.left, right: drawer.right, width: drawer.width },
            viewportWidth: innerWidth,
            appCollapsed: document.querySelector('.app-container')?.classList.contains('nav-collapsed'),
            failures,
            destinationPairs,
            destinations: nav.querySelectorAll('.nav-item[data-nav-key]').length,
            horizontalOverflow: nav.scrollWidth - nav.clientWidth
        };
    });
}

for (const locale of locales) {
    test(`${locale.toUpperCase()} real-phone drawer overrides persisted desktop compact state`, async ({ page, browserName }) => {
        await prepare(page, locale);
        for (const width of widths) {
            await test.step(`${browserName} ${width}px`, async () => {
                await page.setViewportSize({ width, height: 844 });
                await page.goto('/play', { waitUntil: 'domcontentloaded' });
                await expect.poll(() => page.evaluate(() => window.CAISSA_AUTH?.status)).toBe('anonymous');
                const toggle = page.locator('#mobileNavToggle');
                const nav = page.locator('#mainNav');
                await expect(toggle).toHaveAttribute('aria-expanded', 'false');
                await expect(nav).toHaveAttribute('inert', '');
                await toggle.click();
                await expect(toggle).toHaveAttribute('aria-expanded', 'true');
                await expect(nav).not.toHaveAttribute('inert', '');
                await expect.poll(() => nav.evaluate(node => node.getBoundingClientRect().left)).toBeGreaterThanOrEqual(-1);

                const result = await drawerPresentation(page);
                expect(result.appCollapsed).toBe(true);
                expect(result.destinations).toBe(37);
                expect(result.drawer.left).toBeGreaterThanOrEqual(-1);
                expect(result.drawer.right).toBeLessThanOrEqual(width);
                expect(result.drawer.width).toBeLessThan(width);
                expect(result.horizontalOverflow).toBeLessThanOrEqual(1);
                expect(result.destinationPairs).toEqual([]);
                expect(result.failures).toEqual([]);
                const copy = requiredCopy[locale];
                await expect(nav.locator('#sidebarSignIn .nav-label')).toHaveText(copy.signIn);
                await expect(nav.locator('#sidebarCreateAccount .nav-label')).toHaveText(copy.createAccount);
                await expect(nav.locator('.nav-premium-btn .nav-label')).toHaveText('Premium');
                await expect(nav.locator('[data-nav-key="play"] .nav-label')).toHaveText(copy.play);
                await expect(nav.locator('[data-nav-key="yahooClassic"] .nav-label')).toHaveText('CAISSA Classic');
                await expect(nav.locator('[data-nav-key="fics"] .nav-label')).toHaveText('FICS');
                await expect(nav.locator('[data-nav-key="playchess"] .nav-label')).toHaveText('Playchess');
                await expect(nav.locator('[data-nav-key="fritz"] .nav-label')).toHaveText('Fritz');
                await expect(nav.locator('.nav-group-heading').nth(1)).toHaveText(copy.learn);
                await expect(nav.locator('[data-nav-key="help"] .nav-label')).toHaveText(copy.help);
                await expect(nav.locator('[data-nav-key="about"] .nav-label')).toHaveText(copy.about);
                await expect(nav.locator('.nav-language-label')).toContainText(copy.language);

                if (browserName === 'webkit' && width === 393) {
                    fs.mkdirSync(path.join('qa-artifacts', 'ux012'), { recursive: true });
                    await page.screenshot({
                        path: path.join('qa-artifacts', 'ux012', `mobile-drawer-${locale}-webkit-393.png`),
                        fullPage: false
                    });
                }

                await nav.locator('.nav-label').evaluateAll(labels => labels.forEach(label => {
                    label.dataset.ux012Original = label.textContent;
                    label.textContent = `${label.textContent} ${label.textContent.slice(0, Math.ceil(label.textContent.length * 0.4))}`;
                }));
                const expanded = await drawerPresentation(page);
                expect(expanded.horizontalOverflow).toBeLessThanOrEqual(1);
                expect(expanded.destinationPairs).toEqual([]);
                expect(expanded.failures).toEqual([]);
            });
        }
    });
}

test('desktop expanded and compact states remain distinct', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        localStorage.removeItem('caissa_nav_state');
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/play');
    const label = page.locator('#mainNav [data-nav-key="play"] .nav-label');
    await expect(label).toBeVisible();
    await page.locator('#navCollapseBtn').click();
    await expect(label).toBeHidden();
});
