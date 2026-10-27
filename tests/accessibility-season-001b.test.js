import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

test('shared navigation foundation is reconciled without restoring Support CAISSA', () => {
  const navigation = read('js/caissa-primary-navigation.js');
  const sidebar = read('js/caissa-standalone-sidebar.js');
  const index = read('index.html');
  assert.doesNotMatch(navigation, /class="nav-language-control" role="listitem"/);
  assert.match(navigation, /shell\.premiumAccessible/);
  assert.match(sidebar, /ensureMainBypass/);
  assert.match(sidebar, /link\.tabIndex = 0/);
  assert.match(index, /class="caissa-global-skip-link"[^>]+href="#mainContent"/);
  assert.doesNotMatch(index, /data-nav-key="support"/);
});

test('Chess Gym primary and nested tabs expose complete ARIA relationships and keyboard keys', () => {
  const html = read('chess-gym.html');
  const source = read('js/chess-gym/page.js');
  for (const id of ['mode-train', 'mode-learn', 'progress-caissa', 'progress-mentor']) {
    assert.match(html, new RegExp(`role="tab" id="${id}"[^>]+aria-controls=`));
  }
  for (const id of ['training-train', 'training-learn', 'progress-caissa-panel', 'progress-mentor-panel']) {
    assert.match(html, new RegExp(`id="${id}" role="tabpanel"[^>]+aria-labelledby=`));
  }
  assert.match(source, /ArrowLeft.*ArrowRight.*Home.*End/s);
  assert.match(source, /tabIndex = name === 'train'/);
  assert.match(source, /tabIndex = name === 'caissa'/);
});

test('Opening Database tabs, results, loading, and errors have deterministic semantics', () => {
  const html = read('opening-database.html');
  const source = read('js/opening-database.js');
  assert.match(html, /id="odbTabMoves"[^>]+aria-controls="odbMovesPanel"[^>]+tabindex="0"/);
  assert.match(html, /id="odbGamesPanel"[^>]+role="tabpanel"[^>]+aria-busy="false"/);
  assert.match(html, /id="odbGamesStatus"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(html, /id="odbFenError"[^>]+role="alert"/);
  assert.match(source, /gamesPanel\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(source, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(source, /function bindOpeningDbTabInteractions\(\)/);
  assert.match(source, /if \(state\.tabInteractionsBound\) return false/);
  const runInit = source.slice(source.indexOf('async function runInit()'));
  assert.ok(
    runInit.indexOf('bindOpeningDbTabInteractions();') < runInit.indexOf('await initBoard();'),
    'Opening Database tab interactions must bind before asynchronous board initialization'
  );
  assert.doesNotMatch(
    runInit.slice(runInit.indexOf('await initBoard();')),
    /setActiveTab\('moves'\)/,
    'board initialization must not overwrite an early user tab selection'
  );
});

test('Chess TV communicates turn state in text and uses one restrained live region', () => {
  const html = read('index.html');
  const source = read('js/spectator-tv-section.js');
  assert.match(html, /id="spectatorTurnStatus"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.doesNotMatch(html, /id="spectatorLiveContext"[^>]+aria-live=/);
  assert.doesNotMatch(source, /spectator-turn-led[^\n]+aria-label/);
  assert.match(source, /class="spectator-turn-text">\$\{turnText\}/);
  assert.match(source, /lastAnnouncedTurn !== announcedTurn/);
});

test('Scanner names the visible brand, discloses input limits, and describes feedback dialog', () => {
  const html = read('scanner/index.html');
  const source = read('scanner/scanner-app.js');
  assert.match(html, /id="homeBtn" type="button">/);
  assert.doesNotMatch(html, /id="homeBtn"[^>]+aria-label=/);
  assert.match(html, /id="scannerImageRequirements"/);
  assert.match(html, /id="feedbackSheet"[^>]+aria-describedby="feedbackSheetDescription"/);
  assert.doesNotMatch(html, /accept="[^"]*heic/i);
  assert.match(source, /event\.key === 'Tab'/);
  assert.match(source, /activeSheet\.sheet\.contains\(event\.target\)/);
});
