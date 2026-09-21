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
  console.log(`LC0_LAB_PRIMARY ${JSON.stringify(report)}`);
});

test('active infinite search does not honor stop but forced termination still reaches worker baseline', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const report = await page.evaluate(async () => {
    const runtime = window.Lc0Lab.createRuntime({ timeoutMs: 2_500 });
    await runtime.initialize();
    let stopError = null;
    try { await runtime.stopRestartTest(); } catch (error) { stopError = error.message; }
    const searching = runtime.snapshot();
    const terminated = await runtime.terminate('failed-stop-gate');
    await new Promise(resolve => setTimeout(resolve, 250));
    return { stopError, searching, terminated };
  });
  expect(report.stopError).toMatch(/Timed out waiting for UCI output/);
  expect(report.searching.state).toBe('SEARCHING');
  expect(report.terminated.state).toBe('TERMINATED');
  expect(report.terminated.cleanupAcknowledged).toBe(false);
  expect(report.terminated.pthreadWorkers).toBeGreaterThan(0);
  await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
  console.log(`LC0_LAB_STOP_GATE ${JSON.stringify(report)}`);
});

test('ten complete lifecycle cycles acknowledge cleanup and return to the worker baseline', async ({ page }) => {
  await openLab(page);
  const baselineWorkers = await dedicatedWorkerCount(page);
  const cycles = [];
  for (let index = 0; index < 10; index += 1) {
    const cycle = await page.evaluate(async index => {
      const runtime = window.Lc0Lab.createRuntime();
      await runtime.initialize();
      const move = await runtime.startPositionTest();
      const terminated = await runtime.terminate(`cycle-${index + 1}`);
      return { cycle: index + 1, move, terminated, maxWorkers: runtime.maxWorkers };
    }, index);
    expect(cycle.terminated.workers).toBe(0);
    expect(cycle.terminated.cleanupAcknowledged).toBe(true);
    await expect.poll(() => dedicatedWorkerCount(page)).toBe(baselineWorkers);
    cycles.push(cycle);
  }
  const summary = cycles.map(({ cycle, move, terminated, maxWorkers }) => ({
    cycle,
    bestmove: move.bestmove,
    latencyMs: move.latencyMs,
    workers: terminated.workers,
    cleanupAcknowledged: terminated.cleanupAcknowledged,
    maxWorkers
  }));
  console.log(`LC0_LAB_CYCLES ${JSON.stringify(summary)}`);
  expect(cycles).toHaveLength(10);
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
