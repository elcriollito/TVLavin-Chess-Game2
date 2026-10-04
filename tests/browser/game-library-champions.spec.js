import { expect, test } from '@playwright/test';

const desktopSizes = [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }];

const championshipFixture = ({ event, white, black, date }) => `[Event "${event}"]
[Site "CAISSA QA"]
[Date "${date}"]
[Round "1"]
[White "${white}"]
[Black "${black}"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0

[Event "${event}"]
[Site "CAISSA QA"]
[Date "${date}"]
[Round "2"]
[White "${black}"]
[Black "${white}"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2`;

test('championship archive renders its chronological mural at required desktop sizes', async ({ page }) => {
  await page.goto('/game-library/champions');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('World Chess');
  await expect(page.locator('.champion-card')).toHaveCount(18);
  await expect(page.locator('.champion-card__portrait')).toHaveCount(18);
  await expect(page.locator('.champion-card__portrait-status')).toHaveText(Array(18).fill('CAISSA archival monogram'));
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

test('Capablanca champion collection opens and restores exact archive state', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.getByRole('button', { name: 'Championship Matches' }).click();
  await page.getByRole('button', { name: 'Undisputed', exact: true }).click();
  const match = page.locator('[data-match-event="wcc-1927"]');
  await match.scrollIntoViewIfNeeded();
  await match.getByRole('button', { name: 'Champion context' }).click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'José Raúl Capablanca' })).toBeFocused();
  await expect(dialog.locator('[data-event-id="wcc-1927"]')).toHaveClass(/is-selected/);
  await expect(dialog).toContainText('Capablanca–Alekhine');
  await expect(dialog.getByRole('heading', { name: 'Champion collection' })).toBeVisible();
  await expect(dialog).toContainText('Player collection');
  await expect(dialog).toContainText('597 games');
  await expect(dialog).toContainText('Reader available');
  await expect(dialog.locator('[data-event-id="wcc-1927"] [data-event-pgn]')).toHaveCount(1);
  await expect(dialog.locator('[data-event-id="wcc-1927"] .external-pgn-link')).toHaveAttribute('href', 'https://www.pgnmentor.com/events/WorldChamp1927.pgn');
  const complete = dialog.locator('.collection-card.is-complete');
  await expect(complete.getByRole('link', { name: /external source/i })).toHaveCount(0);
  await expect(complete.locator('a[download]')).toHaveCount(0);
  await complete.getByRole('button', { name: 'Open in PGN Reader' }).click();
  await expect(page).toHaveURL(/\/pgn-replayer\?collection=capablanca-complete&game=0&returnTo=/);
  expect(new URL(page.url()).searchParams.get('game')).toBe('0');
  const returnTo = new URL(page.url()).searchParams.get('returnTo');
  for (const part of ['view=matches', 'lineage=undisputed', 'champion=jose-raul-capablanca', 'reign=capablanca-1921', 'event=wcc-1927']) expect(returnTo).toContain(part);
  expect(returnTo).toMatch(/scroll=[1-9]\d*/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PGN Reader');
  await expect(page.locator('[data-pgn-games] [data-game-index]')).toHaveCount(597, { timeout: 20_000 });
  await expect(page.locator('[data-game-index="0"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#pgn-chessboard .caissa-board')).toBeVisible();
  await page.locator('[data-game-index="1"]').click();
  await expect(page.locator('[data-game-index="1"]')).toHaveAttribute('aria-current', 'true');
  await page.locator('[data-pgn-next-game]').click();
  await expect(page.locator('[data-game-index="2"]')).toHaveAttribute('aria-current', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/game-library\/champions\?view=matches/);
  await expect(page.locator('[data-champion-dialog]')).toBeVisible();
  await expect(page.locator('[data-event-id="wcc-1927"]')).toHaveClass(/is-selected/);
  await expect(page.getByRole('button', { name: 'Undisputed', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.locator('.collection-card.is-complete').getByRole('button', { name: 'Open in PGN Reader' }).click();
  const explicitReturn = page.getByRole('link', { name: 'Return to Champions' });
  await expect(explicitReturn).toHaveAttribute('href', /\/game-library\/champions\?view=matches.*event=wcc-1927/);
  await explicitReturn.click();
  await expect(page).toHaveURL(/\/game-library\/champions\?view=matches/);
  await expect(page.getByRole('button', { name: 'Championship Matches' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Undisputed', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-champion-dialog]')).toBeVisible();
  await expect(page.locator('[data-event-id="wcc-1927"]')).toHaveClass(/is-selected/);
  await expect.poll(() => page.evaluate(() => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop))).toBeGreaterThan(100);

});

test('championship albums stay separate from rights-pending player collections', async ({ page }) => {
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="anatoly-karpov"]').click();
  const dialog = page.locator('[data-champion-dialog]');
  await expect(dialog).toContainText('Karpov–Korchnoi');
  await expect(dialog).toContainText('aborted');
  await expect(dialog).toContainText('48 games');
  await expect(dialog).toContainText('Reader available');
  await expect(dialog.locator('.champion-collection .empty-collection')).toContainText('Historical data only');
  await expect(dialog.locator('.champion-collection .empty-collection')).toContainText('No approved player collection');
  await expect(dialog.getByRole('heading', { name: 'Reigns' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Historical context' })).toBeVisible();
  const closeBox = await dialog.getByRole('button', { name: 'Close champion detail' }).boundingBox();
  const navigationBox = await page.locator('.era-navigation').boundingBox();
  expect(closeBox.y).toBeGreaterThanOrEqual(navigationBox.y + navigationBox.height);
  await expect(dialog.locator('[data-event-id="wcc-1984"] [data-event-pgn]')).toHaveCount(1);
  await expect(dialog.locator('[data-event-id="wcc-1984"] .external-pgn-link')).toHaveAttribute('href', 'https://www.pgnmentor.com/events/WorldChamp1984.pgn');
  await expect(dialog.locator('.champion-collection [data-open-pgn], .champion-collection .external-pgn-link')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-open-champion="anatoly-karpov"]')).toBeFocused();
  await page.locator('[data-open-champion="bobby-fischer"]').click();
  await expect(dialog.locator('.champion-collection .empty-collection')).toContainText('Collection not publicly available');
  await expect(dialog.locator('[data-event-id="wcc-1972"] [data-event-pgn]')).toHaveCount(1);
  await expect(dialog.locator('[data-event-id="wcc-1972"] .external-pgn-link')).toHaveAttribute('href', 'https://www.pgnmentor.com/events/WorldChamp1972.pgn');
  await expect(dialog.locator('.champion-collection [data-open-pgn], .champion-collection .external-pgn-link')).toHaveCount(0);
});

test('recent championship View match opens game 1 and restores the exact archive state', async ({ page }) => {
  await page.route('**/api/pgn/pgnmentor?kind=event&file=WorldChamp2024.pgn', route => route.fulfill({
    contentType: 'application/x-chess-pgn',
    body: championshipFixture({ event: 'World Championship 2024', white: 'Ding Liren', black: 'Gukesh D', date: '2024.11.25' })
  }));
  await page.goto('/game-library/champions');
  await page.locator('[data-open-champion="gukesh-dommaraju"]').click();
  const event = page.locator('[data-event-id="wcc-2024"]');
  await expect(event).toContainText('14 games');
  await expect(event.getByRole('link', { name: /Download PGN from external source/i })).toHaveAttribute('href', 'https://www.pgnmentor.com/events/WorldChamp2024.pgn');
  await event.getByRole('button', { name: /View Ding.*Gukesh in PGN Reader/i }).click();
  await expect(page).toHaveURL(/\/pgn-replayer\?collection=world-championship-worldchamp2024&game=0/);
  const readerUrl = new URL(page.url());
  expect(readerUrl.pathname).toBe('/pgn-replayer');
  expect(readerUrl.searchParams.get('collection')).toBe('world-championship-worldchamp2024');
  expect(readerUrl.searchParams.get('game')).toBe('0');
  const returnTo = readerUrl.searchParams.get('returnTo');
  for (const part of ['view=champions', 'champion=gukesh-dommaraju', 'reign=gukesh-2024', 'event=wcc-2024']) expect(returnTo).toContain(part);
  await expect(page.locator('[data-pgn-title]')).toHaveText(/Ding Liren.*Gukesh D/, { timeout: 20_000 });
  await expect(page.locator('[data-pgn-games] [data-game-index]')).toHaveCount(2);
  await expect(page.locator('[data-game-index="0"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('[data-pgn-game-info]')).toContainText('World Championship 2024');
  await expect(page.locator('#pgn-chessboard .caissa-board')).toBeVisible();
  await expect(page.locator('[data-pgn-save-source]')).toBeDisabled();
  await page.keyboard.press('PageDown');
  await expect(page.locator('[data-game-index="1"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('PageUp');
  await expect(page.locator('[data-game-index="0"]')).toHaveAttribute('aria-current', 'true');
  await page.getByRole('link', { name: 'Return to Champions' }).click();
  await expect(page).toHaveURL(/champion=gukesh-dommaraju/);
  await expect(page.locator('[data-champion-dialog]')).toBeVisible();
  await expect(page.locator('[data-event-id="wcc-2024"]')).toHaveClass(/is-selected/);
});

for (const sample of [
  { champion: 'magnus-carlsen', event: 'wcc-2018', collection: 'world-championship-worldchamp2018', file: 'WorldChamp2018.pgn', white: 'Magnus Carlsen', black: 'Fabiano Caruana', date: '2018.11.09' },
  { champion: 'magnus-carlsen', event: 'wcc-2014', collection: 'world-championship-worldchamp2014', file: 'WorldChamp2014.pgn', white: 'Magnus Carlsen', black: 'Viswanathan Anand', date: '2014.11.08' },
  { champion: 'tigran-petrosian', event: 'wcc-1966', collection: 'world-championship-worldchamp1966', file: 'WorldChamp1966.pgn', white: 'Tigran Petrosian', black: 'Boris Spassky', date: '1966.04.11' },
  { champion: 'mikhail-botvinnik', event: 'wcc-1951', collection: 'world-championship-worldchamp1951', file: 'WorldChamp1951.pgn', white: 'Mikhail Botvinnik', black: 'David Bronstein', date: '1951.03.15' }
]) {
  test(`${sample.event} uses its deterministic Reader collection`, async ({ page }) => {
    let requestedUrl = '';
    await page.route(`**/api/pgn/pgnmentor?kind=event&file=${sample.file}`, route => {
      requestedUrl = route.request().url();
      return route.fulfill({
        contentType: 'application/x-chess-pgn',
        body: championshipFixture({ event: `World Championship ${sample.date.slice(0, 4)}`, white: sample.white, black: sample.black, date: sample.date })
      });
    });
    await page.goto('/game-library/champions');
    await page.locator(`[data-open-champion="${sample.champion}"]`).click();
    await page.locator(`[data-event-id="${sample.event}"] [data-event-pgn]`).click();
    await expect(page).toHaveURL(new RegExp(`collection=${sample.collection}.*game=0`));
    const url = new URL(page.url());
    expect(url.searchParams.get('collection')).toBe(sample.collection);
    expect(url.searchParams.get('game')).toBe('0');
    await expect(page.locator('[data-pgn-title]')).toContainText(sample.white, { timeout: 20_000 });
    await expect(page.locator('[data-game-index="0"]')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('PageDown');
    await expect(page.locator('[data-game-index="1"]')).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('PageUp');
    await expect(page.locator('[data-game-index="0"]')).toHaveAttribute('aria-current', 'true');
    expect(new URL(requestedUrl).searchParams.get('file')).toBe(sample.file);
  });
}

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

test('production route excludes private collections and hardens reader/download inputs', async ({ page, request }) => {
  await page.goto('/game-library/champions');
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/internal|test asset|fischer.spassky 1972.*complete match/i);
  await expect(page.locator('[href*="__caissa_internal_qa"], [data-open-pgn="fischer-spassky-1972-complete"]')).toHaveCount(0);

  const privateAsset = await request.get('/__caissa_internal_qa/pgn/fischer-spassky-1972-complete.pgn');
  expect(privateAsset.status()).toBe(404);
  const publicAsset = await request.get('/data/pgn/capablanca-games-1901-1941.pgn');
  expect(publicAsset.status()).toBe(200);
  expect(publicAsset.headers()['content-type']).toContain('application/x-chess-pgn');
  expect(publicAsset.headers()['content-disposition']).toBe('attachment; filename="capablanca-games-1901-1941.pgn"');
  expect((await publicAsset.body()).toString('utf8').match(/^\[Event /gm)).toHaveLength(597);

  await page.goto('/watch/game-replayer?collection=../../secret&returnTo=https://evil.example/');
  await expect(page.locator('iframe[data-game-replayer-frame]')).toHaveAttribute('data-collection-id', 'capablanca-complete');
  await expect(page.locator('[data-invalid-collection]')).toContainText('return destination was not accepted');
  await expect(page.getByRole('link', { name: 'Return to World Champions' })).toHaveAttribute('href', '/game-library/champions');
  await expect(page.locator('[data-collection-download]').first()).toHaveAttribute('href', '/data/pgn/capablanca-games-1901-1941.pgn');
});

test('direct Capablanca reader URL defaults to the archive return route', async ({ page }) => {
  await page.goto('/watch/game-replayer?collection=capablanca-complete');
  await expect(page.getByRole('link', { name: 'Return to World Champions' })).toHaveAttribute('href', '/game-library/champions');
  await expect(page.locator('iframe[data-game-replayer-frame]')).toHaveAttribute('data-collection-id', 'capablanca-complete');
});

test('native Reader rejects arbitrary URLs, unapproved collections, and invalid game indexes before fetch', async ({ page }) => {
  let collectionRequests = 0;
  page.on('request', request => {
    if (request.url().includes('/api/pgn/pgnmentor') || request.url().includes('/data/pgn/')) collectionRequests += 1;
  });
  await page.goto('/pgn-replayer?collection=world-championship-worldchamp2024&game=0&url=https://evil.example/file.pgn');
  await expect(page.locator('[data-pgn-message]')).toContainText('unsupported parameters');
  expect(collectionRequests).toBe(0);

  await page.goto('/pgn-replayer?collection=fischer-spassky-game-6&game=0');
  await expect(page.locator('[data-pgn-message]')).toContainText('not approved');
  expect(collectionRequests).toBe(0);

  await page.goto('/pgn-replayer?collection=world-championship-worldchamp2024&game=9999');
  await expect(page.locator('[data-pgn-message]')).toContainText('requested game is not available');
  expect(collectionRequests).toBe(0);

  await page.route('**/api/pgn/pgnmentor?kind=event&file=WorldChamp2024.pgn', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/pgn-replayer?collection=world-championship-worldchamp2024&game=0');
  await expect(page.locator('[data-pgn-message]')).toContainText('fallback reader is available');
  await expect(page.locator('[data-pgn-fallback]')).toHaveAttribute('href', '/watch/game-replayer?collection=world-championship-worldchamp2024&game=0');
  expect(collectionRequests).toBe(1);
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
  await page.locator('[data-open-champion="jose-raul-capablanca"]').click();
  await page.locator('.collection-card.is-complete').getByRole('button', { name: 'Open in PGN Reader' }).click();
  await expect(page).toHaveURL(/collection=capablanca-complete/);
  const archiveReturn = page.getByRole('link', { name: 'Return to Champions' });
  await expect(archiveReturn).toHaveAttribute('href', /\/game-library\/champions\?view=champions.*champion=jose-raul-capablanca/);
  await archiveReturn.click();
  await expect(page.locator('[data-champion-dialog]')).toBeVisible();
  await page.getByRole('link', { name: 'Open personal library' }).click();
  await expect(page).toHaveURL(/\/game-library$/);
  await expect(page.locator('#libraryPanel')).toHaveClass(/open/);
  const afterArchive = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('caissa_library', 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const read = (store, key) => new Promise((resolve, reject) => { const request = db.transaction(store, 'readonly').objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const result = { collection: await read('collections', 'phase3-personal-collection'), position: await read('positions', 'phase3-position') };
    db.close(); return result;
  });
  expect(afterArchive).toEqual(beforeArchive);
});
