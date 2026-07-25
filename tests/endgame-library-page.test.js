import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLibraryBoardRules } from '../js/endgame-library/library-board-rules.js';

const [html, page, css, server, vercel, sitemap] = await Promise.all([
  readFile(new URL('../endgame-library.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/endgame-library/endgame-library-page.js', import.meta.url), 'utf8'),
  readFile(new URL('../css/endgame-library.css', import.meta.url), 'utf8'),
  readFile(new URL('../server.js', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
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

test('detail derives practice actions only from released eligible activities', () => {
  assert.match(page, /deriveReleasedActivities/);
  assert.match(page, /Practice this concept/);
  assert.match(page, /practiceActivities\.length/);
  assert.doesNotMatch(page, /Try assessment/);
});

test('position preview uses Board API v1 and disables interaction', () => {
  assert.match(page, /EndgameBoardView/);
  assert.match(page, /createLibraryBoardRules/);
  assert.match(page, /setInteractive\(false\)/);
  assert.match(page, /setPosition\(position\.fen\)/);
  assert.match(page, /Read-only chess position/);
  assert.equal((page.match(/new EndgameBoardView/g) || []).length, 1);
  assert.match(page, /board-unavailable/);
  assert.match(page, /try \{[\s\S]*new EndgameBoardView[\s\S]*\} catch/);
});

test('library rules factory honors the Board API empty-FEN contract', () => {
  const initialFromNull = createLibraryBoardRules(null);
  const initialFromUndefined = createLibraryBoardRules(undefined);
  assert.equal(initialFromNull.fen(), initialFromUndefined.fen());
  assert.match(initialFromNull.fen(), / w /);

  const fen = '8/8/6k1/2p1p3/2PP4/5K2/8/8 w - - 0 1';
  assert.equal(createLibraryBoardRules(fen).fen(), fen);
  assert.throws(() => createLibraryBoardRules('not-a-fen'), { code: 'invalid-fen' });
});

test('board assets use the proven trainer strategy in dependency order', () => {
  const jquery = 'https://code.jquery.com/jquery-3.6.0.min.js';
  const chessboard = 'https://cdn.jsdelivr.net/npm/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js';
  assert.match(html, /\/assets\/css\/chessboard-1\.0\.0\.min\.css/);
  assert.match(html, new RegExp(jquery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(chessboard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(html.indexOf(jquery) < html.indexOf(chessboard));
  assert.ok(html.indexOf(chessboard) < html.indexOf('/js/endgame-library/endgame-library-page.js'));
  assert.doesNotMatch(html, /src="\/js\/(?:jquery-3\.7\.1|chessboard-1\.0\.0)\.min\.js"|href="\/css\/chessboard-1\.0\.0\.min\.css"/);
});

test('the public sitemap includes the canonical library route', () => {
  assert.match(sitemap, /https:\/\/www\.caissa-chess\.org\/endgame-library/);
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
