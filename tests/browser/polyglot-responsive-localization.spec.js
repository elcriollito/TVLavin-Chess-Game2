import { test, expect } from '@playwright/test';

test.setTimeout(240_000);

const widths = [320, 360, 375, 390, 393, 412, 430, 768, 1024, 1280, 1440, 1920];
const copy = {
    en: {
        title: 'Polyglot Opening Book Creator', generate: 'Generate opening book',
        help: 'What Is a Polyglot Opening Book?', log: '[ready] Waiting for PGN upload...'
    },
    es: {
        title: 'Creador de libros de aperturas Polyglot', generate: 'Generar libro de aperturas',
        help: '¿Qué es un libro de aperturas Polyglot?', log: '[listo] Esperando un archivo PGN...'
    },
    pt: {
        title: 'Criador de livros de aberturas Polyglot', generate: 'Gerar livro de aberturas',
        help: 'O que é um livro de aberturas Polyglot?', log: '[pronto] Aguardando um arquivo PGN...'
    }
};

async function prepare(page, locale = 'en') {
    await page.addInitScript(value => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        if (!localStorage.getItem('caissa.locale')) localStorage.setItem('caissa.locale', value);
    }, locale);
}

test('EN ES PT localize the complete tool and single Help source with live switching', async ({ page }) => {
    await prepare(page);
    await page.goto('/tools/polyglot');
    const selector = page.locator('[data-caissa-locale-select]').first();
    await expect(selector.locator('option')).toHaveText(['English', 'Español', 'Português']);
    await expect(page.locator('.poly-education')).toHaveCount(1);
    await expect(page.locator('.polyglot-tool-column .poly-education')).toHaveCount(0);

    for (const locale of ['en', 'es', 'pt']) {
        await selector.selectOption(locale);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('h1')).toHaveText(copy[locale].title);
        await expect(page.locator('#generateBtn')).toContainText(copy[locale].generate);
        await expect(page.locator('#polyglot-book-heading')).toHaveText(copy[locale].help);
        await expect(page.locator('#buildLog')).toHaveText(copy[locale].log);
        await expect(page.locator('.polyglot-help-column')).toHaveAttribute('aria-label', /Polyglot/);
    }

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt');
    await expect(page.locator('h1')).toHaveText(copy.pt.title);
    const presentation = await page.locator('.polyglot-workspace').innerText();
    expect(presentation).not.toMatch(/What Is a|Generate opening book|Build Log|Download BIN|Choose PGN file/);
});

test('desktop aligns Tool and Help while tablet and mobile stack without overflow', async ({ page }) => {
    await prepare(page, 'pt');
    for (const width of widths) {
        await test.step(`${width}px`, async () => {
            await page.setViewportSize({ width, height: width <= 430 ? 844 : 1000 });
            await page.goto('/tools/polyglot', { waitUntil: 'domcontentloaded' });
            const geometry = await page.locator('.polyglot-workspace').evaluate(workspace => {
                const tool = workspace.querySelector('.polyglot-tool-column').getBoundingClientRect();
                const help = workspace.querySelector('.polyglot-help-column').getBoundingClientRect();
                const controls = [...workspace.querySelectorAll('#pgnFile, #maxPly, #minCount, #side, #generateBtn, #buildLog')]
                    .map(node => ({ id: node.id, rect: node.getBoundingClientRect() }));
                const columns = getComputedStyle(workspace).gridTemplateColumns.split(' ').filter(Boolean).length;
                return {
                    columns, tool: { left: tool.left, right: tool.right, top: tool.top, bottom: tool.bottom },
                    help: { left: help.left, right: help.right, top: help.top },
                    overflow: document.documentElement.scrollWidth - innerWidth,
                    controlsOutside: controls.filter(item => item.rect.left < tool.left - 1 || item.rect.right > tool.right + 1).map(item => item.id)
                };
            });
            expect(geometry.overflow, `${width}px page overflow`).toBeLessThanOrEqual(1);
            expect(geometry.controlsOutside, `${width}px controls`).toEqual([]);
            if (width >= 1280) {
                expect(geometry.columns, `${width}px columns`).toBe(2);
                expect(geometry.help.left).toBeGreaterThanOrEqual(geometry.tool.right - 1);
                expect(Math.abs(geometry.help.top - geometry.tool.top)).toBeLessThanOrEqual(2);
            } else {
                expect(geometry.columns, `${width}px columns`).toBe(1);
                expect(geometry.help.top).toBeGreaterThanOrEqual(geometry.tool.bottom - 1);
            }
        });
    }
});

test('keyboard labels, live log semantics, and UX-012 mobile icon-label pairs remain intact', async ({ page }) => {
    await prepare(page, 'es');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/tools/polyglot');

    await expect(page.locator('label[for="pgnFile"]')).toHaveText('Elegir archivo PGN');
    await page.locator('#pgnFile').focus();
    await expect(page.locator('#pgnFile')).toBeFocused();
    await page.locator('#maxPly').focus();
    await expect(page.locator('#maxPly')).toBeFocused();
    await expect(page.locator('#buildLog')).toHaveAttribute('role', 'log');
    await expect(page.locator('#buildLog')).toHaveAttribute('aria-live', 'polite');

    const toggle = page.locator('.caissa-standalone-mobile-toggle');
    await toggle.click();
    const mobile = await page.locator('.caissa-standalone-sidebar-host').evaluate(nav => {
        const items = [...nav.querySelectorAll('.nav-item[data-nav-key]')];
        return {
            count: items.length,
            pairs: items.filter(item => item.querySelector('i:first-child')
                && item.querySelector('.nav-label')?.getClientRects().length).length,
            active: nav.querySelector('[data-nav-key="polyglot"] .nav-label')?.textContent?.trim(),
            overflow: nav.scrollWidth - nav.clientWidth
        };
    });
    expect(mobile.pairs).toBe(mobile.count);
    expect(mobile.active).toBe('Herramienta Polyglot');
    expect(mobile.overflow).toBeLessThanOrEqual(1);
});

test('real PGN build preserves options, reports progress, and exposes the BIN download', async ({ page, request }) => {
    await prepare(page, 'pt');
    const pgn = `[Event "PGT-006"]\n[Site "CAISSA"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;
    const apiBaseUrl = process.env.POLYGLOT_API_BASE_URL;
    let observedPayload;
    if (apiBaseUrl) {
        const apiResponse = await request.post(`${apiBaseUrl}/api/polyglot/build`, {
            data: {
                fileName: 'certificacao.pgn', contentType: 'application/x-chess-pgn', pgnText: pgn,
                options: { maxPly: 6, minCount: 1, side: 'white' }
            }
        });
        expect(apiResponse.ok()).toBeTruthy();
        const apiBody = await apiResponse.body();
        const apiHeaders = apiResponse.headers();
        await page.route('**/api/polyglot/build', async route => {
            observedPayload = route.request().postDataJSON();
            await route.fulfill({ status: apiResponse.status(), headers: apiHeaders, body: apiBody });
        });
    }
    await page.goto('/tools/polyglot');
    await page.locator('#pgnFile').setInputFiles({ name: 'certificacao.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(pgn) });
    await page.locator('#maxPly').fill('6');
    await page.locator('#minCount').fill('1');
    await page.locator('#side').selectOption('white');

    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        page.locator('#generateBtn').click()
    ]);
    expect(download.suggestedFilename()).toBe('certificacao.bin');
    await expect(page.locator('#resultRow')).toBeVisible();
    await expect(page.locator('#downloadOutputBtn')).toHaveAttribute('href', /^blob:/);
    await expect(page.locator('#outputSize')).toContainText('Partidas processadas: 1');
    await expect(page.locator('#buildLog')).toContainText('Geração do BIN concluída');
    await expect(page.locator('#maxPly')).toHaveValue('6');
    await expect(page.locator('#minCount')).toHaveValue('1');
    await expect(page.locator('#side')).toHaveValue('white');
    if (apiBaseUrl) expect(observedPayload.options).toEqual({ maxPly: 6, minCount: 1, side: 'white' });
});
