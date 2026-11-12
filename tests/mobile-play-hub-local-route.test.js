import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';

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
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics += chunk; });
  child.stderr.on('data', chunk => { diagnostics += chunk; });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`HQA server exited before becoming ready:\n${diagnostics}`);
    }
    try {
      const response = await fetch(`${origin}/play-hub`);
      if (response.status === 200) return;
    } catch {
      // The child is still binding its socket.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for HQA server:\n${diagnostics}`);
}

test('route-aware mobile HQA server serves Play Hub and all four destinations', async t => {
  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/start-mobile-hqa-server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      CAISSA_SERVER_HOST: '127.0.0.1',
      CAISSA_PLAY_V2_BETA_STAGE: 'public-beta'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        once(child, 'exit'),
        new Promise(resolve => setTimeout(resolve, 2_000))
      ]);
    }
  });

  await waitForServer(child, origin);

  const canonical = await fetch(`${origin}/play-hub`);
  const trailingSlash = await fetch(`${origin}/play-hub/`);
  const directFile = await fetch(`${origin}/play-hub.html`);
  assert.equal(canonical.status, 200);
  assert.equal(trailingSlash.status, 200);
  assert.equal(directFile.status, 200);
  assert.equal(await canonical.text(), await directFile.text());
  assert.match(await trailingSlash.text(), /data-play-hub-destination="play"/);

  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /data-mobile-destination="play"[^>]+href="\/play-hub"/);

  for (const route of ['/play/games', '/online', '/play-online/playchess', '/fics']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, route);
  }
});

test('local launchers require the route-aware server instead of a literal static server', () => {
  const batch = fs.readFileSync(new URL('../START_SERVER.bat', import.meta.url), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(batch, /python\s+-m\s+(?:SimpleHTTPServer|http\.server)|http-server|\bserve\s+-p/i);
  assert.match(batch, /node server\.js/);
  assert.equal(packageJson.scripts['start:mobile-hqa'], 'node scripts/start-mobile-hqa-server.mjs');
});
