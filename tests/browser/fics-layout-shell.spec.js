import { test, expect } from '@playwright/test';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => { window.CAISSA_FICS_AUTO_GUEST_ENABLED = false; });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

test('desktop shell preserves one board inside BOARD plus HEAD BODY FOOT workspace regions', async ({ page }) => {
    await openFics(page);
    const structure = await page.evaluate(() => {
        const section = document.getElementById('ficsSection');
        const board = document.getElementById('ficsBoardContainer');
        const workspace = section.querySelector('[data-fics-shell-region="workspace"]');
        const rect = element => element.getBoundingClientRect().toJSON();
        return {
            enabled: section.classList.contains('fics-rd2-enabled'),
            boards: document.querySelectorAll('#ficsBoardContainer').length,
            boardOwned: window.CaissaFICSClient.elements.boardContainer === board,
            boardInRegion: board.closest('[data-fics-shell-region]')?.dataset.ficsShellRegion,
            regions: [...workspace.children].map(node => node.dataset.ficsWorkspaceRegion),
            tabs: [...workspace.querySelectorAll('[role="tab"]')].map(node => node.textContent),
            visibleTabs: [...workspace.querySelectorAll('[role="tab"]:not([hidden])')].map(node => node.textContent),
            boardRect: rect(section.querySelector('[data-fics-shell-region="board"]')),
            workspaceRect: rect(workspace)
        };
    });
    expect(structure.enabled).toBe(true);
    expect(structure.boards).toBe(1);
    expect(structure.boardOwned).toBe(true);
    expect(structure.boardInRegion).toBe('board');
    expect(structure.regions).toEqual(['head', 'body', 'foot']);
    expect(structure.tabs).toEqual(['Tables', 'Players', 'Seek', 'Game']);
    expect(structure.visibleTabs).toEqual(['Tables', 'Players', 'Seek']);
    expect(structure.boardRect.right).toBeLessThan(structure.workspaceRect.left);
});

test('tabs are keyboard operable, mutate no canonical state, and Players is truthful', async ({ page }) => {
    await openFics(page);
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', pendingSeek: null,
            activeTables: [{ number: '9', white: 'Alpha', black: 'Beta' }],
            seekActions: [{ number: '4', details: { player: 'Gamma', timeControl: '5+0' } }],
            gameActive: false,
            liveGame: { ...client.createEmptyLiveGameState('idle') }
        });
        window.__ficsCanonicalBeforeTabs = JSON.stringify({
            activeTables: client.activeTables, seekActions: client.seekActions,
            pendingSeek: client.pendingSeek, liveGame: client.liveGame
        });
        window.CaissaFICSShell.refresh();
    });
    const tables = page.getByRole('tab', { name: 'Tables' });
    const players = page.getByRole('tab', { name: 'Players' });
    const seek = page.getByRole('tab', { name: 'Seek' });
    await expect(tables).toHaveAttribute('aria-selected', 'true');
    await tables.focus();
    await page.keyboard.press('ArrowRight');
    await expect(players).toBeFocused();
    await expect(players).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-fics-body-view="players"]')).toContainText('No players loaded.');
    await page.keyboard.press('End');
    await expect(seek).toBeFocused();
    await expect(seek).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => window.__ficsCanonicalBeforeTabs === JSON.stringify({
        activeTables: window.CaissaFICSClient.activeTables,
        seekActions: window.CaissaFICSClient.seekActions,
        pendingSeek: window.CaissaFICSClient.pendingSeek,
        liveGame: window.CaissaFICSClient.liveGame
    }))).toBe(true);
});

test('active Game tab is contextual and retains orientation-aware player bars', async ({ page }) => {
    await openFics(page);
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', gameActive: true,
            myColor: 'black', ficsUsername: 'LocalBlack', activeTables: [], pendingSeek: null,
            liveGame: {
                ...client.createEmptyLiveGameState('playing'), gameNumber: 31,
                whiteName: 'ObservedWhite', blackName: 'LocalBlack', userColor: 'black', relation: -1,
                sideToMove: 'w', whiteClock: 120, blackClock: 119, currentFen: 'start',
                gameActive: true, observedGame: false
            }
        });
        client.updatePlayerBars();
        window.CaissaFICSShell.refresh();
    });
    await expect(page.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('tab', { name: 'Players' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('tab', { name: 'Seek' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#ficsTopPlayerBar .fics-player-name')).toContainText('ObservedWhite');
    await expect(page.locator('#ficsBottomPlayerBar .fics-player-name')).toContainText('LocalBlack');
    await page.getByRole('tab', { name: 'Tables' }).click();
    await expect(page.getByRole('tab', { name: 'Game' })).toBeVisible();
    await page.getByRole('tab', { name: 'Game' }).click();
    await expect(page.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'false');
});

test('runtime rollback restores legacy parents without replacing board login or console nodes', async ({ page }) => {
    await openFics(page);
    const result = await page.evaluate(() => {
        const ids = ['ficsBoardContainer', 'ficsConnectBtn', 'ficsConsole', 'ficsCommandInput'];
        const before = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        const boardInstance = window.CaissaFICSClient.board;
        const disabled = window.CaissaFICSShell.setEnabled(false);
        const section = document.getElementById('ficsSection');
        const restored = {
            room: section.querySelector('.fics-game-area > .fics-room-panel') !== null,
            board: section.querySelector('.fics-game-area > .fics-board-section') !== null,
            side: section.querySelector('.fics-game-area > .fics-side-panel') !== null,
            connection: section.querySelector('.fics-layout > .fics-connection') !== null,
            console: section.querySelector('.fics-board-section > .fics-console-section') !== null
        };
        const identitiesAfterDisable = ids.every(id => before[id] === document.getElementById(id));
        const enabled = window.CaissaFICSShell.setEnabled(true);
        return {
            disabled, enabled, restored, identitiesAfterDisable,
            identitiesAfterEnable: ids.every(id => before[id] === document.getElementById(id)),
            boardInstancePreserved: boardInstance === window.CaissaFICSClient.board,
            shellCount: document.querySelectorAll('[data-fics-redesign-shell]').length
        };
    });
    expect(result.disabled).toBe(true);
    expect(result.enabled).toBe(true);
    expect(result.restored).toEqual({ room: true, board: true, side: true, connection: true, console: true });
    expect(result.identitiesAfterDisable).toBe(true);
    expect(result.identitiesAfterEnable).toBe(true);
    expect(result.boardInstancePreserved).toBe(true);
    expect(result.shellCount).toBe(1);
});

test('preboot feature flag leaves the legacy presentation untouched', async ({ page }) => {
    await page.addInitScript(() => { window.CAISSA_FICS_REDESIGN_ENABLED = false; });
    await page.goto('/fics');
    await page.waitForFunction(() => Boolean(window.CaissaFICSShell));
    const legacy = await page.evaluate(() => {
        const section = document.getElementById('ficsSection');
        return {
            snapshot: window.CaissaFICSShell.getSnapshot(),
            shellCount: section.querySelectorAll('[data-fics-redesign-shell]').length,
            room: section.querySelector('.fics-game-area > .fics-room-panel') !== null,
            board: section.querySelector('.fics-game-area > .fics-board-section') !== null,
            side: section.querySelector('.fics-game-area > .fics-side-panel') !== null,
            connection: section.querySelector('.fics-layout > .fics-connection') !== null,
            console: section.querySelector('.fics-board-section > .fics-console-section') !== null
        };
    });
    expect(legacy.snapshot.enabled).toBe(false);
    expect(legacy.snapshot.mounted).toBe(false);
    expect(legacy.shellCount).toBe(0);
    expect({ room: legacy.room, board: legacy.board, side: legacy.side,
        connection: legacy.connection, console: legacy.console }).toEqual({
        room: true, board: true, side: true, connection: true, console: true
    });
});

test('responsive hooks keep a square board first and delegate resize to the existing instance', async ({ page }) => {
    await openFics(page);
    const originalBoardExists = await page.evaluate(() => Boolean(window.CaissaFICSClient.board));
    expect(originalBoardExists).toBe(true);
    await page.evaluate(() => {
        const board = window.CaissaFICSClient.board;
        const original = board.resize.bind(board);
        window.__ficsResizeCalls = 0;
        board.resize = (...args) => { window.__ficsResizeCalls += 1; return original(...args); };
    });

    for (const viewport of [
        { width: 885, height: 611, sideBySide: false },
        { width: 390, height: 844, sideBySide: false },
        { width: 844, height: 390, sideBySide: true }
    ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(120);
        const geometry = await page.evaluate(() => {
            const boardRegion = document.querySelector('[data-fics-shell-region="board"]').getBoundingClientRect();
            const workspace = document.querySelector('[data-fics-shell-region="workspace"]').getBoundingClientRect();
            const board = document.getElementById('ficsBoardContainer').getBoundingClientRect();
            return {
                boardRegion: boardRegion.toJSON(), workspace: workspace.toJSON(), board: board.toJSON(),
                sectionOverflow: document.getElementById('ficsSection').scrollWidth - document.getElementById('ficsSection').clientWidth
            };
        });
        expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(2);
        expect(geometry.board.width).toBeGreaterThan(250);
        if (viewport.sideBySide) expect(geometry.boardRegion.right).toBeLessThanOrEqual(geometry.workspace.left + 1);
        else expect(geometry.boardRegion.bottom).toBeLessThanOrEqual(geometry.workspace.top + 1);
        expect(geometry.sectionOverflow).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => window.__ficsResizeCalls)).toBeGreaterThan(0);
    expect(await page.locator('#ficsBoardContainer .board-b72b1').count()).toBe(1);
});
