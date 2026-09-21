import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SF19_ID = 'stockfish-19-lite';
const SF19_NAME = 'Stockfish 19 Lite';
const SF19_UCI_NAME = 'Stockfish 19 Lite WASM';
const SF19_AUTHOR = 'the Stockfish developers (see AUTHORS file)';
const SF19_WORKER = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js';
const SF18_ID = 'stockfish-18-lite';

async function openArena(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript((workerPath) => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    let sequence = 0;
    const active = new Set();
    const audit = { created: [], terminated: [], protocol: [], maxActive: 0 };
    window.Worker = class TrackedWorker extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__auditId = ++sequence;
        this.__auditUrl = String(url);
        active.add(this.__auditId);
        audit.maxActive = Math.max(audit.maxActive, active.size);
        audit.created.push({ id: this.__auditId, url: this.__auditUrl, at: performance.now() });
        this.addEventListener('message', event => {
          const line = String(event.data);
          if (this.__auditUrl === workerPath && (line === 'uciok' || line === 'readyok')) {
            audit.protocol.push({ id: this.__auditId, line, at: performance.now() });
          }
        });
      }
      terminate() {
        active.delete(this.__auditId);
        audit.terminated.push({ id: this.__auditId, url: this.__auditUrl, at: performance.now() });
        return super.terminate();
      }
    };
    audit.activeCount = () => active.size;
    window.__arenaWorkerAudit = audit;
  }, SF19_WORKER);
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.enginesReady), {
    timeout: 15_000
  }).toBe(true);
  await expect.poll(() => page.locator('#arenaBoardMount').evaluate(element => {
    const box = element.getBoundingClientRect();
    return Math.min(box.width, box.height);
  })).toBeGreaterThan(80);
}

async function selectPairing(page, whiteId, blackId) {
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaWhiteEngine').selectOption(whiteId);
  await page.locator('#arenaBlackEngine').selectOption(blackId);
  await expect.poll(() => page.evaluate(() => {
    const arena = window.CaissaArena;
    return arena.enginesReady && arena.playerInstancesMatchSelections()
      ? [arena.whiteEngineInstance.id, arena.blackEngineInstance.id]
      : [];
  }), { timeout: 15_000 }).toEqual([whiteId, blackId]);
}

function expectSf19Runtime(runtime) {
  expect(runtime).toMatchObject({
    providerId: SF19_ID,
    requestedEngineId: SF19_ID,
    reportedUciName: SF19_UCI_NAME,
    reportedAuthor: SF19_AUTHOR,
    workerAsset: SF19_WORKER,
    identityValidated: true,
    status: 'ready'
  });
}

function boardGeometry(page) {
  return page.locator('#arenaBoardMount').evaluate(element => {
    const section = document.querySelector('#arenaSection');
    const box = element.getBoundingClientRect();
    return {
      x: box.x + section.scrollLeft,
      y: box.y + section.scrollTop,
      width: box.width,
      height: box.height
    };
  });
}

function expectStable(samples, label) {
  for (const field of ['x', 'y', 'width', 'height']) {
    const values = samples.map(sample => sample[field]);
    expect(Math.max(...values) - Math.min(...values), `${label} ${field} drift`)
      .toBeLessThanOrEqual(0.5);
  }
}

test('Stockfish 19 registry metadata is shared, unique, and lazy', async ({ page }) => {
  await openArena(page);
  const result = await page.evaluate(({ id, path }) => {
    const providers = window.EngineRegistry.listArenaProviders();
    const provider = window.EngineRegistry.getArenaProvider(id);
    const match = Array.from(document.querySelectorAll('#arenaWhiteEngine option'));
    const tournament = Array.from(document.querySelectorAll('#arenaTournamentEngines input'));
    return {
      registryCount: providers.filter(candidate => candidate.id === id).length,
      matchCount: match.filter(option => option.value === id).length,
      tournamentCount: tournament.filter(input => input.value === id).length,
      disabled: match.find(option => option.value === id)?.disabled,
      checked: tournament.find(input => input.value === id)?.checked,
      workerCount: window.__arenaWorkerAudit.created.filter(item => item.url === path).length,
      provider: {
        displayName: provider.displayName,
        version: provider.version,
        runtimeId: provider.runtimeId,
        profile: provider.profile,
        defaultOptions: provider.defaultOptions,
        capabilities: provider.capabilities
      }
    };
  }, { id: SF19_ID, path: SF19_WORKER });

  expect(result).toEqual({
    registryCount: 1,
    matchCount: 1,
    tournamentCount: 1,
    disabled: false,
    checked: true,
    workerCount: 0,
    provider: {
      displayName: SF19_NAME,
      version: '19.0.0',
      runtimeId: 'stockfish-19-lite-single-runtime',
      profile: { id: 'lite-single', displayName: 'Lite single-thread', defaultDepth: 20 },
      defaultOptions: { MultiPV: 1, Hash: 16, Threads: 1 },
      capabilities: {
        supportsThreads: false,
        supportsNNUE: true,
        supportsMultiPV: true,
        supportsSyzygy: false,
        browserCompatible: true,
        mobileCompatible: true,
        requiresCrossOriginIsolation: false
      }
    }
  });
});

for (const pairing of [
  { name: 'Stockfish 19 vs Stockfish 18', white: SF19_ID, black: SF18_ID },
  { name: 'Stockfish 18 vs Stockfish 19', white: SF18_ID, black: SF19_ID },
  { name: 'Stockfish 19 vs Stockfish 2019 MV', white: SF19_ID, black: 'stockfish' },
  { name: 'Stockfish 2019 MV vs Stockfish 19', white: 'stockfish', black: SF19_ID },
  { name: 'Stockfish 19 vs Stockfish 19', white: SF19_ID, black: SF19_ID }
]) {
  test(`${pairing.name} uses truthful workers and makes legal SAN-visible play`, async ({ page }) => {
    await openArena(page);
    await selectPairing(page, pairing.white, pairing.black);
    const samples = [await boardGeometry(page)];
    await page.locator('#arenaStartMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
      timeout: 20_000
    }).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Game' }).click();
    await expect.poll(() => page.locator('#arenaEvalDepth').textContent(), {
      timeout: 15_000
    }).not.toBe('0');
    await expect.poll(() => page.locator('#arenaEvalPV').textContent(), {
      timeout: 15_000
    }).not.toBe('--');
    samples.push(await boardGeometry(page));

    const state = await page.evaluate(path => {
      const arena = window.CaissaArena;
      const sfWorkers = window.__arenaWorkerAudit.created.filter(item => item.url === path);
      const firstWorker = sfWorkers[0];
      const protocol = window.__arenaWorkerAudit.protocol.filter(item => item.id === firstWorker?.id);
      const at = line => protocol.find(item => item.line === line)?.at;
      return {
        moves: arena.game.history(),
        moveText: document.querySelector('#arenaMoveHistory').textContent,
        pv: document.querySelector('#arenaEvalPV').textContent,
        evaluation: document.querySelector('#arenaEvalScore').textContent,
        graphWidth: document.querySelector('#arenaEvalGraph').getBoundingClientRect().width,
        white: arena.whiteEngineInstance.getRuntimeIdentity(),
        black: arena.blackEngineInstance.getRuntimeIdentity(),
        recorded: arena.state.currentGame.runtimeIdentities,
        visibleWhite: document.querySelector('#arenaStatusWhite').textContent,
        visibleBlack: document.querySelector('#arenaStatusBlack').textContent,
        sfWorkerCount: sfWorkers.length,
        uciMs: firstWorker ? at('uciok') - firstWorker.at : null,
        readyMs: firstWorker ? at('readyok') - firstWorker.at : null,
        maxActive: window.__arenaWorkerAudit.maxActive
      };
    }, SF19_WORKER);

    expect(state.moves.length).toBeGreaterThan(0);
    expect(state.moveText.trim().length).toBeGreaterThan(0);
    expect(state.moveText).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/);
    expect(state.pv).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/);
    expect(state.evaluation).toMatch(/^(?:[+-]\d+\.\d{2}|M-?\d+)$/);
    expect(state.graphWidth).toBeGreaterThan(80);
    expect(state.visibleWhite).toBe(pairing.white === SF19_ID ? SF19_NAME
      : pairing.white === SF18_ID ? 'Stockfish 18 Lite' : 'Stockfish 2019 MV');
    expect(state.visibleBlack).toBe(pairing.black === SF19_ID ? SF19_NAME
      : pairing.black === SF18_ID ? 'Stockfish 18 Lite' : 'Stockfish 2019 MV');
    if (pairing.white === SF19_ID) expectSf19Runtime(state.white);
    if (pairing.black === SF19_ID) expectSf19Runtime(state.black);
    expect(state.recorded.white.runtimeInstanceId).toBe(state.white.runtimeInstanceId);
    expect(state.recorded.black.runtimeInstanceId).toBe(state.black.runtimeInstanceId);
    expect(state.uciMs).toBeGreaterThanOrEqual(0);
    expect(state.readyMs).toBeGreaterThanOrEqual(state.uciMs);
    // The page also owns one pre-existing legacy App worker outside Arena.
    // Arena itself remains bounded to white, black, and evaluator workers.
    expect(state.maxActive).toBeLessThanOrEqual(4);
    if (pairing.white === pairing.black) {
      expect(state.sfWorkerCount).toBe(2);
      expect(state.white.runtimeInstanceId).not.toBe(state.black.runtimeInstanceId);
    }
    expectStable(samples, pairing.name);

    await page.locator('#arenaPauseMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
    await page.locator('#arenaPauseMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');
    await page.locator('#arenaStopMatch').click();
    expect(await page.evaluate(path => ({
      instances: [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance,
        window.CaissaArena.evaluatorEngine],
      active: window.__arenaWorkerAudit.activeCount(),
      terminatedSf19: window.__arenaWorkerAudit.terminated.filter(item => item.url === path).length
    }), SF19_WORKER)).toEqual({
      instances: [null, null, null],
      active: 1,
      terminatedSf19: pairing.white === pairing.black ? 2 : 1
    });
  });
}

test('three-runtime Tournament completes three truthful rounds without worker growth', async ({ page }) => {
  await openArena(page, { width: 1920, height: 1080 });
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.locator('#arenaTournamentEngines input[value="stockfish-lite"]').uncheck();
  await expect(page.locator('#arenaTournamentEngines input:checked')).toHaveCount(3);
  expect(await page.locator('#arenaTournamentEngines input:checked').evaluateAll(inputs =>
    inputs.map(input => input.value))).toEqual(['stockfish', SF18_ID, SF19_ID]);
  const samples = [await boardGeometry(page)];

  await page.locator('#arenaStartTournament').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaDeclareDraw').click();
  await page.locator('#arenaDrawConfirm').click();

  await expect.poll(() => page.evaluate(id => {
    const game = window.CaissaArena.state.currentGame;
    return window.CaissaArena.state.matchState === 'running'
      && [game?.white?.id, game?.black?.id].includes(id);
  }, SF19_ID), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  samples.push(await boardGeometry(page));
  await page.locator('#arenaDeclareDraw').click();
  await expect(page.locator('#arenaDrawModal')).toBeVisible();
  await page.locator('#arenaDrawCancel').click();
  await expect(page.locator('#arenaDrawModal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');
  await page.locator('#arenaDeclareDraw').click();
  await page.locator('#arenaDrawConfirm').click();

  const recorded = await page.evaluate(id => {
    const arena = window.CaissaArena;
    const game = arena.state.tournament.games.find(candidate => candidate.result !== null
      && [candidate.white.id, candidate.black.id].includes(id));
    const standing = arena.state.tournament.standings.find(item => item.engine.id === id);
    const runtime = game.runtimeIdentities.white.providerId === id
      ? game.runtimeIdentities.white : game.runtimeIdentities.black;
    return {
      result: game.result,
      termination: game.termination,
      moves: game.moves.length,
      runtime,
      points: standing.points,
      games: standing.games,
      halfCells: Array.from(document.querySelectorAll('#arenaTournamentStandings .is-played'))
        .filter(cell => cell.textContent === '\u00bd').length,
      searchesStopped: [arena.whiteEngineInstance, arena.blackEngineInstance,
        arena.evaluatorEngine].every(engine => !engine?.analyzing)
    };
  }, SF19_ID);
  expect(recorded).toMatchObject({
    result: '1/2-1/2',
    termination: 'Draw by adjudication',
    points: 0.5,
    games: 1,
    searchesStopped: true
  });
  expect(recorded.moves).toBeGreaterThan(0);
  expect(recorded.halfCells).toBeGreaterThanOrEqual(4);
  expectSf19Runtime(recorded.runtime);

  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState), {
    timeout: 20_000
  }).toBe('running');
  const continuation = await page.evaluate(() => {
    const arena = window.CaissaArena;
    return {
      participants: arena.state.tournament.engines.map(engine => engine.id),
      active: [arena.state.currentGame.white.id, arena.state.currentGame.black.id],
      runtimeProviders: [arena.whiteEngineInstance, arena.blackEngineInstance]
        .map(engine => engine.getRuntimeIdentity().providerId),
      maxActive: window.__arenaWorkerAudit.maxActive
    };
  });
  expect(continuation.participants).toEqual(['stockfish', SF18_ID, SF19_ID]);
  expect(continuation.runtimeProviders).toEqual(continuation.active);
  expect(continuation.maxActive).toBeLessThanOrEqual(4);
  samples.push(await boardGeometry(page));
  expectStable(samples, 'Stockfish 19 Tournament');

  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaDeclareDraw').click();
  await page.locator('#arenaDrawConfirm').click();
  await expect.poll(() => page.evaluate(() => {
    const tournament = window.CaissaArena.state.tournament;
    return tournament.currentRound === tournament.rounds
      && tournament.games.every(game => game.result !== null);
  }), { timeout: 20_000 }).toBe(true);

  const completed = await page.evaluate(() => {
    const arena = window.CaissaArena;
    const snapshot = arena.runtimeManager.getResourceSnapshot();
    return {
      games: arena.state.tournament.games.map(game => ({
        white: game.white.id,
        black: game.black.id,
        result: game.result,
        runtimeWhite: game.runtimeIdentities?.white?.providerId,
        runtimeBlack: game.runtimeIdentities?.black?.providerId
      })),
      standings: arena.state.tournament.standings.map(standing => ({
        id: standing.engine.id,
        points: standing.points,
        games: standing.games
      })),
      activeWorkers: snapshot.activeWorkers,
      activeRecords: snapshot.activeRuntimeRecords,
      managerPeak: snapshot.diagnostics.peakActiveWorkers,
      auditPeak: window.__arenaWorkerAudit.maxActive
    };
  });
  expect(completed.games).toHaveLength(3);
  expect(completed.games.every(game => game.result === '1/2-1/2')).toBe(true);
  expect(completed.games.every(game => game.white === game.runtimeWhite
    && game.black === game.runtimeBlack)).toBe(true);
  expect(completed.standings).toEqual(expect.arrayContaining([
    { id: 'stockfish', points: 1, games: 2 },
    { id: SF18_ID, points: 1, games: 2 },
    { id: SF19_ID, points: 1, games: 2 }
  ]));
  expect(completed.activeWorkers).toBe(3);
  expect(completed.activeRecords).toBe(3);
  expect(completed.managerPeak).toBeLessThanOrEqual(3);
  expect(completed.auditPeak).toBeLessThanOrEqual(4);
  await page.locator('#arenaStopMatch').click();
  expect(await page.evaluate(() => window.CaissaArena.runtimeManager.getResourceSnapshot()
    .activeWorkers)).toBe(0);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} SF19 remains stable, accessible, and error-free`, async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await openArena(page, viewport);
    await selectPairing(page, SF19_ID, SF18_ID);
    const samples = [await boardGeometry(page)];
    await page.locator('#arenaStartMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
      timeout: 20_000
    }).toBeGreaterThan(0);
    samples.push(await boardGeometry(page));
    await page.getByRole('tab', { name: 'Game' }).click();
    samples.push(await boardGeometry(page));
    await page.getByRole('tab', { name: 'Match' }).click();
    samples.push(await boardGeometry(page));
    expectStable(samples, viewport.name);
    expect(await page.locator('#arenaSection').evaluate(element =>
      element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (viewport.name === 'desktop') {
      const audit = await new AxeBuilder({ page }).include('#arenaSection').analyze();
      expect(audit.violations.filter(violation =>
        ['serious', 'critical'].includes(violation.impact))).toEqual([]);
    }
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.getByRole('tab', { name: 'Game' }).click();
    await page.locator('#arenaStopMatch').click();
  });
}

test('SF19 replacement and section exit terminate workers and clear runtime records', async ({ page }) => {
  await openArena(page);
  await selectPairing(page, SF19_ID, 'stockfish');
  const original = await page.evaluate(() => window.CaissaArena.whiteEngineInstance
    .getRuntimeIdentity().runtimeInstanceId);
  await page.locator('#arenaWhiteEngine').selectOption(SF18_ID);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.playerInstancesMatchSelections()), {
    timeout: 15_000
  }).toBe(true);
  const replacement = await page.evaluate(({ path, oldId }) => ({
    oldTerminated: window.__arenaWorkerAudit.terminated.filter(item => item.url === path).length,
    newId: window.CaissaArena.whiteEngineInstance.getRuntimeIdentity().runtimeInstanceId,
    provider: window.CaissaArena.whiteEngineInstance.getRuntimeIdentity().providerId,
    stale: window.CaissaArena.whiteEngineInstance.getRuntimeIdentity().runtimeInstanceId === oldId
  }), { path: SF19_WORKER, oldId: original });
  expect(replacement).toMatchObject({ oldTerminated: 1, provider: SF18_ID, stale: false });

  await page.locator('#arenaWhiteEngine').selectOption(SF19_ID);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.playerInstancesMatchSelections()), {
    timeout: 15_000
  }).toBe(true);
  await page.evaluate(() => window.CaissaArena.onExit());
  expect(await page.evaluate(path => ({
    instances: [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine],
    active: window.__arenaWorkerAudit.activeCount(),
    sf19Terminated: window.__arenaWorkerAudit.terminated.filter(item => item.url === path).length
  }), SF19_WORKER)).toEqual({
    instances: [null, null, null],
    active: 1,
    sf19Terminated: 2
  });
});

test('runtime manager survives six legal-play replacement cycles and returns to zero', async ({ page }) => {
  test.setTimeout(120_000);
  await openArena(page);
  const cycleSnapshots = [];

  for (let cycle = 0; cycle < 6; cycle += 1) {
    await selectPairing(page, SF18_ID, SF19_ID);
    const finalWhite = cycle % 2 === 0 ? SF19_ID : 'stockfish';
    await page.locator('#arenaWhiteEngine').selectOption(finalWhite);
    await expect.poll(() => page.evaluate(() => window.CaissaArena.playerInstancesMatchSelections()), {
      timeout: 15_000
    }).toBe(true);

    const ready = await page.evaluate(() => {
      const arena = window.CaissaArena;
      const snapshot = arena.runtimeManager.getResourceSnapshot();
      return {
        selected: [arena.state.whiteEngine.id, arena.state.blackEngine.id],
        owned: [snapshot.roles.white.providerId, snapshot.roles.black.providerId],
        runtimeIds: [snapshot.roles.white.runtimeInstanceId, snapshot.roles.black.runtimeInstanceId],
        activeWorkers: snapshot.activeWorkers,
        activeRecords: snapshot.activeRuntimeRecords,
        managerPeak: snapshot.diagnostics.peakActiveWorkers
      };
    });
    expect(ready.owned).toEqual(ready.selected);
    expect(ready.activeWorkers).toBe(3);
    expect(ready.activeRecords).toBe(3);
    expect(ready.managerPeak).toBeLessThanOrEqual(3);
    if (ready.selected[0] === ready.selected[1]) {
      expect(ready.runtimeIds[0]).not.toBe(ready.runtimeIds[1]);
    }

    await page.locator('#arenaStartMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState), {
      timeout: 20_000
    }).toBe('running');
    await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
      timeout: 20_000
    }).toBeGreaterThan(0);
    await page.getByRole('tab', { name: 'Game' }).click();
    await page.locator('#arenaStopMatch').click();
    const stopped = await page.evaluate(() => {
      const snapshot = window.CaissaArena.runtimeManager.getResourceSnapshot();
      return {
        activeWorkers: snapshot.activeWorkers,
        activeRecords: snapshot.activeRuntimeRecords,
        liveRuntimeIds: snapshot.liveRuntimeIds.length,
        replacements: snapshot.diagnostics.replacements,
        managerPeak: snapshot.diagnostics.peakActiveWorkers,
        nativeActive: window.__arenaWorkerAudit.activeCount(),
        nativePeak: window.__arenaWorkerAudit.maxActive
      };
    });
    expect(stopped).toMatchObject({
      activeWorkers: 0,
      activeRecords: 0,
      liveRuntimeIds: 0,
      nativeActive: 1
    });
    expect(stopped.replacements).toBeGreaterThanOrEqual(cycle + 1);
    expect(stopped.managerPeak).toBeLessThanOrEqual(3);
    expect(stopped.nativePeak).toBeLessThanOrEqual(4);
    cycleSnapshots.push(stopped);
  }

  expect(cycleSnapshots).toHaveLength(6);
  expect(cycleSnapshots.every(snapshot => snapshot.activeWorkers === 0
    && snapshot.activeRecords === 0)).toBe(true);
});

test('rapid start-stop, stop-start, tab changes, replacement, and exit ignore stale work', async ({ page }) => {
  test.setTimeout(90_000);
  await openArena(page);
  await selectPairing(page, SF18_ID, SF19_ID);

  const canceledStart = await page.evaluate(async () => {
    const arena = window.CaissaArena;
    arena.destroyEngines();
    const pending = arena.startMatch();
    arena.stopMatch();
    await pending;
    return arena.runtimeManager.getResourceSnapshot();
  });
  expect(canceledStart.activeWorkers).toBe(0);
  expect(canceledStart.activeRuntimeRecords).toBe(0);
  expect(canceledStart.liveRuntimeIds).toEqual([]);

  await page.evaluate(() => window.CaissaArena.startMatch());
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  const beforeTabs = await page.evaluate(() => window.CaissaArena.runtimeManager
    .getResourceSnapshot().liveRuntimeIds);
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('tab', { name: 'Tournament' }).click();
    await page.getByRole('tab', { name: 'Match' }).click();
    await page.getByRole('tab', { name: 'Game' }).click();
  }
  const afterTabs = await page.evaluate(() => window.CaissaArena.runtimeManager
    .getResourceSnapshot().liveRuntimeIds);
  expect(afterTabs).toEqual(beforeTabs);

  await page.evaluate(async () => {
    const arena = window.CaissaArena;
    arena.stopMatch();
    await arena.startMatch();
  });
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  await page.evaluate(() => window.CaissaArena.stopMatch());

  const replacement = await page.evaluate(async ({ sf18, sf19 }) => {
    const manager = window.CaissaArena.runtimeManager;
    const first = manager.acquire('white', sf18);
    const second = manager.acquire('white', sf19);
    await Promise.allSettled([first, second]);
    const snapshot = manager.getResourceSnapshot();
    const result = {
      providerId: snapshot.roles.white?.providerId,
      state: snapshot.roles.white?.state,
      activeWorkers: snapshot.activeWorkers,
      staleAcquisitions: snapshot.diagnostics.staleAcquisitions
    };
    manager.terminateAll('race-test-cleanup');
    return result;
  }, { sf18: SF18_ID, sf19: SF19_ID });
  expect(replacement).toMatchObject({
    providerId: SF19_ID,
    state: 'READY',
    activeWorkers: 1
  });
  expect(replacement.staleAcquisitions).toBeGreaterThan(0);

  const exitDuringInit = await page.evaluate(async () => {
    const arena = window.CaissaArena;
    const pending = arena.initEngines();
    arena.onExit();
    await pending;
    return arena.runtimeManager.getResourceSnapshot();
  });
  expect(exitDuringInit.activeWorkers).toBe(0);
  expect(exitDuringInit.activeRuntimeRecords).toBe(0);
  expect(exitDuringInit.liveRuntimeIds).toEqual([]);
  expect(exitDuringInit.diagnostics.peakActiveWorkers).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => window.__arenaWorkerAudit.activeCount())).toBe(1);
});

test('SF19 worker failure disables only SF19 without fallback or relabeling', async ({ page }) => {
  await page.addInitScript((workerPath) => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    window.Worker = class FailingSf19Worker {
      constructor(url, options) {
        if (String(url) !== workerPath) return new NativeWorker(url, options);
        this.url = String(url);
      }
      postMessage(message) {
        if (message === 'uci') setTimeout(() => this.onerror?.(new Event('error')), 0);
      }
      terminate() { this.terminated = true; }
    };
  }, SF19_WORKER);
  await page.goto('/arena');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.enginesReady), {
    timeout: 15_000
  }).toBe(true);
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaWhiteEngine').selectOption(SF19_ID);
  await expect(page.locator(`#arenaWhiteEngine option[value="${SF19_ID}"]`)).toBeDisabled();
  await expect(page.locator(`#arenaBlackEngine option[value="${SF19_ID}"]`)).toBeDisabled();
  await expect(page.locator(`#arenaWhiteEngine option[value="${SF19_ID}"]`))
    .toContainText('stopped unexpectedly');
  await expect(page.locator('#arenaStartMatch')).toBeDisabled();
  expect(await page.evaluate(id => ({
    sf19: window.EngineRegistry.isArenaProviderAvailable(id),
    sf18: window.EngineRegistry.isArenaProviderAvailable('stockfish-18-lite'),
    legacy: window.EngineRegistry.isArenaProviderAvailable('stockfish'),
    label: document.querySelector('#arenaStatusWhite').textContent,
    runtime: window.CaissaArena.whiteEngineInstance?.getRuntimeIdentity() || null,
    failure: window.CaissaArena.runtimeManager.getResourceSnapshot().lastFailures.white
  }), SF19_ID)).toMatchObject({
    sf19: false,
    sf18: true,
    legacy: true,
    label: SF19_NAME,
    runtime: null,
    failure: { role: 'white', providerId: SF19_ID }
  });
});
