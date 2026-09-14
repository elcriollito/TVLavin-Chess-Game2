import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

const PHONE_VIEWPORTS = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 932, height: 430 }
];

test.beforeEach(async ({ page }) => instrumentPlay(page));

async function openCoach(page, viewport) {
    await page.setViewportSize(viewport);
    await page.goto('/play/beta/coach');
    await expect(page.locator('[data-caissa-native-coach-panel][data-coach-shell-phase="setup"]')).toBeVisible();
}

const snapshot = page => page.locator('.caissa-native-coach-panel__color-options').evaluate(options => ({
    row: (() => { const box = options.getBoundingClientRect(); return { width: box.width, height: box.height }; })(),
    tokens: [...options.querySelectorAll('[data-coach-color-choice]')].map(input => {
        const token = input.nextElementSibling;
        const style = getComputedStyle(token);
        const circle = getComputedStyle(token, '::before');
        const box = token.getBoundingClientRect();
        return {
            value: input.value,
            name: input.getAttribute('aria-label'),
            checked: input.checked,
            width: box.width,
            height: box.height,
            fontSize: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            color: style.color,
            textShadow: style.textShadow,
            strokeWidth: parseFloat(style.webkitTextStrokeWidth),
            circleWidth: parseFloat(circle.width),
            circleHeight: parseFloat(circle.height),
            overflow: style.overflow
        };
    })
}));

for (const viewport of PHONE_VIEWPORTS) {
    test(`Coach-only Play As contrast and unchanged controls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await openCoach(page, viewport);
        const proof = await snapshot(page);
        expect(proof.tokens.map(token => [token.value, token.name])).toEqual([
            ['white', 'White'], ['random', 'Random'], ['black', 'Black']
        ]);
        expect(proof.tokens.map(token => token.checked)).toEqual([true, false, false]);
        expect(proof.row.height).toBe(44);

        const [white, random, black] = proof.tokens;
        for (const token of proof.tokens) {
            expect(token.height).toBe(44);
            expect(token.circleWidth).toBe(30);
            expect(token.circleHeight).toBe(30);
            expect(token.lineHeight).toBeCloseTo(token.fontSize, 1);
            expect(token.overflow).toBe('visible');
        }
        expect(white.fontSize).toBeCloseTo(32.9, 1);
        expect(black.fontSize).toBeCloseTo(32.9, 1);
        expect(random.fontSize).toBeCloseTo(26.6, 1);
        expect(white.strokeWidth).toBe(0);
        expect(random.strokeWidth).toBeGreaterThan(0);
        expect(white.textShadow).not.toBe('none');
        expect(black.textShadow).not.toBe('none');
        expect(random.textShadow).not.toBe('none');
        expect(white.color).toBe('rgb(255, 255, 255)');
        expect(black.color).toBe('rgb(2, 2, 3)');

        const whiteInput = page.locator('[data-coach-color-choice="white"]');
        const randomInput = page.locator('[data-coach-color-choice="random"]');
        const blackInput = page.locator('[data-coach-color-choice="black"]');
        await whiteInput.focus();
        await expect(whiteInput.locator('xpath=following-sibling::*[1]')).toHaveCSS('outline-style', 'solid');
        await whiteInput.press('ArrowRight');
        await expect(randomInput).toBeChecked();
        await randomInput.press('ArrowRight');
        await expect(blackInput).toBeChecked();
        await expect(blackInput.locator('xpath=following-sibling::*[1]')).not.toHaveCSS('box-shadow', 'none');
    });
}

test('desktop Coach icon scale and control geometry remain unchanged', async ({ page }) => {
    await openCoach(page, { width: 1280, height: 800 });
    const proof = await snapshot(page);
    for (const token of proof.tokens) {
        expect(token.fontSize).toBeCloseTo(20.3, 2);
        expect(token.height).toBe(44);
        expect(token.circleWidth).toBe(30);
        expect(token.circleHeight).toBe(30);
    }
    expect(proof.row.height).toBe(44);
});
