import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import downloadsWorker, { verifyDownloadCapability } from '../downloads-worker/worker.js';
import gameFetcher, { parseBoundedInteger } from '../cloudflare-worker/worker.js';
import statsWorker, { clearShardCacheForTest, shardCacheSnapshotForTest } from '../worker/stats-worker.js';
import { BUILD_LIMITS, buildPolyglotBookFromPgn } from '../api/_lib/polyglot-builder.js';
import { createInferenceAdmissionController, createScannerPublicRecognitionService } from '../api/_lib/scanner-public-recognition-service.js';

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function capability(secret, claims) {
  const payload = base64Url(JSON.stringify(claims));
  const signed = `v1.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signed).digest('base64url');
  return `${signed}.${signature}`;
}

function response() {
  return {
    statusCode: null, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

test('download elevation ignores client tier claims and accepts only a short-lived signed capability', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../downloads-worker/worker.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(source, /x-caissa-tier|searchParams\.get\('tier'\)|function getTier/);
  const now = Math.floor(Date.now() / 1000);
  assert.equal(await verifyDownloadCapability('v1.payload.forged', 'secret', now), null);
  const token = capability('secret', {
    aud: 'caissa-downloads', scope: 'openingdb:games:download', exp: now + 120,
    maxGames: 75, maxBytes: 20 * 1024 * 1024
  });
  assert.deepEqual(await verifyDownloadCapability(token, 'secret', now), {
    tier: 'premium', gameLimit: 75, byteLimit: 20 * 1024 * 1024
  });
  assert.equal(await verifyDownloadCapability(token, 'wrong-secret', now), null);

  const ids = Array.from({ length: 30 }, (_, index) => `game-${index}`);
  const bucket = { async get(key) {
    if (key.endsWith('/shards/aa.json')) return { async json() { return { aaaaaaaaaaaaaaaa: ids }; } };
    return null;
  } };
  const responseValue = await downloadsWorker.fetch(new Request('https://downloads.test/openingdb/games/v1/download?tier=premium', {
    method: 'POST',
    headers: { Origin: 'https://caissa-chess.org', 'Content-Type': 'application/json', 'X-Caissa-Tier': 'premium' },
    body: JSON.stringify({ fenHash: 'aaaaaaaaaaaaaaaa', limit: 200 })
  }), { OPENINGDB_BUCKET: bucket });
  const body = await responseValue.json();
  assert.equal(body.tier, 'free');
  assert.equal(body.maxAllowed, 10);
  assert.equal(body.count, 10);
});

test('game and opening-book max parameters reject NaN, fractions, overflow, and negative values', async () => {
  for (const value of ['NaN', '1.5', '-1', '51', '999999999999999999999']) {
    assert.equal(parseBoundedInteger(value, { defaultValue: 20, maximum: 50 }), null);
  }
  assert.equal(parseBoundedInteger(null, { defaultValue: 20, maximum: 50 }), 20);
  assert.equal(parseBoundedInteger('50', { defaultValue: 20, maximum: 50 }), 50);
  const result = await gameFetcher.fetch(new Request('https://worker.test/api/games?username=test&max=NaN', {
    headers: { Origin: 'https://caissa-chess.org', 'CF-Connecting-IP': '192.0.2.41' }
  }), {});
  assert.equal(result.status, 400);
  assert.match((await result.json()).message, /integer from 1 to 50/);
});

test('position shard cache enforces object and aggregate bounds with LRU eviction', async () => {
  clearShardCacheForTest();
  const payload = Buffer.from(JSON.stringify({ entries: {} }));
  const bucket = {
    async get() { return { size: payload.length, async arrayBuffer() { return payload; } }; }
  };
  for (let index = 0; index < 12; index += 1) {
    const shard = index.toString(16).padStart(2, '0');
    const responseValue = await statsWorker.fetch(new Request(`https://stats.test/api/pos-stats?key=${shard}00000000000000`), { POS_STATS_BUCKET: bucket });
    assert.equal(responseValue.status, 200);
  }
  assert.equal(shardCacheSnapshotForTest().length, 8);

  clearShardCacheForTest();
  const oversized = { async get() { return { size: 9 * 1024 * 1024, async arrayBuffer() { throw new Error('must not read'); } }; } };
  const rejected = await statsWorker.fetch(new Request('https://stats.test/api/pos-stats?key=aa00000000000000'), { POS_STATS_BUCKET: oversized });
  assert.equal(rejected.status, 503);
});

test('a timed-out Scanner inference holds its admission slot until underlying work settles', async () => {
  let finish;
  const blocked = new Promise(resolve => { finish = resolve; });
  const admission = createInferenceAdmissionController(1);
  const service = createScannerPublicRecognitionService({
    env: { CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta' },
    authenticate: async () => ({ authenticated: false }),
    rateLimit: () => ({ allowed: true, remaining: 3 }),
    infer: async () => blocked,
    admission,
    timeoutMs: 5,
    log: () => {}
  });
  const req = { method: 'POST', headers: { host: 'caissa.test', origin: 'https://caissa.test', 'content-type': 'application/json' }, body: {} };
  const first = response();
  await service.recognize(req, first);
  assert.equal(first.statusCode, 504);
  assert.equal(admission.snapshot().active, 1);
  const second = response();
  await service.recognize(req, second);
  assert.equal(second.statusCode, 503);
  assert.equal(second.body.error, 'INFERENCE_OVERLOADED');
  finish({ metrics: {}, response: {} });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(admission.snapshot().active, 0);
});

test('Polyglot builder rejects game-count amplification before parsing games', () => {
  const game = '[Event "Bound"]\n\n1. e4 e5 *';
  const input = Array.from({ length: BUILD_LIMITS.games + 1 }, () => game).join('\n');
  assert.throws(() => buildPolyglotBookFromPgn(input), /game limit exceeded/);
});

test('downloads worker exports a callable Worker entry point', () => {
  assert.equal(typeof downloadsWorker.fetch, 'function');
});

