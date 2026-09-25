import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function load(now = 1_000) {
  const values = new Map();
  const context = vm.createContext({
    console, TextEncoder,
    Date: class extends Date { static now() { return now; } },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    sessionStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    }
  });
  vm.runInContext(fs.readFileSync(new URL('../../js/pgn-replayer/pgn-handoff.js', import.meta.url), 'utf8'), context);
  return { api: context.CaissaPgnHandoff, values };
}

test('stores raw PGN only in session storage behind an opaque token', () => {
  const { api, values } = load();
  const id = api.create('[Event "A"]\n\n*');
  assert.equal(id, '12345678-1234-1234-1234-123456789abc');
  assert.equal(id.includes('Event'), false);
  assert.equal(values.size, 1);
});

test('consumes a handoff exactly once', () => {
  const { api } = load();
  const id = api.create('[Event "A"]\n\n*', { sourceLabel: 'Arena series' });
  assert.equal(api.consume(id).sourceLabel, 'Arena series');
  assert.equal(api.consume(id), null);
});

test('rejects malformed tokens without reading arbitrary storage keys', () => {
  const { api } = load();
  assert.equal(api.consume('../secret'), null);
  assert.equal(api.validToken('short'), false);
});

test('rejects empty PGN handoffs', () => {
  const { api } = load();
  assert.throws(() => api.create('  '), /empty/);
});

test('expires stale handoffs', () => {
  const first = load(1_000);
  const id = first.api.create('[Event "A"]\n\n*');
  const raw = [...first.values.values()][0];
  const second = load(1_000 + first.api.MAX_AGE_MS + 1);
  second.values.set(`${second.api.PREFIX}${id}`, raw);
  assert.equal(second.api.consume(id), null);
});
