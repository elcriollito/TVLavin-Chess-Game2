import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openArena(page) {
  await page.addInitScript(() => localStorage.setItem('caissa_onboarding_completed', 'true'));
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect(page.locator('#arenaBoardMount')).toBeVisible();
  await expect.poll(async () => page.locator('#arenaBoardMount').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(100);
}

test('desktop Arena is board-first with one stable three-tab panel', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openArena(page);

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs).toHaveText(['Match', 'Tournament', 'Game']);
  await expect(page.getByRole('tab', { name: 'Game' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#arenaPanelGame')).toBeVisible();
  await expect(page.locator('#arenaEvalScore')).toBeVisible();
  await expect(page.locator('#arenaMoveHistory')).toBeVisible();
  await expect(page.locator('#arenaEvalGraph')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
    const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
    const aFile = document.querySelector('#arenaBoardMount [data-square^="a"], #arenaBoardMount .square-a1')?.getBoundingClientRect();
    const hFile = document.querySelector('#arenaBoardMount [data-square^="h"], #arenaBoardMount .square-h1')?.getBoundingClientRect();
    return {
      board: { left: board.left, right: board.right, top: board.top, bottom: board.bottom, width: board.width, height: board.height },
      panel: { left: panel.left, right: panel.right },
      filesVisible: Boolean(aFile && hFile && aFile.width > 0 && hFile.width > 0 && aFile.left >= 0 && hFile.right <= innerWidth),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(1);
  expect(geometry.board.right).toBeLessThan(geometry.panel.left);
  expect(geometry.board.left).toBeGreaterThanOrEqual(0);
  expect(geometry.board.right).toBeLessThanOrEqual(1920);
  expect(geometry.board.bottom).toBeLessThanOrEqual(1080);
  expect(geometry.filesVisible).toBe(true);
  expect(geometry.pageOverflow).toBe(false);

  const originalBoardWidth = geometry.board.width;
  await page.getByRole('tab', { name: 'Match' }).click();
  await expect(page.locator('#arenaPanelMatch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Match' })).toBeVisible();
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect(page.locator('#arenaPanelTournament')).toBeVisible();
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect(page.locator('#arenaPanelGame')).toBeVisible();
  const finalBoardWidth = await page.locator('#arenaBoardMount').evaluate(el => el.getBoundingClientRect().width);
  expect(Math.abs(finalBoardWidth - originalBoardWidth)).toBeLessThanOrEqual(1);
});

test('Engine Arena naming is consistent while the canonical route stays /arena', async ({ page }) => {
  await openArena(page);
  await expect(page.locator('.arena-page-header strong')).toHaveText('CAISSA Engine Arena');
  await expect(page.locator('.arena-page-header small')).toHaveText('Engine matches, tournaments and analysis');
  await expect(page.locator('[data-nav-key="arena"] .nav-label')).toHaveText('Engine Arena');
  expect(new URL(page.url()).pathname).toBe('/arena');
});

test('Match and Tournament expose the same runnable engines and execute the selected worker identities', async ({ page }) => {
  await openArena(page);
  await page.getByRole('tab', { name: 'Match' }).click();

  const matchAvailability = await page.locator('#arenaWhiteEngine option').evaluateAll(options => options.map(option => ({
    id: option.value,
    disabled: option.disabled,
    label: option.textContent
  })));
  await page.getByRole('tab', { name: 'Tournament' }).click();
  const tournamentAvailability = await page.locator('#arenaTournamentEngines input').evaluateAll(inputs => inputs.map(input => ({
    id: input.value,
    disabled: input.disabled,
    checked: input.checked
  })));

  expect(tournamentAvailability.filter(engine => !engine.disabled).map(engine => engine.id))
    .toEqual(matchAvailability.filter(engine => !engine.disabled).map(engine => engine.id));
  expect(tournamentAvailability.filter(engine => engine.disabled).map(engine => engine.id))
    .toEqual(matchAvailability.filter(engine => engine.disabled).map(engine => engine.id));
  expect(tournamentAvailability.filter(engine => engine.checked).every(engine => !engine.disabled)).toBe(true);
  expect(matchAvailability.find(engine => engine.id === 'arasan')).toMatchObject({ disabled: true });
  expect(matchAvailability.find(engine => engine.id === 'arasan').label).toContain('WASM build needed');
  expect(matchAvailability.find(engine => engine.id === 'fairy-stockfish')).toMatchObject({ disabled: true });
  expect(matchAvailability.find(engine => engine.id === 'fairy-stockfish').label).toContain('cross-origin-isolated');
  await expect(page.locator('#arenaTournamentEngines input[value="arasan"]')).toBeDisabled();
  await expect(page.locator('#arenaTournamentEngines input[value="arasan"] + .engine-name')).toHaveText('Arasan');
  const arasanReason = await page.evaluate(() => window.EngineRegistry.getArenaProvider('arasan').unavailableReason);
  expect(matchAvailability.find(engine => engine.id === 'arasan').label).toContain(arasanReason);
  await expect(page.locator('#arenaTournamentEngines input[value="arasan"]')
    .locator('xpath=..').locator('.engine-availability')).toHaveText(arasanReason);

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaWhiteEngine').selectOption('stockfish-lite');
  await page.locator('#arenaBlackEngine').selectOption('stockfish');
  await expect.poll(async () => page.evaluate(() => ({
    white: window.CaissaArena.whiteEngineInstance?.id,
    black: window.CaissaArena.blackEngineInstance?.id,
    ready: window.CaissaArena.enginesReady
  })), { timeout: 15_000 }).toEqual({ white: 'stockfish-lite', black: 'stockfish', ready: true });

  await page.locator('#arenaStartMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => ({
    whiteSelection: window.CaissaArena.state.currentGame.white.id,
    blackSelection: window.CaissaArena.state.currentGame.black.id,
    whiteWorker: window.CaissaArena.whiteEngineInstance.id,
    blackWorker: window.CaissaArena.blackEngineInstance.id,
    whiteRuntime: window.CaissaArena.whiteEngineInstance.getRuntimeIdentity(),
    blackRuntime: window.CaissaArena.blackEngineInstance.getRuntimeIdentity(),
    recordedRuntimes: window.CaissaArena.state.currentGame.runtimeIdentities,
    visibleWhite: document.getElementById('arenaStatusWhite').textContent,
    visibleBlack: document.getElementById('arenaStatusBlack').textContent
  }))).toEqual({
    whiteSelection: 'stockfish-lite',
    blackSelection: 'stockfish',
    whiteWorker: 'stockfish-lite',
    blackWorker: 'stockfish',
    whiteRuntime: expect.objectContaining({
      providerId: 'stockfish-lite', requestedEngineId: 'stockfish-lite',
      reportedUciName: 'Stockfish 2019-08-15 Multi-Variant', identityValidated: true, status: 'ready'
    }),
    blackRuntime: expect.objectContaining({
      providerId: 'stockfish', requestedEngineId: 'stockfish',
      reportedUciName: 'Stockfish 2019-08-15 Multi-Variant', identityValidated: true, status: 'ready'
    }),
    recordedRuntimes: expect.objectContaining({
      white: expect.objectContaining({ providerId: 'stockfish-lite', identityValidated: true }),
      black: expect.objectContaining({ providerId: 'stockfish', identityValidated: true })
    }),
    visibleWhite: 'Stockfish 2019 MV (Lite profile)',
    visibleBlack: 'Stockfish 2019 MV'
  });
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaStopMatch').click();
});

test('Arena has no serious accessibility violations, page exceptions, or console errors', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  await openArena(page);
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.enginesReady), { timeout: 15_000 }).toBe(true);
  const audit = await new AxeBuilder({ page }).include('#arenaSection').analyze();
  const serious = audit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  expect(serious).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('unavailable Arasan cannot borrow a prewarmed Stockfish runtime or label', async ({ page }) => {
  await openArena(page);
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.enginesReady), { timeout: 15_000 }).toBe(true);

  const result = await page.evaluate(() => {
    const arena = window.CaissaArena;
    const before = arena.inspectEngineDiagnostics();
    const previousSelection = arena.state.whiteEngine.id;
    const previousWorker = arena.whiteEngineInstance;
    arena.selectEngine('white', 'arasan');
    const forbiddenRuntime = window.EngineRegistry.createArenaEngine('arasan');
    const after = arena.inspectEngineDiagnostics();
    return {
      previousSelection,
      selectedAfterRequest: arena.state.whiteEngine.id,
      sameWorker: previousWorker === arena.whiteEngineInstance,
      forbiddenRuntimeCreated: forbiddenRuntime !== null,
      workerProvider: after.runtimes.white.providerId,
      workerUciName: after.runtimes.white.reportedUciName,
      visibleLabel: document.getElementById('arenaStatusWhite').textContent,
      arasanAvailable: after.availability.arasan.available,
      runtimeInstanceStable: before.runtimes.white.runtimeInstanceId === after.runtimes.white.runtimeInstanceId
    };
  });

  expect(result).toEqual({
    previousSelection: 'stockfish',
    selectedAfterRequest: 'stockfish',
    sameWorker: true,
    forbiddenRuntimeCreated: false,
    workerProvider: 'stockfish',
    workerUciName: 'Stockfish 2019-08-15 Multi-Variant',
    visibleLabel: 'Stockfish 2019 MV',
    arasanAvailable: false,
    runtimeInstanceStable: true
  });
});

test('Arena tabs support arrow navigation', async ({ page }) => {
  await openArena(page);
  const game = page.getByRole('tab', { name: 'Game' });
  await game.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Match' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Match' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(game).toBeFocused();
});

test('Bots remain non-interactive participant reservations inside Match and Tournament', async ({ page }) => {
  await openArena(page);
  await expect(page.getByRole('tab')).toHaveText(['Match', 'Tournament', 'Game']);
  await expect(page.getByRole('tab', { name: 'Bots' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Match' }).click();
  const matchReservations = page.locator('#arenaPanelMatch .arena-bot-reservation');
  await expect(matchReservations).toHaveCount(2);
  await expect(matchReservations).toContainText(['Bots', 'Bots']);
  await expect(matchReservations).toContainText(['Coming Soon', 'Coming Soon']);
  await expect(matchReservations.locator('button, input, select, a')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Tournament' }).click();
  const tournamentReservation = page.locator('#arenaPanelTournament .arena-bot-reservation');
  await expect(tournamentReservation).toHaveCount(1);
  await expect(tournamentReservation).toContainText('Coming Soon');
  await expect(tournamentReservation.locator('button, input, select, a')).toHaveCount(0);
});

test('live tournament crosstable scores and reorders real tournament state', async ({ page }) => {
  await openArena(page);
  await page.getByRole('tab', { name: 'Tournament' }).click();

  const selectedCount = await page.locator('#arenaTournamentEngines input:checked').count();
  await expect(page.locator('#arenaTournamentStandings tbody tr')).toHaveCount(selectedCount);
  await expect(page.locator('#arenaTournamentStandings tbody .standings-points')).toHaveText(Array(selectedCount).fill('0'));
  await expect(page.locator('#arenaTournamentStandings tbody .standings-games')).toHaveText(Array(selectedCount).fill('0'));

  const ids = await page.evaluate(() => {
    const participants = window.CaissaArena.engines.slice(0, 3);
    window.CaissaArena.state.mode = 'tournament';
    window.CaissaArena.state.tournament = {
      engines: participants,
      format: 'swiss',
      rounds: 3,
      openingMode: 'free',
      standings: participants.map(engine => ({ engine, points: 0, games: 0 })),
      currentRound: 0,
      games: [
        { white: participants[0], black: participants[1], round: 0, result: null },
        { white: participants[2], black: participants[0], round: 0, result: null },
        { white: participants[1], black: participants[2], round: 0, result: null }
      ]
    };
    window.CaissaArena.updateTournamentUI();
    return participants.map(participant => participant.id);
  });

  const row = id => page.locator(`#arenaTournamentStandings tr[data-participant-id="${id}"]`);
  await expect(row(ids[0]).locator('.standings-result')).toHaveText(['—', '', '']);
  await expect(page.locator('#arenaTournamentProgress')).toHaveText('Round 1 of 3 • Games 0/3');

  await page.evaluate(() => window.CaissaArena.recordTournamentResult('1-0'));
  await expect(row(ids[0]).locator('.standings-points')).toHaveText('1');
  await expect(row(ids[0]).locator('.standings-games')).toHaveText('1');
  await expect(row(ids[1]).locator('.standings-points')).toHaveText('0');
  await expect(row(ids[1]).locator('.standings-games')).toHaveText('1');

  await page.evaluate(() => window.CaissaArena.recordTournamentResult('1/2-1/2'));
  expect(await page.locator('#arenaTournamentStandings tbody tr').evaluateAll(rows => rows.map(row => row.dataset.participantId))).toEqual([ids[0], ids[2], ids[1]]);
  await expect(row(ids[0]).locator('.standings-result')).toHaveText(['—', '½', '1']);
  await expect(row(ids[2]).locator('.standings-result')).toHaveText(['½', '—', '']);
  await expect(row(ids[1]).locator('.standings-result')).toHaveText(['0', '', '—']);
  await expect(row(ids[0]).locator('.standings-points')).toHaveText('1.5');
  await expect(row(ids[2]).locator('.standings-points')).toHaveText('0.5');

  const standingsBeforeTabs = await page.locator('#arenaTournamentStandings').textContent();
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.getByRole('tab', { name: 'Tournament' }).click();
  expect(await page.locator('#arenaTournamentStandings').textContent()).toBe(standingsBeforeTabs);

  await page.evaluate(() => window.CaissaArena.recordTournamentResult('1-0'));
  expect(await page.locator('#arenaTournamentStandings tbody tr').evaluateAll(rows => rows.map(row => row.dataset.participantId))).toEqual([ids[0], ids[1], ids[2]]);
  await expect(row(ids[1]).locator('.standings-result')).toHaveText(['0', '—', '1']);
  await expect(row(ids[2]).locator('.standings-result')).toHaveText(['½', '0', '—']);
  await expect(page.locator('#arenaTournamentStandings tbody .standings-games')).toHaveText(['2', '2', '2']);
  await expect(page.locator('#arenaTournamentProgress')).toHaveText('Round 1 of 3 • Games 3/3');
});

test('active tournament continues across tabs without worker recreation', async ({ page }) => {
  await openArena(page);
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.enginesReady), { timeout: 15_000 }).toBe(true);
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect.poll(async () => page.locator('#arenaTournamentEngines input:checked').count()).toBeGreaterThanOrEqual(2);

  const boardWidth = await page.locator('#arenaBoardMount').evaluate(element => element.getBoundingClientRect().width);
  await page.locator('#arenaStartTournament').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.mode)).toBe('tournament');
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__arenaTournamentWorkers = [
      window.CaissaArena.whiteEngineInstance,
      window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine
    ];
    window.__arenaTournamentRuntimeIds = window.__arenaTournamentWorkers
      .map(worker => worker.getRuntimeIdentity().runtimeInstanceId);
  });
  const firstMoveCount = await page.evaluate(() => window.CaissaArena.game.history().length);

  await page.getByRole('tab', { name: 'Game' }).click();
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 15_000 }).toBeGreaterThan(firstMoveCount);

  const continuity = await page.evaluate(() => ({
    mode: window.CaissaArena.state.mode,
    matchState: window.CaissaArena.state.matchState,
    sameWorkers: window.__arenaTournamentWorkers.every((worker, index) => worker === [
      window.CaissaArena.whiteEngineInstance,
      window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine
    ][index]),
    sameRuntimeIds: window.__arenaTournamentRuntimeIds.every((id, index) => id === [
      window.CaissaArena.whiteEngineInstance,
      window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine
    ][index].getRuntimeIdentity().runtimeInstanceId),
    participantIdentityMatches: ['white', 'black'].every(color => {
      const participant = window.CaissaArena.state.currentGame[color];
      const runtime = window.CaissaArena.state.currentGame.runtimeIdentities[color];
      return runtime.providerId === participant.id
        && runtime.requestedEngineId === participant.id
        && runtime.identityValidated === true
        && runtime.status === 'ready';
    }),
    standingsCount: window.CaissaArena.state.tournament.standings.length
  }));
  expect(continuity.mode).toBe('tournament');
  expect(continuity.matchState).toBe('running');
  expect(continuity.sameWorkers).toBe(true);
  expect(continuity.sameRuntimeIds).toBe(true);
  expect(continuity.participantIdentityMatches).toBe(true);
  expect(continuity.standingsCount).toBeGreaterThanOrEqual(2);
  expect(Math.abs(await page.locator('#arenaBoardMount').evaluate(element => element.getBoundingClientRect().width) - boardWidth)).toBeLessThanOrEqual(1);

  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaStopMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('idle');
});

test('tournament draw adjudication confirms, records, finishes, and continues normally', async ({ page }) => {
  await openArena(page);
  await expect(page.locator('#arenaDeclareDraw')).toBeHidden();
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.locator('#arenaStartTournament').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState), { timeout: 15_000 }).toBe('running');
  await page.getByRole('tab', { name: 'Game' }).click();

  const draw = page.locator('#arenaDeclareDraw');
  await expect(draw).toBeVisible();
  await page.evaluate(() => {
    window.__drawWorkers = [
      window.CaissaArena.whiteEngineInstance,
      window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine
    ];
  });
  const beforeCancel = await page.evaluate(() => ({
    result: window.CaissaArena.state.tournament.games[0].result,
    points: window.CaissaArena.state.tournament.standings.map(standing => standing.points),
    games: window.CaissaArena.state.tournament.standings.map(standing => standing.games)
  }));
  await draw.click();
  await expect(page.locator('#arenaDrawModal')).toHaveClass(/show/);
  await expect(page.locator('#arenaDrawCancel')).toBeFocused();
  await page.locator('#arenaDrawCancel').click();
  expect(await page.evaluate(() => ({
    result: window.CaissaArena.state.tournament.games[0].result,
    points: window.CaissaArena.state.tournament.standings.map(standing => standing.points),
    games: window.CaissaArena.state.tournament.standings.map(standing => standing.games)
  }))).toEqual(beforeCancel);
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');

  await draw.click();
  await page.locator('#arenaDrawConfirm').click();
  const adjudicated = await page.evaluate(() => {
    const game = window.CaissaArena.state.tournament.games[0];
    const participants = [game.white.id, game.black.id];
    return {
      matchState: window.CaissaArena.state.matchState,
      turnLabel: document.querySelector('#arenaStatusTurn').textContent,
      turnState: document.querySelector('#arenaTurnStatus').dataset.turn,
      statusText: document.querySelector('#arenaStatusText').textContent,
      drawVisible: getComputedStyle(document.querySelector('#arenaDeclareDraw')).display !== 'none',
      searchesStopped: [
        window.CaissaArena.whiteEngineInstance,
        window.CaissaArena.blackEngineInstance,
        window.CaissaArena.evaluatorEngine
      ].every(engine => !engine.analyzing),
      drawCells: Array.from(document.querySelectorAll('#arenaTournamentStandings .standings-result.is-played'))
        .filter(cell => cell.textContent === '\u00bd').length,
      result: game.result,
      termination: game.termination,
      preservedMoves: game.moves.length,
      participantScores: window.CaissaArena.state.tournament.standings
        .filter(standing => participants.includes(standing.engine.id))
        .map(standing => ({ points: standing.points, games: standing.games })),
      currentMoves: window.CaissaArena.game.history().length
    };
  });
  expect(adjudicated.matchState).toBe('finished');
  expect(adjudicated.turnLabel).toBe('Finished');
  expect(adjudicated.turnState).toBe('neutral');
  expect(adjudicated.statusText).toBe('Finished: Draw by adjudication');
  expect(adjudicated.drawVisible).toBe(false);
  expect(adjudicated.searchesStopped).toBe(true);
  expect(adjudicated.drawCells).toBe(2);
  expect(adjudicated.result).toBe('1/2-1/2');
  expect(adjudicated.termination).toBe('Draw by adjudication');
  expect(adjudicated.preservedMoves).toBe(adjudicated.currentMoves);
  expect(adjudicated.participantScores).toEqual([{ points: 0.5, games: 1 }, { points: 0.5, games: 1 }]);

  await expect.poll(async () => page.evaluate(() => ({
    state: window.CaissaArena.state.matchState,
    pendingResults: window.CaissaArena.state.tournament.games.filter(game => game.result === null).length,
    nextPairingIncludesStockfish18: [
      window.CaissaArena.state.currentGame?.white?.id,
      window.CaissaArena.state.currentGame?.black?.id
    ].includes('stockfish-18-lite'),
    participantIdentitiesMatch: ['white', 'black'].every(color => {
      const participant = window.CaissaArena.state.currentGame?.[color];
      const runtime = window.CaissaArena.state.currentGame?.runtimeIdentities?.[color];
      return participant?.id === runtime?.providerId
        && participant?.id === runtime?.requestedEngineId
        && runtime?.identityValidated === true
        && runtime?.status === 'ready';
    })
  })), { timeout: 15_000 }).toEqual({
    state: 'running',
    pendingResults: 1,
    nextPairingIncludesStockfish18: true,
    participantIdentitiesMatch: true
  });
  await expect(draw).toBeVisible();
  await page.locator('#arenaStopMatch').click();

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaStartMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState), { timeout: 15_000 }).toBe('running');
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect(draw).toBeHidden();
  await page.locator('#arenaStopMatch').click();
});

test('long tournament fields scroll inside the crosstable on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openArena(page);
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.evaluate(() => {
    const source = window.CaissaArena.engines[0];
    const participants = Array.from({ length: 12 }, (_, index) => ({
      ...source,
      id: `layout-participant-${index + 1}`,
      name: `Participant ${String(index + 1).padStart(2, '0')}`
    }));
    window.CaissaArena.state.tournament = {
      engines: participants,
      format: 'swiss',
      rounds: 3,
      openingMode: 'free',
      standings: participants.map(engine => ({ engine, points: 0, games: 0 })),
      currentRound: 0,
      games: []
    };
    window.CaissaArena.updateTournamentUI();
  });

  const layout = await page.evaluate(() => {
    const scroller = document.querySelector('#arenaTournamentStandings');
    const panel = document.querySelector('.arena-control-panel');
    return {
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      internalOverflow: scroller.scrollWidth > scroller.clientWidth,
      scrollerInsidePanel: scroller.getBoundingClientRect().right <= panel.getBoundingClientRect().right
    };
  });
  expect(layout).toEqual({ pageOverflow: false, internalOverflow: true, scrollerInsidePanel: true });
  await expect(page.locator('#arenaTournamentStandings tbody tr')).toHaveCount(12);
});

test('turn LED follows the board state and finished games never claim a side to move', async ({ page }) => {
  await openArena(page);
  const turnStatus = page.locator('#arenaTurnStatus');
  const turnLabel = page.locator('#arenaStatusTurn');

  await page.evaluate(() => {
    window.CaissaArena.game.reset();
    window.CaissaArena.state.matchState = 'idle';
    window.CaissaArena.updateGameStatus({ moveCount: 0 });
  });
  await expect(turnStatus).toHaveAttribute('data-state', 'idle');
  await expect(turnStatus).toHaveAttribute('data-turn', 'white');
  await expect(turnLabel).toHaveText('White to move');

  await page.evaluate(() => {
    window.CaissaArena.game.move('e4');
    window.CaissaArena.state.matchState = 'running';
    window.CaissaArena.updateGameStatus({ moveCount: 1 });
  });
  await expect(turnStatus).toHaveAttribute('data-state', 'running');
  await expect(turnStatus).toHaveAttribute('data-turn', 'black');
  await expect(turnLabel).toHaveText('Black to move');

  await page.evaluate(() => {
    window.CaissaArena.state.matchState = 'finished';
    window.CaissaArena.updateGameStatus({ result: 'Draw by threefold repetition', moveCount: 106 });
  });
  await expect(turnStatus).toHaveAttribute('data-state', 'finished');
  await expect(turnStatus).toHaveAttribute('data-turn', 'neutral');
  await expect(turnLabel).toHaveText('Finished');
  await expect(turnStatus.locator('.arena-board-status')).toHaveText('Draw by threefold repetition');
  await expect(turnStatus).not.toContainText(/to move/i);
});

test('Moves renders canonical SAN for standard and special chess moves', async ({ page }) => {
  await openArena(page);

  const sanCases = await page.evaluate(() => {
    const fromPosition = (fen, move) => (fen ? new Chess(fen) : new Chess()).move(move)?.san;
    const fromSequence = (moves) => {
      const game = new Chess();
      let result = null;
      moves.forEach(move => { result = game.move(move); });
      return result?.san;
    };

    return {
      pawn: fromPosition(undefined, { from: 'e2', to: 'e4' }),
      knight: fromPosition(undefined, { from: 'g1', to: 'f3' }),
      bishop: fromSequence(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']),
      queen: fromPosition('4k3/8/8/8/8/8/8/3Q2K1 w - - 0 1', { from: 'd1', to: 'f1' }),
      pawnCapture: fromPosition('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', { from: 'e4', to: 'd5' }),
      pieceCapture: fromPosition('7k/8/2n5/1B6/8/8/8/4K3 w - - 0 1', { from: 'b5', to: 'c6' }),
      check: fromPosition('4k3/8/8/8/2B5/8/8/4K3 w - - 0 1', { from: 'c4', to: 'b5' }),
      checkmate: fromPosition('6k1/5pp1/8/8/1B6/3B3Q/8/6K1 w - - 0 1', { from: 'h3', to: 'h7' }),
      kingsideCastle: fromPosition('4k3/8/8/8/8/8/8/4K2R w K - 0 1', { from: 'e1', to: 'g1' }),
      queensideCastle: fromPosition('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', { from: 'e1', to: 'c1' }),
      promotion: fromPosition('8/k3P3/8/8/8/8/8/K7 w - - 0 1', { from: 'e7', to: 'e8', promotion: 'q' }),
      promotionCheck: fromPosition('k7/4P3/8/8/8/8/8/K7 w - - 0 1', { from: 'e7', to: 'e8', promotion: 'q' }),
      disambiguation: fromPosition('4k3/8/8/8/8/1N3N2/8/4K3 w - - 0 1', { from: 'b3', to: 'd2' }),
      enPassant: fromPosition('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', { from: 'e5', to: 'd6' })
    };
  });

  expect(sanCases).toEqual({
    pawn: 'e4',
    knight: 'Nf3',
    bishop: 'Bc5',
    queen: 'Qf1',
    pawnCapture: 'exd5',
    pieceCapture: 'Bxc6',
    check: 'Bb5+',
    checkmate: 'Qh7#',
    kingsideCastle: 'O-O',
    queensideCastle: 'O-O-O',
    promotion: 'e8=Q',
    promotionCheck: 'e8=Q+',
    disambiguation: 'Nbd2',
    enPassant: 'exd6'
  });

  await page.evaluate(() => {
    const arena = window.CaissaArena;
    arena.game = new Chess();
    arena.state.currentGame = { startFen: arena.game.fen(), moves: [] };
    ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3', 'e5', 'Nf3', 'Be7'].forEach(move => arena.game.move(move));
    arena.renderMoveHistory();
  });

  const expectedRows = [
    ['1.', 'e4', 'c5'],
    ['2.', 'Nf3', 'd6'],
    ['3.', 'd4', 'cxd4'],
    ['4.', 'Nxd4', 'Nf6'],
    ['5.', 'Nc3', 'a6'],
    ['6.', 'Be3', 'e5'],
    ['7.', 'Nf3', 'Be7']
  ];
  const readRows = () => page.locator('#arenaMoveHistory .arena-move-row').evaluateAll(rows => rows.map(row => (
    Array.from(row.children, cell => cell.textContent)
  )));
  expect(await readRows()).toEqual(expectedRows);

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.getByRole('tab', { name: 'Game' }).click();
  expect(await readRows()).toEqual(expectedRows);
  expect((await page.locator('#arenaMoveHistory').innerText()).match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/g)).toBeNull();
});

test('preserved Match controls work and tab changes keep active workers alive', async ({ page }) => {
  await openArena(page);
  await page.getByRole('tab', { name: 'Match' }).click();

  const white = page.locator('#arenaWhiteEngine');
  const black = page.locator('#arenaBlackEngine');
  await expect.poll(async () => white.locator('option').count()).toBeGreaterThanOrEqual(3);
  const beforeSwap = { white: await white.inputValue(), black: await black.inputValue() };
  await page.locator('#arenaSwapEngines').click();
  await expect(white).toHaveValue(beforeSwap.black);
  await expect(black).toHaveValue(beforeSwap.white);

  await page.locator('#arenaSetPositionBtn').click();
  await expect(page.locator('#arenaPositionPanel')).toBeVisible();
  await page.locator('#arenaFenInput').fill('8/8/8/8/8/8/4K3/7k w - - 0 1');
  await page.locator('#arenaApplyFen').click();
  await expect(page.locator('#arenaFenMessage')).toContainText('ready');

  await page.locator('#arenaManualSetupBtn').click();
  await expect(page.locator('#arenaSetupModal')).toHaveClass(/show/);
  await page.locator('#arenaSetupClose').click();
  await expect(page.locator('#arenaSetupModal')).not.toHaveClass(/show/);

  await page.locator('#arenaUseStartPosition').click();
  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.analysisRunning)).toBe(true);
  await expect(page.locator('#arenaStatusText')).toContainText('Infinite analysis running');
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect.poll(async () => page.locator('#arenaEvalPV').textContent()).not.toBe('--');
  await expect(page.locator('#arenaEvalPV')).not.toHaveText(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/i);
  const analysisContinuity = await page.evaluate(() => ({
    active: window.CaissaArena.state.analysisRunning,
    mode: window.CaissaArena.state.mode
  }));
  expect(analysisContinuity.active).toBe(true);
  expect(analysisContinuity.mode).toBe('match');

  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaInfiniteAnalysis').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.analysisRunning)).toBe(false);

  await page.evaluate(() => {
    window.__arenaWorkerRefs = [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance, window.CaissaArena.evaluatorEngine];
  });
  await page.locator('#arenaStartMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Game' }).click();
  const running = await page.evaluate(() => ({
    state: window.CaissaArena.state.matchState,
    mode: window.CaissaArena.state.mode,
    sameWorkers: window.__arenaWorkerRefs.every((worker, index) => worker === [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance, window.CaissaArena.evaluatorEngine][index])
  }));
  expect(running).toEqual({ state: 'running', mode: 'match', sameWorkers: true });
  await expect(page.locator('.arena-move-row').first()).toBeVisible();
  const liveNotation = await page.evaluate(() => ({
    storedSan: window.CaissaArena.state.currentGame.moves.map(move => move.move),
    storedUci: window.CaissaArena.state.currentGame.moves.map(move => move.uci),
    canonicalSan: window.CaissaArena.game.history({ verbose: true }).map(move => move.san)
  }));
  expect(liveNotation.storedSan).toEqual(liveNotation.canonicalSan);
  expect(liveNotation.storedUci.every(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))).toBe(true);
  await expect(page.locator('#arenaPauseMatch')).toBeVisible();
  await expect(page.locator('#arenaStopMatch')).toBeVisible();
  await expect(page.locator('#arenaStatusTurn')).toHaveText(/^(White|Black) to move$/);

  const pause = page.locator('#arenaPauseMatch');
  await pause.focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
  await expect(pause).toHaveAttribute('aria-label', 'Resume Arena match');
  await expect(page.locator('#arenaStatusTurn')).toHaveText('Paused');
  await expect(page.locator('#arenaTurnStatus')).toHaveAttribute('data-turn', 'neutral');
  const pausedMoveCount = await page.evaluate(() => window.CaissaArena.game.history().length);

  const headerPosition = await page.locator('.arena-moves-header').evaluate(el => el.getBoundingClientRect().top);
  await page.evaluate(() => {
    const history = document.querySelector('#arenaMoveHistory');
    for (let index = 0; index < 60; index += 1) {
      const row = document.createElement('div');
      row.className = 'arena-move-row';
      row.innerHTML = `<span class="move-num">${index + 20}.</span><span class="move-white">e4</span><span class="move-black">e5</span>`;
      history.appendChild(row);
    }
    history.scrollTop = history.scrollHeight;
  });
  await expect.poll(async () => page.locator('#arenaMoveHistory').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const scrolledHeaderPosition = await page.locator('.arena-moves-header').evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(scrolledHeaderPosition - headerPosition)).toBeLessThanOrEqual(1);

  await pause.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');
  await expect(pause).toHaveAttribute('aria-label', 'Pause Arena match');
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.game.history().length), { timeout: 15_000 }).toBeGreaterThan(pausedMoveCount);
  const resumedStatus = await page.evaluate(() => ({
    label: document.querySelector('#arenaStatusTurn').textContent,
    expected: `${window.CaissaArena.game.turn() === 'w' ? 'White' : 'Black'} to move`,
    sameWorkers: window.__arenaWorkerRefs.every((worker, index) => worker === [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance, window.CaissaArena.evaluatorEngine][index])
  }));
  expect(resumedStatus).toEqual({ label: resumedStatus.expected, expected: resumedStatus.expected, sameWorkers: true });
  await page.locator('#arenaStopMatch').click();
  await expect.poll(async () => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('idle');
  await expect(page.locator('#arenaStatusTurn')).toHaveText('Stopped');
  await expect(page.locator('#arenaTurnStatus')).toHaveAttribute('data-turn', 'neutral');

  await page.getByRole('tab', { name: 'Tournament' }).click();
  await expect.poll(async () => page.locator('#arenaTournamentEngines input:checked').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#arenaStartTournament')).toBeVisible();
});

test('desktop browser-zoom viewport equivalents remain unclipped from 80% through 125%', async ({ page }) => {
  for (const zoom of [0.8, 0.9, 1, 1.1, 1.25]) {
    await page.setViewportSize({
      width: Math.floor(1440 / zoom),
      height: Math.floor(900 / zoom)
    });
    await openArena(page);
    const geometry = await page.evaluate(() => {
      const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
      const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
      return {
        square: Math.abs(board.width - board.height) <= 2,
        boardVisible: board.left >= 0 && board.right <= innerWidth && board.bottom <= innerHeight,
        separated: board.right < panel.left,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(geometry, `zoom ${zoom * 100}%`).toEqual({
      square: true,
      boardVisible: true,
      separated: true,
      horizontalOverflow: false
    });
  }
});

for (const viewport of [
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} keeps the board unclipped above the unified panel`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openArena(page);
    const result = await page.evaluate(() => {
      const board = document.querySelector('#arenaBoardMount').getBoundingClientRect();
      const bottomPlayer = document.querySelector('.arena-player-bar-bottom').getBoundingClientRect();
      const panel = document.querySelector('.arena-control-panel').getBoundingClientRect();
      return {
        square: Math.abs(board.width - board.height) <= 2,
        boardWithinViewport: board.left >= 0 && board.right <= innerWidth,
        panelBelowBoard: panel.top >= bottomPlayer.bottom - 1,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    expect(result).toEqual({
      square: true,
      boardWithinViewport: true,
      panelBelowBoard: true,
      horizontalOverflow: false
    });
  });
}
