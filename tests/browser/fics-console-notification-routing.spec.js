import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openFics(page, viewport = { width: 1600, height: 1000 }) {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.goto('/fics');
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
}

async function installMoveFixture(page) {
    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        window.__ficsWire = [];
        client.messageBuffer = [];
        client.ws = { readyState: WebSocket.OPEN, send(command) { window.__ficsWire.push(command); } };
        Object.assign(client, {
            connected: true,
            authenticated: true,
            connectionState: 'connected',
            ficsUsername: 'FixtureGuest',
            sessionGeneration: 1,
            gameActive: true,
            myColor: 'white',
            pendingMove: null,
            liveGame: {
                ...client.createEmptyLiveGameState('playing'),
                gameNumber: 701,
                whiteName: 'FixtureGuest',
                blackName: 'Opponent',
                userColor: 'white',
                relation: 1,
                sideToMove: 'w',
                whiteClock: 300,
                blackClock: 300,
                currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                gameActive: true,
                observedGame: false,
                status: 'playing'
            }
        });
        client.updateConnectionStatus(true);
        client.updateIdentityStatus();
        window.CaissaFICSShell.refresh();
    });
}

test('move delivery and confirmation stay off the board and remain chronological in collapsed Console', async ({ page }) => {
    await openFics(page);
    await installMoveFixture(page);
    const before = await page.evaluate(() => ({
        boardTop: document.getElementById('ficsBoardContainer').getBoundingClientRect().top,
        boardHeight: document.getElementById('ficsBoardContainer').getBoundingClientRect().height,
        bodyHeight: document.getElementById('ficsRd2Body').getBoundingClientRect().height
    }));

    const eventState = await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.pendingMove = { uci: 'e2e4', optimisticFen: client.liveGame.currentFen, sentAt: performance.now() - 25 };
        client.setPendingState('pending', 'Pending e2e4...');
        client.sendMove('e2e4');
        client.clearPendingMove(true);
        const pending = document.getElementById('ficsPendingState');
        const style = getComputedStyle(pending);
        return {
            wire: [...window.__ficsWire],
            messages: [...client.messageBuffer],
            consoleExpanded: document.getElementById('ficsConsoleToggle').getAttribute('aria-expanded'),
            consoleDisplay: getComputedStyle(document.getElementById('ficsConsoleContainer')).display,
            pendingRect: pending.getBoundingClientRect().toJSON(),
            pendingClipPath: style.clipPath,
            pendingText: pending.textContent,
            pendingAriaLive: pending.getAttribute('aria-live')
        };
    });
    const after = await page.evaluate(() => ({
        boardTop: document.getElementById('ficsBoardContainer').getBoundingClientRect().top,
        boardHeight: document.getElementById('ficsBoardContainer').getBoundingClientRect().height,
        bodyHeight: document.getElementById('ficsRd2Body').getBoundingClientRect().height
    }));

    expect(eventState.wire).toEqual(['e2e4']);
    expect(eventState.messages.filter(message => message.includes('Move sent to FICS'))).toHaveLength(1);
    expect(eventState.messages.filter(message => message.includes('Move confirmed by FICS'))).toHaveLength(1);
    expect(eventState.consoleExpanded).toBe('false');
    expect(eventState.consoleDisplay).toBe('none');
    expect(eventState.pendingRect.width).toBe(1);
    expect(eventState.pendingRect.height).toBe(1);
    expect(eventState.pendingClipPath).toBe('inset(50%)');
    expect(eventState.pendingText).toContain('Move confirmed by FICS');
    expect(eventState.pendingAriaLive).toBe('polite');
    expect(after).toEqual(before);

    await page.locator('#ficsConsoleToggle').click();
    await expect(page.locator('#ficsConsole')).toContainText('[GAME] Move sent to FICS; server confirmation is pending.');
    await expect(page.locator('#ficsConsole')).toContainText('[GAME] Move confirmed by FICS');
    await expect(page.locator('#ficsConsole')).toHaveAttribute('tabindex', '0');
});

test('successful game actions use Console only while blocking delivery errors stay visible', async ({ page }) => {
    await openFics(page);
    await installMoveFixture(page);
    const body = page.locator('[data-fics-body-view="game"]');

    await page.getByRole('button', { name: 'Offer Draw' }).click();
    await expect(body).not.toContainText('Draw offer delivered to the connection');
    expect(await page.evaluate(() => window.CaissaFICSClient.messageBuffer
        .filter(message => message.includes('Draw offer sent to FICS')))).toHaveLength(1);
    await expect(page.locator('#ficsPendingState')).toContainText('Draw offer sent to FICS');

    await page.getByRole('button', { name: 'Resign' }).click();
    await page.getByRole('button', { name: 'Confirm Resign' }).click();
    await expect(body).not.toContainText('Resign command delivered to the connection');
    expect(await page.evaluate(() => window.CaissaFICSClient.messageBuffer
        .filter(message => message.includes('Resign command sent to FICS')))).toHaveLength(1);
    await expect(page.locator('#ficsPendingState')).toContainText('Resign command sent to FICS');

    await page.evaluate(() => {
        const client = window.CaissaFICSClient;
        client.pendingGameActions = { resign: false, draw: false };
        client.ws = null;
        window.CaissaFICSShell.refresh();
    });
    await page.getByRole('button', { name: 'Offer Draw' }).click();
    await expect(page.getByRole('alert')).toContainText('The draw offer was not delivered');
});

test('desktop and mobile stay stable, overflow-free, and free of serious FICS accessibility violations', async ({ page }) => {
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
        await openFics(page, viewport);
        await installMoveFixture(page);
        await page.evaluate(() => {
            const client = window.CaissaFICSClient;
            client.pendingMove = { uci: 'e2e4', optimisticFen: client.liveGame.currentFen, sentAt: performance.now() };
            client.setPendingState('pending', 'Pending e2e4...');
            client.sendMove('e2e4');
        });
        const geometry = await page.evaluate(() => {
            const section = document.getElementById('ficsSection');
            const pending = document.getElementById('ficsPendingState').getBoundingClientRect();
            return {
                overflow: section.scrollWidth - section.clientWidth,
                pendingWidth: pending.width,
                pendingHeight: pending.height,
                consoleReachable: document.getElementById('ficsConsoleToggle').getBoundingClientRect().bottom
                    <= document.querySelector('.fics-rd2-workspace').getBoundingClientRect().bottom
            };
        });
        expect(geometry.overflow, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
        expect(geometry.pendingWidth).toBe(1);
        expect(geometry.pendingHeight).toBe(1);
        expect(geometry.consoleReachable).toBe(true);

        const axe = await new AxeBuilder({ page }).include('#ficsSection').analyze();
        expect(axe.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
        expect(axe.violations.filter(item => item.id === 'scrollable-region-focusable')).toEqual([]);
    }
});

test('feature-flag rollback restores the legacy visible pending surface without replacing its node', async ({ page }) => {
    await openFics(page);
    const rollback = await page.evaluate(() => {
        const pending = document.getElementById('ficsPendingState');
        window.CaissaFICSClient.setPendingState('pending', 'Pending e2e4...');
        const disabled = window.CaissaFICSShell.setEnabled(false);
        const style = getComputedStyle(pending);
        return {
            disabled,
            nodePreserved: pending === document.getElementById('ficsPendingState'),
            width: pending.getBoundingClientRect().width,
            height: pending.getBoundingClientRect().height,
            minHeight: style.minHeight,
            clipPath: style.clipPath
        };
    });
    expect(rollback.disabled).toBe(true);
    expect(rollback.nodePreserved).toBe(true);
    expect(rollback.width).toBeGreaterThan(1);
    expect(rollback.height).toBeGreaterThanOrEqual(24);
    expect(rollback.minHeight).toBe('24px');
    expect(rollback.clipPath).toBe('none');
});
