import { LABELS, ORIENTATIONS, assignImageSquare, canonicalIndexForImageIndex, chessWarnings,
  labelsToPlacementFen, placementFenToLabels, reorientLabelsPreservingImage, squareForImageIndex }
  from './piece-label-core.js';

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
elements.saveStatus = document.createElement('strong');
elements.saveStatus.id = 'save-status';
elements.saveStatus.className = 'save-status';
elements.saveStatus.setAttribute('role', 'status');
elements.saveStatus.setAttribute('aria-live', 'polite');
elements.progress.after(elements.saveStatus);

const AUTO_SAVE_MS = 500;
const pieceNames = Object.freeze({ K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' });
const state = { samples: [], records: new Map(), revisions: new Map(), workingDrafts: new Map(),
  visible: [], currentId: null, imageSampleId: null, labels: Array(64).fill('empty'), orientation: null,
  selectedLabel: 'empty', overlay: 'both', prefillUsed: false, incompleteOnly: false, dirty: false,
  editRevision: 0, saveTimer: null, savePromise: null, navigating: false, confirming: false,
  reviewMode: false, highlightedIndex: null, duplicateAliases: [] };

function labelName(label) {
  return label === 'empty' ? 'Empty / Clear' : `${label === label.toUpperCase() ? 'White' : 'Black'} ${pieceNames[label.toUpperCase()]}`;
}
function pieceSrc(label) {
  return label === 'empty' ? null : `/piece/${label === label.toUpperCase() ? 'w' : 'b'}${label.toUpperCase()}.png`;
}
function sample() { return state.samples.find((item) => item.sampleId === state.currentId) || null; }
function record(id) { return state.records.get(id) || null; }
function verified(id) { return record(id)?.annotation.status === 'verified'; }
function message(value, kind = '') { elements.message.textContent = value; elements.message.className = `message ${kind}`.trim(); }
function saveStatus(kind, value) {
  elements.saveStatus.className = `save-status ${kind}`;
  elements.saveStatus.textContent = value;
}

async function postLocal(path, body) {
  const response = await fetch(path, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Caissa-Local-Tool': 'piece-label-annotator'
  }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Local save failed (${response.status})`);
  return payload;
}

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
  metadata('Truth status', state.workingDrafts.has(current.sampleId)
    ? 'verified truth protected; unverified working edit saved'
    : record(current.sampleId)?.annotation.status || 'pending');
  const aliases = state.duplicateAliases.filter((item) => item.canonicalSampleId === current.sampleId)
    .map((item) => item.sampleId);
  if (aliases.length) metadata('Exact-byte alias', aliases.join(', '));
}

function visibleSamples(incompleteOnly = state.incompleteOnly) {
  return state.samples.filter((item) => !incompleteOnly || !verified(item.sampleId)
    || state.workingDrafts.has(item.sampleId));
}
function nextIncomplete(afterId) {
  const start = Math.max(0, state.samples.findIndex((item) => item.sampleId === afterId));
  for (let step = 1; step <= state.samples.length; step++) {
    const item = state.samples[(start + step) % state.samples.length];
    if (item && !verified(item.sampleId)) return item.sampleId;
  }
  return null;
}
function renderNavigation() {
  state.visible = visibleSamples();
  elements.select.replaceChildren();
  for (const item of state.visible) {
    const option = document.createElement('option');
    option.value = item.sampleId;
    option.textContent = `${verified(item.sampleId) ? '✓' : record(item.sampleId) ? '◐' : '○'} ${item.sampleId}`;
    elements.select.append(option);
  }
  if (state.currentId && state.visible.some((item) => item.sampleId === state.currentId)) {
    elements.select.value = state.currentId;
  }
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  elements.previous.disabled = state.navigating || index <= 0;
  elements.next.disabled = state.navigating || index < 0 || index >= state.visible.length - 1;
  elements.select.disabled = state.navigating || !state.visible.length;
  elements.incomplete.checked = state.incompleteOnly;
  elements.incomplete.disabled = state.navigating;
  elements.review.disabled = state.navigating || state.confirming;
  elements.draft.disabled = state.navigating || state.confirming;
  elements.prefill.disabled = state.navigating || !sample()?.trustedFenPlacement;
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

function ensureBoardSquares() {
  if (elements.grid.childElementCount === 64) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 64; index++) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `board-square ${(Math.floor(index / 8) + index % 8) % 2 ? 'dark' : 'light'}`;
    button.dataset.index = String(index);
    fragment.append(button);
  }
  elements.grid.replaceChildren(fragment);
}
function renderSquare(index) {
  const button = elements.grid.children[index];
  if (!button) return;
  const label = state.orientation ? state.labels[canonicalIndexForImageIndex(index, state.orientation)] : 'empty';
  button.setAttribute('aria-label', state.orientation
    ? `${squareForImageIndex(index, state.orientation)}: ${labelName(label)}`
    : `Image cell ${Math.floor(index / 8) + 1}, ${index % 8 + 1}; choose orientation`);
  if (button.dataset.label === label) return;
  button.dataset.label = label;
  const src = pieceSrc(label);
  if (!src) { button.replaceChildren(); return; }
  let image = button.firstElementChild;
  if (!image) { image = document.createElement('img'); image.alt = ''; button.append(image); }
  if (image.getAttribute('src') !== src) image.src = src;
}
function renderAllSquares() { for (let index = 0; index < 64; index++) renderSquare(index); }
function renderOverlay() {
  elements.stage.className = `board-stage mode-${state.overlay}`;
  for (const button of document.querySelectorAll('[data-overlay]')) {
    button.setAttribute('aria-pressed', String(button.dataset.overlay === state.overlay));
  }
}
function showSquare(index) {
  state.highlightedIndex = index;
  if (index == null) {
    elements.square.textContent = 'Square: —'; elements.squareLabel.textContent = 'Ground-truth label: —'; return;
  }
  if (!state.orientation) {
    elements.square.textContent = `Image cell ${Math.floor(index / 8) + 1},${index % 8 + 1} · choose orientation`;
    elements.squareLabel.textContent = 'Ground-truth label: —'; return;
  }
  elements.square.textContent = `Square: ${squareForImageIndex(index, state.orientation)}`;
  elements.squareLabel.textContent = `Ground-truth label: ${state.labels[canonicalIndexForImageIndex(index, state.orientation)]}`;
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
  elements.confirm.disabled = state.confirming || !state.orientation || !state.reviewMode || !elements.reviewConfirm.checked;
  elements.heading.textContent = state.currentId || 'No pending samples';
  showSquare(state.highlightedIndex);
}

function cancelTimer() { if (state.saveTimer) clearTimeout(state.saveTimer); state.saveTimer = null; }
function scheduleAutosave() {
  cancelTimer();
  state.saveTimer = setTimeout(() => { state.saveTimer = null; void flushDraft().catch(() => {}); }, AUTO_SAVE_MS);
}
function markDirty() {
  state.editRevision++;
  state.dirty = true;
  elements.reviewConfirm.checked = false;
  saveStatus('unsaved', 'Unsaved changes');
  message('Local autosave pending.');
  scheduleAutosave();
}
function draftBody(id, status) {
  return { sampleId: id, labels: [...state.labels], boardOrientation: state.orientation,
    status, source: state.prefillUsed ? (status === 'verified' ? 'fen-prefill-reviewed' : 'fen-prefill-unreviewed') : 'manual',
    humanVerifiedBy: status === 'verified' ? 'Alexander' : null,
    confirmation: status === 'verified' ? 'I reviewed all 64 squares' : null,
    expectedRecordRevision: state.revisions.get(id) || null };
}
async function flushDraft(force = false) {
  cancelTimer();
  if (state.savePromise) {
    await state.savePromise;
    if (state.dirty || force) await flushDraft(force);
    return;
  }
  if (!state.dirty && !force) return;
  const work = (async () => {
    do {
      const id = state.currentId;
      if (!id) return;
      if (!state.dirty && verified(id)) {
        saveStatus('saved', 'Saved · verified truth unchanged');
        return;
      }
      const revision = state.editRevision;
      const body = draftBody(id, 'draft');
      saveStatus('saving', 'Saving…');
      const result = await postLocal('/api/save', body);
      if (result.saveTarget === 'verified-workspace') state.workingDrafts.set(id, result.record);
      else { state.records.set(id, result.record); state.workingDrafts.delete(id); }
      state.revisions.set(id, result.canonicalRevision);
      if (state.currentId === id && state.editRevision === revision) {
        state.dirty = false;
        saveStatus('saved', result.saveTarget === 'verified-workspace'
          ? 'Saved · unverified edit; verified truth protected' : 'Saved · local draft');
      } else if (state.currentId === id) {
        saveStatus('unsaved', 'Unsaved changes');
      }
      renderNavigation(); renderMetadata();
      force = false;
    } while (state.dirty);
  })();
  state.savePromise = work;
  try { await work; }
  catch (error) {
    state.dirty = true;
    saveStatus('failed', 'Save failed · do not close');
    message(`Local save failed: ${error.message}. Navigation was blocked; retry Save draft.`, 'error');
    throw error;
  } finally { if (state.savePromise === work) state.savePromise = null; }
}

async function saveDraftManually() {
  try {
    await flushDraft(true);
    message('Save draft checkpoint complete. Safe to close or restart.', 'success');
  } catch { /* The status and message remain visible; the draft stays in memory. */ }
}

function loadSample(id, recovered = false) {
  state.currentId = id;
  const existing = state.workingDrafts.get(id) || record(id);
  state.labels = existing ? [...existing.labels] : Array(64).fill('empty');
  state.orientation = existing?.boardOrientation || null;
  state.prefillUsed = Boolean(existing?.annotation.source?.startsWith('fen-prefill'));
  state.dirty = false;
  state.editRevision++;
  state.reviewMode = false;
  state.highlightedIndex = null;
  elements.reviewConfirm.checked = false;
  elements.trustedFen.value = sample()?.trustedFenPlacement || '';
  elements.prefill.disabled = !sample()?.trustedFenPlacement;
  if (state.imageSampleId !== id) {
    elements.image.src = id ? `/api/board/${encodeURIComponent(id)}` : '';
    state.imageSampleId = id;
  }
  renderNavigation(); renderAllSquares(); renderOverlay(); renderFacts(); renderMetadata();
  saveStatus(recovered ? 'recovered' : 'saved', recovered ? 'Recovered · check saved labels' : 'Saved');
  message(state.workingDrafts.has(id) ? 'Unverified working edit restored; canonical verified truth is protected.'
    : existing?.annotation.status === 'verified' ? 'Verified record loaded for review or editing.'
      : existing ? 'Draft restored from the file manifest.'
        : 'Pending: choose orientation, then annotate the rectified board.');
}

async function navigateTo(id, incompleteOnly = state.incompleteOnly) {
  if (state.navigating || state.confirming || !id) return;
  const priorId = state.currentId;
  const priorFilter = state.incompleteOnly;
  state.incompleteOnly = incompleteOnly;
  state.navigating = true;
  renderNavigation();
  try {
    await flushDraft();
    await postLocal('/api/activate', { sampleId: id, incompleteOnly });
    loadSample(id);
  } catch (error) {
    state.incompleteOnly = priorFilter;
    elements.select.value = priorId;
    elements.incomplete.checked = priorFilter;
    saveStatus('failed', 'Save failed · navigation blocked');
    message(`Could not navigate safely: ${error.message}. Current labels remain here.`, 'error');
  } finally { state.navigating = false; renderNavigation(); }
}

async function confirmVerified() {
  if (state.confirming || !state.orientation || !state.reviewMode || !elements.reviewConfirm.checked) return;
  state.confirming = true;
  renderFacts();
  try {
    await flushDraft();
    const id = state.currentId;
    saveStatus('saving', 'Saving verified truth…');
    const result = await postLocal('/api/save', draftBody(id, 'verified'));
    state.records.set(id, result.record);
    state.workingDrafts.delete(id);
    state.revisions.set(id, result.canonicalRevision);
    state.dirty = false;
    state.reviewMode = false;
    elements.reviewConfirm.checked = false;
    saveStatus('saved', 'Saved · human-verified truth');
    renderNavigation(); renderFacts(); renderMetadata();
    message('Human-verified truth saved locally.', 'success');
  } catch (error) {
    saveStatus('failed', 'Save failed · do not close');
    message(`Verification was not saved: ${error.message}. Review the current board and retry.`, 'error');
  } finally { state.confirming = false; renderFacts(); }
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
  if (!button || state.confirming || state.navigating) return;
  if (!state.orientation) { message('Choose White at bottom or Black at bottom before labeling.', 'error'); return; }
  const index = Number(button.dataset.index);
  const canonical = canonicalIndexForImageIndex(index, state.orientation);
  if (state.labels[canonical] === state.selectedLabel) { showSquare(index); return; }
  state.labels = assignImageSquare(state.labels, state.orientation, index, state.selectedLabel);
  renderSquare(index); renderFacts(); showSquare(index); markDirty();
});
for (const [button, orientation] of [[elements.white, ORIENTATIONS[0]], [elements.black, ORIENTATIONS[1]]]) {
  button.addEventListener('click', () => {
    if (state.confirming || state.navigating || state.orientation === orientation) return;
    state.labels = reorientLabelsPreservingImage(state.labels, state.orientation, orientation);
    state.orientation = orientation;
    renderAllSquares(); renderFacts(); markDirty();
  });
}
for (const button of document.querySelectorAll('[data-overlay]')) {
  button.addEventListener('click', () => { state.overlay = button.dataset.overlay; renderOverlay(); });
}
elements.prefill.addEventListener('click', () => {
  try {
    if (!state.orientation) throw new Error('Choose orientation before FEN prefill.');
    if (!sample()?.trustedFenPlacement) throw new Error('No corpus-certified FEN for this sample.');
    state.labels = placementFenToLabels(sample().trustedFenPlacement);
    state.prefillUsed = true;
    renderAllSquares(); renderFacts(); markDirty();
    message('Prefilled as an unverified draft. Compare all 64 squares before confirming.');
  } catch (error) { message(error.message, 'error'); }
});
elements.draft.addEventListener('click', () => { void saveDraftManually(); });
elements.review.addEventListener('click', () => {
  state.reviewMode = true; state.overlay = 'both'; renderOverlay(); renderFacts();
  elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  message('Review the rectified image and overlay; warnings do not block compositions.');
});
elements.reviewConfirm.addEventListener('change', renderFacts);
elements.confirm.addEventListener('click', () => { void confirmVerified(); });
elements.previous.addEventListener('click', () => {
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  if (index > 0) void navigateTo(state.visible[index - 1].sampleId);
});
elements.next.addEventListener('click', () => {
  const index = state.visible.findIndex((item) => item.sampleId === state.currentId);
  if (index >= 0 && index < state.visible.length - 1) void navigateTo(state.visible[index + 1].sampleId);
});
elements.select.addEventListener('change', () => { void navigateTo(elements.select.value); });
elements.incomplete.addEventListener('change', () => {
  const checked = elements.incomplete.checked;
  const candidates = visibleSamples(checked);
  const target = candidates.some((item) => item.sampleId === state.currentId) ? state.currentId
    : nextIncomplete(state.currentId) || state.currentId;
  void navigateTo(target, checked);
});
elements.image.addEventListener('error', () => message('Rectified image unavailable or source checksum changed.', 'error'));
window.addEventListener('beforeunload', (event) => {
  if (state.dirty || state.savePromise || state.confirming) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.dirty) void flushDraft().catch(() => {});
});

try {
  const response = await fetch('/api/samples');
  if (!response.ok) throw new Error(`Local corpus could not be loaded (${response.status})`);
  const payload = await response.json();
  state.samples = payload.samples;
  state.records = new Map(payload.records.map((item) => [item.sampleId, item]));
  state.revisions = new Map(Object.entries(payload.revisions));
  state.workingDrafts = new Map(payload.workingDrafts.map((item) => [item.sampleId, item]));
  state.duplicateAliases = payload.duplicateAliases;
  state.incompleteOnly = payload.workspace.incompleteOnly;
  elements.outputPath.textContent = `Manifest: ${payload.outputPath}`;
  ensureBoardSquares(); renderPalette();
  let resumeId = payload.workspace.lastActiveSampleId || state.samples[0]?.sampleId || null;
  if (verified(resumeId) && !state.workingDrafts.has(resumeId)) {
    resumeId = nextIncomplete(resumeId) || resumeId;
  }
  if (state.incompleteOnly && verified(resumeId) && !state.workingDrafts.has(resumeId)) {
    resumeId = nextIncomplete(resumeId) || resumeId;
  }
  if (resumeId && resumeId !== payload.workspace.lastActiveSampleId) {
    await postLocal('/api/activate', { sampleId: resumeId, incompleteOnly: state.incompleteOnly });
  }
  loadSample(resumeId, payload.recovery?.length > 0 || payload.ignoredStaleDrafts > 0);
  if (payload.recovery?.some((item) => item.status === 'workspace-corrupt-no-checkpoint')) {
    saveStatus('recovered', 'Recovery warning · check saved labels');
    message('Workspace metadata was damaged with no valid checkpoint. Canonical truth is intact, but the cursor or unverified working edit may be lost. Review this board before continuing.', 'error');
  } else if (payload.recovery?.length) {
    message(`Recovered from a valid local checkpoint: ${payload.recovery.map((item) => item.status).join(', ')}. Review saved labels.`, 'success');
  } else if (payload.ignoredStaleDrafts) {
    message('A stale unverified edit was ignored; newer canonical verified truth won.', 'success');
  }
  elements.loading.hidden = true; elements.app.hidden = false;
} catch (error) {
  elements.loading.textContent = `Local corpus or recovery failed: ${error.message}`;
}
