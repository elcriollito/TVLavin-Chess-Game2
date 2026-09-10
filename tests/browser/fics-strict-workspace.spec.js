import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

async function setGame(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
            ficsUsername: 'RD6Player', myColor: 'white',
            moveHistory: Array.from({ length: 80 }, (_, index) => ({
                moveNumber: Math.floor(index / 2) + 1,
                color: index % 2 ? 'black' : 'white', san: index % 2 ? 'e5' : 'e4'
            })),
            liveGame: {
                ...client.createEmptyLiveGameState('playing'), gameNumber: 606,
                whiteName: 'RD6Player', blackName: 'Opponent', userColor: 'white', relation: 1,
                sideToMove: 'w', whiteClock: 300, blackClock: 298, currentFen: 'start',
                gameActive: true, observedGame: false
            }
        });
        client.updateConnectionStatus(true);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    });
}

test('workspace exposes exact HEAD BODY FOOT order and only BODY receives the flexible track', async ({ page }) => {
    await openFics(page);
    const architecture = await page.locator('[data-fics-shell-region="workspace"]').evaluate(node => ({
        regions: [...node.children].map(child => ({
            region: child.dataset.ficsWorkspaceRegion,
            sizing: child.dataset.ficsRegionSizing
        })),
        rows: getComputedStyle(node).gridTemplateRows,
        headChildren: [...node.children[0].children].map(child => child.className)
    }));
    expect(architecture.regions).toEqual([
        { region: 'head', sizing: 'intrinsic' },
        { region: 'body', sizing: 'flexible' },
        { region: 'foot', sizing: 'intrinsic' }
    ]);
    expect(architecture.headChildren).toEqual(['fics-rd2-tabs']);
    const tracks = architecture.rows.split(' ').map(parseFloat);
    expect(tracks[1]).toBeGreaterThan(tracks[0]);
    expect(tracks[1]).toBeGreaterThan(tracks[2]);
});

test('disconnected Tables remains product content and connection guidance is in Console only', async ({ page }) => {
    await openFics(page);
    const body = page.locator('#ficsRd2Body');
    await expect(body.locator('[data-fics-body-view="tables"]')).toBeVisible();
    await expect(body).toContainText('No tables loaded.');
    await expect(body).not.toContainText(/Connection unavailable|Connect to FICS|Review the existing FICS/);
    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsole')).toContainText('[CAISSA] Connect to FICS to load tables.');
});

test('Players uses one brief truthful state and routes its explanation to Console', async ({ page }) => {
    await openFics(page);
    await page.getByRole('tab', { name: 'Players' }).click();
    const players = page.locator('[data-fics-body-view="players"]');
    await expect(players).toHaveText('Player directory unavailable.');
    expect((await players.innerText()).length).toBeLessThan(40);
    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsole')).toContainText('[CAISSA] Player directory is not available yet.');
});

test('disconnected Seek preserves Create Table and fails closed with guidance in Console', async ({ page }) => {
    await openFics(page);
    await page.getByRole('tab', { name: 'Seek' }).click();
    const body = page.locator('#ficsRd2Body');
    await expect(body.locator('[data-fics-body-view="seek"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Table' })).toBeDisabled();
    await expect(body).not.toContainText(/Connection unavailable|Connect to FICS/);
    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsole')).toContainText('[CAISSA] Connect to FICS before creating a table.');
    const result = await page.evaluate(() => window.CaissaFICSClient.requestSeek({ minutes: 5, increment: 0 }));
    expect(result).toMatchObject({ ok: false, code: 'NOT_CONNECTED', state: 'error' });
});

test('Settings owns technical diagnostics while BODY and FOOT do not duplicate them', async ({ page }) => {
    await openFics(page);
    await page.getByRole('button', { name: 'Open FICS settings' }).click();
    await expect(page.locator('#ficsRd5SettingsPanel #ficsGatewayStatus')).toHaveCount(1);
    await expect(page.locator('#ficsRd5SettingsPanel #ficsGatewayUrl')).toHaveCount(1);
    await expect(page.locator('#ficsRd5SettingsPanel #ficsGameStatus')).toHaveCount(1);
    await expect(page.locator('#ficsRd2Body #ficsGatewayStatus, .fics-rd2-workspace-foot #ficsGatewayStatus')).toHaveCount(0);
    await expect(page.locator('#ficsRd2Body #ficsGameStatus, .fics-rd2-workspace-foot #ficsGameStatus')).toHaveCount(0);
    await expect(page.locator('#ficsRd5ConsoleSummary')).toHaveCount(0);
});

test('FOOT stays thin and Game Mode fills the same BODY track', async ({ page }) => {
    await openFics(page);
    const disconnected = await page.evaluate(() => ({
        body: Math.round(document.getElementById('ficsRd2Body').getBoundingClientRect().height),
        foot: Math.round(document.querySelector('.fics-rd2-workspace-foot').getBoundingClientRect().height)
    }));
    expect(disconnected.foot).toBeLessThanOrEqual(105);
    expect(disconnected.body).toBeGreaterThan(680);
    await setGame(page);
    await expect(page.locator('[data-fics-body-view="game"]')).toBeVisible();
    const game = await page.evaluate(() => ({
        body: Math.round(document.getElementById('ficsRd2Body').getBoundingClientRect().height),
        notation: Math.round(document.querySelector('.fics-rd4-move-scroll').getBoundingClientRect().height)
    }));
    expect(game.body).toBeGreaterThan(680);
    expect(game.notation).toBeGreaterThan(470);
});

test('tablet and mobile preserve strict regions without horizontal overflow', async ({ page }) => {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
        await openFics(page, viewport);
        const result = await page.evaluate(() => {
            const section = document.getElementById('ficsSection');
            const workspace = document.querySelector('[data-fics-shell-region="workspace"]');
            return {
                regions: [...workspace.children].map(child => child.dataset.ficsWorkspaceRegion),
                overflow: section.scrollWidth - section.clientWidth,
                bodyMinHeight: getComputedStyle(document.getElementById('ficsRd2Body')).minHeight
            };
        });
        expect(result.regions).toEqual(['head', 'body', 'foot']);
        expect(result.overflow).toBeLessThanOrEqual(1);
        expect(result.bodyMinHeight).toBe('0px');
    }
    const mobileControls = await page.evaluate(() => ({
        radioSize: Math.round(document.querySelector('.fics-login-mode input').getBoundingClientRect().width),
        consoleVisible: document.getElementById('ficsConsoleToggle').getBoundingClientRect().bottom
            <= document.querySelector('.fics-rd2-workspace').getBoundingClientRect().bottom
    }));
    expect(mobileControls.radioSize).toBe(16);
    expect(mobileControls.consoleVisible).toBe(true);
});

test('raw FICS and command origins remain in one Console and rollback restores legacy nodes', async ({ page }) => {
    await openFics(page);
    const result = await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.messageBuffer = [];
        client.logToConsole('fics% games', 'FICS');
        client.logToConsole('> who', 'COMMAND');
        const consoleNode = document.getElementById('ficsConsole');
        const inputNode = document.getElementById('ficsCommandInput');
        const disabled = window.CaissaFICSShell.setEnabled(false);
        return {
            disabled,
            messages: [...client.messageBuffer],
            consolePreserved: consoleNode === document.getElementById('ficsConsole'),
            inputPreserved: inputNode === document.getElementById('ficsCommandInput'),
            legacyConsoleParent: consoleNode.closest('.fics-board-section') !== null
        };
    });
    expect(result).toEqual({
        disabled: true,
        messages: ['[FICS] fics% games', '[COMMAND] > who'],
        consolePreserved: true, inputPreserved: true, legacyConsoleParent: true
    });
});

test('strict workspace and Settings have no serious or critical accessibility violations', async ({ page }) => {
    await openFics(page, { width: 390, height: 844 });
    let results = await new AxeBuilder({ page }).include('[data-fics-shell-region="workspace"]').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
    await page.getByRole('button', { name: 'Open FICS settings' }).click();
    results = await new AxeBuilder({ page }).include('#ficsRd5SettingsPanel').analyze();
    expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
