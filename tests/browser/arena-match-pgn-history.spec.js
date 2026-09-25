import { test, expect } from '@playwright/test';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function openArena(page, viewport = { width: 1440, height: 960 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.CaissaArena?.matchSeries && window.CaissaArenaMatchPgn))).toBe(true);
}

async function seedSeries(page, options = {}) {
  return page.evaluate(({ gameCount = 1, games = [], opening = null, timeControl = null, savePgn = true, stopAt = null }) => {
    const arena = window.CaissaArena;
    const standard = window.CaissaArenaOpeningSnapshots.createStandardSnapshot();
    const config = {
      title: 'ML001E Browser Certification',
      participantA: arena.state.whiteEngine,
      participantB: arena.state.blackEngine,
      gameCount,
      startingFen: opening?.resultingFen || standard.resultingFen,
      opening: opening || standard,
      timeControl: timeControl || { mode: 'blitz', preset: '3+2' },
      savePgn
    };
    arena.matchSeries.start(config);
    for (let index = 0; index < games.length; index += 1) {
      const record = games[index];
      const active = arena.matchSeries.currentGame;
      arena.matchSeries.markRunning(active.generation);
      for (const move of record.moves || []) arena.matchSeries.recordMove(active.generation, move);
      if (stopAt === index) {
        arena.matchSeries.stop();
        break;
      }
      arena.matchSeries.complete(active.generation, {
        result: record.result || '1/2-1/2',
        termination: record.termination || 'move-limit'
      });
      if (arena.matchSeries.state === 'BETWEEN_GAMES') arena.matchSeries.advance();
    }
    arena.renderSeriesSummary(arena.matchSeries.snapshot());
    arena.renderSeriesHistory();
    return arena.matchSeries.snapshot();
  }, options);
}

async function captureCurrentPgn(page, series = false) {
  return page.evaluate(useSeries => {
    const arena = window.CaissaArena;
    let captured = null;
    arena.downloadPgn = (text, filename) => { captured = { text, filename }; return true; };
    if (useSeries) arena.saveCurrentSeriesPgn();
    else arena.saveCurrentGamePgn();
    return captured;
  }, series);
}

test('A: standard completed game exports truthful PGN', async ({ page }) => {
  await openArena(page);
  await seedSeries(page, { games: [{ moves: [{ move: 'e4' }, { move: 'e5' }], result: '1/2-1/2', termination: 'move-limit' }] });
  const exported = await captureCurrentPgn(page);
  expect(exported.filename).toBe('ml001e-browser-certification-game-1.pgn');
  expect(exported.text).toContain('[TimeControl "180+2"]');
  expect(exported.text).toContain('1. e4 e5 1/2-1/2');
});

test('B: B90 export retains metadata and starts movetext at the snapshot', async ({ page }) => {
  await openArena(page);
  const opening = await page.evaluate(() => window.CaissaArenaOpeningSnapshots.createEcoSnapshot({
    code: 'B90', name: 'Sicilian Defense: Najdorf', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'
  }));
  await seedSeries(page, { opening, games: [{ moves: [{ move: 'Be3' }], result: '*' , termination: 'stopped' }] });
  const exported = await captureCurrentPgn(page);
  expect(exported.text).toContain('[ECO "B90"]');
  expect(exported.text).toContain('[Opening "Sicilian Defense: Najdorf"]');
  expect(exported.text.split('\n\n')[1]).not.toContain('e4 c5');
});

test('C: custom black-to-move FEN begins with ellipsis numbering', async ({ page }) => {
  await openArena(page);
  const output = await page.evaluate(() => window.CaissaArenaMatchPgn.serializeGamePgn({
    round: 1, white: { name: 'A' }, black: { name: 'B' },
    startingFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 9',
    opening: { type: 'fen' }, timeControl: { mode: 'fixed-depth', preset: '16' },
    moves: [{ move: 'Nc6' }], result: '*', termination: 'stopped'
  }));
  expect(output).toContain('9... Nc6 *');
  expect(output).toContain('[CaissaDepth "16"]');
});

test('D: two-game series exports one parseable multi-game file', async ({ page }) => {
  await openArena(page);
  await seedSeries(page, { gameCount: 2, games: [
    { moves: [{ move: 'e4' }], result: '1-0', termination: 'checkmate' },
    { moves: [{ move: 'd4' }], result: '0-1', termination: 'time-forfeit' }
  ] });
  const exported = await captureCurrentPgn(page, true);
  expect((exported.text.match(/\[Event /g) || [])).toHaveLength(2);
  expect(exported.text).toContain('[CaissaGame "2"]');
});

test('E: three-position balanced set retains six distinct opening associations', async ({ page }) => {
  await openArena(page);
  const output = await page.evaluate(() => {
    const api = window.CaissaArenaMatchPgn;
    const games = Array.from({ length: 6 }, (_, index) => ({
      round: index + 1, white: { name: index % 2 ? 'B' : 'A' }, black: { name: index % 2 ? 'A' : 'B' },
      startingFen: window.CaissaArenaOpeningSnapshots.STANDARD_START_FEN,
      opening: { type: 'eco', eco: ['B20', 'C60', 'D30'][Math.floor(index / 2)], openingName: `Opening ${Math.floor(index / 2) + 1}`, setId: 'set-cert', order: Math.floor(index / 2) + 1 },
      timeControl: { mode: 'rapid', preset: '10+5' }, moves: [], result: '1/2-1/2', termination: 'move-limit'
    }));
    return api.serializeSeriesPgn({ seriesId: 'series-set', config: { title: 'Set', gameCount: 6, opening: { type: 'set', title: 'Three Position Set' }, timeControl: { mode: 'rapid', preset: '10+5' } }, games });
  });
  expect((output.match(/\[CaissaOpeningIndex /g) || [])).toHaveLength(6);
  expect(new Set([...output.matchAll(/\[CaissaOpeningIndex "(\d)"\]/g)].map(match => match[1]))).toEqual(new Set(['1', '2', '3']));
});

test('F: time forfeit exports the winner and no late move', async ({ page }) => {
  await openArena(page);
  await seedSeries(page, { games: [{ moves: [{ move: 'e4' }], result: '0-1', termination: 'time-forfeit' }] });
  const exported = await captureCurrentPgn(page);
  expect(exported.text).toContain('[CaissaTermination "time-forfeit"]');
  expect(exported.text.trim()).toMatch(/1\. e4 0-1$/);
});

test('G: stopped game remains immediately exportable when Save PGN is off', async ({ page }) => {
  await openArena(page);
  await seedSeries(page, { savePgn: false, games: [{ moves: [{ move: 'e4' }], result: '*', termination: 'stopped' }] });
  const exported = await captureCurrentPgn(page);
  expect(exported.text).toContain('[Result "*"]');
  expect(exported.text).toContain('[CaissaTermination "stopped"]');
  await page.evaluate(() => window.CaissaArena.prepareNewMatch());
  expect(await page.evaluate(() => window.CaissaArena.state.matchHistory.length)).toBe(0);
});

test('H: reviewing an old game cannot mutate live game, score, or scheduler state', async ({ page }) => {
  await openArena(page);
  await seedSeries(page, { gameCount: 2, games: [
    { moves: [{ move: 'e4' }, { move: 'e5' }], result: '1-0', termination: 'checkmate' },
    { moves: [{ move: 'd4' }, { move: 'd5' }], result: '1/2-1/2', termination: 'move-limit' }
  ] });
  const result = await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.game.reset();
    arena.game.move('c4');
    arena.state.currentGame = { id: 'live', startFen: window.CaissaArenaOpeningSnapshots.STANDARD_START_FEN };
    const before = { fen: arena.game.fen(), score: JSON.stringify(arena.matchSeries.score), state: arena.matchSeries.state };
    const first = arena.getHistoryEntries()[0].game.gameId;
    arena.selectHistoryGame(first);
    const display = arena.state.review.displayFen;
    arena.game.move('e5');
    return { before, after: { fen: arena.game.fen(), score: JSON.stringify(arena.matchSeries.score), state: arena.matchSeries.state }, display, displayAfter: arena.state.review.displayFen };
  });
  expect(result.after.fen).not.toBe(result.before.fen);
  expect(result.after.score).toBe(result.before.score);
  expect(result.after.state).toBe(result.before.state);
  expect(result.displayAfter).toBe(result.display);
});

test('I: opaque same-origin handoff opens the existing PGN Reader with all games', async ({ page }) => {
  await openArena(page);
  await seedSeries(page, { gameCount: 2, games: [
    { moves: [{ move: 'e4' }], result: '1-0', termination: 'checkmate' },
    { moves: [{ move: 'd4' }], result: '0-1', termination: 'time-forfeit' }
  ] });
  await page.evaluate(() => window.CaissaArena.openCurrentSeriesInPgnReader());
  await page.waitForURL(/\/pgn-replayer/);
  await expect(page.locator('[data-pgn-game-count]')).toHaveText('(2)', { timeout: 15_000 });
  await expect(page.locator('[data-pgn-title]')).toContainText('Stockfish');
  expect(page.url()).not.toContain('Event');
  expect(page.url()).not.toContain('handoff=');
});

test('J: mobile remains board-first and history actions do not overflow', async ({ page }) => {
  await openArena(page, { width: 390, height: 844 });
  await seedSeries(page, { games: [{ moves: [{ move: 'e4' }], result: '*', termination: 'stopped' }] });
  await page.evaluate(() => window.CaissaArena.openSeriesReview());
  const layout = await page.evaluate(() => {
    const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
    const controls = document.querySelector('#arenaSeriesHistory').getBoundingClientRect();
    return { boardTop: board.top, controlsTop: controls.top, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  expect(layout.boardTop).toBeLessThan(layout.controlsTop);
  expect(layout.overflow).toBe(false);
  await expect(page.locator('#arenaSeriesHistory')).toBeVisible();
});
