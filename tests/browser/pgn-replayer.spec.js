import { expect, test } from '@playwright/test';

const annotated = `[Event "Annotated"]
[Site "CAISSA"]
[Date "2026.08.21"]
[Round "1"]
[White "Alpha"]
[Black "Beta"]
[WhiteElo "2100"]
[BlackElo "2050"]
[Result "1-0"]
[ECO "C20"]

1. e4 $1 {King pawn} e5 (1... c5 $5 {Sicilian} 2. Nf3) 2. Nf3 Nc6 3. Bb5 a6 1-0

[Event "Second"]
[White "Gamma"]
[Black "Delta"]
[Result "*"]

1. d4 d5 2. c4 *`;

async function loadPgn(page, pgn = annotated) {
  await page.locator('[data-pgn-file]').setInputFiles({ name: 'private-games.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from(pgn) });
  await expect(page.locator('[data-pgn-message]')).toContainText(/2 games loaded locally/i);
}

test('loads multiple games locally and replays mainline, comments, NAGs, and variations', async ({ page }) => {
  await page.goto('/pgn-replayer');
  await expect(page.getByRole('heading', { name: 'PGN Replayer' })).toBeVisible();
  await expect(page.locator('[data-pgn-empty]')).toContainText('Your PGN stays on this device');
  expect(await page.evaluate(() => localStorage.getItem('caissa_pgn_welcome_seen'))).toBe('1');
  await loadPgn(page);
  await expect(page.locator('[data-pgn-games] [data-game-index]')).toHaveCount(2);
  await expect(page.locator('[data-pgn-title]')).toHaveText('Alpha — Beta');
  await page.getByRole('tab', { name: 'Notation' }).click();
  await expect(page.locator('[data-pgn-notation]')).toContainText('King pawn');
  await expect(page.locator('[data-pgn-notation]')).toContainText('Sicilian');
  await expect(page.locator('.pgn-nag')).toContainText('!');
  await page.getByRole('button', { name: '1. e4' }).click();
  await expect(page.getByRole('button', { name: '1. e4' })).toHaveClass(/is-active/);
  await expect(page.locator('.square-e4 .piece-417db')).toHaveCount(1);
  await page.locator('[data-pgn-next]').click();
  await expect(page.locator('.square-e5 .piece-417db')).toHaveCount(1);
  await page.locator('[data-pgn-previous]').click();
  await expect(page.locator('.square-e4 .piece-417db')).toHaveCount(1);
});

test('supports game selection, notation metadata, Albums, flip, focus, and keyboard navigation', async ({ page }) => {
  await page.goto('/pgn-replayer');
  await loadPgn(page);
  await page.locator('[data-game-index="1"]').click();
  await expect(page.locator('[data-pgn-title]')).toHaveText('Gamma — Delta');
  await page.getByRole('tab', { name: 'Notation' }).click();
  await expect(page.locator('[data-pgn-game-info]')).toContainText('Second');
  await page.getByRole('tab', { name: 'Albums' }).click();
  await expect(page.locator('[data-pgn-albums]')).toContainText('private-games.pgn');
  await expect(page.locator('[data-pgn-albums] [data-access="local"]')).toHaveText('Local PGN');
  await page.locator('[data-pgn-flip]').click();
  await expect(page.locator('#pgn-chessboard')).toHaveAttribute('aria-label', /black orientation/i);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.square-d4 .piece-417db')).toHaveCount(1);
  await page.locator('[data-pgn-focus]').click();
  await expect(page.locator('body')).toHaveClass(/pgn-focus-mode/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/pgn-focus-mode/);
  await expect(page.locator('[data-pgn-focus]')).toBeFocused();
});

test('opens the existing Capablanca collection as a free album', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/pgn-replayer');
  await page.getByRole('tab', { name: 'Albums' }).click();
  const album = page.locator('[data-album-id="capablanca-games-1901-1941"]');
  await expect(album).toContainText('José Raúl Capablanca');
  await expect(album.locator('[data-access="free"]')).toHaveText('Free');
  await album.click();
  await expect(page.locator('[data-pgn-message]')).toContainText('597 games loaded locally', { timeout: 30_000 });
  await expect(page.locator('[data-pgn-games] [data-game-index]')).toHaveCount(597);
  await expect(album).toHaveAttribute('aria-current', 'true');
});

test('engine defaults off and renders exactly two local analysis lines', async ({ page }) => {
  await page.route('**/engine/stockfish-working.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `onmessage = event => {
      if (event.data === 'uci') postMessage('uciok');
      if (event.data === 'isready') postMessage('readyok');
      if (String(event.data).startsWith('go ')) {
        postMessage('info depth 10 multipv 1 score cp 35 pv e2e4 e7e5 g1f3');
        postMessage('info depth 10 multipv 2 score cp 12 pv d2d4 d7d5 c2c4');
        postMessage('bestmove e2e4');
      }
      if (event.data === 'stop') postMessage('bestmove e2e4');
    };`
  }));
  await page.goto('/pgn-replayer');
  await loadPgn(page);
  const toggle = page.locator('[data-pgn-engine]');
  await expect(toggle).toContainText('Off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-pgn-engine-panel]')).toBeVisible();
  const reservedHeight = await page.locator('[data-pgn-engine-panel]').evaluate(node => node.getBoundingClientRect().height);
  await toggle.click();
  await expect(toggle).toContainText('On');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-pgn-engine-panel]')).toBeVisible();
  await expect(page.locator('.pgn-engine-line')).toHaveCount(2);
  await expect(page.locator('.pgn-engine-line').first()).toContainText('+0.35');
  await expect(page.locator('.pgn-engine-line').first()).toContainText('e4 e5 Nf3');
  await expect(page.locator('[data-pgn-engine-panel]')).toHaveCSS('height', `${reservedHeight}px`);
  await toggle.click();
  await expect(toggle).toContainText('Off');
  await expect(page.locator('[data-pgn-engine-panel]')).toBeVisible();
  await expect(page.locator('[data-pgn-engine-panel]')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('.pgn-engine-line').first()).toContainText('Turn Engine on to analyze');
});

test('renders active-looking PGN content as text and reports invalid PGN safely', async ({ page }) => {
  await page.goto('/pgn-replayer');
  const hostile = `[Event "<img src=x onerror=alert(1)>"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 {<script>window.pwned=true</script>} *`;
  await page.locator('[data-pgn-file]').setInputFiles({ name: 'hostile.pgn', mimeType: 'text/plain', buffer: Buffer.from(hostile) });
  await expect(page.locator('[data-pgn-message]')).toContainText('1 game loaded locally');
  await page.getByRole('tab', { name: 'Notation' }).click();
  await expect(page.locator('[data-pgn-game-info]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('[data-pgn-notation]')).toContainText('<script>window.pwned=true</script>');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await page.locator('[data-pgn-file]').setInputFiles({ name: 'broken.pgn', mimeType: 'text/plain', buffer: Buffer.from('not a PGN') });
  await expect(page.locator('[data-pgn-message]')).toHaveAttribute('data-tone', 'error');
});

test('stays board-first without horizontal page overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/pgn-replayer');
  await loadPgn(page);
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    boardWidth: document.querySelector('.pgn-board-stage').getBoundingClientRect().width,
    panelWidth: document.querySelector('.pgn-panel').getBoundingClientRect().width
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.boardWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.boardWidth).toBeGreaterThan(280);
  expect(geometry.panelWidth).toBeLessThanOrEqual(geometry.clientWidth);
  for (const control of ['first', 'previous', 'play', 'next', 'last', 'flip', 'focus']) {
    const box = await page.locator(`[data-pgn-${control}]`).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(42);
    expect(box.height).toBeGreaterThanOrEqual(42);
  }
});
