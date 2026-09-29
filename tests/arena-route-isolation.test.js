import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');

function loadArenaController(pathname) {
  let onDomContentLoaded;
  const document = {
    readyState: 'loading',
    addEventListener(type, callback) {
      if (type === 'DOMContentLoaded') onDomContentLoaded = callback;
    }
  };
  const location = { pathname };
  const window = {
    location,
    addEventListener() {},
    dispatchEvent() {}
  };
  class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  vm.runInNewContext(source, {
    window,
    document,
    location,
    CustomEvent,
    console,
    performance,
    crypto,
    setTimeout,
    clearTimeout
  }, { filename: 'js/caissa-arena.js' });

  assert.equal(typeof onDomContentLoaded, 'function');
  return { window, initializeArena: onDomContentLoaded };
}

for (const pathname of ['/play', '/play/games', '/play/bots', '/play/coach', '/analyze', '/fics']) {
  test(`Arena bootstrap is inert on ${pathname}`, async () => {
    const { window, initializeArena } = loadArenaController(pathname);
    let initCalls = 0;
    window.CaissaArena.init = () => { initCalls += 1; };

    await assert.doesNotReject(initializeArena());
    assert.equal(initCalls, 0);
  });
}

test('Arena bootstrap still initializes Arena and prepares rollout on /arena', async () => {
  const { window, initializeArena } = loadArenaController('/arena');
  let initCalls = 0;
  let rolloutCalls = 0;
  window.CaissaArena.init = () => { initCalls += 1; };
  window.CaissaArenaRollout = { prepare: () => { rolloutCalls += 1; } };

  await initializeArena();

  assert.equal(initCalls, 1);
  assert.equal(rolloutCalls, 1);
});
