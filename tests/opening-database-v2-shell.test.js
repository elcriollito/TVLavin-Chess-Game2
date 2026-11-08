import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('opening-database.html');
const css = read('css/opening-database.css');
const source = read('js/opening-database.js');

test('Opening Database V2 exposes the requested HEAD/BODY/FOOT workspace and tab order', () => {
  const explorer = html.indexOf('id="odbTabExplorer"');
  const analysis = html.indexOf('id="odbTabAnalysis"');
  const games = html.indexOf('id="odbTabGames"');
  const moves = html.indexOf('id="odbTabMoves"');
  assert.ok(explorer > -1 && analysis > explorer && games > analysis && moves > games);
  assert.match(html, /id="odbTabExplorer"[^>]+aria-selected="true"[^>]+tabindex="0"/);
  assert.match(html, /id="odbExplorerPanel"[^>]+aria-labelledby="odbTabExplorer"/);
  assert.match(html, /id="odbMovesPanel"[^>]+aria-labelledby="odbTabMoves"[^>]+hidden/);
  assert.match(html, /openingdb-workspace-head/);
  assert.match(html, /openingdb-workspace-body/);
  assert.match(html, /openingdb-workspace-foot/);
  assert.match(css, /\.openingdb-workspace-body\s*\{[\s\S]*overflow-y:\s*auto/);
});

test('V2 preserves board dependencies, theme assets, and Quiet Drag integration', () => {
  assert.match(html, /chessboard-1\.0\.0\.min\.css/);
  assert.match(html, /chessboard-1\.0\.0\.min\.js/);
  assert.match(html, /chess-0\.10\.3\.min\.js/);
  assert.match(html, /caissa-legacy-quiet-drag\.css/);
  assert.match(source, /caissa-legacy-quiet-drag-adapter\.js/);
  assert.match(source, /pieceTheme:\s*'\/img\/chesspieces\/wikipedia\/\{piece\}\.png'/);
  assert.doesNotMatch(css, /\.white-1e1d7\s*\{|\.black-3c85d\s*\{|\.piece-417db\s*\{/);
});

test('Explore rows are semantic controls with honest accessible WDL statistics', () => {
  assert.match(source, /<button class="openingdb-move-action"[^>]+data-move-index/);
  assert.match(source, /aria-label="White wins \$\{wPct\.toFixed\(1\)\} percent, draws/);
  assert.match(source, /No game-result statistics for this move/);
  assert.match(html, /legend-white[\s\S]*White[\s\S]*legend-draw[\s\S]*Draw[\s\S]*legend-black[\s\S]*Black/);
  assert.match(css, /--odb-win:\s*#[0-9a-f]+/i);
  assert.match(css, /--odb-draw:\s*#[0-9a-f]+/i);
  assert.match(css, /--odb-loss:\s*#[0-9a-f]+/i);
});

test('Games UI states line-search scope and does not advertise unavailable exports', () => {
  assert.match(html, /Transpositions reached through a different line are not included/);
  assert.match(source, /Indexed matches:/);
  assert.match(source, /Shown sample:/);
  assert.match(source, /Metadata only/);
  assert.doesNotMatch(source, /coming soon/i);
  assert.doesNotMatch(source, /getTierFromUrl|URL_PARAMS\.get\(['"]tier/);
  assert.doesNotMatch(source, /`\/search\?fen=/);
});

test('Analyzer handoff and deferred Trainer action are explicit', () => {
  assert.match(html, /\/js\/play\/analyze-handoff\.js/);
  assert.match(source, /function openCurrentPositionInAnalyzer/);
  assert.match(source, /source:\s*'opening-database'/);
  assert.match(source, /window\.location\.assign\(`\/analyze\?handoff=/);
  assert.match(html, /id="odbPracticeTrainerBtn"[^>]+disabled/);
  assert.match(html, /compatible repertoire handoff contract/);
  const explorerPanel = html.indexOf('id="odbExplorerPanel"');
  const analyzeAction = html.indexOf('id="odbAnalyzeInCaissaBtn"');
  const workspaceFoot = html.indexOf('openingdb-workspace-foot');
  assert.ok(analyzeAction > explorerPanel && analyzeAction < workspaceFoot);
});

test('Opening Database owns a vetted Stockfish 19 Lite client and bounded Fast/Pro queues', () => {
  const adapter = html.indexOf('/js/engine-adapter.js');
  const sf19 = html.indexOf('/js/opening-trainer/stockfish19-client.js');
  const page = html.indexOf('/js/opening-database.js');
  assert.ok(adapter > -1 && sf19 > adapter && page > sf19);
  assert.doesNotMatch(html, /\/js\/engine\/stockfish-client\.js/);
  assert.match(html, /id="odbEngineIdentityValue">Stockfish 19 Lite/);
  assert.match(source, /owner:\s*'opening-database'/);
  assert.match(source, /ENGINE_MOVE_EVAL_FAST_LIMIT\s*=\s*10/);
  assert.match(source, /ENGINE_MOVE_EVAL_PRO_LIMIT\s*=\s*20/);
  assert.match(source, /startInfiniteAnalysis/);
  assert.match(source, /startInfiniteAnalysis\(\{[\s\S]*?stopAtTarget:\s*false,[\s\S]*?maxActivityMs:\s*0,[\s\S]*?stallTimeoutMs:\s*30000/);
  assert.match(source, /engine\.evalClient\.startInfiniteAnalysis\(\{[\s\S]*?stopAtTarget:\s*true/);
  assert.doesNotMatch(source, /\.goDepth\(/);
});

test('Explorer exposes independent Popularity and Engine sorting without restoring All legal', () => {
  assert.doesNotMatch(html, /id="odbMovesAllBtn"|>All legal</i);
  assert.doesNotMatch(html, /aria-label="Move list mode"/);
  assert.match(html, /id="odbSortPopularityBtn"[^>]*aria-pressed="true"[^>]*>Popularity/);
  assert.match(html, /id="odbSortEngineBtn"[^>]*aria-pressed="false"[^>]*>Engine/);
  assert.match(html, /id="odbQuickEvalToggle"/);
  assert.match(html, /id="odbQuickEvalMode"/);
  assert.match(html, /id="odbExplorerSortStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(source, /explorerSortMode:\s*'popularity'/);
  assert.match(source, /function parseExplorerEngineEval/);
  assert.match(source, /function sortExplorerRows/);
  assert.match(source, /function getExplorerDisplayRows/);
  assert.match(source, /mode:\s*state\.explorerSortMode/);
  assert.match(source, /turn === 'b' \? a\.score - b\.score : b\.score - a\.score/);
  assert.match(source, /aEvaluated !== bEvaluated/);
  assert.match(source, /return a\.index - b\.index/);
  assert.match(source, /state\.explorerSortMode = 'popularity';[\s\S]*?cancelNextMoveEvalQueue/);
});

test('Moves is a dedicated isolated SAN review surface with honest metadata fallback', () => {
  assert.match(html, /id="odbMovesNotation"/);
  assert.match(html, /id="odbMovesFirstBtn"/);
  assert.match(html, /id="odbMovesPrevBtn"/);
  assert.match(html, /id="odbMovesNextBtn"/);
  assert.match(html, /id="odbMovesLastBtn"/);
  assert.match(html, /id="odbMovesReturnGamesBtn"/);
  assert.match(source, /Move notation is unavailable because this indexed result contains metadata only/);
  assert.match(source, /createReplayAtPly/);
  assert.match(source, /restoreExplorationBoard/);
  assert.match(source, /candidate\.load_pgn\(pgnText/);
});

test('SEO metadata describes the public Opening Explorer', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.caissa-chess\.org\/opening-database">/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /"@type":\s*"WebApplication"/);
  assert.match(html, /"@type":\s*"BreadcrumbList"/);
});
