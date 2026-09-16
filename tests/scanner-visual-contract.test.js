import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const FAILURE = 'CAISSA Scanner Phase 2C visual contract changed. Explicit Alexander approval is required before altering certified UX.';

function contract(value, detail) {
  assert.ok(value, `${FAILURE}\n${detail}`);
}

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

function hasId(source, id) {
  return new RegExp(`\\bid="${id}"`).test(source);
}

function openingTag(source, id) {
  return source.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] || '';
}

function orderedIds(source, ids, detail) {
  const positions = ids.map((id) => source.indexOf(`id="${id}"`));
  contract(positions.every((position) => position >= 0), `${detail}: a required control is missing.`);
  contract(positions.every((position, index) => index === 0 || position > positions[index - 1]), `${detail}: required order is ${ids.join(' → ')}.`);
}

test('freeze metadata and exception policy remain authoritative', async () => {
  const [document, markerSource] = await Promise.all([
    read('docs/CAISSA_SCANNER_VISUAL_FREEZE.md'),
    read('scanner/SCANNER_VISUAL_FREEZE.json')
  ]);
  const marker = JSON.parse(markerSource);
  contract(marker.phase === '2C', 'Freeze marker phase must remain 2C.');
  contract(marker.status === 'physically-certified', 'Freeze marker must retain physical certification.');
  contract(marker.certifiedBaseline === 'ad8036132417bc0d283f18ccd8d0e320111325c2', 'Certified baseline changed.');
  contract(marker.requiresExplicitApprovalForVisualChanges === true, 'Explicit visual-change approval flag must remain enabled.');
  contract(document.includes("VISUAL-FREEZE exception requires Alexander's explicit approval."), 'Required exception policy is missing.');
  contract(document.includes('Capture → Reading → routeRecognitionResult() → Review/Edit OR Workspace'), 'Phase 3 recognition seam is missing.');
});

test('Workspace toolbar and New Scan structure remain certified', async () => {
  const html = await read('scanner/index.html');
  const toolbarIds = ['editBtn', 'workspaceSaveDiagramBtn', 'workspaceShareBtn', 'moreBtn'];
  toolbarIds.forEach((id) => contract(hasId(html, id), `Workspace toolbar control ${id} is missing.`));
  orderedIds(html, toolbarIds, 'Workspace toolbar changed');
  contract(/class="position-actions"[\s\S]*?id="editBtn"[\s\S]*?id="workspaceSaveDiagramBtn"[\s\S]*?id="workspaceShareBtn"[\s\S]*?id="moreBtn"[\s\S]*?<\/div>/.test(html), 'Workspace toolbar controls must remain together in their certified order.');

  contract(count(html, /id="newScanBtn"/g) === 1, 'Workspace must contain exactly one primary New Scan action.');
  contract(/id="newScanSheet"[^>]*\bhidden\b/.test(html), 'New Scan choices must remain in a progressive chooser.');
  orderedIds(html, ['cancelNewScanBtn', 'takePhotoBtn', 'choosePhotoBtn'], 'New Scan chooser changed');
  for (const id of ['cameraInput', 'galleryInput']) {
    const tag = openingTag(html, id);
    contract(Boolean(tag) && /\bhidden\b/.test(tag), `${id} must remain a hidden picker input, not a permanent visible control.`);
  }

  const fenTag = openingTag(html, 'fenInput');
  contract(/\bhidden\b/.test(fenTag) && /aria-hidden="true"/.test(fenTag), 'Raw FEN input must remain internal and hidden.');
  contract(!/<label[^>]+for="fenInput"/.test(html), 'Raw FEN must not receive a permanent visible label.');
});

test('four principal views retain exclusive app-like architecture', async () => {
  const [html, viewState, app] = await Promise.all([
    read('scanner/index.html'),
    read('scanner/scanner-view-state.js'),
    read('scanner/scanner-app.js')
  ]);
  const views = [
    ['capture', 'homeView'],
    ['reading', 'readingView'],
    ['review_edit', 'reviewEditView'],
    ['workspace', 'workspaceView']
  ];
  for (const [name, id] of views) {
    contract(count(html, new RegExp(`data-principal-view="${name}"`, 'g')) === 1, `Principal view ${name} must exist exactly once.`);
    contract(hasId(html, id), `Principal view container ${id} is missing.`);
  }
  for (const id of ['readingView', 'reviewEditView', 'workspaceView']) {
    const tag = openingTag(html, id);
    contract(/\bhidden\b/.test(tag) && /\binert\b/.test(tag) && /aria-hidden="true"/.test(tag), `${id} must start inactive and non-focusable.`);
  }
  for (const [key, value] of [['CAPTURE', 'capture'], ['READING', 'reading'], ['REVIEW_EDIT', 'review_edit'], ['WORKSPACE', 'workspace']]) {
    contract(new RegExp(`${key}:\\s*['\"]${value}['\"]`).test(viewState), `Presentation state ${key} is missing.`);
  }
  contract(/element\.hidden = !visible/.test(app), 'Inactive principal views must leave layout.');
  contract(/element\.inert = !visible \|\| sheetIsOpen/.test(app), 'Inactive or modal-obscured views must not remain interactive.');
});

test('Review/Edit controls, palette placement, and current-position behavior remain certified', async () => {
  const [html, app] = await Promise.all([read('scanner/index.html'), read('scanner/scanner-app.js')]);
  const required = [
    'applyEditBtn', 'cancelEditBtn', 'editWhiteTurnBtn', 'editBlackTurnBtn',
    'editCastlingBtn', 'clearBoardBtn', 'clearSquareBtn', 'editFlipBtn',
    'editLibraryBtn', 'editExportBtn', 'editMenuBtn', 'editToolStatus'
  ];
  required.forEach((id) => contract(hasId(html, id), `Certified Edit control ${id} is missing.`));
  orderedIds(html, ['blackPiecePalette', 'editBoardSlot', 'whitePiecePalette'], 'Edit palette placement changed');
  contract(count(html, /data-piece="[kqrbnpKQRBNP]"/g) === 12, 'Edit must retain six black and six white piece tools.');
  contract(count(html, /src="\/img\/chesspieces\/wikipedia\/[bw][KQRBNP]\.png"/g) >= 12, 'Edit must retain official image piece assets.');
  contract(/function openEdit[\s\S]*?const fen = currentFen\(\)/.test(app), 'Edit must continue to open the current board position.');

  const editStart = html.indexOf('id="reviewEditView"');
  const editEnd = html.indexOf('id="sheetBackdrop"');
  const editMarkup = html.slice(editStart, editEnd);
  contract(!/id="(?:cameraInput|galleryInput|newScanBtn|takePhotoBtn|choosePhotoBtn)"/.test(editMarkup), 'Camera, Gallery, and New Scan controls must stay out of Edit.');
});

test('product and current-position menus remain separate and complete', async () => {
  const html = await read('scanner/index.html');
  const productStart = html.indexOf('id="scannerProductMenu"');
  const analysisStart = html.indexOf('id="scannerAnalysisMenu"');
  const newScanStart = html.indexOf('id="newScanSheet"');
  contract(productStart >= 0 && analysisStart > productStart && newScanStart > analysisStart, 'Certified menu containers are missing or reordered.');
  const product = html.slice(productStart, analysisStart);
  const analysis = html.slice(analysisStart, newScanStart);
  for (const label of ['Diagram Library', 'Video Board Explorer', 'Account', 'Membership', 'Logout']) {
    contract(product.includes(`>${label}<`), `Product / Account menu item ${label} is missing.`);
    contract(!analysis.includes(`>${label}<`), `${label} must not move into the lower analysis menu.`);
  }
  for (const label of ['Open in Lichess Analyzer', 'Open in Chess.com Analyzer', 'Open in CAISSA Analyzer']) {
    contract(analysis.includes(`>${label}<`), `Current Position / Analysis menu item ${label} is missing.`);
    contract(!product.includes(`>${label}<`), `${label} must not move into the Product / Account menu.`);
  }
});

test('Export remains internal-first and retains both certified formats', async () => {
  const [html, app] = await Promise.all([read('scanner/index.html'), read('scanner/scanner-app.js')]);
  contract(/id="exportSheet"[^>]*\bhidden\b[^>]*role="dialog"/.test(html), 'Export must remain an internal progressive chooser.');
  orderedIds(html, ['exportDiagramBtn', 'exportFenBtn'], 'Export format order changed');
  contract(html.includes('>Diagram Image<'), 'Diagram Image export is missing.');
  contract(html.includes('>FEN Text<'), 'FEN Text export is missing.');
  contract(/els\.workspaceShare\.addEventListener\(\s*['\"]click['\"][\s\S]{0,120}openExport\(/.test(app), 'First Workspace Export tap must open the internal chooser.');
});

test('engine identity and persistent 8 by 8 board architecture remain certified', async () => {
  const [html, analysis, app, geometry, geometryCss, fen] = await Promise.all([
    read('scanner/index.html'),
    read('scanner/scanner-analysis.js'),
    read('scanner/scanner-app.js'),
    read('scanner/scanner-geometry.js'),
    read('scanner/scanner-geometry.css'),
    read('scanner/scanner-fen.js')
  ]);
  contract(html.includes('Stockfish 18'), 'Stockfish 18 identity is missing.');
  contract(/const MULTIPV = 3/.test(analysis), 'MultiPV 3 expectation changed.');
  contract(count(html, /id="scannerBoard"/g) === 1, 'There must be exactly one canonical board container.');
  for (const id of ['scannerBoardShell', 'workspaceBoardSlot', 'editBoardSlot']) {
    contract(hasId(html, id), `Persistent board architecture node ${id} is missing.`);
  }
  contract(/els\.editBoardSlot\.appendChild\(els\.boardShell\)/.test(app), 'Review/Edit must reuse the persistent board shell.');
  contract(/els\.workspaceBoardSlot\.appendChild\(els\.boardShell\)/.test(app), 'Workspace must reuse the persistent board shell.');
  contract(/Math\.floor\(available\/8\)\*8/.test(geometry), 'Board size must remain divisible into eight equal files/ranks.');
  contract(/repeat\(8,var\(--scanner-square-size/.test(geometryCss), 'Board CSS must retain eight equal columns and rows.');
  contract(/squares\.length === 64/.test(fen) && /i < 64/.test(fen), 'Canonical board renderer must retain exactly 64 squares.');
});
