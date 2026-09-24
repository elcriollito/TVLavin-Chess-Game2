import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  ML001C_CLOCK_CONTRACT,
  STANDARD_START_FEN,
  TIME_CONTROL_PRESETS,
  buildMatchTitle,
  createClockDisplayState,
  createMatchLabUiConfig,
  formatClockDisplay,
  getTimeControlPresets
} from '../js/arena-match-lab-ui.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('../js/arena-match-lab-ui.js', import.meta.url), 'utf8');

function matchPanel() {
  const start = html.indexOf('id="arenaPanelMatch"');
  const end = html.indexOf('id="arenaPanelTournament"', start);
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

test('ML-001A preserves Match as the existing Arena workspace and default tab', () => {
  assert.match(html, /id="arenaTabMatch" class="arena-tab active"/);
  assert.match(html, /id="arenaPanelMatch" class="arena-panel active"/);
  assert.doesNotMatch(html, /Match Lab(?:Section|Page)|data-nav-key="match-lab"/i);
});

test('approved position controls precede one collapsible advanced panel', () => {
  const panel = matchPanel();
  const white = panel.indexOf('id="arenaWhiteEngine"');
  const black = panel.indexOf('id="arenaBlackEngine"');
  const position = panel.indexOf('id="arenaSetPositionBtn"');
  const manual = panel.indexOf('id="arenaManualSetupBtn"');
  const advanced = panel.indexOf('id="arenaAdvancedMatchOptions"');
  const swap = panel.indexOf('id="arenaSwapEngines"');
  assert.ok(white < black && black < position && position < manual && manual < advanced && advanced < swap);
  for (const id of ['arenaSetPositionBtn', 'arenaManualSetupBtn', 'arenaSwapEngines']) {
    assert.equal((panel.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} stays unique`);
  }
  assert.doesNotMatch(panel.slice(0, advanced), /id="arenaSwapEngines"/);
});

test('advanced shell has the approved three-column control contract', () => {
  const panel = matchPanel();
  for (const heading of ['Match Basics', 'Time Control', 'Opening']) assert.match(panel, new RegExp(`>${heading}<|> ${heading}<`));
  for (const id of [
    'arenaMatchTitle', 'arenaMatchGameCount', 'arenaMatchMoveLimit', 'arenaFlipBoard', 'arenaSavePgn',
    'arenaTimeControlMode', 'arenaTimeControlPreset', 'arenaOpeningMode', 'arenaEcoSelect', 'arenaOpeningFenPreview'
  ]) assert.match(panel, new RegExp(`id="${id}"`));
  assert.match(panel, /value="standard" selected>Standard Position/);
  assert.match(panel, /value="eco">ECO Opening/);
  assert.match(panel, /value="set">Opening Set/);
  assert.match(panel, /value="fen">Custom FEN/);
  assert.match(styles, /\.arena-match-options-grid[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
});

test('ML-001A.1 gives both fixed player bars accessible clock display slots', () => {
  const boardStart = html.indexOf('class="arena-board-zone"');
  const boardEnd = html.indexOf('<!-- Unified Control and Information Panel -->', boardStart);
  const board = html.slice(boardStart, boardEnd);
  assert.match(board, /id="arenaBlackClock"[^>]+aria-label="Black engine time"[^>]*>03:00/);
  assert.match(board, /id="arenaWhiteClock"[^>]+aria-label="White engine time"[^>]*>03:00/);
  assert.doesNotMatch(board, /id="arenaStatusTurn"|id="arenaStatusMoves"|Black to move|White to move|Move 37/);
  assert.match(styles, /#arenaSection \.arena-player-clock[\s\S]*?width:\s*88px[\s\S]*?font-variant-numeric:\s*tabular-nums/);
});

test('preview clock contract covers clock modes and fixed depth without countdown behavior', () => {
  assert.equal(formatClockDisplay(60_000), '01:00');
  assert.equal(formatClockDisplay(3_600_000), '1:00:00');
  assert.deepEqual(createClockDisplayState({ mode: 'blitz', preset: '3+2' }), {
    kind: 'clock', text: '03:00', depth: null, remainingMs: 180_000,
    authoritative: false, active: false
  });
  assert.equal(createClockDisplayState({ mode: 'bullet', preset: '1+0' }).text, '01:00');
  assert.equal(createClockDisplayState({ mode: 'rapid', preset: '10+0' }).text, '10:00');
  assert.equal(createClockDisplayState({ mode: 'long', preset: '30+0' }).text, '30:00');
  assert.deepEqual(createClockDisplayState({ mode: 'fixed-depth', preset: '16' }), {
    kind: 'depth', text: 'Depth 16', depth: 16, remainingMs: null,
    authoritative: false, active: false
  });
  assert.equal(ML001C_CLOCK_CONTRACT.implementedInThisPhase, false);
  assert.equal(ML001C_CLOCK_CONTRACT.termination, 'time forfeit');
  assert.doesNotMatch(uiSource, /setInterval|wtime|btime|\bgo\s+depth\b|remainingMs\s*[-+]=/);
});

test('time-control presets and the UI config model are deterministic', () => {
  assert.deepEqual(getTimeControlPresets('blitz').map(item => item.value), ['3+0', '3+2', '5+0', '5+3', 'custom']);
  assert.deepEqual(getTimeControlPresets('fixed-depth').map(item => item.value), ['8', '12', '16', '20', '24', 'custom']);
  assert.equal(Object.isFrozen(TIME_CONTROL_PRESETS), true);
  assert.equal(buildMatchTitle('Stockfish 19 Lite', 'Stockfish 18 Lite'), 'Stockfish 19 Lite vs Stockfish 18 Lite');
  assert.deepEqual(createMatchLabUiConfig({ whiteName: 'Engine A', blackName: 'Engine B' }), {
    title: 'Engine A vs Engine B',
    gameCount: 1,
    moveLimit: null,
    alternateColors: true,
    timeControl: { mode: 'blitz', preset: '3+2' },
    opening: { type: 'standard', fen: STANDARD_START_FEN },
    savePgn: true,
    flipBoard: false
  });
});

test('Match Lab presentation module delegates scheduling and does not own engines, PGN, or FEN behavior', () => {
  assert.doesNotMatch(uiSource, /ArenaRuntimeManager|ArenaTournamentScheduler|new\s+Worker|new\s+Chess|getBestMove|startMatch\s*\(|\.load\s*\(|fetch\s*\(/);
  assert.match(uiSource, /phase:\s*'ML-001B'/);
  assert.match(styles, /#arenaSection \.arena-control-panel[\s\S]*?height:\s*calc\(100dvh - 156px\)/);
  assert.match(styles, /#arenaSection \.arena-panel-scroll[\s\S]*?overflow-y:\s*auto/);
});
