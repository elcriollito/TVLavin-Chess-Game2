import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

test('QA shell exposes CAISSA identity structure while preserving board and routes', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const before = await page.evaluate(() => {
        window.__identityBoard = window.App.board;
        return { fen: window.App.game.fen() };
    });
    await expect(page.locator('[data-caissa-expression="inscribed-mode-rail"]')).toBeVisible();
    await expect(page.locator('[data-shell-mode="games"]')).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-shell-mode="bots"]').click();
    await expect(page).toHaveURL(/\/play\/bots\?simplified=1/);
    expect(await page.evaluate(() => window.App.board === window.__identityBoard)).toBe(true);
    expect(await page.evaluate(() => window.App.game.fen())).toBe(before.fen);
});

test('component hierarchy has one primary command and distinct identity markers', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(() => {
        const api = window.CaissaPlayVisualComponents;
        const host = document.createElement('div'); document.body.appendChild(host);
        const nodes = [
            api.createProfileCard({ name: 'CAISSA Profile', description: 'Purpose before metadata', rating: { value: 1400 } }),
            api.createTimeControlSelector({ items: [{ id: 'rapid', label: '10+0', selected: true }] }),
            api.createCtaFooter({ actions: [{ label: 'Begin', actionId: 'primary' }, { label: 'Details', actionId: 'secondary' }] }),
            api.createGameOverCard({ result: 'Draw', actions: [{ label: 'Rematch', actionId: 'rematch' }] }),
            api.createLoadingSkeleton({ message: 'Preparing board' }),
            api.createEmptyState({ message: 'No records available' }),
            api.createLockedState({ message: 'Unavailable in this mode' })
        ];
        nodes.forEach(node => host.appendChild(node));
        return {
            expressions: [...host.querySelectorAll('[data-caissa-expression]')].map(node => node.dataset.caissaExpression),
            primaries: host.querySelectorAll('.caissa-vc-button--primary').length,
            policy: window.CaissaPlayIdentityRules.getPolicy()
        };
    });
    expect(proof.expressions).toEqual(expect.arrayContaining([
        'identity-first-profile', 'rating-ledger', 'score-sheet-controls',
        'separated-primary-command', 'learning-continuation', 'ledger-wash',
        'open-file-state', 'notched-readiness'
    ]));
    expect(proof.primaries).toBe(2);
    expect(proof.policy.principleId).toBe('caissa-board-first');
});

test('Play UI has no foreign product branding or external competitor visual requests', async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.goto('/play/players?simplified=1');
    const shellText = await page.locator('[data-caissa-simplified-shell]').innerText();
    expect(shellText).not.toMatch(/chess\.com|lichess|chess24|chessable/i);
    expect(requests.filter(url => /chess\.com|lichess|chess24|chessable/i.test(url))).toEqual([]);
    await expect(page.getByRole('button', { name: 'Open CAISSA Classic' }).first()).toBeVisible();
});

test('nine viewport hierarchy remains board-first, bounded, accessible, and reduced-motion safe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const viewport of [
        { width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 },
        { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
        { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }
    ]) {
        await page.setViewportSize(viewport); await page.goto('/play/games?simplified=1');
        const geometry = await page.evaluate(() => {
            const board = document.querySelector('.caissa-simplified-shell__board-stage')?.getBoundingClientRect();
            const panel = document.querySelector('.caissa-simplified-shell__context')?.getBoundingClientRect();
            return { bounded: document.documentElement.scrollWidth <= innerWidth + 1,
                boardVisible: !!board && board.width > 0 && board.height > 0,
                panelVisible: !!panel && panel.width > 0 && panel.height > 0 };
        });
        expect(geometry).toEqual({ bounded: true, boardVisible: true, panelVisible: true });
    }
    const results = await new AxeBuilder({ page }).include('[data-caissa-simplified-shell]').analyze();
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact))).toEqual([]);
});

test('Legacy Play and Classic remain default and unaffected', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#yahooClassicSection')).toHaveClass(/active/);
    await expect(page.locator('[data-caissa-simplified-shell]')).toBeHidden();
    await page.goto('/play/games');
    await expect(page.locator('#playSection')).toHaveClass(/active/);
    await expect(page.locator('[data-caissa-simplified-shell]')).toBeHidden();
});
