import { test, expect } from '@playwright/test';

const SF18 = Object.freeze({
  id: 'stockfish-18-lite',
  worker: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js',
  wasm: '/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm',
  name: 'Stockfish 18 Lite WASM'
});
const SF19 = Object.freeze({
  id: 'stockfish-19-lite',
  worker: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js',
  wasm: '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm',
  name: 'Stockfish 19 Lite WASM'
});

async function openHarnessPage(page) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    const seed = await page.request.get('/favicon-test.html', { headers: {
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true'
    } });
    expect(seed.status()).toBe(200);
  }
  await page.goto('/favicon-test.html');
}

async function runDirectWorker(page, engine) {
  const responses = [];
  const onResponse = response => {
    const pathname = new URL(response.url()).pathname;
    if (pathname === engine.worker || pathname === engine.wasm) {
      responses.push({
        pathname,
        status: response.status(),
        contentType: response.headers()['content-type'] || '',
        csp: response.headers()['content-security-policy'] || ''
      });
    }
  };
  page.on('response', onResponse);
  const result = await page.evaluate(async ({ worker, expectedName }) => {
    const trace = [];
    const startedAt = performance.now();
    const stamp = (event, detail = null) => trace.push({
      event,
      atMs: Number((performance.now() - startedAt).toFixed(3)),
      detail
    });
    stamp('provider-selected');
    return new Promise(resolve => {
      const instance = new Worker(worker);
      let name = null;
      let author = null;
      stamp('worker-constructed');
      instance.onerror = event => {
        stamp('worker-error', event.message || 'Worker error');
        instance.terminate();
        resolve({ ready: false, name, author, trace });
      };
      instance.onmessageerror = () => {
        stamp('worker-message-error');
        instance.terminate();
        resolve({ ready: false, name, author, trace });
      };
      instance.onmessage = event => {
        const line = String(event.data?.data ?? event.data);
        if (line.startsWith('id name ')) {
          name = line.slice('id name '.length).trim();
          stamp('id-name', name);
        } else if (line.startsWith('id author ')) {
          author = line.slice('id author '.length).trim();
          stamp('id-author', author);
        } else if (line.trim() === 'uciok') {
          stamp('uciok');
          if (name !== expectedName || !author) {
            instance.terminate();
            resolve({ ready: false, name, author, trace, identityMismatch: true });
            return;
          }
          stamp('identity-accepted');
          instance.postMessage('isready');
          stamp('isready-sent');
        } else if (line.trim() === 'readyok') {
          stamp('readyok');
          stamp('provider-ready');
          instance.postMessage('quit');
          instance.terminate();
          resolve({ ready: true, name, author, trace });
        }
      };
      instance.postMessage('uci');
      stamp('uci-sent');
    });
  }, { worker: engine.worker, expectedName: engine.name });
  page.off('response', onResponse);
  return { ...result, responses };
}

test('SF18 and SF19 direct workers complete truthful UCI readiness', async ({ page }) => {
  await openHarnessPage(page);

  for (const engine of [SF18, SF19]) {
    const result = await runDirectWorker(page, engine);
    expect(result.ready, `${engine.id} trace: ${JSON.stringify(result.trace)}`).toBe(true);
    expect(result.name).toBe(engine.name);
    expect(result.author).toBe('the Stockfish developers (see AUTHORS file)');
    expect(result.trace.map(item => item.event)).toEqual([
      'provider-selected', 'worker-constructed', 'uci-sent', 'id-name', 'id-author',
      'uciok', 'identity-accepted', 'isready-sent', 'readyok', 'provider-ready'
    ]);
    expect(result.responses.find(item => item.pathname === engine.worker)?.status).toBe(200);
    expect(result.responses.find(item => item.pathname === engine.wasm)).toMatchObject({
      status: 200,
      contentType: expect.stringContaining('application/wasm')
    });
  }
});

test('SF19 worker response grants only the scoped WASM compilation capability', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'Deployed response headers are certified on immutable preview');
  await openHarnessPage(page);
  const result = await runDirectWorker(page, SF19);
  const workerResponse = result.responses.find(item => item.pathname === SF19.worker);

  expect(result.ready).toBe(true);
  expect(workerResponse?.csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(workerResponse?.csp).not.toMatch(/(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
});
