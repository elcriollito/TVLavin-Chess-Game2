import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const adapterSource = fs.readFileSync(new URL('../js/engine-adapter.js', import.meta.url), 'utf8');
const registrySource = fs.readFileSync(new URL('../js/engine-registry.js', import.meta.url), 'utf8');
const arenaSource = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const stylesSource = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function adapterCommands(options, id = 'qa') {
  const window = { location: { pathname: '/arena' } };
  vm.runInNewContext(adapterSource, { window, console });
  const adapter = new window.EngineAdapter({ id, workerPath: '/engine/stockfish-working.js' });
  const commands = [];
  adapter.send = command => commands.push(command);
  adapter.go(options);
  return commands;
}

test('all standard provider identities emit clock UCI without hidden depth or movetime', () => {
  for (const id of ['stockfish', 'stockfish-lite', 'stockfish-18-lite', 'stockfish-19-lite']) {
    assert.deepEqual(adapterCommands({ wtime: 180000, btime: 179250, winc: 2000, binc: 2000 }, id),
      ['go wtime 180000 btime 179250 winc 2000 binc 2000'], id);
  }
});

test('EngineAdapter emits exact fixed-depth UCI', () => {
  assert.deepEqual(adapterCommands({ depth: 12 }), ['go depth 12']);
});

test('all four standard Arena providers declare both timing capabilities', () => {
  const declarations = registrySource.match(/supportsClockTimeControl:\s*true/g) || [];
  const fixed = registrySource.match(/supportsFixedDepth:\s*true/g) || [];
  assert.equal(declarations.length, 3, 'shared legacy plus SF18 and SF19 declarations');
  assert.equal(fixed.length, 3);
  for (const id of ['stockfish', 'stockfish-lite', 'stockfish-18-lite', 'stockfish-19-lite']) {
    assert.match(registrySource, new RegExp(`(?:id: '${id}'|'${id}': \\{)`));
  }
});

test('Arena maps flag color to decisive result and time-forfeit termination', () => {
  assert.match(arenaSource, /color === 'white' \? '0-1' : '1-0'/);
  assert.match(arenaSource, /termination: 'time-forfeit'/);
  assert.match(arenaSource, /lost on time/);
});

test('Arena uses one 100 ms render interval and authoritative deadline controller', () => {
  assert.match(arenaSource, /clockRenderInterval = setInterval[\s\S]*?}, 100\)/);
  assert.match(arenaSource, /MatchClockController/);
  assert.match(arenaSource, /settleBestMove/);
});

test('clock script loads before Arena controller and production presets omit QA clocks', () => {
  assert.ok(indexSource.indexOf('js/arena-match-clock.js') < indexSource.indexOf('js/caissa-arena.js'));
  assert.doesNotMatch(indexSource, /2\s*seconds|2\+0|qa-clock/i);
});

test('clock display has stable tabular fixed widths and an active non-color cue', () => {
  assert.match(stylesSource, /\.arena-player-clock[\s\S]*?width:\s*88px[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(stylesSource, /\.arena-player-clock\[data-active="true"\][\s\S]*?text-decoration:\s*underline/);
});

test('Tournament search path retains existing bounded movetime', () => {
  assert.match(arenaSource, /this\.state\.mode === 'match' && this\.matchClock[\s\S]*?\{ movetime: ARENA_ENGINE_MOVETIME_MS \}/);
  assert.match(arenaSource, /context\.timeControlMode \? null : moveTimeoutMs/);
});
