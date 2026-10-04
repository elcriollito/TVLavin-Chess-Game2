import { expect, test } from '@playwright/test';

const desktopSizes = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 }
];

test('championship archive renders its chronological mural at the required desktop sizes', async ({ page }) => {
  await page.goto('/game-library/champions');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('World Chess');
  await expect(page.locator('.champion-card')).toHaveCount(18);
  await expect(page.locator('.champion-card').first()).toContainText('Wilhelm Steinitz');
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
test('Fischer detail opens the complete match in the allowlisted reader and returns', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="bobby-fischer"]').click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Spassky–Fischer');
  await expect(dialog).toContainText('Fischer–Karpov title succession');
  await expect(dialog).toContainText('21 games');
  await expect(dialog).toContainText('forfeited');
  await expect(dialog.getByRole('link', { name: 'Download PGN' })).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Reader handoff pending' })).toHaveCount(2);
  const completeDownload = dialog.locator('.collection-card.is-complete').getByRole('link', { name: 'Download PGN' });
  await expect(completeDownload).toHaveAttribute('href', '/data/pgn/world-championships/fischer-spassky-1972.pgn');
  await dialog.getByRole('button', { name: 'Open in PGN Reader' }).click();
  await expect(page).toHaveURL(/\/watch\/game-replayer\?collection=fischer-spassky-1972-complete$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Fischer–Spassky 1972');
  const frame = page.frameLocator('iframe[data-game-replayer-frame]');
  await expect(page.locator('[data-game-replayer-shell]')).toHaveClass(/is-ready/, { timeout: 20_000 });
  await expect(frame.getByRole('button', { name: 'Games', exact: true })).toBeVisible();
  await frame.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(frame.locator('.cbreplay')).toContainText(/Fischer|Spassky/);
  await frame.getByRole('button', { name: 'Next Game', exact: true }).click();
  await page.getByRole('link', { name: 'Return to World Champions' }).click();
  await expect(page).toHaveURL('/game-library/champions');
});

test('Karpov detail distinguishes aborted and completed title events', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="anatoly-karpov"]').click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toContainText('Karpov–Korchnoi');
  await expect(dialog).toContainText('aborted');
  await expect(dialog).toContainText('48 games');
  await expect(dialog.getByRole('link', { name: 'Download PGN' })).toHaveAttribute('href', '/pgn/world-champions/Karpov_Anatoly/karpov-kasparov-1985.pgn');
});

test('the existing Game Library route and IndexedDB records remain isolated', async ({ page }) => {
  await page.goto('/game-library');
  await expect(page.locator('#libraryPanel')).toHaveClass(/open/);
  await expect(page.locator('#libraryTabPositions')).toBeVisible();
  await expect(page.locator('#libraryTabGames')).toBeVisible();
  await expect(page.locator('script[src*="championship-archive"]')).toHaveCount(0);

  const beforeArchive = await page.evaluate(async () => {
    await window.CaissaLibraryUIReady;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('caissa_library', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const collection = { id: 'phase2-personal-collection', name: 'Phase 2 Regression', type: 'game', positions: ['phase2-position'], headers: { Event: 'Private Test Game' }, createdAt: 1, updatedAt: 1, isDefault: false };
    const position = { id: 'phase2-position', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', fenHash: 'phase2', title: 'Private saved position', tags: ['private-tag'], collectionId: collection.id, isFavorite: true, engineReport: { depth: 12, score: 0 }, dateAdded: 1, syncStatus: 'pending' };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['positions', 'collections'], 'readwrite');
      tx.objectStore('positions').put(position);
      tx.objectStore('collections').put(collection);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { collection, position };
  });

  await page.goto('/game-library/champions');
  await expect(page.locator('.champion-card')).toHaveCount(18);
  const afterArchive = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('caissa_library', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store, key) => new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const result = { collection: await read('collections', 'phase2-personal-collection'), position: await read('positions', 'phase2-position') };
    db.close();
    return result;
  });
  expect(afterArchive).toEqual(beforeArchive);
});
