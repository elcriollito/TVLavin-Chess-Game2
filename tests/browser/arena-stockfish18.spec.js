import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SF18_ID = 'stockfish-18-lite';
const SF18_NAME = 'Stockfish 18 Lite';
const SF18_UCI_NAME = 'Stockfish 18 Lite WASM';
const SF18_AUTHOR = 'the Stockfish developers (see AUTHORS file)';
const SF18_WORKER = '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js';

async function openArena(page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript((workerPath) => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    const audit = { created: [], terminated: [] };
    window.Worker = class TrackedWorker extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__auditUrl = String(url);
        audit.created.push({ url: this.__auditUrl, at: performance.now() });
      }
      terminate() {
        audit.terminated.push({ url: this.__auditUrl, at: performance.now() });
        return super.terminate();
      }
    };
    window.__arenaWorkerAudit = audit;
    window.__sf18WorkerPath = workerPath;
  }, SF18_WORKER);
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

async function startAndObserveLegalPlay(page) {
  await page.locator('#arenaStartMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  return page.evaluate(() => {
    const arena = window.CaissaArena;
    return {
      fen: arena.game.fen(),
      moves: arena.game.history(),
      whiteRuntime: arena.whiteEngineInstance.getRuntimeIdentity(),
      blackRuntime: arena.blackEngineInstance.getRuntimeIdentity(),
      recorded: arena.state.currentGame.runtimeIdentities,
      visibleWhite: document.querySelector('#arenaStatusWhite').textContent,
      visibleBlack: document.querySelector('#arenaStatusBlack').textContent
    };
  });
}

function expectSf18Runtime(runtime) {
  expect(runtime).toMatchObject({
    providerId: SF18_ID,
    requestedEngineId: SF18_ID,
    reportedUciName: SF18_UCI_NAME,
    reportedAuthor: SF18_AUTHOR,
    workerAsset: SF18_WORKER,
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
    expect(Math.max(...values) - Math.min(...values), `${label} ${field} drift`).toBeLessThanOrEqual(0.5);
  }
}

test('Stockfish 18 is registered once, shared by Match and Tournament, and lazy before selection', async ({ page }) => {
  await openArena(page);
  const registration = await page.evaluate(({ id, path }) => {
    const providers = window.EngineRegistry.listArenaProviders();
    const matchOptions = Array.from(document.querySelectorAll('#arenaWhiteEngine option'));
    const tournamentInputs = Array.from(document.querySelectorAll('#arenaTournamentEngines input'));
    const provider = window.EngineRegistry.getArenaProvider(id);
    return {
      registryCount: providers.filter(candidate => candidate.id === id).length,
      matchCount: matchOptions.filter(option => option.value === id).length,
      tournamentCount: tournamentInputs.filter(input => input.value === id).length,
      matchDisabled: matchOptions.find(option => option.value === id)?.disabled,
      tournamentDisabled: tournamentInputs.find(input => input.value === id)?.disabled,
      tournamentChecked: tournamentInputs.find(input => input.value === id)?.checked,
      sf18WorkersBeforeSelection: window.__arenaWorkerAudit.created.filter(worker => worker.url === path).length,
      provider: {
        id: provider.id,
        displayName: provider.displayName,
        capabilities: provider.capabilities,
        defaultOptions: provider.defaultOptions,
        profile: provider.profile,
        availability: provider.availability
      }
    };
  }, { id: SF18_ID, path: SF18_WORKER });

  expect(registration).toEqual({
    registryCount: 1,
    matchCount: 1,
    tournamentCount: 1,
    matchDisabled: false,
    tournamentDisabled: false,
    tournamentChecked: true,
    sf18WorkersBeforeSelection: 0,
    provider: {
      id: SF18_ID,
      displayName: SF18_NAME,
      capabilities: {
        supportsThreads: false,
        supportsNNUE: true,
        supportsMultiPV: true,
        supportsSyzygy: false,
        browserCompatible: true,
        mobileCompatible: true,
        requiresCrossOriginIsolation: false
      },
      defaultOptions: { MultiPV: 1, Hash: 16, Threads: 1 },
      profile: { id: 'lite-single', displayName: 'Lite single-thread', defaultDepth: 20 },
      availability: 'available'
    }
  });

  await selectPairing(page, SF18_ID, 'stockfish');
  const sf18RuntimeId = await page.evaluate(() => window.CaissaArena.whiteEngineInstance
    .getRuntimeIdentity().runtimeInstanceId);
  await page.locator('#arenaWhiteEngine').selectOption('stockfish-lite');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.playerInstancesMatchSelections()), {
    timeout: 15_000
  }).toBe(true);
  expect(await page.evaluate(({ path, oldRuntimeId }) => ({
    terminatedSf18Workers: window.__arenaWorkerAudit.terminated
      .filter(worker => worker.url === path).length,
    oldRuntimeReplaced: window.CaissaArena.whiteEngineInstance
      .getRuntimeIdentity().runtimeInstanceId !== oldRuntimeId,
    currentProvider: window.CaissaArena.whiteEngineInstance.getRuntimeIdentity().providerId
  }), { path: SF18_WORKER, oldRuntimeId: sf18RuntimeId })).toEqual({
    terminatedSf18Workers: 1,
    oldRuntimeReplaced: true,
    currentProvider: 'stockfish-lite'
  });
});

for (const pairing of [
  { name: 'Stockfish 18 vs Stockfish 2019 MV', white: SF18_ID, black: 'stockfish' },
  { name: 'Stockfish 2019 MV vs Stockfish 18', white: 'stockfish', black: SF18_ID },
  { name: 'Stockfish 18 vs Stockfish 2019 MV Lite', white: SF18_ID, black: 'stockfish-lite' },
  { name: 'Stockfish 18 vs Stockfish 18', white: SF18_ID, black: SF18_ID }
]) {
  test(`${pairing.name} uses truthful independent runtimes and makes a legal move`, async ({ page }) => {
    await openArena(page);
    await selectPairing(page, pairing.white, pairing.black);
    const result = await startAndObserveLegalPlay(page);

    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.fen).not.toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(result.visibleWhite).toBe(pairing.white === SF18_ID ? SF18_NAME
      : pairing.white === 'stockfish' ? 'Stockfish 2019 MV' : 'Stockfish 2019 MV (Lite profile)');
    expect(result.visibleBlack).toBe(pairing.black === SF18_ID ? SF18_NAME
      : pairing.black === 'stockfish' ? 'Stockfish 2019 MV' : 'Stockfish 2019 MV (Lite profile)');
    if (pairing.white === SF18_ID) expectSf18Runtime(result.whiteRuntime);
    if (pairing.black === SF18_ID) expectSf18Runtime(result.blackRuntime);
    expect(result.recorded.white.runtimeInstanceId).toBe(result.whiteRuntime.runtimeInstanceId);
    expect(result.recorded.black.runtimeInstanceId).toBe(result.blackRuntime.runtimeInstanceId);
    if (pairing.white === pairing.black) {
      expect(result.whiteRuntime.runtimeInstanceId).not.toBe(result.blackRuntime.runtimeInstanceId);
      expect(await page.evaluate(() => window.CaissaArena.whiteEngineInstance
        !== window.CaissaArena.blackEngineInstance)).toBe(true);
      expect(await page.evaluate(path => window.__arenaWorkerAudit.created
        .filter(worker => worker.url === path).length, SF18_WORKER)).toBe(2);
    }
    await page.getByRole('tab', { name: 'Game' }).click();
    await page.locator('#arenaStopMatch').click();
  });
}

test('three-participant Tournament rotates the bye, runs Stockfish 18, and records canonical draws', async ({ page }) => {
  await openArena(page, { width: 1920, height: 1080 });
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.locator('#arenaTournamentEngines input[value="stockfish-19-lite"]').uncheck();
  await expect(page.locator('#arenaTournamentEngines input:checked')).toHaveCount(3);
  await expect(page.locator('#arenaTournamentStandings tbody tr')).toHaveCount(3);
  const geometry = [await boardGeometry(page)];

  await page.locator('#arenaStartTournament').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#arenaEvalDepth').textContent(), {
    timeout: 15_000
  }).not.toBe('0');
  await expect.poll(() => page.locator('#arenaEvalPV').textContent(), {
    timeout: 15_000
  }).not.toBe('--');
  geometry.push(await boardGeometry(page));
  await page.getByRole('tab', { name: 'Game' }).click();
  await page.locator('#arenaDeclareDraw').click();
  await page.locator('#arenaDrawConfirm').click();

  await expect.poll(() => page.evaluate(id => {
    const game = window.CaissaArena.state.currentGame;
    return window.CaissaArena.state.matchState === 'running'
      && [game?.white?.id, game?.black?.id].includes(id);
  }, SF18_ID), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
    timeout: 20_000
  }).toBeGreaterThan(0);
  geometry.push(await boardGeometry(page));

  const active = await page.evaluate(() => {
    const arena = window.CaissaArena;
    return {
      participants: arena.state.tournament.engines.map(engine => engine.id),
      white: arena.state.currentGame.white.id,
      black: arena.state.currentGame.black.id,
      runtimes: arena.state.currentGame.runtimeIdentities,
      moveRows: document.querySelectorAll('#arenaMoveHistory .arena-move-row').length,
      evaluation: document.querySelector('#arenaEvalScore').textContent,
      depth: document.querySelector('#arenaEvalDepth').textContent,
      pv: document.querySelector('#arenaEvalPV').textContent,
      runtimeIds: [arena.whiteEngineInstance, arena.blackEngineInstance]
        .map(engine => engine.getRuntimeIdentity().runtimeInstanceId)
    };
  });
  expect(active.participants).toEqual(['stockfish', 'stockfish-lite', SF18_ID]);
  expect(active.moveRows).toBeGreaterThan(0);
  expect(active.evaluation).toMatch(/^(?:[+-]\d+\.\d{2}|M-?\d+)$/);
  expect(Number(active.depth)).toBeGreaterThan(0);
  expect(active.pv.length).toBeGreaterThan(0);
  expect(active.runtimeIds[0]).not.toBe(active.runtimeIds[1]);
  expectSf18Runtime(active.white === SF18_ID ? active.runtimes.white : active.runtimes.black);

  await page.locator('#arenaPauseMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
  await page.locator('#arenaPauseMatch').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');
  await page.locator('#arenaDeclareDraw').click();
  await page.locator('#arenaDrawConfirm').click();

  const recorded = await page.evaluate(id => {
    const arena = window.CaissaArena;
    const sfGame = arena.state.tournament.games.find(game => game.result !== null
      && [game.white.id, game.black.id].includes(id));
    const standing = arena.state.tournament.standings.find(item => item.engine.id === id);
    return {
      result: sfGame?.result,
      termination: sfGame?.termination,
      preservedMoves: sfGame?.moves?.length,
      runtime: sfGame?.runtimeIdentities?.white?.providerId === id
        ? sfGame.runtimeIdentities.white : sfGame?.runtimeIdentities?.black,
      points: standing?.points,
      games: standing?.games,
      drawCells: Array.from(document.querySelectorAll('#arenaTournamentStandings .is-played'))
        .filter(cell => cell.textContent === '½').length,
      searchesStoppedAtRecord: [arena.whiteEngineInstance, arena.blackEngineInstance,
        arena.evaluatorEngine].every(engine => !engine?.analyzing)
    };
  }, SF18_ID);
  expect(recorded.result).toBe('1/2-1/2');
  expect(recorded.termination).toBe('Draw by adjudication');
  expect(recorded.preservedMoves).toBeGreaterThan(0);
  expect(recorded.points).toBe(1);
  expect(recorded.games).toBe(2);
  expect(recorded.drawCells).toBeGreaterThanOrEqual(4);
  expect(recorded.searchesStoppedAtRecord).toBe(true);
  expectSf18Runtime(recorded.runtime);
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState), {
    timeout: 15_000
  }).toBe('running');
  geometry.push(await boardGeometry(page));
  expectStable(geometry, 'Stockfish 18 Tournament');
  await page.locator('#arenaStopMatch').click();
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} Stockfish 18 Match remains stable and continuous`, async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await openArena(page, viewport);
    await selectPairing(page, SF18_ID, 'stockfish');
    const runtimeId = await page.evaluate(() => window.CaissaArena.whiteEngineInstance
      .getRuntimeIdentity().runtimeInstanceId);
    const samples = [await boardGeometry(page)];
    await page.locator('#arenaStartMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.game.history().length), {
      timeout: 20_000
    }).toBeGreaterThanOrEqual(2);
    samples.push(await boardGeometry(page));
    await page.getByRole('tab', { name: 'Game' }).click();
    samples.push(await boardGeometry(page));
    await page.locator('#arenaPauseMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('paused');
    await page.locator('#arenaPauseMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.state.matchState)).toBe('running');
    await page.getByRole('tab', { name: 'Match' }).click();
    samples.push(await boardGeometry(page));
    expectStable(samples, `${viewport.name} Stockfish 18 Match`);
    expect(await page.evaluate(expected => window.CaissaArena.whiteEngineInstance
      .getRuntimeIdentity().runtimeInstanceId === expected, runtimeId)).toBe(true);
    if (viewport.name === 'desktop') {
      const audit = await new AxeBuilder({ page }).include('#arenaSection').analyze();
      expect(audit.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))).toEqual([]);
    }
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await page.getByRole('tab', { name: 'Game' }).click();
    await page.locator('#arenaStopMatch').click();
  });
}

test('Stockfish 18 worker/WASM failure disables its UI without relabeling or fallback', async ({ page }) => {
  await page.addInitScript((workerPath) => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    window.Worker = class FailingSf18Worker {
      constructor(url, options) {
        if (String(url) !== workerPath) return new NativeWorker(url, options);
        this.url = String(url);
      }
      postMessage(message) {
        if (message === 'uci') setTimeout(() => this.onerror?.(new Event('error')), 0);
      }
      terminate() { this.terminated = true; }
    };
  }, SF18_WORKER);
  await page.goto('/arena');
  await expect.poll(() => page.evaluate(() => window.CaissaArena.enginesReady), {
    timeout: 15_000
  }).toBe(true);
  await page.getByRole('tab', { name: 'Match' }).click();
  await page.locator('#arenaWhiteEngine').selectOption(SF18_ID);
  await expect(page.locator(`#arenaWhiteEngine option[value="${SF18_ID}"]`)).toBeDisabled();
  await expect(page.locator(`#arenaBlackEngine option[value="${SF18_ID}"]`)).toBeDisabled();
  await expect(page.locator(`#arenaWhiteEngine option[value="${SF18_ID}"]`))
    .toContainText('stopped unexpectedly');
  await expect(page.locator('#arenaStartMatch')).toBeDisabled();
  const failure = await page.evaluate(id => ({
    sf18Available: window.EngineRegistry.isArenaProviderAvailable(id),
    legacyAvailable: window.EngineRegistry.isArenaProviderAvailable('stockfish'),
    selectedLabel: document.querySelector('#arenaStatusWhite').textContent,
    liveWorkerCount: [window.CaissaArena.whiteEngineInstance, window.CaissaArena.blackEngineInstance,
      window.CaissaArena.evaluatorEngine].filter(engine => Boolean(engine?.engine)).length
  }), SF18_ID);
  expect(failure).toEqual({
    sf18Available: false,
    legacyAvailable: true,
    selectedLabel: SF18_NAME,
    liveWorkerCount: 2
  });
});
