import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('approved workspace exposes one scan control and progressive action sheets', async () => {
  const html = await read('scanner/index.html');
  assert.match(html, /id="newScanBtn"/);
  assert.equal((html.match(/id="newScanBtn"/g) || []).length, 1);
  assert.match(html, /id="newScanSheet"[^>]*hidden/);
  assert.match(html, />Take Photo</);
  assert.match(html, />Choose Photo</);
  assert.match(html, /id="cancelNewScanBtn"/);
  assert.doesNotMatch(html, /quick-rescan|quick-rescan-btn/);
});

test('position toolbar and board navigation match the mobile contract', async () => {
  const html = await read('scanner/index.html');
  assert.match(html, /class="position-toolbar"/);
  assert.match(html, /id="sideToMove"/);
  for (const id of ['editBtn', 'workspaceShareBtn', 'moreBtn', 'firstMoveBtn', 'previousMoveBtn', 'nextMoveBtn', 'lastMoveBtn', 'flipBtn', 'boardActionsBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /id="shareBtn"|id="menuBtn"/);
});

test('FEN stays internal and export opens a format chooser', async () => {
  const html = await read('scanner/index.html');
  assert.match(html, /id="fenInput" hidden aria-hidden="true"/);
  assert.match(html, /id="exportSheet"[^>]*hidden/);
  assert.match(html, /id="exportDiagramBtn"/);
  assert.match(html, /id="exportFenBtn"/);
  assert.doesNotMatch(html, /<label[^>]*for="fenInput"/);
});

test('Scanner keeps Stockfish 18, MultiPV 3, and attributed stale-result guards', async () => {
  const [html, analysis] = await Promise.all([read('scanner/index.html'), read('scanner/scanner-analysis.js')]);
  assert.match(html, /Stockfish 18/);
  assert.match(analysis, /const MULTIPV = 3/);
  assert.match(analysis, /stockfish-18-lite/);
  assert.match(analysis, /startAnalysisAttributed/);
  assert.match(analysis, /generation !== activeGeneration/);
  assert.match(analysis, /stopAnalysis/);
});

test('new scan only advances generation after a valid image selection', async () => {
  const app = await read('scanner/scanner-app.js');
  const openNewScan = app.slice(app.indexOf('function openNewScan'), app.indexOf('function openPicker'));
  const selectFile = app.slice(app.indexOf('function selectFile'), app.indexOf('function resetAll'));
  assert.doesNotMatch(openNewScan, /beginSource|resetAll/);
  assert.match(selectFile, /file\.type\.startsWith\('image\/'\)/);
  assert.ok(selectFile.indexOf('state.beginSource()') > selectFile.indexOf("file.type.startsWith('image/')"));
  assert.match(selectFile, /expectedGeneration/);
});

test('state generations reject stale recognition results', async () => {
  const source = await read('scanner/scanner-state.js');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const scannerState = context.window.CaissaScannerState;
  const first = scannerState.beginSource();
  scannerState.beginSource();
  const currentGeneration = scannerState.snapshot().generation;
  assert.equal(scannerState.setCandidate(first.generation, { fen: 'stale' }), false);
  assert.equal(scannerState.setCandidate(currentGeneration, { fen: 'current' }), true);
  assert.equal(scannerState.snapshot().candidate.fen, 'current');
});

test('geometry remains an integer 8 by 8 persistent grid', async () => {
  const [geometry, geometryCss, fen] = await Promise.all([
    read('scanner/scanner-geometry.js'),
    read('scanner/scanner-geometry.css'),
    read('scanner/scanner-fen.js')
  ]);
  assert.match(geometry, /Math\.floor\(available\/8\)\*8/);
  assert.match(geometryCss, /repeat\(8,var\(--scanner-square-size/);
  assert.match(fen, /squares\.length === 64/);
  assert.match(fen, /for \(let i = 0; i < 64; i \+= 1\)/);
});
