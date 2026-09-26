import test from 'node:test';
import assert from 'node:assert/strict';
import '../js/arena-match-clock.js';

const { MatchClockController, createTimeControl, createQaTimeControl, assertProviderCapabilities,
  intersectProviderModes, supportedProviderModes, SUPPORTED_PRESETS } = globalThis.CaissaArenaMatchClock;

function fixture(input = { mode: 'blitz', preset: '3+2' }) {
  let now = 0;
  let id = 0;
  const timers = new Map();
  const flags = [];
  const changes = [];
  const clock = new MatchClockController({
    timeControl: input,
    now: () => now,
    setTimeoutFn: (callback, delay) => {
      const handle = ++id;
      timers.set(handle, { callback, due: now + delay });
      return handle;
    },
    clearTimeoutFn: handle => timers.delete(handle),
    onFlag: event => flags.push(event),
    onChange: snapshot => changes.push(snapshot)
  });
  const advance = milliseconds => { now += milliseconds; };
  const runDue = () => {
    const due = [...timers.entries()].filter(([, timer]) => timer.due <= now);
    due.forEach(([handle, timer]) => { timers.delete(handle); timer.callback(); });
  };
  const begin = (color = 'white', searchGeneration = 1, gameGeneration = 1) =>
    clock.beginSearch(color, { gameId: 'game-1', gameGeneration, searchGeneration });
  return { clock, advance, runDue, begin, flags, changes, timers, now: () => now };
}

test('1+0 initializes both colors to 60000 ms', () => {
  const f = fixture({ mode: 'bullet', preset: '1+0' });
  assert.equal(f.clock.snapshot().whiteRemainingMs, 60000);
  assert.equal(f.clock.snapshot().blackRemainingMs, 60000);
});

test('3+2 initializes time and increment', () => {
  const snapshot = fixture().clock.snapshot();
  assert.equal(snapshot.whiteRemainingMs, 180000);
  assert.equal(snapshot.incrementMs, 2000);
});

test('approved modes expose only certified presets', () => {
  assert.deepEqual([...SUPPORTED_PRESETS.bullet], ['1+0', '1+1']);
  assert.deepEqual([...SUPPORTED_PRESETS.blitz], ['3+0', '3+2', '5+0', '5+3']);
  assert.deepEqual([...SUPPORTED_PRESETS.rapid], ['10+0', '10+5', '15+10']);
  assert.deepEqual([...SUPPORTED_PRESETS.long], ['30+0', '30+20', '60+30']);
  assert.deepEqual([...SUPPORTED_PRESETS['fixed-depth']], ['8', '12', '16', '20', '24']);
});

test('unsupported custom preset fails closed', () => {
  assert.throws(() => createTimeControl({ mode: 'blitz', preset: 'custom' }), /Unsupported/);
});

test('provider without the selected timing capability is rejected', () => {
  const clock = createTimeControl({ mode: 'blitz', preset: '3+2' });
  assert.throws(() => assertProviderCapabilities(clock, [
    { id: 'supported', capabilities: { supportsClockTimeControl: true } },
    { id: 'unsupported', name: 'Unsupported Engine', capabilities: { supportsClockTimeControl: false } }
  ]), /Unsupported Engine does not support blitz/);
  assert.equal(assertProviderCapabilities(clock, [
    { id: 'supported', capabilities: { supportsClockTimeControl: true } }
  ]), true);
});

test('provider capability intersection disables Bullet without hardcoding Lc0 in the UI', () => {
  const stockfish = { capabilities: { supportsClockTimeControl: true, supportsFixedDepth: true } };
  const lc0 = { name: 'Lc0 — Maia 1100', capabilities: {
    supportsClockTimeControl: true,
    supportsFixedDepth: true,
    supportedMatchTimeControls: ['blitz', 'rapid', 'long', 'fixed-depth'],
    unsupportedMatchTimeControlMessages: {
      bullet: 'Lc0 Experimental does not currently support Bullet Match time control.'
    }
  } };
  assert.deepEqual([...supportedProviderModes(lc0)], ['blitz', 'rapid', 'long', 'fixed-depth']);
  assert.deepEqual([...intersectProviderModes([stockfish, lc0])],
    ['blitz', 'rapid', 'long', 'fixed-depth']);
  assert.throws(() => assertProviderCapabilities(createTimeControl({ mode: 'bullet', preset: '1+0' }),
    [stockfish, lc0]), /Lc0 Experimental does not currently support Bullet/);
  assert.equal(assertProviderCapabilities(createTimeControl({ mode: 'blitz', preset: '3+2' }),
    [stockfish, lc0]), true);
});

test('thinking elapsed decrements moving color only', () => {
  const f = fixture(); const search = f.begin(); f.advance(4200);
  f.clock.settleBestMove(search.token);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 175800);
  assert.equal(f.clock.snapshot().blackRemainingMs, 180000);
});

test('increment applies after accepted legal move', () => {
  const f = fixture(); const search = f.begin(); f.advance(4200);
  f.clock.settleBestMove(search.token);
  assert.equal(f.clock.commitLegalMove(search.token), true);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 177800);
});

test('increment does not apply to illegal move', () => {
  const f = fixture(); const search = f.begin(); f.advance(4200);
  f.clock.settleBestMove(search.token);
  assert.equal(f.clock.rejectMove(search.token), true);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 175800);
});

test('increment does not apply when the legal move ended the game', () => {
  const f = fixture(); const search = f.begin(); f.advance(1000);
  f.clock.settleBestMove(search.token);
  f.clock.commitLegalMove(search.token, { gameEnded: true });
  assert.equal(f.clock.snapshot().whiteRemainingMs, 179000);
});

test('white flag produces authoritative zero', () => {
  const f = fixture({ mode: 'bullet', preset: '1+0' }); f.begin('white'); f.advance(60000); f.runDue();
  assert.equal(f.clock.snapshot().flaggedColor, 'white');
  assert.equal(f.clock.snapshot().whiteRemainingMs, 0);
  assert.equal(f.flags.length, 1);
});

test('black flag produces authoritative zero', () => {
  const f = fixture({ mode: 'bullet', preset: '1+0' }); f.begin('black'); f.advance(60001); f.runDue();
  assert.equal(f.clock.snapshot().flaggedColor, 'black');
  assert.equal(f.flags[0].color, 'black');
});

test('BESTMOVE strictly before deadline wins race', () => {
  const f = fixture(createQaTimeControl({ initialMs: 2000 })); const search = f.begin(); f.advance(1999);
  assert.equal(f.clock.settleBestMove(search.token).accepted, true);
  assert.equal(f.flags.length, 0);
});

test('BESTMOVE at deadline loses deterministic race', () => {
  const f = fixture(createQaTimeControl({ initialMs: 2000 })); const search = f.begin(); f.advance(2000);
  assert.equal(f.clock.settleBestMove(search.token).flagged, true);
  assert.equal(f.flags.length, 1);
});

test('late BESTMOVE is rejected after deadline callback', () => {
  const f = fixture(createQaTimeControl({ initialMs: 2000 })); const search = f.begin(); f.advance(2001); f.runDue();
  assert.equal(f.clock.settleBestMove(search.token).accepted, false);
  assert.equal(f.flags.length, 1);
});

test('pause reconciles elapsed and freezes clock', () => {
  const f = fixture(); f.begin(); f.advance(1200); f.clock.pause();
  const paused = f.clock.snapshot().whiteRemainingMs;
  f.advance(9000);
  assert.equal(paused, 178800);
  assert.equal(f.clock.snapshot().whiteRemainingMs, paused);
});

test('resume preserves remaining time and uses fresh start point', () => {
  const f = fixture(); f.begin('white', 1); f.advance(1000); f.clock.pause();
  f.advance(5000); const resumed = f.begin('white', 2); f.advance(500); f.clock.settleBestMove(resumed.token);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 178500);
});

test('stop cancels deadline and later callback cannot flag', () => {
  const f = fixture(createQaTimeControl({ initialMs: 1000 })); f.begin();
  assert.equal(f.timers.size, 1); f.clock.stop(); f.advance(2000); f.runDue();
  assert.equal(f.flags.length, 0);
  assert.equal(f.timers.size, 0);
});

test('reset gives a next series game fresh clocks', () => {
  const f = fixture(); const search = f.begin(); f.advance(5000); f.clock.settleBestMove(search.token);
  f.clock.reset(createTimeControl({ mode: 'blitz', preset: '3+2' }));
  assert.equal(f.clock.snapshot().whiteRemainingMs, 180000);
  assert.equal(f.clock.snapshot().blackRemainingMs, 180000);
});

test('clock ownership follows color across alternating engine assignment', () => {
  const f = fixture(); const black = f.begin('black'); f.advance(2500); f.clock.settleBestMove(black.token);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 180000);
  assert.equal(f.clock.snapshot().blackRemainingMs, 177500);
});

test('fixed depth emits depth UCI option and no deadline', () => {
  const f = fixture({ mode: 'fixed-depth', preset: '12' }); const search = f.begin();
  assert.deepEqual(search.options, { depth: 12 });
  assert.equal(f.timers.size, 0);
  assert.equal(f.clock.snapshot().whiteRemainingMs, null);
});

test('clock search emits color-correct UCI values', () => {
  const f = fixture(); const white = f.begin('white'); f.advance(1000); f.clock.settleBestMove(white.token); f.clock.commitLegalMove(white.token);
  const black = f.begin('black', 2);
  assert.deepEqual(black.options, { wtime: 181000, btime: 180000, winc: 2000, binc: 2000 });
});

test('background reconciliation uses monotonic elapsed, not render ticks', () => {
  const f = fixture(); f.begin(); f.advance(15000);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 165000);
  assert.equal(f.changes.at(-1).whiteRemainingMs, 180000);
});

test('move delay after settled BESTMOVE is excluded', () => {
  const f = fixture(); const search = f.begin(); f.advance(750); f.clock.settleBestMove(search.token);
  f.advance(10000); f.clock.commitLegalMove(search.token);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 181250);
});

test('stale deadline from earlier search generation is rejected', () => {
  const f = fixture(createQaTimeControl({ initialMs: 1000 })); f.begin('white', 1);
  const staleTimer = [...f.timers.values()][0].callback;
  f.clock.pause(); f.begin('white', 2); f.advance(100); staleTimer();
  assert.equal(f.flags.length, 0);
  assert.equal(f.clock.snapshot().running, true);
});

test('early deadline callback reschedules remaining monotonic duration', () => {
  const f = fixture(createQaTimeControl({ initialMs: 1000 })); f.begin();
  const [handle, timer] = [...f.timers.entries()][0];
  f.timers.delete(handle); f.advance(400); timer.callback();
  assert.equal(f.flags.length, 0);
  assert.equal(f.timers.size, 1);
});

test('book move increment is applied without charging setup or delay', () => {
  const f = fixture(); f.advance(20000);
  assert.equal(f.clock.commitInstantLegalMove('white'), true);
  assert.equal(f.clock.snapshot().whiteRemainingMs, 182000);
});

test('fixed-depth pause and resume never creates countdown', () => {
  const f = fixture({ mode: 'fixed-depth', preset: '24' }); f.begin(); f.advance(5000); f.clock.pause();
  const resumed = f.begin('white', 2);
  assert.equal(resumed.options.depth, 24);
  assert.equal(f.clock.snapshot().deadlineAt, null);
});
