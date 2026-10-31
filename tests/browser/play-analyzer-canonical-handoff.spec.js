import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay, playMove } from '../play/playwright-helpers.js';

test.use({ hasTouch: true });

const modes = [
    { name: 'games', route: '/play/games', tab: 'Play Game', start: '[data-games-primary]' },
    { name: 'bots', route: '/play/bots', tab: 'Play Bots', start: '[data-bot-primary]' },
    { name: 'coach', route: '/play/coach', tab: 'Play Coach', start: '[data-coach-primary]' }
];

async function completeGame(page, mode) {
    await page.goto(mode.route);
    await expect(page.locator('body[data-caissa-play-v2-entry="official"]')).toHaveCount(1);
    await expect(page.locator(mode.start)).toBeEnabled();
    await page.locator(mode.start).click();
    await expect.poll(() => page.evaluate(() => window.App?.gameActive === true)).toBe(true);
    expect(await playMove(page, 'e2', 'e4')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.App?.game?.history?.().length || 0)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => {
        window.confirm = () => true;
        window.resignGame();
    });
    await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
    const state = await page.evaluate(() => {
        const postGame = window.CaissaPostGameExperienceInstance.getSnapshot();
        return {
            recordId: postGame.gameRecordId,
            result: postGame.result.value,
            termination: postGame.result.termination,
            finalFen: window.App.game.fen(),
            history: window.App.game.history(),
            orientation: window.CaissaPlayCompatibility.getSnapshot().board.orientation,
            activeWorkers: window.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.().activeWorkerCount ?? 0
        };
    });
    expect(state.activeWorkers).toBe(0);
    await page.evaluate(() => { window.__caissaPlayDocumentIdentity = 'dedicated-play-document'; });
    return state;
}

async function openCanonicalAnalyzer(page) {
    const navigationRequest = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-post-game-action="analyze"]:visible').first().click();
    await navigationRequest;
    await expect(page).toHaveURL(/\/analyze\?handoff=[A-Za-z0-9_-]+$/);
    await expect(page.locator('[data-caissa-analyze-v2]')).toHaveAttribute('data-analyze-v2-ready', 'true');
    await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);
    await expect(page.locator('#analyzeSection > .analyze-layout')).toHaveCount(0);
    await expect(page.locator('#analyzeChessboard .caissa-board')).toBeVisible();
    expect(await page.evaluate(() => window.__caissaPlayDocumentIdentity)).toBeUndefined();
    await expect.poll(() => page.evaluate(() => Boolean(window.AnalyzeSection?.loadedGame))).toBe(true);
}

for (const mode of modes) {
    test(`official ${mode.name} hands its completed record to the canonical Analyzer document`, async ({ page }) => {
        await instrumentPlay(page);
        const before = await completeGame(page, mode);
        await openCanonicalAnalyzer(page);

        const proof = await page.evaluate(() => {
            const token = new URL(location.href).searchParams.get('handoff');
            const stored = JSON.parse(sessionStorage.getItem(`caissa:analyze:handoff:v1:${token}`));
            return {
                token,
                payload: stored.payload,
                source: window.AnalyzeSection.loadedGame?.source,
                recordId: window.AnalyzeSection.loadedGame?.recordId,
                loadedPgn: window.AnalyzeSection.loadedGame?.pgn,
                loadedFen: window.AnalyzeSection.getGame?.().fen?.(),
                currentMoveIndex: window.AnalyzeSection.currentMoveIndex,
                boardFlipped: window.AnalyzeSection.boardFlipped,
                navigationType: performance.getEntriesByType('navigation')[0]?.type
            };
        });
        expect(proof.payload.recordId).toBe(before.recordId);
        expect(proof.payload.finalFen).toBe(before.finalFen);
        expect(proof.payload.pgn).toContain(before.history[0]);
        expect(proof.payload.boardOrientation).toBe(before.orientation);
        expect(proof.payload.result).toBe(before.result);
        expect(proof.payload.termination).toBe(before.termination);
        expect(proof.payload.selectedPly).toBeGreaterThan(0);
        expect(proof.loadedFen).toBe(before.finalFen);
        expect(proof.loadedPgn).toBe(proof.payload.pgn);
        expect(proof.currentMoveIndex).toBe(proof.payload.selectedPly - 1);
        expect(proof.boardFlipped).toBe(before.orientation === 'black');
        expect(proof.source).toBe('Play handoff');
        expect(proof.navigationType).toBe('navigate');

        if (mode.name === 'games') {
            if (!await page.evaluate(() => window.AnalyzeSection.liveEngineEnabled)) {
                await page.locator('#analyzeEngineToggle').click();
            }
            await expect.poll(() => page.locator('#analyzeV2EngineLines .caissa-analyze-v2__engine-line').count())
                .toBeGreaterThanOrEqual(2);
            await expect(page.locator('#analyzeReviewBtn')).toBeEnabled();
            await page.locator('#analyzeReviewBtn').click();
            await expect.poll(() => page.evaluate(() => window.AnalyzeSection.analysisPhase)).not.toBe('idle');
        }

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(new RegExp(`${mode.route.replaceAll('/', '\\/')}$`));
        await expect(page.locator('body[data-caissa-play-v2-entry="official"]')).toHaveCount(1);
        await expect(page.getByRole('tab', { name: mode.tab })).toHaveAttribute('aria-selected', 'true');
        const backState = await page.evaluate(() => ({
            gameActive: window.App?.gameActive === true,
            recordId: window.CaissaPostGameExperienceInstance?.getSnapshot?.().gameRecordId || null,
            postGameVisible: window.CaissaPostGameExperienceInstance?.getSnapshot?.().visible === true,
            activeWorkers: window.CaissaPlayV2BotWorkerReadiness?.getSnapshot?.().activeWorkerCount ?? 0
        }));
        expect(backState.gameActive).toBe(false);
        expect(backState.activeWorkers).toBe(0);
        if (backState.postGameVisible) expect(backState.recordId).toBe(before.recordId);
    });
}

test('Coach level selector preserves layout and exposes mouse, keyboard, touch, and selected states', async ({ page }) => {
    await instrumentPlay(page);
    await page.goto('/play/coach');
    const panel = page.locator('[data-caissa-native-coach-panel]');
    const balanced = panel.locator('.caissa-native-coach-panel__level-card').filter({ hasText: 'Balanced' });
    await balanced.click();
    await expect(panel.getByLabel('Balanced')).toBeChecked();

    const selectedStyles = await balanced.evaluate(node => {
        const reference = node.parentElement.querySelector('.caissa-native-coach-panel__level-card');
        const style = getComputedStyle(node);
        const referenceStyle = getComputedStyle(reference);
        const typography = element => {
            const title = getComputedStyle(element.querySelector('.caissa-native-coach-panel__level-name'));
            const description = getComputedStyle(element.querySelector('.caissa-native-coach-panel__level-description'));
            return {
                titleSize: title.fontSize,
                titleWeight: title.fontWeight,
                titleSpacing: title.letterSpacing,
                descriptionSize: description.fontSize,
                descriptionLineHeight: description.lineHeight
            };
        };
        const indicator = getComputedStyle(node, '::after');
        return {
            background: style.backgroundColor,
            border: style.borderColor,
            indicator: indicator.content,
            selectedTypography: typography(node),
            referenceTypography: typography(reference),
            selectedPadding: style.padding,
            referencePadding: referenceStyle.padding
        };
    });
    expect(selectedStyles.border).toBe('rgb(87, 189, 131)');
    expect(selectedStyles.indicator).not.toBe('none');
    expect(selectedStyles.selectedTypography).toEqual(selectedStyles.referenceTypography);
    expect(selectedStyles.selectedPadding).toBe(selectedStyles.referencePadding);

    const showAll = panel.locator('[data-coach-show-levels]');
    await showAll.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(panel.getByLabel('Balanced')).toBeFocused();
    expect(await balanced.evaluate(node => getComputedStyle(node).outlineStyle)).toBe('solid');
    await page.keyboard.press('ArrowRight');
    await expect(panel.getByLabel('Challenging')).toBeChecked();
    await showAll.click();
    await expect(panel.getByLabel('Grandmaster')).toBeVisible();
    const grandmaster = panel.locator('.caissa-native-coach-panel__level-row').filter({ hasText: 'Grandmaster' });
    await grandmaster.click();
    await expect(panel.getByLabel('Grandmaster')).toBeChecked();
    expect(await grandmaster.evaluate(node => getComputedStyle(node).borderColor)).toBe('rgb(87, 189, 131)');
    expect(await grandmaster.evaluate(node => getComputedStyle(node, '::after').content)).not.toBe('none');

    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator('.caissa-native-coach-panel__level-card').filter({ hasText: 'Casual' }).tap();
    await expect(panel.getByLabel('Casual')).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const accessibility = await new AxeBuilder({ page })
        .include('[data-caissa-native-coach-panel]')
        .analyze();
    expect(accessibility.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});
