import { expect, test } from '@playwright/test';

const mainOrigin = 'http://127.0.0.1:8791';
const isolatedOrigin = 'http://127.0.0.1:8792';
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 100) / 100;
};

async function openPair(context) {
  const main = await context.newPage();
  const engine = await context.newPage();
  await main.goto(mainOrigin);
  return { main, engine };
}

async function claim(main, engine, label) {
  const session = await main.evaluate(label => window.Eae010Main.create(label), label);
  await engine.goto('about:blank');
  await engine.goto(`${isolatedOrigin}/#${new URLSearchParams({ session: session.sessionId,
    claim: session.claimToken })}`);
  await expect(engine.locator('#status')).toContainText('Claimed');
  await expect(engine).toHaveURL(`${isolatedOrigin}/`);
  return session;
}

test('distinct origins, isolation and strict Origin/CORS policies', async ({ context }) => {
  const { main, engine } = await openPair(context);
  await engine.goto(isolatedOrigin);
  const mainState = await main.evaluate(() => ({ origin: location.origin,
    isolated: crossOriginIsolated }));
  const engineState = await engine.evaluate(() => ({ origin: location.origin,
    isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer === 'function' }));
  expect(mainState).toEqual({ origin: mainOrigin, isolated: false });
  expect(engineState).toEqual({ origin: isolatedOrigin, isolated: true, sab: true });
  const mainHeaders = await fetch(mainOrigin).then(response => response.headers);
  const engineHeaders = await fetch(isolatedOrigin).then(response => response.headers);
  expect(mainHeaders.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
  expect(mainHeaders.get('cross-origin-embedder-policy')).toBeNull();
  expect(engineHeaders.get('cross-origin-opener-policy')).toBe('same-origin');
  expect(engineHeaders.get('cross-origin-embedder-policy')).toBe('require-corp');
  const rejected = await fetch(`${mainOrigin}/api/session`, { method: 'POST',
    headers: { Origin: 'http://evil.invalid', 'Content-Type': 'application/json',
      'X-Test-User': 'test-user-attacker' },
    body: JSON.stringify({ userId: 'test-user-attacker', competitionId: 'evil', participantRole: 'white' }) });
  expect(rejected.status).toBe(403);
  expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  const crossFetch = await engine.evaluate(async url => {
    try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{}' }); return 'unexpected-success'; }
    catch (error) { return error.name; }
  }, `${mainOrigin}/api/session`);
  expect(crossFetch).toBe('TypeError');
});

test('isolated popup has no opener relationship', async ({ context }) => {
  const { main } = await openPair(context);
  await main.evaluate(() => window.Eae010Main.create('popup-opener-check'));
  const popupEvent = context.waitForEvent('page');
  await main.evaluate(() => window.Eae010Main.openIsolated());
  const popup = await popupEvent;
  await expect(popup).toHaveURL(`${isolatedOrigin}/`);
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  expect(await popup.evaluate(() => crossOriginIsolated)).toBe(true);
});

test('twenty real-browser two-origin relay cycles pass the Tournament gate and yield local latency samples', async ({ context }) => {
  const { main, engine } = await openPair(context);
  const samples = { commandAcceptMs: [], ackRttMs: [], infoPropagationMs: [],
    stopToBestmoveMs: [], bestmovePropagationMs: [], quitToCleanupMs: [] };
  for (let index = 0; index < 20; index++) {
    await claim(main, engine, `browser-cycle-${index}`);
    const gate = await main.evaluate(() => window.Eae010Main.runSequence());
    expect(gate.advanceAllowed).toBe(true);
    const result = await main.evaluate(() => {
      const client = window.Eae010Main;
      const event = (type, command) => client.events.find(item => item.type === type &&
        (!command || item.command === command));
      const ack = command => event('ACK', command);
      const bestmove = event('BESTMOVE');
      const cleanup = event('CLEANUP');
      const info = event('INFO');
      return {
        types: client.events.map(item => item.type),
        commandAcceptMs: [...client.acceptanceMs.values()],
        ackRttMs: [...client.sentAt].map(([seq, at]) => {
          const message = client.events.find(item => item.type === 'ACK' && item.seq === seq);
          return message ? message.at - at : null;
        }).filter(value => value !== null),
        infoPropagationMs: info.receivedEpoch - info.emittedAt,
        stopToBestmoveMs: bestmove.at - client.sentAt.get(ack('STOP').seq),
        bestmovePropagationMs: bestmove.receivedEpoch - bestmove.emittedAt,
        quitToCleanupMs: cleanup.at - client.sentAt.get(ack('QUIT').seq)
      };
    });
    const highPriority = result.types.filter(type => type !== 'INFO');
    expect(highPriority).toEqual(['ACK', 'READY', 'ACK', 'ACK', 'ACK',
      'BESTMOVE', 'STOPPED', 'ACK', 'CLEANUP']);
    expect(result.types).toContain('INFO');
    expect(result.ackRttMs).toHaveLength(5);
    for (const key of Object.keys(samples)) {
      const values = Array.isArray(result[key]) ? result[key] : [result[key]];
      samples[key].push(...values);
    }
    await expect.poll(async () => (await fetch(`${mainOrigin}/health`).then(response => response.json())).activeSessions)
      .toBe(0);
  }
  const summary = Object.fromEntries(Object.entries(samples).map(([key, values]) =>
    [key, { count: values.length, medianMs: percentile(values, 0.5), p95Ms: percentile(values, 0.95) }]));
  console.log(`EAE010_LOCAL_LATENCY ${JSON.stringify(summary)}`);
  expect(samples.stopToBestmoveMs.every(value => value < 2_500)).toBe(true);
  expect(samples.quitToCleanupMs.every(value => value < 2_500)).toBe(true);
});

test('disconnect/reconnect lease and main reload fail closed', async ({ context }) => {
  const { main, engine } = await openPair(context);
  const session = await claim(main, engine, 'browser-reconnect');
  await engine.evaluate(() => window.Eae010Engine.disconnect());
  await expect.poll(() => main.evaluate(() => window.Eae010Main.events.some(event =>
    event.type === 'ERROR' && event.code === 'ENGINE_DISCONNECTED'))).toBe(true);
  await engine.evaluate(() => window.Eae010Engine.reconnect());
  await expect(engine.locator('#status')).toHaveText('RECONNECTED');
  await main.evaluate(() => window.Eae010Main.sendAndAck('HELLO'));
  await expect.poll(() => main.evaluate(() => window.Eae010Main.events.some(event => event.type === 'READY')))
    .toBe(true);
  await main.reload();
  await expect.poll(async () => (await fetch(`${mainOrigin}/health`).then(response => response.json())).activeSessions)
    .toBe(0);
  const old = await fetch(`${mainOrigin}/api/session/${session.sessionId}/command`, { method: 'POST',
    headers: { Origin: mainOrigin, Authorization: `Bearer ${session.arenaCredential}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'POSITION', seq: 2, fen: 'startpos' }) });
  expect(old.status).toBe(410);
});

test('INFO flood cannot starve STOP and late engine messages fail after cleanup', async ({ context }) => {
  const { main, engine } = await openPair(context);
  const session = await claim(main, engine, 'browser-flood');
  await main.evaluate(async () => {
    const client = window.Eae010Main;
    await client.sendAndAck('HELLO');
    await client.waitFor(event => event.type === 'READY', 3_000, 0);
    await client.sendAndAck('POSITION', { fen: 'startpos' });
    await client.sendAndAck('GO');
  });
  const initialFlood = await engine.evaluate(async () => Promise.all(Array.from({ length: 40 }, (_, index) =>
    window.Eae010Engine.message({ type: 'INFO', depth: index + 1, pv: 'e2e4', score: index,
      emittedAt: Date.now() }).then(() => true, () => false))));
  expect(initialFlood.some(Boolean)).toBe(true);
  const flood = engine.evaluate(async () => Promise.all(Array.from({ length: 80 }, (_, index) =>
    window.Eae010Engine.message({ type: 'INFO', depth: index + 1, pv: 'e2e4', score: index,
      emittedAt: Date.now() }).then(() => true, () => false))));
  const stop = await main.evaluate(async () => {
    const client = window.Eae010Main;
    const started = performance.now();
    const seq = await client.sendAndAck('STOP');
    const best = await client.waitFor(event => event.type === 'BESTMOVE', 3_000, 0);
    return { seq, bestmove: best.move, elapsedMs: performance.now() - started };
  });
  const results = await flood;
  expect(results.length).toBe(80);
  expect(stop.bestmove).toBe('e2e4');
  expect(stop.elapsedMs).toBeLessThan(2_500);
  await main.evaluate(async () => {
    const client = window.Eae010Main;
    await client.waitFor(event => event.type === 'STOPPED', 3_000, 0);
    await client.sendAndAck('QUIT');
    await client.waitFor(event => event.type === 'CLEANUP', 3_000, 0);
    await client.advance();
    await client.terminate();
  });
  const late = await fetch(`${isolatedOrigin}/api/session/${session.sessionId}/message`, { method: 'POST',
    headers: { Origin: isolatedOrigin, Authorization: `Bearer ${await engine.evaluate(() => window.Eae010Engine.credential)}`,
      'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'BESTMOVE', move: 'd2d4' }) });
  expect(late.status).toBe(410);
  const metrics = await fetch(`${mainOrigin}/api/metrics`).then(response => response.json());
  expect(metrics.coalescedInfo).toBeGreaterThan(0);
  expect(metrics.activeSessions).toBe(0);
});
