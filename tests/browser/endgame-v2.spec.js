import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

const artifact = JSON.parse(await readFile(new URL(
    '../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json',
    import.meta.url
), 'utf8'));
const byTitle = new Map(artifact.positions.map((position) => [position.title, position]));

async function openV2(page) {
    await page.goto('/endgame-trainer?trainerV2=1');
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

test('feature flag starts and completes a five-position curated challenge', async ({ page }) => {
    await openV2(page);
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
        await expect(page.locator('[data-v2-feedback]')).toContainText('authored move');
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

test('V1 default and Guided Study precedence remain intact', async ({ page }) => {
    await page.goto('/endgame-trainer');
    await expect(page.locator('[data-endgame-trainer-page]')).not.toHaveClass(/is-v2/);
    await expect(page.locator('[data-action="prepare"]')).toBeVisible();
    await page.goto('/endgame-trainer?trainerV2=1&studyUnit=direct-opposition&release=rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84');
    await expect(page.locator('[data-endgame-trainer-page]')).not.toHaveClass(/is-v2/);
    await expect(page.locator('[data-library-study]')).toBeVisible();
});

test('mobile, 200 percent zoom, touch targets, and reduced motion remain bounded', async ({ page }) => {
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
        await openV2(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
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

test('V2 shell and Modes dialog have no automated axe violations', async ({ page }) => {
    await openV2(page);
    const shell = await new AxeBuilder({ page }).include('[data-endgame-v2-shell]').analyze();
    expect(shell.violations).toEqual([]);
    await page.locator('[data-v2-open-modes]').click();
    const dialog = await new AxeBuilder({ page }).include('[data-v2-modes-dialog]').analyze();
    expect(dialog.violations).toEqual([]);
});
