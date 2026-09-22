import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../js/caissa-arena.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function method(name, nextName) {
  const start = controller.indexOf(`    ${name}(`);
  const end = controller.indexOf(`    ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} source must exist before ${nextName}`);
  return controller.slice(start, end);
}

test('Game Moves owns the accessible review row immediately above Eval Graph', () => {
  const moves = html.indexOf('id="arenaMoveHistory"');
  const controls = html.indexOf('id="arenaReviewControls"', moves);
  const graph = html.indexOf('id="arenaGraphPanel"', controls);
  assert.ok(moves >= 0 && controls > moves && graph > controls);
  for (const label of [
    'First position', 'Previous move', 'Play game review', 'Next move',
    'Latest position', 'Return to live position'
  ]) {
    assert.match(html.slice(controls, graph), new RegExp(`aria-label="${label}"`));
  }
  assert.match(html.slice(controls, graph), /id="arenaReviewStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('review reconstruction mutates only an isolated Chess instance', () => {
  const reconstruction = method('reconstructReviewPosition', 'showReviewPosition');
  assert.match(reconstruction, /const reviewGame = new Chess\(\)/);
  assert.match(reconstruction, /const startFen = this\.getReviewStartFen\(\)/);
  assert.match(method('getReviewStartFen', 'reconstructReviewPosition'), /this\.state\.currentGame\?\.startFen/);
  assert.match(reconstruction, /reviewGame\.load\(startFen\)/);
  assert.match(reconstruction, /reviewGame\.move\(/);
  assert.doesNotMatch(reconstruction, /this\.game\.(?:load|undo|move)\(/);

  const reviewBlock = controller.slice(
    controller.indexOf('    isReviewing()'),
    controller.indexOf('    updateMoveHistory()', controller.indexOf('    isReviewing()'))
  );
  assert.doesNotMatch(reviewBlock, /runtimeManager\.(?:acquire|replace|newGame|stop|terminate)|getBestMove\(|\.send\(/);
});

test('live moves preserve a selected historical display and new games return to Live', () => {
  const playMoveStart = controller.indexOf('    playUciMove(');
  const playMove = controller.slice(playMoveStart, controller.indexOf('    async runEngineLoop', playMoveStart));
  assert.match(playMove, /if \(!this\.isReviewing\(\)\) this\.board\.position\(this\.game\.fen\(\)\)/);
  assert.match(playMove, /this\.state\.currentGame\.moves\.push/);

  const resetStart = controller.indexOf('    resetBoard()');
  const reset = controller.slice(resetStart, controller.indexOf('\n    }\n};', resetStart));
  assert.match(reset, /this\.resetReviewState\(\{ render: false \}\)/);
  assert.match(controller, /newerMoves: this\.isReviewing\(\)/);
});

test('review controls are layout-contained and expose a stable selected-ply treatment', () => {
  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.arena-review-button-row/);
  assert.match(styles, /\.arena-move-button\.is-current/);
  assert.match(styles, /\.arena-review-last-move/);
  assert.match(controller, /container\.scrollTop = bottom - container\.clientHeight/);
  assert.doesNotMatch(controller, /scrollIntoView\(/);
});
