import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

const widths = [320, 360, 390, 430];

function contrastRatio(foreground, background) {
    const parse = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = value => {
        const channels = parse(value).map(channel => {
            const normalized = channel / 255;
            return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
        });
        return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + .05) / (darker + .05);
}

test.beforeEach(async ({ page }) => instrumentPlay(page));

for (const width of widths) {
    test(`Games summary owns readable normal and forced-color states at ${width}px`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none', colorScheme: 'light' });
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/play/beta');

        const disclosure = page.locator('[data-games-setup-disclosure]');
        const summary = page.getByText('Change', { exact: true });
        const value = page.locator('[data-games-summary-value]');
        await expect(value).toHaveText('1+0 · Bullet · White');
        if (await disclosure.evaluate(element => element.open)) await summary.click();
        await expect(disclosure).not.toHaveAttribute('open', '');
        await summary.click();
        await expect(disclosure).toHaveAttribute('open', '');
        await page.getByRole('radio', { name: '15+10 · Rapid', exact: true }).check();
        await page.getByRole('radio', { name: 'Random', exact: true }).check();
        await expect(value).toHaveText('15+10 · Rapid · Random');
        await summary.click();
        await expect(disclosure).not.toHaveAttribute('open', '');
        await page.evaluate(() => {
            window.CaissaPlayThemes.applyTheme('system');
            document.documentElement.style.zoom = '2';
        });

        const collapsed = await value.evaluate(element => {
            const summaryNode = element.closest('summary');
            const valueStyle = getComputedStyle(element);
            const summaryStyle = getComputedStyle(summaryNode);
            return {
                color: valueStyle.color,
                background: summaryStyle.backgroundColor,
                opacity: valueStyle.opacity,
                filter: valueStyle.filter,
                blend: valueStyle.mixBlendMode,
                summaryHeight: summaryNode.getBoundingClientRect().height,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
        });
        expect(contrastRatio(collapsed.color, collapsed.background)).toBeGreaterThanOrEqual(4.5);
        expect(collapsed).toMatchObject({ opacity: '1', filter: 'none', blend: 'normal' });
        expect(collapsed.summaryHeight).toBeGreaterThanOrEqual(44);
        expect(collapsed.overflow).toBeLessThanOrEqual(1);

        const summaryControl = page.locator('[data-games-setup-summary]');
        await summaryControl.focus();
        await expect(summaryControl).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(summaryControl).toBeFocused();
        expect(await summaryControl.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
        await summaryControl.press('Enter');
        await expect(disclosure).toHaveAttribute('open', '');
        await expect(value).toHaveText('15+10 · Rapid · Random');
        expect(await page.evaluate(() => document.documentElement.scrollWidth
            - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

        const axe = await new AxeBuilder({ page }).include('[data-games-setup-disclosure]').analyze();
        expect(axe.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
        await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active', colorScheme: 'light' });
        const forced = await summaryControl.evaluate(element => {
            const style = getComputedStyle(element);
            return { color: style.color, background: style.backgroundColor,
                outline: style.outlineStyle, target: element.getBoundingClientRect().height };
        });
        expect(forced.outline).toBe('solid');
        expect(forced.target).toBeGreaterThanOrEqual(44);
    });
}
