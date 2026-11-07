import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('opening-database.html');
const css = read('css/opening-database.css');
const source = read('js/opening-database.js');

test('Opening Database V2 exposes the requested HEAD/BODY/FOOT workspace and tab order', () => {
  const analysis = html.indexOf('id="odbTabAnalysis"');
  const games = html.indexOf('id="odbTabGames"');
  const explore = html.indexOf('id="odbTabMoves"');
  assert.ok(analysis > -1 && games > analysis && explore > games);
  assert.match(html, /id="odbTabMoves"[^>]+aria-selected="true"[^>]+tabindex="0"/);
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
});

test('SEO metadata describes the public Opening Explorer', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.caissa-chess\.org\/opening-database">/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /"@type":\s*"WebApplication"/);
  assert.match(html, /"@type":\s*"BreadcrumbList"/);
});
