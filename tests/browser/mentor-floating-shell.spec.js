import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

test('Play exposes Mentor with zero auto-call, keyboard-safe lifecycle, and no issue-control collision', async ({ page }) => {
    await instrumentPlay(page);
    const mentorRequests = [];
    page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await page.goto('/play?simplified=1');
    const launcher = page.locator('[data-caissa-mentor-launcher]');
    await expect(launcher).toBeVisible(); await expect(launcher).toHaveAccessibleName('Open CAISSA Mentor');
    expect(mentorRequests).toEqual([]);
    await launcher.click();
    const shell = page.locator('[data-caissa-mentor-shell]');
    await expect(shell).toBeVisible(); await expect(page.locator('#caissaMentorInput')).toBeFocused();
    await expect(shell).toContainText('General Mentor · no board position is shared');
    await expect(shell).toContainText('Local Game Review'); expect(mentorRequests).toEqual([]);
    await page.keyboard.press('Escape'); await expect(shell).toBeHidden(); await expect(launcher).toBeFocused();
    await launcher.click(); await page.getByRole('button', { name: 'Minimize CAISSA Mentor' }).click();
    await expect(shell).toBeHidden(); expect(mentorRequests).toEqual([]);
    const boxes = await page.evaluate(() => {
        const box = selector => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? { x:r.x,y:r.y,w:r.width,h:r.height } : null; };
        return { mentor: box('[data-caissa-mentor-launcher]'), report: box('.caissa-manual-qa-launcher') };
    });
    expect(boxes.mentor).not.toBeNull(); expect(boxes.report).not.toBeNull();
    expect(boxes.mentor.y + boxes.mentor.h <= boxes.report.y || boxes.report.y + boxes.report.h <= boxes.mentor.y).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[data-caissa-mentor-shell]').analyze(); expect(axe.violations).toEqual([]);
});

test('mobile Mentor is a board-safe bottom sheet with no horizontal clipping or network activity', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await instrumentPlay(page);
    const mentorRequests = []; page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await page.goto('/play?simplified=1');
    const boardBefore = await page.locator('#playSection #chessboard').boundingBox();
    await page.locator('[data-caissa-mentor-launcher]').click();
    const shell = page.locator('[data-caissa-mentor-shell]'); await expect(shell).toBeVisible();
    const layout = await page.evaluate(() => { const r = document.querySelector('[data-caissa-mentor-shell]').getBoundingClientRect();
        return { left:r.left,right:r.right,bottom:innerHeight-r.bottom,height:r.height,viewportWidth:innerWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth }; });
    expect(layout.left).toBeGreaterThanOrEqual(0); expect(layout.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.bottom).toBeLessThanOrEqual(1); expect(layout.height).toBeLessThanOrEqual(844 * .73); expect(layout.overflow).toBeLessThanOrEqual(2);
    expect(boardBefore?.width || 0).toBeGreaterThan(200); expect(mentorRequests).toEqual([]);
    await page.getByRole('button', { name: 'Close CAISSA Mentor' }).click(); await expect(shell).toBeHidden(); expect(mentorRequests).toEqual([]);
});

test('Mentor reacts to authoritative auth changes without submitting or caching a token', async ({ page }) => {
    await instrumentPlay(page);
    const mentorRequests = [];
    page.on('request', request => { if (/\/api\/mentor\//.test(request.url())) mentorRequests.push(request.url()); });
    await page.goto('/play?simplified=1');
    await page.locator('[data-caissa-mentor-launcher]').click();
    const shell = page.locator('[data-caissa-mentor-shell]');
    const signedOutCopy = shell.getByText(/Shared AI requires an account\./);
    const signedInCopy = shell.getByText('Signed in · Shared AI is available under your account rules.');
    await expect(signedOutCopy).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('caissa-auth-change', {
        detail: { isLoaded: true, isSignedIn: true }
    })));
    await expect(signedInCopy).toBeVisible();
    await expect(signedOutCopy).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('caissa-auth-change', {
        detail: { isLoaded: true, isSignedIn: false }
    })));
    await expect(signedOutCopy).toBeVisible();
    expect(mentorRequests).toEqual([]);
    expect(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(key => /token/i.test(key)))).toEqual([]);
});
