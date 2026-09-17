import { LABELS, ORIENTATIONS, assignImageSquare, canonicalIndexForImageIndex, chessWarnings,
  labelsToPlacementFen, placementFenToLabels, reorientLabelsPreservingImage, squareForImageIndex }
  from './piece-label-core.js';

// The old, already-running loopback server may still be serving this static file.
// Keep its client compatible until Alexander restarts; only the hotfix server advertises the workspace API.
let hotfixServer = false;
try {
  const probe = await fetch('/api/samples');
  if (probe.ok) {
    const payload = await probe.json();
    hotfixServer = Boolean(payload.workspace && payload.revisions && Array.isArray(payload.workingDrafts));
  }
} catch { /* The legacy client below will show its normal local-load error. */ }
if (hotfixServer) {
  await import('./annotator-app-v2.js');
} else {

const $ = (selector) => document.querySelector(selector);
const elements = {
  app: $('#app'), loading: $('#loading'), progress: $('#progress'), outputPath: $('#output-path'),
  incomplete: $('#incomplete-only'), select: $('#sample-select'), previous: $('#previous'), next: $('#next'),
  metadata: $('#metadata'), white: $('#white-bottom'), black: $('#black-bottom'), orientation: $('#orientation-status'),
  palette: $('#palette'), selected: $('#selected-label'), heading: $('#sample-heading'), stage: $('#board-stage'),
  image: $('#board-image'), grid: $('#board-grid'), square: $('#square-name'), squareLabel: $('#square-label'),
  fen: $('#placement-fen'), trustedFen: $('#trusted-fen'), prefill: $('#prefill'), warnings: $('#warnings'),
  draft: $('#save-draft'), review: $('#review'), reviewPanel: $('#review-panel'), reviewConfirm: $('#review-confirm'),
  confirm: $('#confirm'), message: $('#message')
};
const pieceNames = Object.freeze({ K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' });
const state = { samples: [], records: new Map(), visible: [], currentId: null, labels: Array(64).fill('empty'),
  orientation: null, selectedLabel: 'empty', overlay: 'both', prefillUsed: false, dirty: false, reviewMode: false,
  highlightedIndex: null, outputPath: '', duplicateAliases: [], outOfScope: [] };

function labelName(label) {
  return label === 'empty' ? 'Empty / Clear' : `${label === label.toUpperCase() ? 'White' : 'Black'} ${pieceNames[label.toUpperCase()]}`;
}

function pieceSrc(label) {
  return label === 'empty' ? null : `/piece/${label === label.toUpperCase() ? 'w' : 'b'}${label.toUpperCase()}.png`;
}

function message(value, kind = '') { elements.message.textContent = value; elements.message.className = `message ${kind}`.trim(); }
function sample() { return state.samples.find((item) => item.sampleId === state.currentId) || null; }
function record(sampleId) { return state.records.get(sampleId) || null; }
function verified(sampleId) { return record(sampleId)?.annotation?.status === 'verified'; }
function markDirty() { state.dirty = true; elements.reviewConfirm.checked = false; message('Unsaved changes. Save draft or review and confirm.'); }

function metadata(label, value) {
  const dt = document.createElement('dt'); dt.textContent = label;
  const dd = document.createElement('dd'); dd.textContent = value == null || value === '' ? '—' : String(value);
  elements.metadata.append(dt, dd);
}

function renderMetadata() {
  const current = sample();
  elements.metadata.replaceChildren();
  if (!current) return;
  metadata('Sample', current.sampleId);
  metadata('Source', current.sourceFilename);
  metadata('SHA-256', current.sourceSha256);
  metadata('Corners', `${current.cornerManifestSha256.slice(0, 16)}…`);
  metadata('Category', current.sourceCategory);
  metadata('Piece family', current.pieceSetFamily || 'unknown');
  metadata('Piece style', current.pieceSetStyle);
  metadata('Board theme', current.boardThemeFamily || 'unknown');
  metadata('Platform', current.sourcePlatform || 'unknown');
  metadata('Difficulty', current.difficultyTags?.join(', ') || 'none recorded');
  metadata('Reference only', current.referenceOutcome || 'unknown');
  metadata('Truth status', record(current.sampleId)?.annotation?.status || 'pending');
  const aliases = state.duplicateAliases.filter((item) => item.canonicalSampleId === current.sampleId)
    .map((item) => item.sampleId);
  if (aliases.length) metadata('Exact-byte alias', aliases.join(', '));
}

function renderNavigation(preferredId = state.currentId) {
  state.visible = state.samples.filter((item) => !elements.incomplete.checked || !verified(item.sampleId));
  if (!state.visible.some((item) => item.sampleId === preferredId)) {
    const oldIndex = Math.max(0, state.samples.findIndex((item) => item.sampleId === preferredId));
    state.currentId = state.visible[Math.min(oldIndex, state.visible.length - 1)]?.sampleId || null;
  } else state.currentId = preferredId;
  elements.select.replaceChildren();
  for (const item of state.visible) {
    const option = document.createElement('option');
    option.value = item.sampleId;
    option.textContent = `${verified(item.sampleId) ? '✓' : record(item.sampleId) ? '◐' : '○'} ${item.sampleId}`;
    elements.select.append(option);
  }
  if (state.currentId) elements.select.value = state.currentId;
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  elements.previous.disabled = index <= 0;
  elements.next.disabled = index < 0 || index >= state.visible.length - 1;
  const done = state.samples.filter((item) => verified(item.sampleId)).length;
  elements.progress.textContent = `${done} / ${state.samples.length} verified · ${state.samples.length - done} pending`;
}

function renderPalette() {
  elements.palette.replaceChildren();
  for (const [color, labels] of [['White', ['K', 'Q', 'R', 'B', 'N', 'P']],
    ['Black', ['k', 'q', 'r', 'b', 'n', 'p']]]) {
    const heading = document.createElement('span'); heading.className = 'palette-group-title'; heading.textContent = color;
    const group = document.createElement('div'); group.className = 'palette-group';
    for (const label of labels) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.label = label;
      button.setAttribute('aria-label', `Select ${labelName(label)}`);
      button.setAttribute('aria-pressed', String(state.selectedLabel === label));
      const image = document.createElement('img'); image.src = pieceSrc(label); image.alt = '';
      button.append(image); group.append(button);
    }
    elements.palette.append(heading, group);
  }
  const empty = document.createElement('button'); empty.type = 'button'; empty.className = 'empty-tool';
  empty.dataset.label = 'empty'; empty.textContent = 'Empty / Clear';
  empty.setAttribute('aria-pressed', String(state.selectedLabel === 'empty'));
  elements.palette.append(empty);
  elements.selected.textContent = `Selected: ${labelName(state.selectedLabel)} (${state.selectedLabel})`;
}

function showSquare(imageIndex) {
  state.highlightedIndex = imageIndex;
  if (imageIndex == null) {
    elements.square.textContent = 'Square: —'; elements.squareLabel.textContent = 'Ground-truth label: —'; return;
  }
  if (!state.orientation) {
    elements.square.textContent = `Image cell ${Math.floor(imageIndex / 8) + 1},${imageIndex % 8 + 1} · choose orientation`;
    elements.squareLabel.textContent = 'Ground-truth label: —'; return;
  }
  const canonicalIndex = canonicalIndexForImageIndex(imageIndex, state.orientation);
  elements.square.textContent = `Square: ${squareForImageIndex(imageIndex, state.orientation)}`;
  elements.squareLabel.textContent = `Ground-truth label: ${state.labels[canonicalIndex]}`;
}

function renderBoard() {
  elements.grid.replaceChildren();
  const visual = state.orientation
    ? (state.orientation === 'white-at-bottom' ? state.labels : [...state.labels].reverse())
    : Array(64).fill('empty');
  for (let index = 0; index < 64; index++) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `board-square ${(Math.floor(index / 8) + index % 8) % 2 ? 'dark' : 'light'}`;
    button.dataset.index = String(index);
    button.setAttribute('aria-label', state.orientation
      ? `${squareForImageIndex(index, state.orientation)}: ${labelName(visual[index])}`
      : `Image cell ${Math.floor(index / 8) + 1}, ${index % 8 + 1}; choose orientation`);
    const src = pieceSrc(visual[index]);
    if (src) { const image = document.createElement('img'); image.src = src; image.alt = ''; button.append(image); }
    elements.grid.append(button);
  }
  elements.stage.className = `board-stage mode-${state.overlay}`;
  for (const button of document.querySelectorAll('[data-overlay]')) {
    button.setAttribute('aria-pressed', String(button.dataset.overlay === state.overlay));
  }
  showSquare(state.highlightedIndex);
}

function renderFacts() {
  elements.white.setAttribute('aria-pressed', String(state.orientation === ORIENTATIONS[0]));
  elements.black.setAttribute('aria-pressed', String(state.orientation === ORIENTATIONS[1]));
  elements.orientation.textContent = state.orientation
    ? state.orientation === ORIENTATIONS[0] ? 'White at bottom' : 'Black at bottom / flipped'
    : 'Not selected — choose orientation before labeling or verifying';
  elements.fen.textContent = state.orientation ? labelsToPlacementFen(state.labels) : 'Choose orientation';
  elements.warnings.replaceChildren();
  for (const warning of chessWarnings(state.labels)) {
    const item = document.createElement('li'); item.textContent = warning; elements.warnings.append(item);
  }
  if (!elements.warnings.childElementCount) {
    const item = document.createElement('li'); item.textContent = 'No structural warnings.'; elements.warnings.append(item);
  }
  elements.reviewPanel.hidden = !state.reviewMode;
  elements.confirm.disabled = !state.orientation || !state.reviewMode || !elements.reviewConfirm.checked;
  elements.heading.textContent = state.currentId || 'No pending samples';
  renderBoard(); renderMetadata();
}

function loadSample(sampleId) {
  state.currentId = sampleId;
  const existing = record(sampleId);
  state.labels = existing ? [...existing.labels] : Array(64).fill('empty');
  state.orientation = existing?.boardOrientation || null;
  state.prefillUsed = Boolean(existing?.annotation?.source?.startsWith('fen-prefill'));
  state.dirty = false;
  state.reviewMode = false;
  state.highlightedIndex = null;
  elements.reviewConfirm.checked = false;
  elements.trustedFen.value = sample()?.trustedFenPlacement || '';
  elements.prefill.disabled = !sample()?.trustedFenPlacement;
  elements.image.src = sampleId ? `/api/board/${encodeURIComponent(sampleId)}` : '';
  renderNavigation(sampleId);
  renderFacts();
  message(existing?.annotation?.status === 'verified' ? 'Verified record loaded for review or editing.'
    : existing ? 'Draft restored from the file manifest.' : 'Pending: choose orientation, then annotate the rectified board.');
}

function navigateTo(sampleId) {
  if (state.dirty && !window.confirm('Discard unsaved label changes?')) {
    elements.select.value = state.currentId; return;
  }
  loadSample(sampleId);
}

async function persist(status) {
  const current = sample();
  if (!current) return;
  if (status === 'verified' && (!state.orientation || !state.reviewMode || !elements.reviewConfirm.checked)) {
    message('Choose orientation, review all 64 squares, and check the human confirmation box.', 'error'); return;
  }
  const source = state.prefillUsed ? (status === 'verified' ? 'fen-prefill-reviewed' : 'fen-prefill-unreviewed') : 'manual';
  const body = { sampleId: current.sampleId, labels: state.labels, boardOrientation: state.orientation,
    status, source, humanVerifiedBy: status === 'verified' ? 'Alexander' : null,
    confirmation: status === 'verified' ? 'I reviewed all 64 squares' : null };
  try {
    const response = await fetch('/api/save', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Caissa-Local-Tool': 'piece-label-annotator'
    }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);
    state.records.set(current.sampleId, result.record);
    state.dirty = false;
    elements.reviewConfirm.checked = false;
    if (status === 'verified') state.reviewMode = false;
    renderNavigation(current.sampleId);
    if (state.currentId !== current.sampleId) loadSample(state.currentId);
    else renderFacts();
    message(status === 'verified' ? 'Human-verified truth saved locally.' : 'Draft saved locally. It is not benchmark truth.', 'success');
  } catch (error) { message(error.message, 'error'); }
}

elements.palette.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-label]');
  if (!button || !LABELS.includes(button.dataset.label)) return;
  state.selectedLabel = button.dataset.label;
  renderPalette();
});
elements.grid.addEventListener('pointerover', (event) => {
  const button = event.target.closest('button[data-index]');
  if (button) showSquare(Number(button.dataset.index));
});
elements.grid.addEventListener('focusin', (event) => {
  const button = event.target.closest('button[data-index]');
  if (button) showSquare(Number(button.dataset.index));
});
elements.grid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-index]');
  if (!button) return;
  if (!state.orientation) { message('Choose White at bottom or Black at bottom before labeling.', 'error'); return; }
  const index = Number(button.dataset.index);
  state.labels = assignImageSquare(state.labels, state.orientation, index, state.selectedLabel);
  markDirty(); renderFacts(); showSquare(index);
});
for (const [button, orientation] of [[elements.white, ORIENTATIONS[0]], [elements.black, ORIENTATIONS[1]]]) {
  button.addEventListener('click', () => {
    state.labels = reorientLabelsPreservingImage(state.labels, state.orientation, orientation);
    state.orientation = orientation;
    markDirty(); renderFacts();
  });
}
for (const button of document.querySelectorAll('[data-overlay]')) {
  button.addEventListener('click', () => { state.overlay = button.dataset.overlay; renderBoard(); });
}
elements.prefill.addEventListener('click', () => {
  try {
    if (!state.orientation) throw new Error('Choose orientation before FEN prefill.');
    if (!sample()?.trustedFenPlacement) throw new Error('No corpus-certified FEN for this sample.');
    state.labels = placementFenToLabels(sample().trustedFenPlacement);
    state.prefillUsed = true;
    markDirty(); renderFacts();
    message('Prefilled as an unverified draft. Compare all 64 squares to the image before confirming.');
  } catch (error) { message(error.message, 'error'); }
});
elements.draft.addEventListener('click', () => persist('draft'));
elements.review.addEventListener('click', () => {
  state.reviewMode = true; state.overlay = 'both'; renderFacts();
  elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  message('Review the rectified image and overlay; warnings do not block compositions.');
});
elements.reviewConfirm.addEventListener('change', () => { elements.confirm.disabled = !state.orientation || !elements.reviewConfirm.checked; });
elements.confirm.addEventListener('click', () => persist('verified'));
elements.previous.addEventListener('click', () => {
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  if (index > 0) navigateTo(state.visible[index - 1].sampleId);
});
elements.next.addEventListener('click', () => {
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  if (index >= 0 && index < state.visible.length - 1) navigateTo(state.visible[index + 1].sampleId);
});
elements.select.addEventListener('change', () => navigateTo(elements.select.value));
elements.image.addEventListener('error', () => message('Rectified image unavailable or source checksum changed.', 'error'));
elements.incomplete.addEventListener('change', () => {
  if (state.dirty && !window.confirm('Discard unsaved label changes?')) {
    elements.incomplete.checked = !elements.incomplete.checked; return;
  }
  renderNavigation(state.currentId); loadSample(state.currentId);
});
window.addEventListener('beforeunload', (event) => {
  if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
});

try {
  const response = await fetch('/api/samples');
  if (!response.ok) throw new Error(`Local corpus could not be loaded (${response.status})`);
  const payload = await response.json();
  state.samples = payload.samples;
  state.records = new Map(payload.records.map((item) => [item.sampleId, item]));
  state.duplicateAliases = payload.duplicateAliases;
  state.outOfScope = payload.outOfScope;
  state.outputPath = payload.outputPath;
  elements.outputPath.textContent = `Manifest: ${payload.outputPath}`;
  renderPalette(); renderNavigation(state.samples[0]?.sampleId);
  loadSample(state.currentId);
  elements.loading.hidden = true; elements.app.hidden = false;
} catch (error) {
  elements.loading.textContent = `Local corpus certification failed: ${error.message}`;
}
}
