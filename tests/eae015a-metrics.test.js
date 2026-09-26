import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crossSiteAllowed, idempotentCleanupResult, relayMetrics } from '../api/eae011.js';
import { RelayError } from '../experiments/lc0-preview-relay/durable-broker.mjs';

const names = metrics => metrics.map(item => item.metric);

test('relay metrics are aggregate-only and cover required success and failure signals', () => {
  const ready = relayMetrics({ action: 'message', messageType: 'READY', status: 202,
    latencyMs: 25, dbReads: 2, dbWrites: 3, activeSessions: 4 });
  assert.deepEqual(names(ready), [
    'relay_request', 'db_read', 'db_write', 'active_sessions', 'ready_success'
  ]);
  assert.equal(JSON.stringify(ready).includes('sessionId'), false);
  assert.equal(JSON.stringify(ready).includes('user'), false);

  const failure = names(relayMetrics({ action: 'message', messageType: 'ERROR',
    messageCode: 'NETWORK_HASH_INTEGRITY_FAILURE', status: 202, latencyMs: 10 }));
  assert.ok(failure.includes('network_hash_failure'));
  const worker = names(relayMetrics({ action: 'message', messageType: 'ERROR',
    messageCode: 'WORKER_CRASH', status: 202, latencyMs: 10 }));
  assert.ok(worker.includes('worker_crash'));

  const rejected = names(relayMetrics({ action: 'claim', status: 429,
    errorCode: 'CLAIM_RATE_LIMIT', latencyMs: 8 }));
  assert.ok(rejected.includes('claim_failure'));
  assert.ok(rejected.includes('rate_limit_reject'));

  assert.equal(names(relayMetrics({ action: 'inspect', status: 410,
    errorCode: 'SESSION_GONE', latencyMs: 4 })).includes('session_gone'), false);
  assert.equal(names(relayMetrics({ action: 'command', status: 410,
    errorCode: 'SESSION_GONE', latencyMs: 4 })).includes('session_gone'), true);
  const cleaned = names(relayMetrics({ action: 'message', messageType: 'CLEANUP',
    status: 200, latencyMs: 4 }));
  assert.ok(cleaned.includes('cleanup_success'));
  assert.equal(cleaned.includes('relay_error'), false);
});

test('a CLEANUP retry after row deletion returns bounded idempotent success', () => {
  assert.deepEqual(idempotentCleanupResult('message', 'CLEANUP',
    new RelayError('SESSION_GONE', 410)),
  { accepted: true, type: 'CLEANUP', status: 'ALREADY_CLEANED' });
  assert.equal(idempotentCleanupResult('inspect', 'CLEANUP',
    new RelayError('SESSION_GONE', 410)), null);
  assert.equal(idempotentCleanupResult('message', 'READY',
    new RelayError('SESSION_GONE', 410)), null);
});

test('metrics migration defines every required high-severity alert', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260923013000_eae015a_metrics_and_alerts.sql',
    import.meta.url), 'utf8');
  for (const alert of [
    'unexpected_session_gone', 'stop_timeout_spike', 'forced_termination_spike',
    'relay_error_spike', 'scheduled_cleanup_failure', 'active_growth_without_cleanup'
  ]) assert.match(sql, new RegExp(`'${alert}'`));
  assert.match(sql, /security invoker/gi);
  assert.match(sql, /revoke all on public\.eae015a_metric_minutes from public, anon, authenticated/i);
});

test('production-shaped relay accepts cross-site browser metadata only for exact configured origins', () => {
  const pair = { productionShape: true, main: 'https://main.example.vercel.app',
    engine: 'https://engine.example.vercel.app' };
  assert.equal(crossSiteAllowed('cross-site', pair.main, pair), true);
  assert.equal(crossSiteAllowed('cross-site', pair.engine, pair), true);
  assert.equal(crossSiteAllowed('cross-site', 'https://evil.example', pair), false);
  assert.equal(crossSiteAllowed('cross-site', pair.main, { ...pair, productionShape: false }), false);
  assert.equal(crossSiteAllowed('same-origin', 'https://evil.example', pair), true);
});
