import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = new URL('../', import.meta.url);

async function reservePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(child, origin) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('HQA server exited before becoming ready');
    try {
      const response = await fetch(`${origin}/opening-database`);
      if (response.status === 200) return;
    } catch {
      // The child is still binding its socket.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for the HQA server');
}

test('mobile HQA server mirrors the canonical Opening Database rewrite', async t => {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/start-mobile-hqa-server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      CAISSA_SERVER_HOST: '127.0.0.1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2_000))]);
    }
  });

  await waitForServer(child, origin);

  const manifestResponse = await fetch(`${origin}/openingdb/manifest.json`);
  assert.equal(manifestResponse.status, 200);
  assert.equal(manifestResponse.headers.get('x-caissa-local-proxy'), 'openingdb');
  const manifest = await manifestResponse.json();
  assert.equal(manifest.activeVersion, 'v3_p60');
  assert.match(manifest.baseUrl, /^https:\/\/downloads\.caissa-chess\.org\/openingdb\/shards\/v3_p60$/);

  const shardResponse = await fetch(`${origin}/openingdb/shards/${manifest.activeVersion}/66.json`, { method: 'HEAD' });
  assert.equal(shardResponse.status, 200);
  assert.equal(shardResponse.headers.get('x-caissa-local-proxy'), 'openingdb');
  assert.equal(shardResponse.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.match(shardResponse.headers.get('cache-control') || '', /immutable/);

  const rejected = await fetch(`${origin}/openingdb/manifest.json`, { method: 'POST' });
  assert.equal(rejected.status, 405);
});
