import test from 'node:test';
import assert from 'node:assert/strict';
import { createBetaCenterHandler } from '../api/beta/page.js';
import { createScannerBetaPageHandler } from '../api/beta/scanner.js';
import { renderBetaCenter } from '../api/_lib/beta-center-document.js';

function response() {
  return { statusCode: 200, headers: {}, body: '', setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; }, send(body = '') { this.body = body; return this; },
    json(body) { this.body = JSON.stringify(body); return this; }, end(body = '') { this.body = body; return this; } };
}

const scanner = { id: 'scanner', displayName: 'CAISSA Scanner', description: 'Scan chess positions.',
  stage: 'internal-beta', route: '/scanner/beta' };

test('anonymous Beta Center request redirects to sign in with a safe return path', async () => {
  const handler = createBetaCenterHandler({ service: { async listForRequest() { return { ok: false, authenticated: false, status: 401 }; } } });
  const res = response();
  await handler({ method: 'GET', url: '/beta', headers: {} }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, '/signin?redirect_url=%2Fbeta');
  assert.match(res.headers['X-Robots-Tag'], /noindex/);
});

test('authenticated non-beta account is denied without experiment leakage', async () => {
  const handler = createBetaCenterHandler({ service: { async listForRequest() { return { ok: false, authenticated: true, status: 403 }; } } });
  const res = response();
  await handler({ method: 'GET', url: '/beta', headers: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.doesNotMatch(res.body, /CAISSA Scanner/);
});

test('beta tester sees active Scanner card and the canonical direct link', async () => {
  const events = [];
  const handler = createBetaCenterHandler({ service: {
    async listForRequest() { return { ok: true, user: { id: 'u1' }, experiments: [scanner] }; },
    audit(event) { events.push(event); }
  } });
  const res = response();
  await handler({ method: 'GET', url: '/beta', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /CAISSA Scanner/);
  assert.match(res.body, /href="\/scanner\/beta"/);
  assert.match(res.body, /Internal Beta/);
  assert.equal(events[0].eventType, 'beta_center_viewed');
});

test('empty Beta Center is friendly, semantic, responsive, and noindex', () => {
  const document = renderBetaCenter([]);
  assert.match(document, /No beta experiments are active right now/);
  assert.match(document, /@media\(max-width:600px\)/);
  assert.match(document, /noindex,nofollow,noarchive/);
  assert.match(document, /<main>/);
});

test('direct Scanner beta request is server-authorized before its document loads', async () => {
  let loaded = false;
  const denied = createScannerBetaPageHandler({ service: { async authorizeExperiment() { return { ok: false, authenticated: true, status: 403 }; } },
    loadDocument: async () => { loaded = true; return 'secret beta'; } });
  const deniedRes = response();
  await denied({ method: 'GET', url: '/scanner/beta', headers: {} }, deniedRes);
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(loaded, false);

  const allowed = createScannerBetaPageHandler({ service: { async authorizeExperiment() { return { ok: true, user: { id: 'u1' } }; }, audit() {} },
    loadDocument: async () => { loaded = true; return '<html>Scanner beta</html>'; } });
  const allowedRes = response();
  await allowed({ method: 'GET', url: '/scanner/beta', headers: {} }, allowedRes);
  assert.equal(allowedRes.statusCode, 200);
  assert.equal(loaded, true);
});
