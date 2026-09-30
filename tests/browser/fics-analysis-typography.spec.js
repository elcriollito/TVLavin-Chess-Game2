import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
});

async function openAnalyze(page, source) {
    await page.goto('/fics');
    const token = await page.evaluate((handoffSource) => {
        const transport = window.CaissaAnalyzeHandoff.createTransport();
        const created = transport.create({
            source: handoffSource, intent: 'analyze-game',
            payload: { recordId: `${handoffSource}-typography`,
                pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6', result: '*', recordStatus: 'complete' },
            provenance: { sourceSection: handoffSource, transport: 'sessionStorage' }
        });
        if (!created.ok || !transport.store(created.value).ok) throw new Error('handoff fixture failed');
        return created.value.token;
    }, source);
    await page.goto(`/analyze?handoff=${encodeURIComponent(token)}`);
    await expect(page.locator('#analyzeMoveList .move-row')).toHaveCount(3);
}

test('approved 18px Medium typography applies only to FICS Analysis', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openAnalyze(page, 'fics');
    const section = page.locator('#analyzeSection');
    const san = page.locator('#analyzeMoveList .move-white').first();
    const number = page.locator('#analyzeMoveList .move-num').first();
    await expect(section).toHaveAttribute('data-caissa-analyze-source', 'fics');
    await expect(san).toHaveCSS('font-size', '18px');
    await expect(san).toHaveCSS('font-weight', '600');
    await expect(san).toHaveCSS('line-height', '25px');
    await expect(san).toHaveCSS('letter-spacing', '0.18px');
    await expect(number).toHaveCSS('font-size', '16px');
    await expect(number).toHaveCSS('font-weight', '600');
    await expect(number).toHaveCSS('line-height', '25px');
    await expect(page.locator('[data-caissa-fics-typography-lab]')).toHaveCount(0);
});

test('long FICS notation remains aligned, unclipped, and vertically scrollable', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openAnalyze(page, 'fics');
    const result = await page.evaluate(() => {
        const list = document.getElementById('analyzeMoveList');
        const grid = list.querySelector('.move-list-grid');
        const template = grid.querySelector('.move-row');
        const sans = ['Nfxe5+', 'O-O-O', 'e8=Q+', 'Qh7+', 'R1e2'];
        const buttons = [...grid.querySelectorAll('button')];
        sans.forEach((san, index) => { buttons[index].textContent = san; });
        for (let index = 0; index < 45; index += 1) grid.append(template.cloneNode(true));
        const columns = [...grid.querySelectorAll('.move-row')].map(row => ({
            white: row.querySelector('.move-white').getBoundingClientRect().left,
            black: row.querySelector('.move-black').getBoundingClientRect().left
        }));
        return {
            horizontalOverflow: list.scrollWidth - list.clientWidth,
            verticalScroll: list.scrollHeight > list.clientHeight,
            clipped: buttons.slice(0, sans.length).some(button => button.scrollWidth > button.clientWidth),
            columnsAligned: columns.every(item => Math.abs(item.white - columns[0].white) <= 0.5
                && Math.abs(item.black - columns[0].black) <= 0.5)
        };
    });
    expect(result).toEqual({ horizontalOverflow: 0, verticalScroll: true, clipped: false, columnsAligned: true });
});

test('non-FICS Analyze keeps its existing typography contract', async ({ page }) => {
    await openAnalyze(page, 'play');
    await expect(page.locator('#analyzeSection')).not.toHaveAttribute('data-caissa-analyze-source', 'fics');
    await expect(page.locator('#analyzeMoveList .move-white').first()).toHaveCSS('font-size', '14px');
});
