import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const engineClient = fs.readFileSync(new URL(
  '../experiments/lc0-preview-relay/engine/client-source.js', import.meta.url), 'utf8');
const arena = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');

test('isolated runtime retries transport within the certified lease window', () => {
  assert.match(engineClient, /TRANSPORT_RECONNECT_MS = 20_000/);
  assert.match(engineClient, /while \(!this\.closed && !this\.intentionalDisconnect && performance\.now\(\) < deadline\)/);
  assert.match(engineClient, /RECONNECT_SEARCH_MISMATCH/);
  assert.match(engineClient, /this\.seq = state\.lastEngineSeq;\s*await this\.connect\(\)/);
  assert.doesNotMatch(engineClient, /this\.runtime\.send\(['"]go/);
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
