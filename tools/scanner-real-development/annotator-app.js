import { LABELS, ORIENTATIONS, assignImageSquare, canonicalIndexForImageIndex, labelsToPlacementFen,
  reorientLabelsPreservingImage, squareForImageIndex } from '/piece-label-core.js';

const $ = (selector) => document.querySelector(selector);
const element = {
  app: $('#app'), loading: $('#loading'), progress: $('#progress'), saveStatus: $('#save-status'),
  select: $('#sample-select'), incomplete: $('#incomplete-only'), previous: $('#previous'), next: $('#next'),
  sourceMetadata: $('#source-metadata'), governance: $('#governance'), output: $('#output-path'),
  platform: $('#platform'), platformSubtype: $('#platform-subtype'), captureType: $('#capture-type'),
  sourceCategory: $('#source-category'), rightsStatus: $('#rights-status'), developmentUseAllowed: $('#development-use-allowed'),
  sourceGroup: $('#source-group'), sessionGroup: $('#session-group'),
  split: $('#split'), notes: $('#notes'), tags: $('#subtype-tags'), nearReview: $('#near-review'),
  reviewDistinct: $('#review-distinct'), reviewReason: $('#review-reason'), source: $('#source-image'),
  sourceStage: $('#source-stage'), overlay: $('#corner-overlay'), cornerInstruction: $('#corner-instruction'),
  undo: $('#undo-corner'), reset: $('#reset-corners'), verifyCorners: $('#verify-corners'),
  piecePanel: $('#piece-panel'), board: $('#board-image'), grid: $('#board-grid'), palette: $('#palette'),
  selected: $('#selected-label'), white: $('#white-bottom'), black: $('#black-bottom'),
  orientation: $('#orientation-status'), square: $('#square-status'), fen: $('#placement-fen'),
  review: $('#review-labels'), reviewPanel: $('#review-panel'), all64: $('#all64-reviewed'),
  verifyPieces: $('#verify-pieces'), saveDraft: $('#save-draft'), exclude: $('#exclude'), message: $('#message')
};
const subtypes = ['plain-digital', 'highlighted', 'arrow-overlay', 'coordinate-edge', 'screen-glare', 'moire',
  'compression', 'wood', 'dark-theme', 'light-theme', 'print', 'paper-texture', 'hatched', 'low-contrast',
  'livestream', 'photo-of-screen'];
const state = { samples: [], records: new Map(), revisions: new Map(), currentId: null, record: null,
  selectedLabel: 'empty', visible: [], dirty: false, editRevision: 0, saveTimer: null, savePromise: null,
  navigating: false, verifying: false, sourceShown: null, boardShown: null };
const currentSample = () => state.samples.find((item) => item.sampleId === state.currentId);
const locked = () => ['human-verified', 'excluded'].includes(state.record?.status);
const labelName = (label) => label === 'empty' ? 'Empty / Clear'
  : `${label === label.toUpperCase() ? 'White' : 'Black'} ${{
    K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' }[label.toUpperCase()]}`;
const pieceSrc = (label) => label === 'empty' ? null
  : `/piece/${label === label.toUpperCase() ? 'w' : 'b'}${label.toUpperCase()}.png`;
function message(text, kind = '') { element.message.textContent = text; element.message.className = kind; }
function saveStatus(text, kind = '') { element.saveStatus.textContent = text; element.saveStatus.className = kind; }
async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json',
    'X-Caissa-Local-Tool': 'real-development-annotator' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Local save failed (${response.status})`);
  return payload;
}
async function cornerHash(corners) {
  const bytes = new TextEncoder().encode(JSON.stringify(corners));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function defaultRecord(sample) {
  return { sampleId: sample.sampleId, sourceSha256: sample.sourceSha256, sourceRole: 'development-only',
    finalBenchmarkUseAllowed: false, status: sample.governanceStatus === 'excluded-exact-duplicate' ? 'excluded' : 'unreviewed',
    corners: [], cornerRevision: null, orientation: null, labels: Array(64).fill('empty'),
    placementFen: labelsToPlacementFen(Array(64).fill('empty')),
    verification: { cornersVerifiedBy: null, piecesVerifiedBy: null, all64Reviewed: false,
      nearDuplicateReviewedDistinctBy: null, reviewReason: '' },
    metadata: { platform: sample.platform, platformSubtype: sample.platformSubtype,
      captureType: sample.captureType, sourceCategory: sample.sourceCategory, rightsStatus: sample.rightsStatus,
      developmentUseAllowed: true, redistributionAllowed: false, sourceGroup: null, sessionGroup: null,
      split: 'unassigned', subtypeTags: [], notes: sample.duplicateOf ? `Exact duplicate of ${sample.duplicateOf}` : '' } };
}
function visibleSamples() {
  return state.samples.filter((item) => !state.incompleteOnly
    || state.records.get(item.sampleId)?.status !== 'human-verified');
}
function renderNavigation() {
  state.visible = visibleSamples();
  element.select.replaceChildren();
  for (const item of state.visible) {
    const option = document.createElement('option'); option.value = item.sampleId;
    const status = state.records.get(item.sampleId)?.status || item.governanceStatus;
    option.textContent = `${status === 'human-verified' ? '✓' : status === 'excluded' ? '×' : '○'} ${item.sampleId}`;
    element.select.append(option);
  }
  if (state.currentId && state.visible.some((item) => item.sampleId === state.currentId)) element.select.value = state.currentId;
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  element.previous.disabled = state.navigating || index <= 0;
  element.next.disabled = state.navigating || index < 0 || index >= state.visible.length - 1;
  const done = state.samples.filter((item) => state.records.get(item.sampleId)?.status === 'human-verified').length;
  element.progress.textContent = `${done} / ${state.samples.length} human-verified · ${state.samples.length - done} pending`;
}
function addMetadata(name, value) {
  const dt = document.createElement('dt'); dt.textContent = name;
  const dd = document.createElement('dd'); dd.textContent = value == null ? '—' : String(value);
  element.sourceMetadata.append(dt, dd);
}
function renderSourceMetadata() {
  const sample = currentSample();
  element.sourceMetadata.replaceChildren();
  if (!sample) return;
  addMetadata('File', sample.sourceFilename); addMetadata('Size', `${sample.sourceWidth}×${sample.sourceHeight}, ${sample.sourceBytes} bytes`);
  addMetadata('SHA-256', sample.sourceSha256); addMetadata('Role', 'development-only');
  addMetadata('Status', state.record.status);
  addMetadata('Rights', `${state.record.metadata.rightsStatus}; development ${state.record.metadata.developmentUseAllowed ? 'allowed' : 'blocked'}; no redistribution`);
  element.governance.textContent = sample.governanceStatus === 'admitted' ? 'No exact or screened near-duplicate found.'
    : sample.governanceStatus === 'review-required'
      ? `HOLD for review: protected ${sample.possibleNearProtected.join(', ') || 'none'}; peers ${sample.possibleNearPeers.join(', ') || 'none'}`
      : `Excluded exact duplicate of ${sample.duplicateOf}`;
  element.nearReview.hidden = sample.governanceStatus !== 'review-required';
}
function loadMetadataFields() {
  const metadata = state.record.metadata;
  for (const [key, input] of [['platform', element.platform], ['platformSubtype', element.platformSubtype],
    ['captureType', element.captureType], ['sourceCategory', element.sourceCategory],
    ['sourceGroup', element.sourceGroup], ['sessionGroup', element.sessionGroup], ['notes', element.notes]]) {
    input.value = metadata[key] || '';
  }
  element.split.value = metadata.split || 'unassigned';
  element.rightsStatus.value = metadata.rightsStatus || 'user-provided-internal-research';
  element.developmentUseAllowed.checked = metadata.developmentUseAllowed === true;
  for (const input of element.tags.querySelectorAll('input')) input.checked = metadata.subtypeTags.includes(input.value);
  element.reviewDistinct.checked = state.record.verification?.nearDuplicateReviewedDistinctBy === 'Alexander';
  element.reviewReason.value = state.record.verification?.reviewReason || '';
  for (const input of document.querySelectorAll('aside input, aside select, aside textarea')) {
    if (input.id !== 'incomplete-only' && input.id !== 'sample-select') input.disabled = locked();
  }
}
function renderCorners() {
  const sample = currentSample(), corners = state.record.corners || [];
  element.overlay.replaceChildren();
  element.overlay.setAttribute('viewBox', `0 0 ${sample.sourceWidth} ${sample.sourceHeight}`);
  if (corners.length > 1) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', [...corners, ...(corners.length === 4 ? [corners[0]] : [])]
      .map((point) => point.join(',')).join(' '));
    element.overlay.append(line);
  }
  corners.forEach(([x, y], index) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 7); element.overlay.append(dot);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 12); text.setAttribute('y', y - 12);
    text.textContent = ['TL', 'TR', 'BR', 'BL'][index]; element.overlay.append(text);
  });
  element.cornerInstruction.textContent = corners.length < 4 ? `Click ${['TL', 'TR', 'BR', 'BL'][corners.length]} corner (${corners.length + 1}/4)`
    : 'Review the quadrilateral, then verify the playable field.';
  element.undo.disabled = locked() || !corners.length;
  element.reset.disabled = locked() || !corners.length;
  element.verifyCorners.disabled = locked() || corners.length !== 4 || state.verifying;
}
function renderPalette() {
  element.palette.replaceChildren();
  for (const [name, pieces] of [['White', ['K', 'Q', 'R', 'B', 'N', 'P']], ['Black', ['k', 'q', 'r', 'b', 'n', 'p']]]) {
    const heading = document.createElement('strong'); heading.textContent = name; element.palette.append(heading);
    for (const label of pieces) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.label = label;
      button.setAttribute('aria-label', `Select ${labelName(label)}`);
      button.setAttribute('aria-pressed', String(state.selectedLabel === label));
      const image = document.createElement('img'); image.src = pieceSrc(label); image.alt = '';
      button.append(image); element.palette.append(button);
    }
  }
  const empty = document.createElement('button'); empty.type = 'button'; empty.dataset.label = 'empty';
  empty.textContent = 'Empty / Clear'; empty.setAttribute('aria-pressed', String(state.selectedLabel === 'empty'));
  element.palette.append(empty);
  element.selected.textContent = `Selected: ${labelName(state.selectedLabel)}`;
}
function renderPieces() {
  const record = state.record;
  const ready = ['corners-verified', 'pieces-draft', 'human-verified'].includes(record.status);
  element.piecePanel.hidden = !ready;
  if (!ready) return;
  element.white.setAttribute('aria-pressed', String(record.orientation === ORIENTATIONS[0]));
  element.black.setAttribute('aria-pressed', String(record.orientation === ORIENTATIONS[1]));
  element.white.disabled = locked(); element.black.disabled = locked();
  element.orientation.textContent = record.orientation || 'Choose orientation';
  element.fen.textContent = record.orientation ? record.placementFen : 'Choose orientation';
  element.review.disabled = locked() || !record.orientation;
  element.verifyPieces.disabled = locked() || !element.all64.checked;
  if (element.grid.childElementCount !== 64) {
    for (let index = 0; index < 64; index++) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.index = String(index);
      element.grid.append(button);
    }
  }
  for (let index = 0; index < 64; index++) {
    const button = element.grid.children[index];
    const label = record.orientation ? record.labels[canonicalIndexForImageIndex(index, record.orientation)] : 'empty';
    button.setAttribute('aria-label', record.orientation ? `${squareForImageIndex(index, record.orientation)}: ${labelName(label)}`
      : `Image cell ${index + 1}; choose orientation`);
    if (button.dataset.label !== label) {
      button.dataset.label = label;
      const src = pieceSrc(label);
      if (!src) button.replaceChildren();
      else { const image = document.createElement('img'); image.src = src; image.alt = ''; button.replaceChildren(image); }
    }
    button.disabled = locked();
  }
  const boardKey = `${record.sampleId}:${record.cornerRevision}`;
  if (state.boardShown !== boardKey) {
    element.board.src = `/api/board/${encodeURIComponent(record.sampleId)}?v=${record.cornerRevision}`;
    state.boardShown = boardKey;
  }
}
function render() {
  renderNavigation(); renderSourceMetadata(); renderCorners(); renderPalette(); renderPieces();
  element.saveDraft.disabled = locked() || state.navigating;
  element.exclude.disabled = locked() || state.navigating;
}
function cancelSaveTimer() { if (state.saveTimer) clearTimeout(state.saveTimer); state.saveTimer = null; }
function markDirty() {
  state.editRevision++;
  state.dirty = true;
  saveStatus('Unsaved changes', 'unsaved');
  cancelSaveTimer();
  state.saveTimer = setTimeout(() => { state.saveTimer = null; void flushDraft().catch(() => {}); }, 450);
}
async function flushDraft(force = false) {
  cancelSaveTimer();
  if (state.savePromise) {
    await state.savePromise;
    if (state.dirty || force) await flushDraft(force);
    return;
  }
  if (!state.dirty && !force) return;
  const work = (async () => {
    do {
      const id = state.currentId, edit = state.editRevision;
      const record = structuredClone(state.record);
      saveStatus('Saving…', 'saving');
      const payload = await post('/api/save', { record, expectedRevision: state.revisions.get(id) || null });
      state.records.set(id, payload.record); state.revisions.set(id, payload.revision);
      if (id === state.currentId && edit === state.editRevision) {
        state.dirty = false; saveStatus('Saved · local draft', 'saved');
      }
      force = false;
    } while (state.dirty);
    renderNavigation();
  })();
  state.savePromise = work;
  try { await work; }
  catch (error) {
    state.dirty = true; saveStatus('Save failed · do not close', 'failed');
    message(`Local save failed: ${error.message}. Navigation blocked; retry Save draft.`, 'error');
    throw error;
  } finally { if (state.savePromise === work) state.savePromise = null; }
}
function loadSample(id) {
  state.currentId = id; state.record = structuredClone(state.records.get(id) || defaultRecord(currentSample()));
  state.dirty = false; state.editRevision++;
  element.reviewPanel.hidden = true; element.all64.checked = false;
  state.boardShown = null;
  if (state.sourceShown !== id) {
    element.source.src = `/api/source/${encodeURIComponent(id)}`;
    state.sourceShown = id;
  }
  loadMetadataFields(); render(); saveStatus('Saved', 'saved');
  message(state.record.status === 'human-verified' ? 'Human truth is locked and preserved.'
    : state.record.status === 'excluded' ? 'This source is excluded.'
      : 'Ready. Corners, metadata and piece drafts autosave locally.');
}
async function navigate(id) {
  if (!id || state.navigating || id === state.currentId) return;
  state.navigating = true; renderNavigation();
  const old = state.currentId;
  try {
    await flushDraft();
    await post('/api/activate', { sampleId: id, incompleteOnly: state.incompleteOnly });
    loadSample(id);
  } catch (error) {
    element.select.value = old;
    message(`Navigation blocked: ${error.message}`, 'error');
  } finally { state.navigating = false; renderNavigation(); }
}
function resetAfterCornerEdit() {
  if (locked()) return;
  state.record.status = 'corners-draft';
  state.record.cornerRevision = null;
  state.record.verification.cornersVerifiedBy = null;
  state.record.verification.piecesVerifiedBy = null;
  state.record.verification.all64Reviewed = false;
  state.record.orientation = null;
  state.record.labels = Array(64).fill('empty');
  state.record.placementFen = labelsToPlacementFen(state.record.labels);
  state.boardShown = null;
  markDirty(); render();
}
function editMetadata() {
  if (locked()) return;
  const metadata = state.record.metadata;
  metadata.platform = element.platform.value.trim() || 'unknown';
  metadata.platformSubtype = element.platformSubtype.value.trim() || 'unknown';
  metadata.captureType = element.captureType.value.trim() || 'unknown';
  metadata.sourceCategory = element.sourceCategory.value.trim() || 'unknown';
  metadata.rightsStatus = element.rightsStatus.value;
  if (metadata.rightsStatus !== 'user-provided-internal-research') element.developmentUseAllowed.checked = false;
  metadata.developmentUseAllowed = element.developmentUseAllowed.checked;
  metadata.sourceGroup = element.sourceGroup.value.trim() || null;
  metadata.sessionGroup = element.sessionGroup.value.trim() || null;
  if (!metadata.developmentUseAllowed) element.split.value = 'unassigned';
  metadata.split = element.split.value;
  metadata.notes = element.notes.value;
  metadata.subtypeTags = [...element.tags.querySelectorAll('input:checked')].map((input) => input.value);
  state.record.verification.nearDuplicateReviewedDistinctBy = element.reviewDistinct.checked ? 'Alexander' : null;
  state.record.verification.reviewReason = element.reviewReason.value;
  markDirty(); renderSourceMetadata();
}

for (const tag of subtypes) {
  const label = document.createElement('label'); const input = document.createElement('input');
  input.type = 'checkbox'; input.value = tag; label.append(input, document.createTextNode(tag)); element.tags.append(label);
}
for (const input of document.querySelectorAll('aside input, aside select, aside textarea')) {
  if (['sample-select', 'incomplete-only'].includes(input.id)) continue;
  input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', editMetadata);
}
element.sourceStage.addEventListener('click', (event) => {
  if (locked() || state.record.corners.length === 4) return;
  const rect = element.source.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  const sample = currentSample();
  const x = Number(((event.clientX - rect.left) * sample.sourceWidth / rect.width).toFixed(3));
  const y = Number(((event.clientY - rect.top) * sample.sourceHeight / rect.height).toFixed(3));
  state.record.corners.push([x, y]); resetAfterCornerEdit();
});
element.undo.addEventListener('click', () => { state.record.corners.pop(); resetAfterCornerEdit(); });
element.reset.addEventListener('click', () => { state.record.corners = []; resetAfterCornerEdit(); });
element.verifyCorners.addEventListener('click', async () => {
  if (locked() || state.record.corners.length !== 4 || state.verifying) return;
  state.verifying = true; renderCorners();
  try {
    await flushDraft();
    state.record.status = 'corners-verified';
    state.record.cornerRevision = await cornerHash(state.record.corners);
    state.record.verification.cornersVerifiedBy = 'Alexander';
    markDirty(); await flushDraft(); render();
    message('Playable-field corners verified. Choose orientation and annotate 64 squares.', 'success');
  } catch (error) { message(`Corners not verified: ${error.message}`, 'error'); }
  finally { state.verifying = false; renderCorners(); }
});
element.palette.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-label]'); if (!button) return;
  state.selectedLabel = button.dataset.label; renderPalette();
});
for (const [button, orientation] of [[element.white, ORIENTATIONS[0]], [element.black, ORIENTATIONS[1]]]) {
  button.addEventListener('click', () => {
    if (locked() || state.record.orientation === orientation) return;
    state.record.labels = reorientLabelsPreservingImage(state.record.labels, state.record.orientation, orientation);
    state.record.orientation = orientation; state.record.placementFen = labelsToPlacementFen(state.record.labels);
    state.record.status = 'pieces-draft'; markDirty(); renderPieces();
  });
}
element.grid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-index]');
  if (!button || locked()) return;
  if (!state.record.orientation) { message('Choose orientation first.', 'error'); return; }
  const index = Number(button.dataset.index);
  const canonical = canonicalIndexForImageIndex(index, state.record.orientation);
  if (state.record.labels[canonical] === state.selectedLabel) return;
  state.record.labels = assignImageSquare(state.record.labels, state.record.orientation, index, state.selectedLabel);
  state.record.placementFen = labelsToPlacementFen(state.record.labels);
  state.record.status = 'pieces-draft'; markDirty(); renderPieces();
  element.square.textContent = `${squareForImageIndex(index, state.record.orientation)}: ${labelName(state.selectedLabel)}`;
});
element.review.addEventListener('click', () => { element.reviewPanel.hidden = false;
  message('Compare the rectified image and every label. Warnings do not block puzzles.'); });
element.all64.addEventListener('change', () => { element.verifyPieces.disabled = !element.all64.checked; });
element.verifyPieces.addEventListener('click', async () => {
  if (locked() || !element.all64.checked || !state.record.orientation || state.verifying) return;
  state.verifying = true;
  try {
    await flushDraft();
    state.record.status = 'human-verified';
    state.record.verification.piecesVerifiedBy = 'Alexander';
    state.record.verification.all64Reviewed = true;
    markDirty(); await flushDraft(); render();
    message('All 64 labels human-verified and saved locally. Original source unchanged.', 'success');
  } catch (error) {
    state.record.status = 'pieces-draft'; state.record.verification.piecesVerifiedBy = null;
    state.record.verification.all64Reviewed = false;
    message(`Verification blocked: ${error.message}`, 'error');
  } finally { state.verifying = false; }
});
element.saveDraft.addEventListener('click', async () => {
  try { await flushDraft(true); message('Draft checkpoint complete. Safe to close or restart.', 'success'); }
  catch { /* Failure status already explains why navigation is blocked. */ }
});
element.exclude.addEventListener('click', async () => {
  if (locked()) return;
  if (element.notes.value.trim().length < 5) { message('Write an exclusion reason in Notes first.', 'error'); return; }
  state.record.metadata.notes = element.notes.value;
  state.record.status = 'excluded'; markDirty();
  try { await flushDraft(); render(); message('Source excluded; original image unchanged.', 'success'); }
  catch (error) { state.record.status = 'unreviewed'; message(`Exclusion not saved: ${error.message}`, 'error'); }
});
element.previous.addEventListener('click', () => {
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  if (index > 0) void navigate(state.visible[index - 1].sampleId);
});
element.next.addEventListener('click', () => {
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  if (index >= 0 && index < state.visible.length - 1) void navigate(state.visible[index + 1].sampleId);
});
element.select.addEventListener('change', () => { void navigate(element.select.value); });
element.incomplete.addEventListener('change', () => {
  state.incompleteOnly = element.incomplete.checked;
  const list = visibleSamples();
  const id = list.some((item) => item.sampleId === state.currentId) ? state.currentId : list[0]?.sampleId;
  renderNavigation(); if (id && id !== state.currentId) void navigate(id);
});
window.addEventListener('beforeunload', (event) => {
  if (state.dirty || state.savePromise || state.verifying) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.dirty) void flushDraft().catch(() => {});
});
try {
  const response = await fetch('/api/samples');
  if (!response.ok) throw new Error(`Local corpus unavailable (${response.status})`);
  const payload = await response.json();
  state.samples = payload.samples; state.records = new Map(payload.records.map((item) => [item.sampleId, item]));
  state.revisions = new Map(Object.entries(payload.revisions));
  state.incompleteOnly = payload.workspace.incompleteOnly;
  element.incomplete.checked = state.incompleteOnly;
  element.output.textContent = `Local truth: ${payload.outputPath}`;
  const start = payload.workspace.lastActiveSampleId || state.samples[0]?.sampleId;
  if (!start) throw new Error('No source images in certified cohort.');
  loadSample(start);
  if (payload.recovery.length) message(`Recovered local checkpoint: ${payload.recovery.join(', ')}. Review draft.`, 'success');
  element.loading.hidden = true; element.app.hidden = false;
} catch (error) { element.loading.textContent = `Annotation blocked: ${error.message}`; }
