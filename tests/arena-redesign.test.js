import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');
const runtimeManager = fs.readFileSync(new URL('../js/arena-runtime-manager.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function arenaMarkup() {
  const start = html.indexOf('<section id="arenaSection"');
  const end = html.indexOf('<section id="cheater-insightSection"', start);
  assert.ok(start >= 0 && end > start, 'Arena section boundaries must exist');
  return html.slice(start, end);
}

test('Arena uses one board stage and one three-tab control panel', () => {
  const arena = arenaMarkup();
  assert.equal((arena.match(/class="arena-board-zone"/g) || []).length, 1);
  assert.equal((arena.match(/class="arena-sidebar arena-control-panel"/g) || []).length, 1);
  assert.deepEqual(
    [...arena.matchAll(/id="arenaTab(Match|Tournament|Game)"/g)].map(match => match[1]),
    ['Match', 'Tournament', 'Game']
  );
  assert.doesNotMatch(arena, /arena-left-panel|arena-right-panel|arena-eval-sidebar/);
  assert.doesNotMatch(arena, /id="arenaTabBots"|id="arenaPanelBots"/);
});

test('Arena presents the approved Engine Arena product naming', () => {
  const arena = arenaMarkup();
  assert.match(arena, /<strong>CAISSA Engine Arena<\/strong>/);
  assert.match(arena, /<small>Engine matches, tournaments and analysis<\/small>/);
  assert.match(html, /data-nav-key="arena" aria-label="Engine Arena"/);
});

test('Bots are reserved as non-interactive participants inside Match and Tournament', () => {
  const arena = arenaMarkup();
  assert.equal((arena.match(/class="arena-bot-reservation"/g) || []).length, 3);
  assert.equal((arena.match(/class="arena-bot-reservation-state">Coming Soon/g) || []).length, 3);
  assert.match(arena, /White Participant/);
  assert.match(arena, /Black Participant/);
  assert.match(arena, /Participants \(min 2\)/);
  assert.doesNotMatch(arena, /play against bots|human[- ]vs[- ]bot/i);
});

test('Game tab owns evaluation, moves, active controls, and graph while preserving runtime IDs', () => {
  const arena = arenaMarkup();
  const matchStart = arena.indexOf('id="arenaPanelMatch"');
  const gameStart = arena.indexOf('id="arenaPanelGame"');
  const gameEnd = arena.indexOf('id="arenaSetupModal"', gameStart);
  const match = arena.slice(matchStart, gameStart);
  const game = arena.slice(gameStart, gameEnd);

  for (const id of ['arenaEvalScore', 'arenaEvalDepth', 'arenaEvalNodes', 'arenaEvalPV', 'arenaDeclareDraw', 'arenaPauseMatch', 'arenaStopMatch', 'arenaMoveHistory', 'arenaEvalGraph']) {
    assert.match(game, new RegExp(`id="${id}"`), `${id} must remain in Game`);
    assert.equal((arena.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must stay unique`);
  }
  assert.doesNotMatch(match, /id="arena(?:Pause|Stop)Match"/, 'active controls must not be duplicated in Match');
  assert.ok(game.indexOf('arenaPauseMatch') < game.indexOf('arenaMoveHistory'), 'active controls stay in the Moves header');
  assert.ok(game.indexOf('arenaMoveHistory') < game.indexOf('arenaEvalGraph'), 'graph remains the Game footer');
});

test('Match and Tournament share runnable engine availability', () => {
  assert.match(controller, /getRunnableEngines\(\)/);
  assert.match(controller, /filter\(engine => this\.isEngineRunnable\(engine\)\)/);
  assert.match(controller, /class="tournament-engine-item\$\{runnable \? '' : ' is-unavailable'\}"/);
  assert.match(controller, /\$\{runnable \? ' checked' : ' disabled'\}/);
  assert.match(controller, /playerInstancesMatchSelections\(\)/);
  assert.match(controller, /this\.runtimeManager\.acquire\('white'/);
  assert.match(runtimeManager, /this\.terminate\(role, 'provider-replaced'\)/);
});

test('Tournament draw adjudication is confirmed and uses the normal result pipeline', () => {
  const arena = arenaMarkup();
  assert.match(arena, /id="arenaDeclareDraw"/);
  assert.match(arena, /id="arenaDrawModal"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(controller, /isActiveTournamentGame\(\)/);
  assert.match(controller, /adjudicateTournamentDraw\(\)/);
  assert.match(controller, /this\.recordTournamentResult\('1\/2-1\/2'\)/);
  assert.match(controller, /this\.scheduleNextTournamentGame\(\)/);
  assert.match(controller, /termination = 'Draw by adjudication'/);
});

test('turn status is a stateful LED derived from the game and neutral when finished', () => {
  const arena = arenaMarkup();
  assert.match(arena, /id="arenaTurnStatus"[\s\S]{0,220}?role="status"[\s\S]{0,220}?class="arena-turn-led"/);
  assert.match(arena, /id="arenaStatusTurn" class="arena-turn-label">White to move/);
  assert.match(controller, /const sideToMove = this\.game\?\.turn\?\.\(\) === 'b' \? 'black' : 'white'/);
  assert.match(controller, /this\.state\.matchState === 'finished'[\s\S]{0,180}?turnLabel = 'Finished'/);
  assert.match(controller, /turnState === 'running' \|\| turnState === 'idle' \? sideToMove : 'neutral'/);
});

test('Arena tabs are accessible and do not own competition lifecycle state', () => {
  const arena = arenaMarkup();
  assert.match(arena, /class="arena-tabs" role="tablist"/);
  assert.equal((arena.match(/id="arenaTab(?:Match|Tournament|Game)"[\s\S]{0,180}?role="tab"/g) || []).length, 3);
  assert.equal((arena.match(/id="arenaPanel(?:Match|Tournament|Game)"[\s\S]{0,180}?role="tabpanel"/g) || []).length, 3);
  assert.match(controller, /activeTab: 'match'/);
  assert.match(controller, /onTabKeydown\(event\)/);
  const switchTab = controller.slice(controller.indexOf('switchTab(tab'), controller.indexOf('onTabKeydown(event)'));
  assert.doesNotMatch(switchTab, /state\.mode\s*=\s*tab/);
});

test('Arena sizing snapshots stable inputs and isolates game content from board geometry', () => {
  assert.match(controller, /Math\.min\(arenaMax, availableWidth, availableHeight\)/);
  assert.match(controller, /boardContainer\.clientWidth - horizontalPadding/);
  assert.match(controller, /Math\.abs\(width - observedWidth\) < 0\.5/);
  assert.match(controller, /mobileLayout && previous && !widthChanged && !orientationChanged/);
  assert.match(controller, /sizeChanged \|\| force/);
  assert.match(controller, /teardownBoardSizing\(\)/);
  assert.doesNotMatch(controller, /setupLayoutObserver/, 'the board-owned height must not be observed');
  assert.match(controller, /container\.scrollTop = container\.scrollHeight/);
  assert.match(styles, /#arenaSection \.arena-board-mount[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(styles, /#arenaSection \.arena-player-bar[\s\S]*?height:\s*58px[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /#arenaSection \.arena-move-list[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /#arenaSection \.arena-control-panel[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(styles, /#arenaSection \.arena-control-panel[\s\S]*?scrollbar-gutter:\s*stable/);
});

test('Tournament standings are sourced from participants, games, and standard scoring', () => {
  const arena = arenaMarkup();
  assert.match(arena, /id="arenaTournamentStandings"[\s\S]{0,180}?role="region"/);
  assert.match(controller, /getRankedTournamentStandings\(\)/);
  assert.match(controller, /getTournamentHeadToHead\(participantId, opponentId\)/);
  assert.match(controller, /result === '1-0'[\s\S]{0,100}?points \+= 1/);
  assert.match(controller, /result === '0-1'[\s\S]{0,100}?points \+= 1/);
  assert.match(controller, /points \+= 0\.5/g);
  assert.match(controller, /whiteStanding\.games\+\+[\s\S]{0,80}?blackStanding\.games\+\+/);
  assert.match(controller, /<th class="standings-participant" scope="col">Participant<\/th>/);
  assert.match(styles, /#arenaSection \.tournament-standings[\s\S]*?overflow-x:\s*auto/);
});

test('Arena move presentation uses canonical SAN while engine transport remains UCI', () => {
  const renderStart = controller.indexOf('    renderMoveHistory() {');
  const renderEnd = controller.indexOf('// ===== EVALUATION PANEL =====', renderStart);
  const renderer = controller.slice(renderStart, renderEnd);
  assert.match(renderer, /history\(\{ verbose: true \}\)/);
  assert.match(renderer, /move\.san/);
  assert.doesNotMatch(renderer, /game\.move\(/, 'rendering must not replay moves into the live game');
  assert.match(controller, /playUciMove\(uciMove, isWhiteTurn/);
  assert.match(controller, /uci:\s*uciMove/);
  assert.match(controller, /this\.playUciMove\(bestMove, isWhiteTurn, 'engine'\)/);
  assert.match(controller, /formatPvAsSan\(pv, fen\)/);
  assert.match(controller, /const analysisGame = new Chess\(\)/);
  assert.match(controller, /analysisGame\.move\(/);
  assert.match(controller, /evalPV\.textContent = this\.formatPvAsSan\(data\.pv, data\.fen\)/);
});
