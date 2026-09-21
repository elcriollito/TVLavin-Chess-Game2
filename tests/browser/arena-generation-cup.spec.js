import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const FIELD = [
  { id: 'stockfish', name: 'Stockfish 2019 MV', uci: 'Stockfish 2019-08-15 Multi-Variant' },
  { id: 'stockfish-lite', name: 'Stockfish 2019 MV (Lite profile)', uci: 'Stockfish 2019-08-15 Multi-Variant' },
  { id: 'stockfish-18-lite', name: 'Stockfish 18 Lite', uci: 'Stockfish 18 Lite WASM' },
  { id: 'stockfish-19-lite', name: 'Stockfish 19 Lite', uci: 'Stockfish 19 Lite WASM' }
];

const EXPECTED_SINGLE_ROUND_ROBIN = [
  ['stockfish', 'stockfish-19-lite'],
  ['stockfish-lite', 'stockfish-18-lite'],
  ['stockfish-18-lite', 'stockfish'],
  ['stockfish-19-lite', 'stockfish-lite'],
  ['stockfish', 'stockfish-lite'],
  ['stockfish-18-lite', 'stockfish-19-lite']
];

async function openArena(page, viewport = { width: 1920, height: 1080 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    let sequence = 0;
    const active = new Set();
    const audit = { created: [], terminated: [], maxActive: 0 };
    window.Worker = class TrackedWorker extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__auditId = ++sequence;
        this.__auditUrl = String(url);
        active.add(this.__auditId);
        audit.created.push({ id: this.__auditId, url: this.__auditUrl });
        audit.maxActive = Math.max(audit.maxActive, active.size);
      }
      terminate() {
        active.delete(this.__auditId);
        audit.terminated.push({ id: this.__auditId, url: this.__auditUrl });
        return super.terminate();
      }
    };
    audit.activeCount = () => active.size;
    window.__generationCupWorkerAudit = audit;
  });
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

async function selectGenerationCup(page, rounds = '3') {
  await page.getByRole('tab', { name: 'Tournament' }).click();
  for (const participant of FIELD) {
    await page.locator(`#arenaTournamentEngines input[value="${participant.id}"]`).check();
  }
  await page.locator('#arenaTournamentEngines input').evaluateAll((inputs, allowed) => {
    for (const input of inputs) {
      if (!allowed.includes(input.value) && !input.disabled) input.checked = false;
    }
    inputs[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  }, FIELD.map(participant => participant.id));
  await page.locator('#arenaTournamentRounds').selectOption(rounds);
  await page.locator('#arenaTournamentOpening').selectOption('free');
  await expect(page.locator('#arenaTournamentEngines input:checked')).toHaveCount(4);
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

async function waitForGame(page, completedGames) {
  await expect.poll(() => page.evaluate(expectedCompleted => {
    const arena = window.CaissaArena;
    return arena.state.matchState === 'running'
      && arena.state.tournament.games.filter(game => game.result !== null).length === expectedCompleted
      && arena.game.history().length > 0;
  }, completedGames), { timeout: 25_000 }).toBe(true);
  await page.getByRole('tab', { name: 'Game' }).click();
  await expect.poll(() => page.locator('#arenaEvalDepth').textContent(), {
    timeout: 15_000
  }).not.toBe('0');
  await expect.poll(() => page.locator('#arenaEvalPV').textContent(), {
    timeout: 15_000
  }).not.toBe('--');
}

test('Generation Cup completes all six four-engine pairings truthfully and within budget', async ({ page }) => {
  test.setTimeout(150_000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await openArena(page);
  await selectGenerationCup(page);
  const geometries = [await boardGeometry(page)];
  const observations = [];
  let previous = null;

  await page.locator('#arenaStartTournament').click();
  for (let gameIndex = 0; gameIndex < EXPECTED_SINGLE_ROUND_ROBIN.length; gameIndex += 1) {
    await waitForGame(page, gameIndex);
    geometries.push(await boardGeometry(page));
    const observation = await page.evaluate(() => {
      const arena = window.CaissaArena;
      const snapshot = arena.runtimeManager.getResourceSnapshot();
      const current = arena.state.currentGame;
      const pending = arena.state.tournament.games.find(game => game.result === null);
      return {
        pairing: [current.white.id, current.black.id],
        pendingPairing: [pending.white.id, pending.black.id],
        visible: [
          document.querySelector('#arenaStatusWhite').textContent,
          document.querySelector('#arenaStatusBlack').textContent
        ],
        identities: [
          arena.whiteEngineInstance.getRuntimeIdentity(),
          arena.blackEngineInstance.getRuntimeIdentity()
        ],
        recorded: current.runtimeIdentities,
        evaluator: arena.evaluatorEngine.getRuntimeIdentity(),
        roles: snapshot.roles,
        liveRuntimeIds: snapshot.liveRuntimeIds,
        activeWorkers: snapshot.activeWorkers,
        activeRecords: snapshot.activeRuntimeRecords,
        managerPeak: snapshot.diagnostics.peakActiveWorkers,
        replacements: snapshot.diagnostics.replacements,
        reuses: snapshot.diagnostics.reuses,
        nativePeak: window.__generationCupWorkerAudit.maxActive,
        moves: arena.game.history(),
        moveText: document.querySelector('#arenaMoveHistory').textContent,
        pv: document.querySelector('#arenaEvalPV').textContent,
        evaluation: document.querySelector('#arenaEvalScore').textContent,
        graphWidth: document.querySelector('#arenaEvalGraph').getBoundingClientRect().width,
        states: [snapshot.roles.white.state, snapshot.roles.black.state, snapshot.roles.evaluator.state]
      };
    });

    expect(observation.pairing).toEqual(EXPECTED_SINGLE_ROUND_ROBIN[gameIndex]);
    expect(observation.pendingPairing).toEqual(observation.pairing);
    expect(observation.activeWorkers).toBe(3);
    expect(observation.activeRecords).toBe(3);
    expect(observation.managerPeak).toBeLessThanOrEqual(3);
    expect(observation.nativePeak).toBeLessThanOrEqual(4);
    expect(observation.moves.length).toBeGreaterThan(0);
    expect(observation.moveText.trim()).not.toBe('');
    expect(observation.moveText).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/);
    expect(observation.pv).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/);
    expect(observation.evaluation).toMatch(/^(?:[+-]\d+\.\d{2}|M-?\d+)$/);
    expect(observation.graphWidth).toBeGreaterThan(80);
    expect(observation.states).not.toContain('TERMINATED');
    expect(observation.states).not.toContain('FAILED');

    for (let roleIndex = 0; roleIndex < 2; roleIndex += 1) {
      const provider = FIELD.find(candidate => candidate.id === observation.pairing[roleIndex]);
      const identity = observation.identities[roleIndex];
      const role = roleIndex === 0 ? 'white' : 'black';
      expect(observation.visible[roleIndex]).toBe(provider.name);
      expect(identity).toMatchObject({
        providerId: provider.id,
        requestedEngineId: provider.id,
        reportedUciName: provider.uci,
        identityValidated: true,
        status: 'ready'
      });
      expect(observation.recorded[role].runtimeInstanceId).toBe(identity.runtimeInstanceId);
      expect(observation.roles[role].providerId).toBe(provider.id);
      expect(observation.roles[role].runtimeInstanceId).toBe(identity.runtimeInstanceId);
      if (previous) {
        const sameProvider = previous.pairing[roleIndex] === provider.id;
        const previousId = previous.identities[roleIndex].runtimeInstanceId;
        if (sameProvider) expect(identity.runtimeInstanceId).toBe(previousId);
        else expect(identity.runtimeInstanceId).not.toBe(previousId);
      }
    }
    expect(observation.evaluator).toMatchObject({
      providerId: 'stockfish',
      requestedEngineId: 'stockfish',
      reportedUciName: 'Stockfish 2019-08-15 Multi-Variant',
      identityValidated: true,
      status: 'ready'
    });
    if (previous) {
      expect(observation.evaluator.runtimeInstanceId).toBe(previous.evaluator.runtimeInstanceId);
    }
    expect(new Set(observation.liveRuntimeIds)).toEqual(new Set([
      observation.identities[0].runtimeInstanceId,
      observation.identities[1].runtimeInstanceId,
      observation.evaluator.runtimeInstanceId
    ]));
    observations.push(observation);
    previous = observation;

    await page.locator('#arenaDeclareDraw').click();
    await page.locator('#arenaDrawConfirm').click();
    await expect.poll(() => page.evaluate(expected => {
      const arena = window.CaissaArena;
      return arena.state.tournament.games.filter(game => game.result !== null).length;
    }, gameIndex + 1), { timeout: 10_000 }).toBe(gameIndex + 1);

    const completed = await page.evaluate(() => {
      const arena = window.CaissaArena;
      const snapshot = arena.runtimeManager.getResourceSnapshot();
      return {
        searchesStopped: arena.runtimeManager.getActiveInstances()
          .every(record => !record.instance.analyzing),
        states: Object.values(snapshot.roles).filter(Boolean).map(role => role.state),
        standings: arena.state.tournament.standings.map(standing => ({
          id: standing.engine.id,
          points: standing.points,
          games: standing.games,
          uiPoints: document.querySelector(
            `#arenaTournamentStandings tr[data-participant-id="${standing.engine.id}"] .standings-points`
          )?.textContent,
          uiGames: document.querySelector(
            `#arenaTournamentStandings tr[data-participant-id="${standing.engine.id}"] .standings-games`
          )?.textContent
        })),
        activeWorkers: snapshot.activeWorkers
      };
    });
    expect(completed.searchesStopped).toBe(true);
    expect(completed.states.every(state => state === 'IDLE')).toBe(true);
    expect(completed.activeWorkers).toBe(3);
    for (const standing of completed.standings) {
      expect(standing.uiPoints).toBe(Number.isInteger(standing.points)
        ? String(standing.points) : standing.points.toFixed(1));
      expect(standing.uiGames).toBe(String(standing.games));
      expect(standing.points).toBe(standing.games * 0.5);
    }
  }

  await expect.poll(() => page.evaluate(() => {
    const tournament = window.CaissaArena.state.tournament;
    return tournament.currentRound === tournament.rounds
      && tournament.games.every(game => game.result !== null);
  }), { timeout: 15_000 }).toBe(true);
  geometries.push(await boardGeometry(page));
  expectStable(geometries, 'Generation Cup desktop');

  const final = await page.evaluate(() => {
    const arena = window.CaissaArena;
    const snapshot = arena.runtimeManager.getResourceSnapshot();
    return {
      format: arena.state.tournament.format,
      results: arena.state.tournament.games.map(game => ({
        pairing: [game.white.id, game.black.id],
        result: game.result,
        termination: game.termination,
        runtimePairing: [game.runtimeIdentities.white.providerId,
          game.runtimeIdentities.black.providerId]
      })),
      standings: arena.getRankedTournamentStandings().map(entry => ({
        id: entry.standing.engine.id,
        points: entry.standing.points,
        games: entry.standing.games,
        rank: entry.rank,
        tied: entry.tied
      })),
      halfCells: Array.from(document.querySelectorAll(
        '#arenaTournamentStandings .standings-result.is-played'
      )).filter(cell => cell.textContent === '\u00bd').length,
      rankLabels: Array.from(document.querySelectorAll(
        '#arenaTournamentStandings .standings-rank[aria-label]'
      )).map(cell => cell.getAttribute('aria-label')),
      diagnostics: snapshot.diagnostics,
      activeWorkers: snapshot.activeWorkers,
      nativePeak: window.__generationCupWorkerAudit.maxActive,
      horizontalOverflow: document.querySelector('#arenaSection').scrollWidth
        > document.querySelector('#arenaSection').clientWidth + 1
    };
  });
  expect(final.format).toBe('round-robin');
  expect(final.results.map(game => game.pairing)).toEqual(EXPECTED_SINGLE_ROUND_ROBIN);
  expect(final.results.every(game => game.result === '1/2-1/2'
    && game.termination === 'Draw by adjudication'
    && JSON.stringify(game.pairing) === JSON.stringify(game.runtimePairing))).toBe(true);
  expect(final.standings).toEqual(FIELD.map(participant => ({
    id: participant.id, points: 1.5, games: 3, rank: 1, tied: true
  })));
  expect(final.halfCells).toBe(12);
  expect(final.rankLabels).toEqual(Array(4).fill('Rank 1, tied'));
  expect(final.diagnostics.acquisitions).toBe(13);
  expect(final.diagnostics.replacements).toBe(10);
  expect(final.diagnostics.reuses).toBe(8);
  expect(final.diagnostics.terminations).toBe(10);
  expect(final.diagnostics.peakActiveWorkers).toBe(3);
  expect(final.activeWorkers).toBe(3);
  expect(final.nativePeak).toBeLessThanOrEqual(4);
  expect(final.horizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page }).include('#arenaSection').analyze();
  expect(accessibility.violations.filter(violation =>
    ['serious', 'critical'].includes(violation.impact))).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  await page.evaluate(() => window.CaissaArena.onExit());
  const cleaned = await page.evaluate(() => ({
    snapshot: window.CaissaArena.runtimeManager.getResourceSnapshot(),
    nativeActive: window.__generationCupWorkerAudit.activeCount()
  }));
  expect(cleaned.snapshot.activeWorkers).toBe(0);
  expect(cleaned.snapshot.activeRuntimeRecords).toBe(0);
  expect(cleaned.snapshot.liveRuntimeIds).toEqual([]);
  expect(cleaned.snapshot.diagnostics.terminations).toBe(13);
  expect(cleaned.nativeActive).toBe(1);
  expect(observations).toHaveLength(6);
});

for (const viewport of [
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'mobile landscape', width: 844, height: 390 }
]) {
  test(`${viewport.name} Tournament transitions, stops, and restarts without contamination`, async ({ page }) => {
    test.setTimeout(90_000);
    await openArena(page, viewport);
    await selectGenerationCup(page);
    const geometries = [await boardGeometry(page)];
    await page.locator('#arenaStartTournament').click();
    await waitForGame(page, 0);
    geometries.push(await boardGeometry(page));

    const first = await page.evaluate(() => {
      const arena = window.CaissaArena;
      const snapshot = arena.runtimeManager.getResourceSnapshot();
      return {
        pairing: [arena.state.currentGame.white.id, arena.state.currentGame.black.id],
        activeWorkers: snapshot.activeWorkers,
        activeRecords: snapshot.activeRuntimeRecords,
        moveText: document.querySelector('#arenaMoveHistory').textContent,
        pv: document.querySelector('#arenaEvalPV').textContent,
        overflow: document.querySelector('#arenaSection').scrollWidth
          > document.querySelector('#arenaSection').clientWidth + 1
      };
    });
    expect(first.activeWorkers).toBe(3);
    expect(first.activeRecords).toBe(3);
    expect(first.moveText).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/);
    expect(first.pv).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/);
    expect(first.overflow).toBe(false);

    await page.locator('#arenaStopMatch').click();
    await expect.poll(() => page.evaluate(() => window.CaissaArena.runtimeManager
      .getResourceSnapshot().activeWorkers)).toBe(0);
    await page.getByRole('tab', { name: 'Tournament' }).click();
    await page.locator('#arenaStartTournament').click();
    await waitForGame(page, 0);
    geometries.push(await boardGeometry(page));

    const restarted = await page.evaluate(firstPairing => {
      const arena = window.CaissaArena;
      const snapshot = arena.runtimeManager.getResourceSnapshot();
      return {
        pairing: [arena.state.currentGame.white.id, arena.state.currentGame.black.id],
        results: arena.state.tournament.games.filter(game => game.result !== null).length,
        activeWorkers: snapshot.activeWorkers,
        activeRecords: snapshot.activeRuntimeRecords,
        staleIds: snapshot.liveRuntimeIds.length !== 3,
        firstPairing
      };
    }, first.pairing);
    expect(restarted.pairing).toEqual(first.pairing);
    expect(restarted.results).toBe(0);
    expect(restarted.activeWorkers).toBe(3);
    expect(restarted.activeRecords).toBe(3);
    expect(restarted.staleIds).toBe(false);
    expectStable(geometries, viewport.name);

    await page.locator('#arenaStopMatch').click();
    expect(await page.evaluate(() => window.CaissaArena.runtimeManager
      .getResourceSnapshot().activeWorkers)).toBe(0);
  });
}

test('automatic insufficient-material draw records normally and explicit stop cancels advance', async ({ page }) => {
  test.setTimeout(60_000);
  await openArena(page);
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.locator('#arenaTournamentEngines input').evaluateAll(inputs => {
    for (const input of inputs) input.checked = ['stockfish', 'stockfish-lite'].includes(input.value);
    inputs[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    window.CaissaArena.state.customStartFen = '8/8/8/8/8/8/2k5/K7 w - - 0 1';
  });
  await page.locator('#arenaStartTournament').click();
  await expect.poll(() => page.evaluate(() => window.CaissaArena.state.tournament.games[0]?.result), {
    timeout: 20_000
  }).toBe('1/2-1/2');
  expect(await page.evaluate(() => ({
    state: window.CaissaArena.state.matchState,
    status: document.querySelector('#arenaStatusText').textContent,
    standings: window.CaissaArena.state.tournament.standings.map(item => ({
      points: item.points, games: item.games
    }))
  }))).toEqual({
    state: 'finished',
    status: 'Finished: Draw - insufficient material',
    standings: [{ points: 0.5, games: 1 }, { points: 0.5, games: 1 }]
  });

  await page.evaluate(() => window.CaissaArena.stopMatch());
  await page.waitForTimeout(2_300);
  expect(await page.evaluate(() => ({
    state: window.CaissaArena.state.matchState,
    completed: window.CaissaArena.state.tournament.games.filter(game => game.result !== null).length,
    activeWorkers: window.CaissaArena.runtimeManager.getResourceSnapshot().activeWorkers,
    advancePending: window.CaissaArena._tournamentAdvanceTimer !== null
  }))).toEqual({ state: 'idle', completed: 1, activeWorkers: 0, advancePending: false });
});

test('controlled SF19 Tournament startup failure fails closed and cleans surviving roles', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    const NativeWorker = window.Worker;
    window.Worker = class FailingGenerationCupWorker {
      constructor(url, options) {
        if (String(url) !== '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js') {
          return new NativeWorker(url, options);
        }
      }
      postMessage(message) {
        if (message === 'uci') setTimeout(() => this.onerror?.(new Event('error')), 0);
      }
      terminate() { this.terminated = true; }
    };
  });
  await page.goto('/arena');
  await expect(page.locator('body')).toHaveAttribute('data-caissa-surface', 'arena');
  await page.getByRole('tab', { name: 'Tournament' }).click();
  await page.locator('#arenaStartTournament').click();

  await expect.poll(() => page.evaluate(() => window.CaissaArena.runtimeManager
    .getResourceSnapshot().lastFailures.black?.providerId), { timeout: 15_000 })
    .toBe('stockfish-19-lite');
  const failure = await page.evaluate(() => {
    const arena = window.CaissaArena;
    const snapshot = arena.runtimeManager.getResourceSnapshot();
    return {
      matchState: arena.state.matchState,
      pendingResult: arena.state.tournament.games[0].result,
      selected: [arena.state.whiteEngine.id, arena.state.blackEngine.id],
      activeWorkers: snapshot.activeWorkers,
      activeRecords: snapshot.activeRuntimeRecords,
      liveRuntimeIds: snapshot.liveRuntimeIds,
      failedRole: snapshot.lastFailures.black,
      sf19Available: window.EngineRegistry.isArenaProviderAvailable('stockfish-19-lite'),
      visibleBlack: document.querySelector('#arenaStatusBlack').textContent
    };
  });
  expect(failure).toMatchObject({
    matchState: 'idle',
    pendingResult: null,
    selected: ['stockfish', 'stockfish-19-lite'],
    activeWorkers: 0,
    activeRecords: 0,
    liveRuntimeIds: [],
    failedRole: { role: 'black', providerId: 'stockfish-19-lite' },
    sf19Available: false,
    visibleBlack: 'Stockfish 19 Lite'
  });
});
