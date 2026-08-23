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

test('opens an honest Options and About guide from the desktop source bar', async ({ page }) => {
  await page.goto('/pgn-replayer');
  await page.locator('[data-pgn-options]').click();
  const guide = page.locator('[data-pgn-options-dialog]');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Player figurines');
  await expect(guide).toContainText('Find a player quickly');
  await expect(guide).toContainText('Credits and album access');
  await expect(guide).toContainText('does not deduct credits or sell collections yet');
  await guide.getByRole('button', { name: 'Done' }).click();
  await expect(guide).toBeHidden();
  await expect(page.locator('[data-pgn-options]')).toBeFocused();
});

test('opens the existing Capablanca collection as a free album', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/pgn-replayer');
  await page.getByRole('tab', { name: 'Albums' }).click();
  const album = page.locator('[data-album-id="capablanca-games-1901-1941"]');
  await expect(album).toContainText('José Raúl Capablanca');
  await expect(album).toContainText('Player game collection · PGN');
  await expect(album).toHaveAttribute('data-player-distinction', 'open-world-champion');
  await expect(album.locator('.fa-chess-king')).toHaveCount(1);
  await expect(album.locator('[data-access="free"]')).toHaveText('Free');
  await album.click();
  await expect(page.locator('[data-pgn-message]')).toContainText('597 games loaded locally', { timeout: 30_000 });
  await expect(page.locator('[data-pgn-games] [data-game-index]')).toHaveCount(597);
  await expect(album).toHaveAttribute('aria-current', 'true');
});

test('classifies all 82 Players with historical chess-piece icons', async ({ page }) => {
  await page.goto('/pgn-replayer');
  await page.getByRole('tab', { name: 'Albums' }).click();
  await expect(page.locator('[data-library-family="players"]')).toHaveCount(82);
  await expect(page.locator('[data-player-distinction="open-world-champion"]')).toHaveCount(22);
  await expect(page.locator('[data-player-distinction="womens-world-champion"]')).toHaveCount(8);
  await expect(page.locator('[data-player-distinction="world-championship-challenger"]')).toHaveCount(16);
  await expect(page.locator('[data-player-distinction="player"]')).toHaveCount(36);

  await expect(page.getByRole('button', { name: /Ding Liren/ }).locator('.fa-chess-king')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Nona Gaprindashvili/ }).locator('.fa-chess-queen')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /David Bronstein/ }).locator('.fa-chess-rook')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Efim Geller/ }).locator('.fa-chess-knight')).toHaveCount(1);
});

test('navigates the historical families and loads the 1972 championship through CAISSA', async ({ page }) => {
  const fischerSpassky = `[Event "World Championship 1972"]
[Site "Reykjavik"]
[Date "1972.07.11"]
[White "Fischer, Robert James"]
[Black "Spassky, Boris V"]
[Result "0-1"]

1. d4 Nf6 2. c4 e6 3. Nf3 d5 0-1`;
  await page.route('**/api/pgn/pgnmentor?kind=event&file=WorldChamp1972.pgn', route => route.fulfill({
    contentType: 'application/x-chess-pgn',
    body: fischerSpassky
  }));
  await page.goto('/pgn-replayer');
  await page.getByRole('tab', { name: 'Albums' }).click();

  const championships = page.locator('[data-pgn-library-family="world-championships"]');
  await championships.click();
  await expect(championships).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-pgn-library-summary]')).toContainText('Source catalog checked Aug 22, 2026');
  await expect(page.locator('[data-mentor-historical-album-id]')).toHaveCount(59);

  await page.locator('[data-pgn-library-search]').fill('Fischer');
  const match = page.locator('[data-mentor-historical-album-id="world-championship-worldchamp1972"]');
  await expect(match).toBeVisible();
  await expect(page.locator('[data-library-family="world-championships"]:visible')).toHaveCount(1);
  await match.click();
  await expect(page.locator('[data-pgn-message]')).toContainText('1 game loaded locally');
  await expect(page.locator('[data-pgn-title]')).toHaveText('Fischer, Robert James — Spassky, Boris V');

  await page.getByRole('tab', { name: 'Albums' }).click();
  await page.locator('[data-pgn-library-family="qualifiers"]').click();
  await expect(page.locator('[data-mentor-historical-album-id]:visible')).toHaveCount(58);
  await page.locator('[data-pgn-library-family="openings"]').click();
  await expect(page.locator('[data-pgn-library-notice]')).toContainText('Opening Library is the next indexed phase');
  await expect(page.locator('[data-pgn-albums]')).toBeHidden();
});

test('engine defaults off and renders exactly two local analysis lines', async ({ page }) => {
  await page.route('**/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js', route => route.fulfill({
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
  await page.getByRole('tab', { name: 'Notation' }).click();
  const toggle = page.locator('[data-pgn-engine]');
  await expect(toggle).toContainText('Off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const visiblePanel = page.locator('[data-pgn-engine-panel]:visible');
  await expect(visiblePanel).toHaveCount(1);
  const reservedHeight = await visiblePanel.evaluate(node => node.getBoundingClientRect().height);
  await toggle.click();
  await expect(toggle).toContainText('On');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(visiblePanel).toHaveCount(1);
  await expect(visiblePanel.locator('.pgn-engine-line')).toHaveCount(2);
  await expect(visiblePanel.locator('.pgn-engine-line').first()).toContainText('+0.35');
  await expect(visiblePanel.locator('.pgn-engine-line').first()).toContainText('e4 e5 Nf3');
  await expect(visiblePanel).toHaveCSS('height', `${reservedHeight}px`);
  await toggle.click();
  await expect(toggle).toContainText('Off');
  await expect(visiblePanel).toHaveAttribute('data-state', 'off');
  await expect(visiblePanel.locator('.pgn-engine-line').first()).toContainText('Turn Engine on to analyze');
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

  const firstRow = await page.locator('.pgn-toolbar-imports-mobile button, .pgn-toolbar-playback button').evaluateAll(nodes => nodes.map(node => ({
    name: node.hasAttribute('data-pgn-open') ? 'open' : node.hasAttribute('data-pgn-paste') ? 'paste' : [...node.attributes].find(attribute => attribute.name.startsWith('data-pgn-'))?.name.replace('data-pgn-', ''),
    top: Math.round(node.getBoundingClientRect().top)
  })));
  expect(firstRow.map(control => control.name)).toEqual(['open', 'paste', 'first', 'previous', 'play', 'next', 'last']);
  expect(new Set(firstRow.map(control => control.top)).size).toBe(1);

  const secondRow = await page.locator('[data-pgn-engine], [data-pgn-speed], [data-pgn-flip], [data-pgn-focus]').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(Math.max(...secondRow) - Math.min(...secondRow)).toBeLessThanOrEqual(2);
  expect(secondRow[0]).toBeGreaterThan(firstRow[0].top);

  const mobileStack = await page.locator('.pgn-toolbar, .pgn-engine-panel--mobile, .pgn-panel').evaluateAll(nodes => nodes.map(node => ({
    className: node.className,
    top: Math.round(node.getBoundingClientRect().top),
    visible: node.getBoundingClientRect().height > 0
  })).filter(item => item.visible));
  expect(mobileStack).toHaveLength(3);
  expect(mobileStack[0].className).toContain('pgn-toolbar');
  expect(mobileStack[1].className).toContain('pgn-engine-panel--mobile');
  expect(mobileStack[2].className).toContain('pgn-panel');
  expect(mobileStack[0].top).toBeLessThan(mobileStack[1].top);
  expect(mobileStack[1].top).toBeLessThan(mobileStack[2].top);

  await page.getByRole('tab', { name: 'Notation' }).click();
  await page.locator('[data-pgn-speed]').selectOption('400');
  await page.locator('[data-pgn-play]').click();
  const autoplayScrollY = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(1200);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - autoplayScrollY)).toBeLessThanOrEqual(1);
});
