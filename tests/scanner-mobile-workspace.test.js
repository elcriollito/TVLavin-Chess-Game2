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

test('four exclusive app-like views use a separate presentation state machine', async () => {
  const [html, source] = await Promise.all([
    read('scanner/index.html'),
    read('scanner/scanner-view-state.js')
  ]);
  for (const view of ['capture', 'reading', 'review_edit', 'workspace']) {
    assert.equal((html.match(new RegExp(`data-principal-view="${view}"`, 'g')) || []).length, 1);
  }
  assert.match(html, /id="readingView"[^>]*hidden[^>]*inert/);
  assert.match(html, /id="reviewEditView"[^>]*hidden[^>]*inert/);
  assert.match(html, /id="workspaceView"[^>]*hidden[^>]*inert/);
  assert.equal((html.match(/id="scannerBoard"/g) || []).length, 1);
  assert.match(html, /id="workspaceBoardSlot"/);
  assert.match(html, /id="editBoardSlot"/);

  const context = { window: {} };
  vm.runInNewContext(source, context);
  const views = context.window.CaissaScannerViewState;
  assert.equal(views.snapshot().view, views.STATES.CAPTURE);
  assert.equal(views.transition(views.STATES.READING, { reason: 'image' }).view, views.STATES.READING);
  assert.equal(views.transition(views.STATES.REVIEW_EDIT, { reason: 'recognition-review' }).view, views.STATES.REVIEW_EDIT);
  assert.equal(views.transition(views.STATES.WORKSPACE, { reason: 'approved' }).view, views.STATES.WORKSPACE);
  assert.equal(views.transition(views.STATES.READING, { reason: 'new-scan' }).view, views.STATES.READING);
  assert.equal(views.transition(views.STATES.CAPTURE, { reason: 'back' }).view, views.STATES.CAPTURE);
  assert.equal(views.transition(views.STATES.WORKSPACE), false);
});

test('position toolbar and board navigation match the mobile contract', async () => {
  const html = await read('scanner/index.html');
  assert.match(html, /class="position-toolbar"/);
  assert.match(html, /id="sideToMove"/);
  for (const id of ['editBtn', 'workspaceSaveDiagramBtn', 'workspaceShareBtn', 'moreBtn', 'firstMoveBtn', 'previousMoveBtn', 'nextMoveBtn', 'lastMoveBtn', 'flipBtn', 'boardActionsBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /class="position-actions"[\s\S]*id="editBtn"[\s\S]*id="workspaceSaveDiagramBtn"[\s\S]*id="workspaceShareBtn"[\s\S]*id="moreBtn"/);
  assert.equal((html.match(/id="workspaceSaveDiagramBtn"/g) || []).length, 1);
  assert.match(html, /id="workspaceSaveDiagramBtn"[^>]*data-diagram-state="unsaved"[^>]*aria-label="Save Diagram"[^>]*aria-pressed="false"[\s\S]*?<i class="far fa-star"/);
  assert.doesNotMatch(html, /id="shareBtn"|id="menuBtn"/);
});

test('Diagram Library entry points reuse one honest placeholder action', async () => {
  const [html, app] = await Promise.all([read('scanner/index.html'), read('scanner/scanner-app.js')]);
  for (const id of ['workspaceSaveDiagramBtn', 'editLibraryBtn', 'diagramLibraryBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function showDiagramLibraryPlaceholder\(\)[\s\S]*Diagram Library — coming soon\./);
  assert.equal((app.match(/addEventListener\('click', showDiagramLibraryPlaceholder\)/g) || []).length, 3);
  assert.doesNotMatch(app, /workspaceSaveDiagram[\s\S]{0,160}(localStorage|indexedDB|fetch\()/);
});

test('top and lower hamburgers expose separate product and analysis menus', async () => {
  const html = await read('scanner/index.html');
  assert.match(html, /id="moreBtn"[^>]*aria-controls="scannerProductMenu"/);
  assert.match(html, /id="boardActionsBtn"[^>]*aria-controls="scannerAnalysisMenu"/);
  for (const label of ['Diagram Library', 'Video Board Explorer', 'Account', 'Membership', 'Logout']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  for (const label of ['Open in Lichess Analyzer', 'Open in Chess.com Analyzer', 'Open in CAISSA Analyzer']) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  const productMenu = html.slice(html.indexOf('id="scannerProductMenu"'), html.indexOf('id="scannerAnalysisMenu"'));
  assert.doesNotMatch(productMenu, />Flip Board<|>Copy FEN<|>Reset Scanner</);
  assert.match(html, /role="menu"/);
  assert.match(html, /role="menuitem"/);
});

test('Edit mode exposes tool-first palettes and compact position controls', async () => {
  const html = await read('scanner/index.html');
  for (const id of ['editSheet', 'applyEditBtn', 'cancelEditBtn', 'editWhiteTurnBtn', 'editBlackTurnBtn', 'editCastlingBtn', 'clearBoardBtn', 'clearSquareBtn', 'editFlipBtn', 'editLibraryBtn', 'editExportBtn', 'editMenuBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal((html.match(/data-piece="[kqrbnpKQRBNP]"/g) || []).length, 12);
  assert.match(html, /id="blackPiecePalette"[\s\S]*data-piece="k"[\s\S]*data-piece="q"[\s\S]*data-piece="r"[\s\S]*data-piece="b"[\s\S]*data-piece="n"[\s\S]*data-piece="p"/);
  assert.match(html, /id="whitePiecePalette"[\s\S]*data-piece="K"[\s\S]*data-piece="Q"[\s\S]*data-piece="R"[\s\S]*data-piece="B"[\s\S]*data-piece="N"[\s\S]*data-piece="P"/);
  assert.match(html, /Add to Diagram Library/);
  assert.match(html, /id="editLibraryBtn"[\s\S]*>Soon</);
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
  assert.match(selectFile, /showReading\(\)/);
  assert.match(selectFile, /routeRecognitionResult\(\)/);
  assert.match(selectFile, /expectedGeneration/);
});

test('safe areas, modal blocking, and mobile touch targets are explicit', async () => {
  const [html, css, app] = await Promise.all([
    read('scanner/index.html'),
    read('scanner/scanner-experience.css'),
    read('scanner/scanner-app.js')
  ]);
  for (const inset of ['top', 'right', 'bottom', 'left']) assert.match(css, new RegExp(`safe-area-inset-${inset}`));
  assert.match(html, /id="sheetBackdrop"[^>]*hidden/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(css, /\.edit-toolbar button,.edit-settings button[^}]*min-height:44px/);
  assert.match(css, /\.sheet-head button\{min-height:44px/);
  assert.match(app, /els\.topbar\.inert = sheetIsOpen/);
  assert.match(app, /element\.inert = !visible \|\| sheetIsOpen/);
  assert.match(app, /focusTargets/);
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

test('FEN draft helpers preserve fields while supporting incomplete edit boards', async () => {
  const source = await read('scanner/scanner-fen.js');
  const window = {};
  vm.runInNewContext(source, { window });
  const tools = window.CaissaScannerFen;
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq e3 4 10';
  const cleared = tools.clearBoard(fen);
  assert.equal(cleared, '8/8/8/8/8/8/8/8 w KQkq - 4 10');
  assert.equal(tools.validate(cleared).ok, false);
  assert.equal(tools.validateDraft(cleared).ok, true);
  assert.equal(tools.setSideToMove(fen, 'b'), 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 4 10');
  assert.equal(tools.setCastling(fen, 'qK'), 'r3k2r/8/8/8/8/8/8/R3K2R w Kq e3 4 10');
  const repeated = tools.mutateSquare(tools.mutateSquare(fen, 3, 7, 'p'), 2, 6, 'p');
  assert.equal(tools.validateDraft(repeated).board[3][7], 'p');
  assert.equal(tools.validateDraft(repeated).board[2][6], 'p');
});

test('analysis handoffs preserve exact FEN and use canonical CAISSA transport', async () => {
  const [handoffSource, adapterSource] = await Promise.all([
    read('js/play/analyze-handoff.js'),
    read('scanner/scanner-adapters.js')
  ]);
  const data = new Map();
  const storage = {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  const assigned = [];
  const window = {
    sessionStorage: storage,
    location: { origin: 'https://caissa.test', assign: (url) => assigned.push(url) },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' }
  };
  vm.runInNewContext(handoffSource, { window, URL });
  vm.runInNewContext(adapterSource, { window, URL });
  const fen = 'r3k2r/pppq1ppp/2npbn2/3Np3/2B1P3/2N2Q2/PPP2PPP/R3K2R w KQkq - 4 10';
  assert.equal(
    window.CaissaScannerAdapters.createLichessAnalysisUrl(fen),
    'https://lichess.org/analysis/standard/r3k2r/pppq1ppp/2npbn2/3Np3/2B1P3/2N2Q2/PPP2PPP/R3K2R_w_KQkq_-_4_10'
  );
  const prepared = window.CaissaScannerAdapters.prepareCaissaAnalyzeHandoff(fen, { orientation: 'black' });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.value.handoff.intent, 'analyze-position');
  assert.equal(prepared.value.handoff.source, 'scanner');
  assert.equal(prepared.value.handoff.payload.finalFen, fen);
  assert.equal(prepared.value.handoff.payload.boardOrientation, 'black');
  const url = new URL(prepared.value.url);
  assert.equal(url.pathname, '/analyze');
  assert.equal(url.searchParams.get('handoff'), prepared.value.handoff.token);
  assert.equal(url.searchParams.has('fen'), false);
});
