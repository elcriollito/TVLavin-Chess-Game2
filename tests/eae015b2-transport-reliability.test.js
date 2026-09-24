import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const engineClient = fs.readFileSync(new URL(
  '../experiments/lc0-preview-relay/engine/client-source.js', import.meta.url), 'utf8');
const arena = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');
const relayApi = fs.readFileSync(new URL('../api/eae011.js', import.meta.url), 'utf8');
const livePreview = fs.readFileSync(new URL(
  '../experiments/lc0-arena-preview/tests/live-preview.mjs', import.meta.url), 'utf8');
const tournamentPreview = fs.readFileSync(new URL(
  '../experiments/lc0-arena-preview/tests/tournament-preview.mjs', import.meta.url), 'utf8');

test('isolated runtime retries transport within the certified lease window', () => {
  assert.match(engineClient, /TRANSPORT_RECONNECT_MS = 20_000/);
  assert.match(engineClient, /while \(!this\.closed && !this\.intentionalDisconnect && performance\.now\(\) < deadline\)/);
  assert.match(engineClient, /RECONNECT_SEARCH_MISMATCH/);
  assert.match(engineClient, /this\.seq = state\.lastEngineSeq;\s*await this\.connect\(\)/);
  assert.doesNotMatch(engineClient, /this\.runtime\.send\(['"]go/);
});

test('isolated runtime reconciles uncertain engine-event delivery before advancing sequence', () => {
  assert.match(engineClient, /ENGINE_MESSAGE_RETRY_MS = TRANSPORT_RECONNECT_MS/);
  assert.match(engineClient, /state\?\.lastEngineSeq === payload\.seq/);
  assert.match(engineClient, /state\.lastEngineSeq !== payload\.seq - 1/);
  assert.match(engineClient, /OUTBOUND_RECONCILED/);
  assert.match(engineClient, /OUTBOUND_RETRY/);
  assert.match(engineClient, /body: payload/);
});

test('transport expiry performs STOP then cooperative local termination without broker claims', () => {
  assert.match(engineClient, /async localFailsafeCleanup\(reason\)/);
  assert.match(engineClient, /this\.runtime\.send\('stop'\)/);
  assert.match(engineClient, /await this\.runtime\.waitForLine/);
  assert.match(engineClient, /await this\.runtime\.terminate\(reason\)/);
  assert.match(engineClient, /localCleanupObserved/);
  assert.match(engineClient, /brokerCleanupAcknowledged = false/);
  assert.match(engineClient, /forcedTerminations/);
});

test('Arena errors and stale callbacks have deterministic reason telemetry', () => {
  for (const code of [
    'ARENA_ERROR_STALE_SEARCH', 'ARENA_ERROR_RUNTIME_STATE',
    'ARENA_ERROR_DUPLICATE_SEARCH', 'ARENA_ERROR_NEXT_SEARCH_START',
    'ARENA_ERROR_ILLEGAL_BESTMOVE', 'ARENA_ERROR_SEARCH_TIMEOUT'
  ]) assert.match(arena, new RegExp(code));
  assert.match(arena, /arenaErrorsByReason/);
  assert.match(arena, /staleBestmovesIgnored/);
  assert.match(arena, /duplicateBestmovesIgnored/);
});

test('move telemetry is emitted only from the move application path', () => {
  const destroy = arena.slice(arena.indexOf('destroyEngines()'),
    arena.indexOf('captureLifecycleTrace(event'));
  const playMove = arena.slice(arena.indexOf('playUciMove(uciMove'),
    arena.indexOf('/**\n     * Main engine loop'));
  assert.doesNotMatch(destroy, /MOVE_APPLIED|uciMove|isWhiteTurn/);
  assert.match(playMove, /captureLifecycleTrace\('MOVE_APPLIED'/);
});

test('SSE delivery rewinds to the durable ACK cursor after a silent socket gap', () => {
  assert.match(relayApi, /acknowledgedCursor >= currentCursor/);
  assert.match(relayApi, /currentCursor = next\.acknowledgedCursor/);
  assert.match(relayApi, /claim_command keeps execution exactly-once/);
});

test('main adapter recovers lifecycle events from durable state after a selective SSE gap', () => {
  const adapter = fs.readFileSync(new URL(
    '../experiments/lc0-arena-preview/isolated-browser-runtime-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /waitEventOrDurable/);
  assert.match(adapter, /DURABLE_EVENT_RECOVERED/);
  for (const event of ['ACK_', 'READY', 'REUSE_READY', 'STOPPED', 'CLEANUP'])
    assert.match(adapter, new RegExp(event));
});

test('suspended command requests reconcile durable sequence state before any retry', () => {
  const adapter = fs.readFileSync(new URL(
    '../experiments/lc0-arena-preview/isolated-browser-runtime-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /reconcileCommandDelivery/);
  assert.match(adapter, /state\.lastCommandSeq === command\.seq/);
  assert.match(adapter, /state\.lastCommandSeq === command\.seq - 1 && !state\.pending && retryAllowed/);
  assert.match(adapter, /lost first response can race this retry/);
  assert.match(adapter, /await this\.waitForTransportConnected\(\)/);
  assert.match(adapter, /!\['STOP', 'QUIT'\]\.includes\(type\)\)\s*await this\.waitForTransportConnected\(\)/);
  assert.match(adapter, /COMMAND_ACK_TIMEOUT_MS = TRANSPORT_RECONNECT_MS \+ 2_000/);
  assert.match(adapter, /from, COMMAND_ACK_TIMEOUT_MS, `ACK_\$\{type\}`/);
});

test('remote async runtime readiness has a bounded production-network allowance', () => {
  assert.match(arena, /engine\.asyncLifecycle \? 15000 : 5000/);
  assert.match(arena, /engine\.asyncLifecycle \? 30000 : ARENA_ENGINE_TIMEOUT_MS/);
  assert.match(arena, /String\(error\?\.code \|\| error\?\.message \|\| ''\)\.toUpperCase\(\)/);
});

test('Lc0 cold startup has a distinct bounded allowance and reports backend timing', () => {
  const runtime = fs.readFileSync(new URL(
    '../experiments/lc0-browser-lab/src/lab-runtime.js', import.meta.url), 'utf8');
  const adapter = fs.readFileSync(new URL(
    '../experiments/lc0-arena-preview/isolated-browser-runtime-adapter.js', import.meta.url), 'utf8');
  assert.match(engineClient, /startupTimeoutMs: 60_000/);
  assert.match(runtime, /timeout: this\.startupTimeoutMs/);
  assert.match(runtime, /this\.timings\.backendSessionMs/);
  assert.match(adapter, /from, 75_000, 'READY'/);
  assert.match(livePreview, /PAUSE_SETTLE_TIMEOUT_MS = 30_000/);
  assert.match(livePreview, /BROKER_EXPIRY_TIMEOUT_MS = 70_000/);
  assert.match(tournamentPreview, /PAUSE_SETTLE_TIMEOUT_MS = 30_000/);
});
