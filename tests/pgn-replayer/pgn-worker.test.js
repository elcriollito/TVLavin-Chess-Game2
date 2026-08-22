import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path.replace(/^\//, ''), root), 'utf8');
const require = createRequire(import.meta.url);
const PgnParser = require('@mliebelt/pgn-parser');

function workerHarness() {
  let listener;
  const messages = [];
  const context = vm.createContext({ TextEncoder, console, Chess, PgnParser });
  context.self = context;
  context.postMessage = message => messages.push(message);
  context.addEventListener = (type, handler) => { if (type === 'message') listener = handler; };
  vm.runInContext(read('js/pgn-replayer/pgn-core.js'), context);
  const workerSource = read('js/pgn-replayer/pgn-worker.js').replace(/^import .*;$/gm, '');
  vm.runInContext(workerSource, context);
  return { send: data => listener({ data }), messages };
}

test('actual module Worker handler returns a structured playable collection', () => {
  const worker = workerHarness();
  worker.send({ type: 'parse', requestId: 7, text: '[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *' });
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].type, 'parsed');
  assert.equal(worker.messages[0].requestId, 7);
  assert.equal(worker.messages[0].collection.games[0].mainline[1].san, 'e5');
});

test('actual Worker returns a bounded error object for malformed input', () => {
  const worker = workerHarness();
  worker.send({ type: 'parse', requestId: 9, text: '<script>not pgn</script>' });
  assert.equal(worker.messages.length, 1);
  assert.equal(worker.messages[0].type, 'error');
  assert.equal(worker.messages[0].requestId, 9);
  assert.equal(worker.messages[0].error.code, 'INVALID_PGN');
  assert.ok(worker.messages[0].error.message.length <= 300);
});
