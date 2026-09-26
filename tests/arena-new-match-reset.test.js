import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');

test('New Match is the first persistent Match setup action', () => {
  const row = html.match(/<div class="arena-position-button-row"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(row, /id="arenaNewMatch"[\s\S]*?New Match/);
  assert.ok(row.indexOf('arenaNewMatch') < row.indexOf('arenaSetPositionBtn'));
  assert.ok(row.indexOf('arenaSetPositionBtn') < row.indexOf('arenaManualSetupBtn'));
  assert.match(row, /aria-label="Start a new Arena match"/);
  assert.equal((html.match(/id="arenaNewMatch"/g) || []).length, 1);
});

test('desktop and mobile layouts keep the action row stable', () => {
  assert.match(css, /\.arena-position-button-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.arena-position-button-row\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.arena-position-button-row #arenaNewMatch\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
});

test('reset contract preserves configuration/history while clearing live state', () => {
  const start = arena.indexOf('    prepareNewMatch() {');
  const end = arena.indexOf('\n    setMatchConfigurationLocked(', start);
  const reset = arena.slice(start, end);
  assert.match(reset, /window\.confirm\('Start a new match\?/);
  assert.match(reset, /await this\._cleanupPromise/);
  assert.match(reset, /this\.matchSeries\?\.reset\?\.\(\)/);
  assert.match(reset, /this\.state\.currentGame = null/);
  assert.match(reset, /this\.lastArenaError = null/);
  assert.match(reset, /this\.renderEngineSelectors\(\)/);
  assert.match(reset, /this\.resetBoard\(\)/);
  assert.match(reset, /this\.initializeMatchClock\(timeControl\)/);
  assert.match(reset, /this\.updateGameStatus\(\{ result: 'Ready'/);
  assert.doesNotMatch(reset, /matchHistory\s*=/);
  assert.doesNotMatch(reset, /state\.tournament\s*=/);
});

