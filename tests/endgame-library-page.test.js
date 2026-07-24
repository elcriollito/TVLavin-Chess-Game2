import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, page, css, server, vercel] = await Promise.all([
  readFile(new URL('../endgame-library.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/endgame-library/endgame-library-page.js', import.meta.url), 'utf8'),
  readFile(new URL('../css/endgame-library.css', import.meta.url), 'utf8'),
  readFile(new URL('../server.js', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8')
]);

test('route has accessible loading, error, empty, missing, filter, and detail states', () => {
  for (const marker of ['loading-state', 'error-state', 'empty-state', 'missing-state', 'library-filters', 'result-count', 'unit-detail', 'aria-live="polite"', 'Skip to library']) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(server, /pathname === '\/endgame-library'/);
  assert.match(vercel, /"source": "\/endgame-library"/);
});

test('detail includes instructional content and learner-facing graph groups', () => {
  for (const label of ['Explanation', 'Learning objectives', 'Mastery criteria', 'Key ideas', 'Practical rules', 'Decision process', 'Common misconceptions', 'Reflection prompts', 'Coaching prompts', 'Learning activities', 'Knowledge connections', 'Build on these first', 'Continue with', 'Review if this is difficult', 'Compare with', 'Related study']) {
    assert.match(page, new RegExp(label));
  }
});

test('position preview uses Board API v1 and disables interaction', () => {
  assert.match(page, /EndgameBoardView/);
  assert.match(page, /ChessRulesFacade/);
  assert.match(page, /setInteractive\(false\)/);
  assert.match(page, /setPosition\(position\.fen\)/);
  assert.match(page, /Read-only chess position/);
});

test('responsive styles prevent overflow and collapse grids', () => {
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.card-grid,\s*\.relation-list \{ grid-template-columns: 1fr/);
  assert.match(css, /aspect-ratio:\s*1/);
});

test('page does not write progress or integrate coaching and mastery systems', () => {
  assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB|training-memory|mastery-store|endgame-coach|\/api\//i);
  assert.match(html, /does not change training progress or mastery/);
});
