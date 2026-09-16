import {
  CORNER_KEYS,
  CORNER_LABELS,
  OUTPUT_FILE,
  annotateSample,
  cornersFromGroundTruth,
  createAnnotationState,
  hydrateAnnotations,
  isSampleComplete,
  mapDisplayPoint,
  mergeAnnotationManifest,
  reduceAnnotationState,
  serializeManifest,
  sha256Hex,
  validateQuadrilateral,
  verifyChecksum
} from './annotator-core.js';

const elements = {
  app: document.querySelector('#app'),
  welcome: document.querySelector('#welcome'),
  openCorpus: document.querySelector('#open-corpus'),
  progress: document.querySelector('#progress'),
  incompleteOnly: document.querySelector('#incomplete-only'),
  sampleSelect: document.querySelector('#sample-select'),
  metadata: document.querySelector('#metadata'),
  checksum: document.querySelector('#checksum'),
  expectedCorner: document.querySelector('#expected-corner'),
  imageStage: document.querySelector('#image-stage'),
  image: document.querySelector('#source-image'),
  overlay: document.querySelector('#corner-overlay'),
  reset: document.querySelector('#reset'),
  undo: document.querySelector('#undo'),
  confirm: document.querySelector('#confirm'),
  previous: document.querySelector('#previous'),
  next: document.querySelector('#next'),
  message: document.querySelector('#message')
};

const state = {
  directory: null,
  sourceManifest: null,
  sourceManifestSha256: null,
  annotations: new Map(),
  visibleSamples: [],
  sampleIndex: 0,
  points: createAnnotationState(),
  checksumOk: false,
  imageWidth: 0,
  imageHeight: 0,
  imageUrl: null,
  loadGeneration: 0
};

function setMessage(text, kind = '') {
  elements.message.textContent = text;
  elements.message.className = `message ${kind}`.trim();
}

function setChecksum(text, kind = '') {
  elements.checksum.textContent = text;
  elements.checksum.className = `checksum ${kind}`.trim();
}

function selectedStatus() {
  return document.querySelector('input[name="sample-status"]:checked')?.value || 'board-present';
}

function setSelectedStatus(value) {
  const input = document.querySelector(`input[name="sample-status"][value="${value}"]`);
  (input || document.querySelector('input[name="sample-status"][value="board-present"]')).checked = true;
}

async function readTextFile(directory, name, required = true) {
  try {
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    return { file, text: await file.text() };
  } catch (error) {
    if (!required && error?.name === 'NotFoundError') return null;
    throw error;
  }
}

async function getFileByRelativePath(directory, relativePath) {
  const segments = String(relativePath).split(/[\\/]/).filter(Boolean);
  let current = directory;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = await current.getDirectoryHandle(segments[index]);
  }
  const handle = await current.getFileHandle(segments.at(-1));
  return handle.getFile();
}

async function writeOutputManifest(manifest) {
  const handle = await state.directory.getFileHandle(OUTPUT_FILE, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(serializeManifest(manifest));
  } finally {
    await writable.close();
  }
}

function currentSourceSample() {
  return state.visibleSamples[state.sampleIndex] || null;
}

function currentDisplaySample() {
  const source = currentSourceSample();
  return source ? (state.annotations.get(source.sampleId) || source) : null;
}

function allDisplaySamples() {
  return state.sourceManifest.samples.map((sample) => state.annotations.get(sample.sampleId) || sample);
}

function rebuildVisibleSamples(preferredId = null) {
  const incompleteOnly = elements.incompleteOnly.checked;
  state.visibleSamples = state.sourceManifest.samples.filter((sample) => {
    const display = state.annotations.get(sample.sampleId) || sample;
    return !incompleteOnly || !isSampleComplete(display);
  });
  const foundIndex = preferredId
    ? state.visibleSamples.findIndex((sample) => sample.sampleId === preferredId)
    : -1;
  state.sampleIndex = foundIndex >= 0
    ? foundIndex
    : Math.min(state.sampleIndex, Math.max(0, state.visibleSamples.length - 1));
  renderSampleOptions();
  renderProgress();
}

function renderProgress() {
  const completed = allDisplaySamples().filter(isSampleComplete).length;
  elements.progress.textContent = `${completed} / ${state.sourceManifest.samples.length} completed`;
}

function renderSampleOptions() {
  elements.sampleSelect.replaceChildren();
  for (const sample of state.visibleSamples) {
    const option = document.createElement('option');
    option.value = sample.sampleId;
    const display = state.annotations.get(sample.sampleId) || sample;
    option.textContent = `${isSampleComplete(display) ? '✓' : '○'} ${sample.sampleId}`;
    elements.sampleSelect.append(option);
  }
  const current = currentSourceSample();
  if (current) elements.sampleSelect.value = current.sampleId;
}

function addMetadata(label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value == null || value === '' ? '—' : String(value);
  elements.metadata.append(term, detail);
}

function renderMetadata(sample) {
  elements.metadata.replaceChildren();
  addMetadata('Sample', sample.sampleId);
  addMetadata('File', sample.originalFile);
  addMetadata('Dimensions', state.imageWidth && state.imageHeight ? `${state.imageWidth} × ${state.imageHeight}` : 'loading');
  addMetadata('Provenance', sample.provenance);
  addMetadata('Use', sample.permissionUseCategory);
  addMetadata('Split', sample.split ?? 'unassigned');
  addMetadata('Reference', sample.referenceSystem ? `${sample.referenceSystem}: ${sample.referenceOutcome}` : 'none');
  addMetadata('Difficulty', (sample.difficultyTags || []).join(', '));
  addMetadata('Saved status', sample.annotation?.sampleStatus || 'incomplete');
}

function renderInstruction() {
  const status = selectedStatus();
  if (status !== 'board-present') {
    elements.expectedCorner.textContent = status === 'board-not-present'
      ? 'Confirm that no board is present'
      : status === 'unsupported-partial-board'
        ? 'Confirm unsupported partial/cropped board'
        : 'Confirm skip-for-now status';
    return;
  }
  const count = state.points.points.length;
  elements.expectedCorner.textContent = count < 4
    ? `Click ${CORNER_LABELS[count]} corner (${count + 1} of 4)`
    : 'Review the quadrilateral, then Confirm';
}

function svgElement(name, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function renderOverlay() {
  elements.overlay.replaceChildren();
  if (!state.imageWidth || !state.imageHeight) return;
  elements.overlay.setAttribute('viewBox', `0 0 ${state.imageWidth} ${state.imageHeight}`);
  const points = state.points.points;
  if (points.length > 1) {
    const pathPoints = points.length === 4 ? [...points, points[0]] : points;
    elements.overlay.append(svgElement('polyline', {
      class: 'corner-line',
      points: pathPoints.map((point) => `${point.x},${point.y}`).join(' ')
    }));
  }
  points.forEach((point, index) => {
    elements.overlay.append(svgElement('circle', {
      class: 'corner-point', cx: point.x, cy: point.y, r: Math.max(5, Math.min(state.imageWidth, state.imageHeight) * .008)
    }));
    const label = svgElement('text', {
      class: 'corner-label', x: point.x + 10, y: point.y - 10
    });
    label.textContent = `${index + 1} ${['TL', 'TR', 'BR', 'BL'][index]}`;
    elements.overlay.append(label);
  });
  renderInstruction();
}

function updateControls() {
  const hasSample = Boolean(currentSourceSample());
  const positive = selectedStatus() === 'board-present';
  const pointCount = state.points.points.length;
  elements.imageStage.classList.toggle('annotatable', hasSample && state.checksumOk && positive && pointCount < 4);
  elements.reset.disabled = !hasSample || pointCount === 0;
  elements.undo.disabled = !hasSample || pointCount === 0;
  elements.confirm.disabled = !hasSample || !state.checksumOk || (positive && pointCount !== 4);
  elements.previous.disabled = state.sampleIndex <= 0;
  elements.next.disabled = state.sampleIndex >= state.visibleSamples.length - 1;
  renderInstruction();
}

async function loadCurrentSample() {
  const generation = ++state.loadGeneration;
  const source = currentSourceSample();
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = null;
  state.checksumOk = false;
  state.imageWidth = 0;
  state.imageHeight = 0;
  state.points = createAnnotationState();
  elements.image.removeAttribute('src');
  elements.overlay.replaceChildren();

  if (!source) {
    setMessage('No samples match the current filter.');
    setChecksum('No sample selected.');
    renderSampleOptions();
    renderProgress();
    updateControls();
    return;
  }

  elements.sampleSelect.value = source.sampleId;
  setMessage('Reading local image and verifying SHA-256…');
  setChecksum('Checksum verification in progress…');
  updateControls();
  try {
    const file = await getFileByRelativePath(state.directory, source.originalFile);
    const bytes = await file.arrayBuffer();
    const checksum = await verifyChecksum(bytes, source.originalSha256);
    if (generation !== state.loadGeneration) return;
    if (!checksum.ok) {
      setChecksum(`checksum-mismatch\nExpected: ${checksum.expected}\nActual: ${checksum.actual}`, 'error');
      setMessage('Annotation blocked: source bytes do not match the starter manifest.', 'error');
      renderMetadata(source);
      updateControls();
      return;
    }

    state.checksumOk = true;
    setChecksum(`SHA-256 verified\n${checksum.actual}`, 'ok');
    state.imageUrl = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      elements.image.onload = resolve;
      elements.image.onerror = () => reject(new Error('image-decode-failed'));
      elements.image.src = state.imageUrl;
    });
    if (generation !== state.loadGeneration) return;
    state.imageWidth = elements.image.naturalWidth;
    state.imageHeight = elements.image.naturalHeight;
    const display = state.annotations.get(source.sampleId) || source;
    const savedStatus = display.annotation?.sampleStatus || (display.boardPresent === false ? 'board-not-present' : 'board-present');
    setSelectedStatus(savedStatus);
    state.points = reduceAnnotationState(state.points, { type: 'load', points: cornersFromGroundTruth(display) });
    renderMetadata(display);
    renderOverlay();
    setMessage(isSampleComplete(display)
      ? 'Review mode: verify the saved annotation, or correct and Confirm again.'
      : 'Ready for local annotation.');
  } catch (error) {
    setChecksum('Unable to verify this source.', 'error');
    setMessage(`Annotation blocked: ${error.message || error}`, 'error');
  }
  updateControls();
}

async function openCorpus() {
  if (typeof window.showDirectoryPicker !== 'function') {
    setMessage('This tool requires a Chromium browser with the File System Access API.', 'error');
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
    const sourceResult = await readTextFile(directory, 'manifest-starter.json');
    const sourceManifest = JSON.parse(sourceResult.text);
    if (!sourceManifest.corpus || !Array.isArray(sourceManifest.samples) || sourceManifest.samples.length === 0) {
      throw new Error('starter-manifest-invalid');
    }
    const ids = new Set();
    for (const sample of sourceManifest.samples) {
      if (!sample.sampleId || ids.has(sample.sampleId)) throw new Error('duplicate-sample-id');
      ids.add(sample.sampleId);
    }
    const sourceManifestSha256 = await sha256Hex(await sourceResult.file.arrayBuffer());
    const existingResult = await readTextFile(directory, OUTPUT_FILE, false);
    let annotations = new Map();
    if (existingResult) {
      const existing = JSON.parse(existingResult.text);
      if (existing.sourceManifest?.sha256 !== sourceManifestSha256) throw new Error('annotation-source-manifest-mismatch');
      annotations = hydrateAnnotations(sourceManifest, existing);
    }

    state.directory = directory;
    state.sourceManifest = sourceManifest;
    state.sourceManifestSha256 = sourceManifestSha256;
    state.annotations = annotations;
    state.sampleIndex = 0;
    elements.app.hidden = false;
    elements.welcome.hidden = true;
    rebuildVisibleSamples();
    await loadCurrentSample();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    setMessage(`Could not open corpus: ${error.message || error}`, 'error');
    elements.app.hidden = false;
  }
}

async function confirmCurrent() {
  const source = currentSourceSample();
  if (!source || !state.checksumOk) return;
  const status = selectedStatus();
  try {
    if (status === 'board-present') {
      const validation = validateQuadrilateral(state.points.points, state.imageWidth, state.imageHeight);
      if (!validation.valid) {
        setMessage(`Cannot save: ${validation.reasons.join(', ')}`, 'error');
        return;
      }
    }
    const annotated = annotateSample(source, {
      status,
      points: state.points.points,
      imageWidth: state.imageWidth,
      imageHeight: state.imageHeight
    });
    state.annotations.set(source.sampleId, annotated);
    const output = mergeAnnotationManifest(state.sourceManifest, state.annotations, state.sourceManifestSha256);
    await writeOutputManifest(output);
    renderMetadata(annotated);
    renderProgress();
    renderSampleOptions();
    setMessage(`Saved locally to ${OUTPUT_FILE}. Original image unchanged.`, 'success');
    if (elements.incompleteOnly.checked) {
      const previousIndex = state.sampleIndex;
      rebuildVisibleSamples();
      state.sampleIndex = Math.min(previousIndex, Math.max(0, state.visibleSamples.length - 1));
      await loadCurrentSample();
    }
  } catch (error) {
    setMessage(`Could not save annotation: ${error.message || error}`, 'error');
  }
}

async function move(delta) {
  const nextIndex = state.sampleIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.visibleSamples.length) return;
  state.sampleIndex = nextIndex;
  await loadCurrentSample();
}

elements.openCorpus.addEventListener('click', openCorpus);
elements.imageStage.addEventListener('click', (event) => {
  if (!state.checksumOk || selectedStatus() !== 'board-present' || state.points.points.length >= 4) return;
  const rect = elements.image.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
  const point = mapDisplayPoint({
    clientX: event.clientX,
    clientY: event.clientY,
    rect,
    imageWidth: state.imageWidth,
    imageHeight: state.imageHeight
  });
  state.points = reduceAnnotationState(state.points, { type: 'add', point });
  renderOverlay();
  updateControls();
});
elements.reset.addEventListener('click', () => {
  state.points = reduceAnnotationState(state.points, { type: 'reset' });
  renderOverlay();
  updateControls();
});
elements.undo.addEventListener('click', () => {
  state.points = reduceAnnotationState(state.points, { type: 'undo' });
  renderOverlay();
  updateControls();
});
elements.confirm.addEventListener('click', confirmCurrent);
elements.previous.addEventListener('click', () => move(-1));
elements.next.addEventListener('click', () => move(1));
elements.sampleSelect.addEventListener('change', async () => {
  const index = state.visibleSamples.findIndex((sample) => sample.sampleId === elements.sampleSelect.value);
  if (index >= 0) {
    state.sampleIndex = index;
    await loadCurrentSample();
  }
});
elements.incompleteOnly.addEventListener('change', async () => {
  const preferredId = currentSourceSample()?.sampleId;
  rebuildVisibleSamples(preferredId);
  await loadCurrentSample();
});
document.querySelectorAll('input[name="sample-status"]').forEach((input) => {
  input.addEventListener('change', () => {
    renderInstruction();
    updateControls();
  });
});
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (event.key === 'r' || event.key === 'R') elements.reset.click();
  if (event.key === 'u' || event.key === 'U' || event.key === 'Backspace') {
    event.preventDefault();
    elements.undo.click();
  }
  if (event.key === 'Enter') elements.confirm.click();
  if (event.key === 'ArrowLeft') elements.previous.click();
  if (event.key === 'ArrowRight') elements.next.click();
});
window.addEventListener('beforeunload', () => {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
});
