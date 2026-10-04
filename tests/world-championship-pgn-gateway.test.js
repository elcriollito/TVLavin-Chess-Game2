import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/pgn/pgnmentor.js';

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end(value) { this.body = value ?? this.body; return this; }
  };
}

test('PGN gateway rejects arbitrary, malformed, and non-event inputs before fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('must not fetch'); };
  try {
    for (const query of [
      { kind: 'event', file: '../../secret.pgn' },
      { kind: 'event', file: 'Unknown2024.pgn' },
      { kind: 'player', file: 'WorldChamp2024.pgn' },
      { kind: 'event', file: 'https://evil.example/file.pgn' }
    ]) {
      const res = responseRecorder();
      await handler({ method: 'GET', query }, res);
      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, { error: 'Unknown PGN collection' });
    }
    assert.equal(fetchCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('PGN gateway fetches only the exact allowlisted upstream and returns inline PGN', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const pgn = '[Event "WCh 2024"]\n[White "Gukesh,D"]\n[Black "Ding Liren"]\n\n1. e4 e6 1/2-1/2\n';
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(pgn, { status: 200, headers: { 'content-length': String(Buffer.byteLength(pgn)) } });
  };
  try {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { kind: 'event', file: 'WorldChamp2024.pgn' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://www.pgnmentor.com/events/WorldChamp2024.pgn');
    assert.equal(res.headers['content-disposition'], 'inline; filename="WorldChamp2024.pgn"');
    assert.equal(res.headers['x-caissa-pgn-source'], 'pgnmentor-event');
    assert.equal(Buffer.isBuffer(res.body), true);
    assert.match(res.body.toString('utf8'), /\[White "Gukesh,D"\]/);
  } finally { globalThis.fetch = originalFetch; }
});

test('gateway does not expose a download method or accept oversized/invalid payloads', async () => {
  const method = responseRecorder();
  await handler({ method: 'POST', query: { kind: 'event', file: 'WorldChamp2024.pgn' } }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET, HEAD');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('not pgn', { status: 200 });
  try {
    const invalid = responseRecorder();
    await handler({ method: 'GET', query: { kind: 'event', file: 'WorldChamp2024.pgn' } }, invalid);
    assert.equal(invalid.statusCode, 502);
  } finally { globalThis.fetch = originalFetch; }
});
