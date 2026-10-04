import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Opening Database reuses the canonical legacy Quiet Drag adapter', () => {
  const source = read('js/opening-database.js');
  const html = read('opening-database.html');

  assert.match(source, /OPENINGDB_QUIET_DRAG_URL\s*=\s*'\/js\/board\/caissa-legacy-quiet-drag-adapter\.js'/);
  assert.match(source, /quietDragModule\.create\(els\.board/);
  assert.match(source, /qaQuery:\s*OPENINGDB_QUIET_DRAG_QUERY/);
  assert.match(source, /localHosts\.has\(window\.location\.hostname\)/);
  assert.match(html, /\/css\/caissa-legacy-quiet-drag\.css/);
  assert.doesNotMatch(source, /class\s+OpeningDatabaseQuietDrag/);
});

test('Opening Database preserves queen promotion and one commit path', () => {
  const source = read('js/opening-database.js');
  const drop = source.slice(source.indexOf('function applyBoardDrop'), source.indexOf('function getQuietDragSnapshot'));

  assert.match(drop, /state\.game\.move\(\{ from: source, to: target, promotion: 'q' \}\)/);
  assert.equal((drop.match(/state\.game\.move\(/g) || []).length, 1);
  assert.equal((drop.match(/state\.board\.position\(/g) || []).length, 1);
  assert.equal((drop.match(/updatePositionView\(/g) || []).length, 1);
  assert.equal((drop.match(/updateMoveListFromGame\(/g) || []).length, 0);
});

test('Opening Database owns legacy handler suspension and lifecycle cleanup', () => {
  const source = read('js/opening-database.js');

  assert.match(source, /captureChessboardGlobalHandlers/);
  assert.match(source, /onEnabledChange:\s*\(enabled\)[\s\S]*legacyInput\.detach\(\)[\s\S]*legacyInput\.attach\(\)/);
  assert.match(source, /getLegacyInputState:\s*\(\)\s*=>\s*legacyInput\.snapshot\(\)/);
  assert.match(source, /state\.quietDragAdapter\?\.destroy\?\.\(\)/);
  assert.match(source, /legacyInput\.destroy\(\)/);
  assert.match(source, /window\.addEventListener\('pagehide', destroyBoard\)/);
});

test('pointer movement stays inside the shared renderer and outside Opening Database state', () => {
  const source = read('js/opening-database.js');
  const adapter = read('js/board/caissa-legacy-quiet-drag-adapter.js');
  const core = read('js/board/caissa-quiet-drag.js');

  assert.doesNotMatch(source, /pointermove/i);
  assert.match(core, /this\.#listen\('pointermove'/);
  assert.match(core, /this\.#scheduler\.update/);
  assert.match(adapter, /translate3d\(/);
  assert.doesNotMatch(adapter, /\.animate\(/);
});

test('Opening Database retains async request ordering and duplicate-FEN guards', () => {
  const source = read('js/opening-database.js');

  assert.match(source, /if \(!force && state\.lastResolvedFenKey === fenKey\)/);
  assert.match(source, /if \(requestId !== state\.positionRequestId\) return/);
  assert.match(source, /state\.nodeApiController\.abort\(\)/);
});
