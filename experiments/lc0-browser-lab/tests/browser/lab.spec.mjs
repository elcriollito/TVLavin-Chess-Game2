import { expect, test } from '@playwright/test';

async function openLab(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CAISSA Lc0 Browser Lab' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.Lc0Lab?.environment?.supported)).toBe(true);
}

async function dedicatedWorkerCount(page) {
  return (await dedicatedWorkerTargets(page)).length;
}

async function dedicatedWorkerTargets(page) {
  const session = await page.context().newCDPSession(page);
  const result = await session.send('Target.getTargets');
  await session.detach();
  return result.targetInfos
    .filter(target => target.type === 'worker' && /lc0|ort-wasm/i.test(`${target.title} ${target.url}`))
    .map(target => ({ targetId: target.targetId, title: target.title, url: target.url, attached: target.attached }));
}

test('isolated environment, UCI, 20 legal positions, and zero-worker termination', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const report = await page.evaluate(async () => {
    const runtime = window.Lc0Lab.createRuntime();
    await runtime.initialize();
    await runtime.uciTest();
    const first = await runtime.startPositionTest();
    const repeated = await runtime.repeatedLegalMoves(20);
    const beforeTerminate = runtime.snapshot();
    const terminated = await runtime.terminate('certification');
    await new Promise(resolve => setTimeout(resolve, 250));
    return { environment: runtime.environment, first, repeated, beforeTerminate, terminated };
  });
  expect(report.environment.crossOriginIsolated).toBe(true);
  expect(report.environment.sharedArrayBuffer).toBe(true);
  expect(report.environment.runtimeModuleValid).toBe(true);
  expect(report.repeated).toHaveLength(20);
  expect(report.repeated.every(result => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(result.bestmove))).toBe(true);
  expect(report.terminated.state).toBe('TERMINATED');
  expect(report.terminated.workers).toBe(0);
  expect(report.terminated.cleanupAcknowledged).toBe(true);
  await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
  console.log(`LC0_LAB_PRIMARY ${JSON.stringify({ network: report.terminated.identity?.networkSha256,
    legalSearches: report.repeated.length, maxWorkers: report.beforeTerminate.maxWorkers,
    terminatedWorkers: report.terminated.workers, cleanup: report.terminated.cleanupAcknowledged })}`);
});

test('active search stops and restarts twenty times without force termination', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const report = await page.evaluate(async () => {
    const runtime = window.Lc0Lab.createRuntime({ timeoutMs: 2_500 });
    await runtime.initialize();
    const stops = [];
    for (let index = 0; index < 20; index += 1) stops.push(await runtime.stopRestartTest());
    const searching = runtime.snapshot();
    const terminated = await runtime.terminate('stop-gate');
    await new Promise(resolve => setTimeout(resolve, 250));
    return { stops, searching: { state: searching.state, maxWorkers: searching.maxWorkers },
      terminated: { state: terminated.state, workers: terminated.workers,
        cleanupAcknowledged: terminated.cleanupAcknowledged, forcedTerminations: terminated.forcedTerminations } };
  });
  expect(report.stops).toHaveLength(20);
  console.log(`LC0_LAB_20_STOPS ${JSON.stringify({ count: report.stops.length,
    latencyMs: report.stops.map(stop => stop.stopLatencyMs), searching: report.searching,
    terminated: report.terminated })}`);
  expect(report.stops.every(stop => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(stop.stoppedBestmove) &&
    /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(stop.restarted.bestmove))).toBe(true);
  expect(report.searching.state).toBe('READY');
  expect(report.terminated.state).toBe('TERMINATED');
  expect(report.terminated.cleanupAcknowledged).toBe(true);
  expect(report.terminated.workers).toBe(0);
  expect(report.terminated.forcedTerminations).toBe(0);
  await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
});

test('opt-in UCI trace locates the active stop boundary', async ({ page }) => {
  await openLab(page);
  const browserErrors = [];
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', error => browserErrors.push(error.message));
  const report = await page.evaluate(async () => {
    const events = [];
    const runtime = window.Lc0Lab.createRuntime({ timeoutMs: 2_500, testMode: 'trace-uci', onEvent: event => {
      if (event.type === 'uci-trace' || event.type === 'stdin' || event.type === 'worker-error' ||
          event.type === 'failure' || event.type === 'stderr' ||
          (event.type === 'stdout' && (/^bestmove|^info depth/.test(event.line)))) {
        events.push(event);
      }
    } });
    await runtime.initialize();
    let stopError = null;
    try { await runtime.stopRestartTest(); } catch (error) { stopError = error.message; }
    const before = runtime.snapshot();
    const after = await runtime.terminate('trace');
    return { events, stopError, before: { state: before.state, pthreadWorkers: before.pthreadWorkers },
      after: { cleanupAcknowledged: after.cleanupAcknowledged, pthreadWorkers: after.pthreadWorkers } };
  });
  console.log(`LC0_LAB_UCI_TRACE ${JSON.stringify({ events: report.events.filter(event =>
    event.type === 'uci-trace' || (event.type === 'stdout' && event.line.startsWith('bestmove '))),
    stopError: report.stopError, before: report.before, after: report.after, browserErrors })}`);
  expect(report.stopError).toBeNull();
  expect(report.after.cleanupAcknowledged).toBe(true);
  expect(report.after.pthreadWorkers).toBe(0);
  const stages = report.events.filter(event => event.type === 'uci-trace').map(event => event.stage);
  for (const stage of ['worker-receive', 'uci-dequeue', 'uci-loop-receive', 'search-begins',
    'search-stop-requested', 'bestmove-generated', 'bestmove-emitted', 'search-terminates',
    'uci-loop-exit', 'runtime-exit']) expect(stages).toContain(stage);
  const stopRequested = report.events.findIndex(event => event.stage === 'search-stop-requested');
  const emitted = report.events.findIndex(event => event.stage === 'bestmove-emitted');
  const loopStop = report.events.findIndex(event => event.stage === 'uci-loop-receive' && event.command === 'stop');
  expect(stopRequested).toBeLessThan(emitted);
  expect(emitted).toBeLessThan(loopStop);
});

test('twenty active-search lifecycle cycles cooperatively exit to worker baseline', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const cycles = [];
  for (let index = 0; index < 20; index += 1) {
    const cycle = await page.evaluate(async index => {
      const events = [];
      const runtime = window.Lc0Lab.createRuntime({ testMode: 'trace-uci', onEvent: event => {
        if (event.type === 'uci-trace' || event.type === 'failure' || event.type === 'stderr') events.push(event);
      } });
      await runtime.initialize();
      const stop = await runtime.stopRestartTest();
      const terminated = await runtime.terminate(`cycle-${index + 1}`);
      return { cycle: index + 1, stop, terminated, maxWorkers: runtime.maxWorkers,
        lastEvents: events.filter(event => event.type !== 'stderr').slice(-12),
        errors: events.filter(event => event.type === 'stderr').slice(-3) };
    }, index);
    console.log(`LC0_LAB_STRESS_CYCLE ${JSON.stringify({ cycle: cycle.cycle,
      stopLatencyMs: cycle.stop.stopLatencyMs, workers: cycle.terminated.workers,
      forced: cycle.terminated.forcedTerminations, cleanup: cycle.terminated.cleanupAcknowledged,
      terminateMs: cycle.terminated.timings.terminateMs, errors: cycle.errors })}`);
    expect(cycle.terminated.workers).toBe(0);
    expect(cycle.terminated.cleanupAcknowledged).toBe(true);
    expect(cycle.terminated.forcedTerminations).toBe(0);
    expect(cycle.stop.stoppedBestmove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
    cycles.push(cycle);
  }
  const summary = cycles.map(({ cycle, stop, terminated, maxWorkers }) => ({
    cycle,
    bestmove: stop.stoppedBestmove,
    stopLatencyMs: stop.stopLatencyMs,
    workers: terminated.workers,
    cleanupAcknowledged: terminated.cleanupAcknowledged,
    forcedTerminations: terminated.forcedTerminations,
    maxWorkers
  }));
  console.log(`LC0_LAB_CYCLES ${JSON.stringify(summary)}`);
  expect(cycles).toHaveLength(20);
});

test('rapid stop, duplicate stop, quit, teardown, and error races do not leave workers', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const results = await page.evaluate(async () => {
    const scenarios = ['immediate-stop', 'double-stop', 'stop-quit', 'go-quit',
      'isready-terminate', 'active-terminate', 'search-worker-error'];
    const results = [];
    for (const name of scenarios) {
      const runtime = window.Lc0Lab.createRuntime({ timeoutMs: 2_500 });
      await runtime.initialize();
      const start = runtime.lines.length;
      let error = null;
      if (name === 'isready-terminate') {
        runtime.send('isready');
        await runtime.terminate(name);
      } else {
        runtime.send('position startpos');
        runtime.send('go infinite');
        if (name === 'active-terminate') {
          await new Promise(resolve => setTimeout(resolve, 120));
          await runtime.terminate(name);
        } else if (name === 'search-worker-error') {
          await new Promise(resolve => setTimeout(resolve, 120));
          runtime.send('stop');
          try { await runtime.crash(); } catch (caught) { error = caught.message; }
          await runtime.terminate(name);
        } else {
          if (name !== 'go-quit') runtime.send('stop');
          if (name === 'double-stop') runtime.send('stop');
          if (name === 'stop-quit' || name === 'go-quit') runtime.send('quit');
          const line = await runtime.waitForLine(value => /^bestmove\s+\S+/.test(value),
            { start, timeout: 2_500 });
          if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(line.split(/\s+/)[1])) {
            throw new Error(`Invalid ${name} bestmove: ${line}`);
          }
          if (name === 'immediate-stop' || name === 'double-stop') {
            runtime.send('isready');
            await runtime.waitForLine(value => value === 'readyok',
              { start: runtime.lines.length, timeout: 2_500 });
          }
          await runtime.terminate(name);
        }
      }
      const lines = runtime.snapshot().lines.slice(start);
      results.push({ name, error, bestmoves: lines.filter(line => line.startsWith('bestmove ')).length,
        readyAfterTerminated: runtime.state === 'READY', ...{
          state: runtime.state, workers: runtime.workerCount(),
          cleanupAcknowledged: runtime.cleanupAcknowledged,
          forcedTerminations: runtime.forcedTerminations
        } });
    }
    return results;
  });
  console.log(`LC0_LAB_RACES ${JSON.stringify(results)}`);
  expect(results.every(result => result.state === 'TERMINATED' && result.workers === 0 &&
    !result.readyAfterTerminated)).toBe(true);
  for (const result of results) {
    if (['immediate-stop', 'double-stop', 'stop-quit', 'go-quit'].includes(result.name))
      expect(result.bestmoves).toBe(1);
    if (result.name !== 'search-worker-error') {
      expect(result.cleanupAcknowledged).toBe(true);
      expect(result.forcedTerminations).toBe(0);
    }
  }
  await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);

  await page.evaluate(async () => {
    const runtime = window.Lc0Lab.createRuntime();
    await runtime.initialize();
    runtime.send('position startpos');
    runtime.send('go infinite');
    window.Lc0Lab.teardownRaceRuntime = runtime;
  });
  await page.reload();
  await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
});

test('integrity, missing asset, runtime, UCI, ready, crash, and rapid termination failures close safely', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const results = await page.evaluate(async () => {
    async function failure(name, options, action = runtime => runtime.initialize()) {
      const runtime = window.Lc0Lab.createRuntime({ timeoutMs: 1_500, ...options });
      let message = null;
      try { await action(runtime); } catch (error) { message = error.message; }
      await runtime.terminate(`failure-${name}`).catch(() => {});
      return { name, message, snapshot: runtime.snapshot() };
    }
    const failures = [];
    failures.push(await failure('wrong-hash', { network: { sha256: '0'.repeat(64) } }));
    failures.push(await failure('missing-network', { network: { url: '/artifacts/network/missing.pb.gz' } }));
    failures.push(await failure('runtime-init', { testMode: 'runtime-failure' }));
    failures.push(await failure('uci-timeout', { testMode: 'uci-timeout' }));
    failures.push(await failure('ready-timeout', { testMode: 'ready-timeout' }));
    failures.push(await failure('worker-crash', {}, async runtime => { await runtime.initialize(); await runtime.crash(); }));

    const duringInit = window.Lc0Lab.createRuntime();
    const initializing = duringInit.initialize().catch(error => error.message);
    await new Promise(resolve => setTimeout(resolve, 10));
    await duringInit.terminate('during-initialization');
    await initializing;
    failures.push({ name: 'terminate-during-init', message: 'terminated', snapshot: duringInit.snapshot() });

    const rapid = [];
    for (let index = 0; index < 10; index += 1) {
      const runtime = window.Lc0Lab.createRuntime();
      const initializingNow = runtime.initialize().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 5));
      await runtime.terminate('rapid');
      await initializingNow;
      rapid.push(runtime.snapshot());
    }
    return { failures, rapid };
  });
  const remainingTargets = await dedicatedWorkerTargets(page);
  console.log(`LC0_LAB_FAILURES ${JSON.stringify({
    failures: results.failures.map(result => ({
      name: result.name,
      message: result.message,
      state: result.snapshot.state,
      workers: result.snapshot.workers,
      cleanupAcknowledged: result.snapshot.cleanupAcknowledged
    })),
    rapid: results.rapid.map(snapshot => ({ state: snapshot.state, workers: snapshot.workers })),
    remainingTargets
  })}`);
  expect(results.failures.every(result => result.message && result.snapshot.workers === 0)).toBe(true);
  expect(results.rapid.every(snapshot => snapshot.workers === 0)).toBe(true);
  await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
});
