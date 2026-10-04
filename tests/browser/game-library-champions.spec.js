import { expect, test } from '@playwright/test';

const desktopSizes = [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }];

test('championship archive renders its chronological mural at required desktop sizes', async ({ page }) => {
  await page.goto('/game-library/champions');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('World Chess');
  await expect(page.locator('.champion-card')).toHaveCount(18);
  await expect(page.locator('.champion-card__portrait')).toHaveCount(18);
  await expect(page.locator('.champion-card__portrait-status')).toHaveText(Array(18).fill('Archival monogram · no portrait'));
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('.champion-card').first()).toContainText('Wilhelm Steinitz');
  await expect(page.locator('.champion-card').first()).toContainText('No. 01');
  await expect(page.locator('.champion-card').first()).toContainText('World champion');
  await expect(page.locator('.champion-card').first()).toContainText('1886–1894');
  await expect(page.locator('.champion-card').last()).toContainText('Gukesh Dommaraju');
  await expect(page.locator('[data-split-diagram]')).toContainText('Classical lineage');
  await expect(page.locator('[data-split-diagram]')).toContainText('FIDE lineage');
  for (const size of desktopSizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))).toEqual({ client: size.width, scroll: size.width });
    await expect(page.locator('.archive-hero')).toBeVisible();
    await expect(page.locator('.champion-card').first()).toBeVisible();
  }
});

test('Fischer match opens the internal QA reader and restores archive state', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.getByRole('button', { name: 'Championship Matches' }).click();
  await page.getByRole('button', { name: 'Undisputed', exact: true }).click();
  const match = page.locator('[data-match-event="wcc-1972"]');
  await match.scrollIntoViewIfNeeded();
  await match.getByRole('button', { name: 'Champion context' }).click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-event-id="wcc-1972"]')).toHaveClass(/is-selected/);
  await expect(dialog).toContainText('21 games');
  await expect(dialog).toContainText('PGN internal QA');
  const complete = dialog.locator('.collection-card.is-complete');
  await expect(complete.getByRole('link', { name: 'Download PGN' })).toHaveAttribute('href', '/__caissa_internal_qa/pgn/fischer-spassky-1972-complete.pgn');
  await complete.getByRole('button', { name: 'Open in PGN Reader' }).click();
  await expect(page).toHaveURL(/\/watch\/game-replayer\?collection=fischer-spassky-1972-complete&returnTo=/);
  const returnTo = new URL(page.url()).searchParams.get('returnTo');
  for (const part of ['view=matches', 'lineage=undisputed', 'champion=bobby-fischer', 'reign=fischer-1972', 'event=wcc-1972']) expect(returnTo).toContain(part);
  expect(returnTo).toMatch(/scroll=[1-9]\d*/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Fischer–Spassky 1972');
  const frame = page.frameLocator('iframe[data-game-replayer-frame]');
  await expect(page.locator('[data-game-replayer-shell]')).toHaveClass(/is-ready/, { timeout: 20_000 });
  await frame.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(frame.locator('.cbreplay')).toContainText(/Fischer|Spassky/);
  await frame.getByRole('button', { name: 'Next Game', exact: true }).click();
  await page.getByRole('link', { name: 'Return to World Champions' }).click();
  await expect(page).toHaveURL(/\/game-library\/champions\?view=matches/);
  await expect(page.getByRole('button', { name: 'Championship Matches' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Undisputed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-champion-dialog]')).toBeVisible();
  await expect(page.locator('[data-event-id="wcc-1972"]')).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop))).toBeGreaterThan(100);
});

test('Karpov detail distinguishes history from rights-pending PGN data', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="anatoly-karpov"]').click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toContainText('Karpov–Korchnoi');
  await expect(dialog).toContainText('aborted');
  await expect(dialog).toContainText('48 games');
  await expect(dialog).toContainText('PGN pending review');
  await expect(dialog).toContainText('Rights review required · Public actions disabled');
  await expect(dialog.getByRole('heading', { name: 'Reigns' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Historical context' })).toBeVisible();
  const closeBox = await dialog.getByRole('button', { name: 'Close champion detail' }).boundingBox();
  const navigationBox = await page.locator('.era-navigation').boundingBox();
  expect(closeBox.y).toBeGreaterThanOrEqual(navigationBox.y + navigationBox.height);
  await expect(dialog.getByRole('link', { name: 'Download PGN' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Not available publicly' })).toBeDisabled();
});

test('multiple reigns are explicit and the selected reign survives reload', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="mikhail-botvinnik"]').click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog.locator('[data-detail-reign]')).toHaveCount(3);
  await dialog.locator('[data-detail-reign="botvinnik-1961"]').click();
  await expect(page).toHaveURL(/champion=mikhail-botvinnik/);
  await expect(page).toHaveURL(/reign=botvinnik-1961/);
  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-detail-reign="botvinnik-1961"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-open-champion="mikhail-botvinnik"]')).toHaveAttribute('aria-expanded', 'true');
});

test('match filters remain chronological and reflected in the URL', async ({ page }) => {
  await page.goto('/game-library/champions?view=matches&lineage=classical');
  await expect(page.getByRole('button', { name: 'Championship Matches' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Classical', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const years = (await page.locator('.match-card__year').allTextContents()).map(Number);
  expect(years.length).toBeGreaterThan(0);
  expect(years).toEqual([...years].sort((a, b) => a - b));
  await page.getByRole('button', { name: 'Special transitions' }).click();
  await expect(page).toHaveURL(/lineage=special/);
  await expect(page.locator('[data-match-results]')).toContainText('Exceptional transitions');
  await expect(page.locator('[data-match-event="wcc-1984"]')).toContainText('aborted');
});

test('existing Game Library route and IndexedDB records remain isolated', async ({ page }) => {
  await page.goto('/game-library');
  await expect(page.locator('#libraryPanel')).toHaveClass(/open/);
  await expect(page.locator('#libraryTabPositions')).toBeVisible();
  await expect(page.locator('#libraryTabGames')).toBeVisible();
  await expect(page.locator('script[src*="championship-archive"]')).toHaveCount(0);
  const beforeArchive = await page.evaluate(async () => {
    await window.CaissaLibraryUIReady;
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('caissa_library', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const collection = { id: 'phase3-personal-collection', name: 'Phase 3 Regression', type: 'game', positions: ['phase3-position'], headers: { Event: 'Private Test Game' }, createdAt: 1, updatedAt: 1, isDefault: false };
    const position = { id: 'phase3-position', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', fenHash: 'phase3', title: 'Private saved position', tags: ['private-tag'], collectionId: collection.id, isFavorite: true, engineReport: { depth: 12, score: 0 }, dateAdded: 1, syncStatus: 'pending' };
    await new Promise((resolve, reject) => { const tx = db.transaction(['positions', 'collections'], 'readwrite'); tx.objectStore('positions').put(position); tx.objectStore('collections').put(collection); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close(); return { collection, position };
  });
  await page.goto('/game-library/champions');
  await expect(page.locator('.champion-card')).toHaveCount(18);
  const afterArchive = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('caissa_library', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const read = (store, key) => new Promise((resolve, reject) => { const request = db.transaction(store, 'readonly').objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = { collection: await read('collections', 'phase3-personal-collection'), position: await read('positions', 'phase3-position') };
    db.close(); return result;
  });
  expect(afterArchive).toEqual(beforeArchive);
});
