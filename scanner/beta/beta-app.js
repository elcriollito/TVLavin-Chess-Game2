import { MODEL, createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord, fenDiff } from './scanner-beta-contract.js';
import { randomUuid, sha256Hex } from './scanner-beta-crypto.js';
import { enqueueSubmission, flushSubmissions, pendingCount } from './scanner-beta-queue.js';

const $ = (id) => document.getElementById(id);
const views = ['captureView', 'readingView', 'reviewView', 'workspaceView'];
const fenTools = window.CaissaScannerFen;
let generation = 0;
let runtime = window.CaissaScannerRecognitionRuntime.create({ isGenerationCurrent: (value) => value === generation });
let snapshot = null;
let workingFen = '';
let selectedPiece = '';
let captureType = null;
let activeRecognitionController = null;

function show(id) { views.forEach((view) => { $(view).hidden = view !== id; }); }
function consent() { return { shareImageForImprovement: $('shareImage').checked, shareCorrectionForImprovement: $('shareCorrection').checked }; }
function clientMetadata() {
  return {
    viewport: { width: innerWidth, height: innerHeight },
    screenOrientation: screen.orientation?.type || null,
    browser: navigator.userAgent.slice(0, 180)
  };
}
function status(message, target = 'submitStatus') { $(target).textContent = message; }

async function imageHash(file) {
  return sha256Hex(await file.arrayBuffer());
}

function rgbaBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(value);
}

async function recognizeBoard(body, signal) {
  let lastError = new Error('CLASSIFIER_UNAVAILABLE');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) throw new DOMException('Recognition canceled.', 'AbortError');
    try {
      const response = await fetch('/api/scanner/beta/recognize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
      });
      if (!response.ok) {
        const retryable = [429, 503, 504].includes(response.status);
        if (!retryable || attempt === 1) throw new Error('CLASSIFIER_UNAVAILABLE');
      } else return response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt === 1) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

async function submitOrQueue(id, endpoint, body) {
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return { synced: true, value: await response.json() };
  } catch (_) {
    enqueueSubmission({ id, endpoint, body });
    return { synced: false, value: null };
  }
}

async function uploadImage(file, hash) {
  if (!$('shareImage').checked) return null;
  const response = await fetch('/api/scanner/beta/image', {
    method: 'PUT', headers: { 'Content-Type': file.type, 'X-Caissa-Image-Sha256': hash }, body: file
  });
  if (!response.ok) throw new Error('IMAGE_UPLOAD_FAILED');
  return (await response.json()).imageStorageReference;
}

function failureCode(value) {
  return String(value || 'UNKNOWN_FAILURE').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 80) || 'UNKNOWN_FAILURE';
}

async function recordScanFailure({ scanId, hash, stage, code, source = captureType }) {
  const failure = createScanFailureRecord({
    feedbackId: randomUuid(), scanId, timestamp: new Date().toISOString(), imageHash: hash,
    modelVersion: MODEL.version, modelChecksum: MODEL.checksum, occupancyThreshold: MODEL.occupancyThreshold,
    orientation: $('orientation').value, consent: consent(), platform: $('platform').value || null,
    captureType: source, clientMetadata: clientMetadata(), failureStage: stage, errorCode: failureCode(code)
  });
  return submitOrQueue(`failure:${failure.feedbackId}`, '/api/scanner/beta/failure', { failure });
}

function boardFlipped() {
  return (snapshot?.orientation || $('orientation').value) === 'black-at-bottom';
}

function mountBoard(slot) {
  const shell = $('betaBoardShell');
  if (shell.parentElement !== slot) slot.appendChild(shell);
}

function editSquare(row, col) {
  const next = fenTools.mutateSquare(workingFen, row, col, selectedPiece);
  if (!next) return;
  workingFen = next;
  renderBoard(true);
  const count = fenDiff(snapshot.predictedFEN, workingFen).length;
  $('confirmPosition').textContent = count ? 'Position Correct Now' : 'Confirm Correct';
  status(count ? `${count} correction${count === 1 ? '' : 's'} ready to submit.` : 'No corrections. Confirm if the board is exact.');
}

function renderBoard(editable) {
  const board = $('betaBoard');
  mountBoard(editable ? $('reviewBoardSlot') : $('workspaceBoardSlot'));
  fenTools.renderDraft(board, workingFen, boardFlipped(), editable ? editSquare : null);
  board.dataset.fen = workingFen;
  board.dataset.orientation = boardFlipped() ? 'black-at-bottom' : 'white-at-bottom';
  board.dataset.editable = String(editable);
  board.setAttribute('aria-label', editable ? 'Recognized chess position' : 'Confirmed chess position');
}

function buildPalette() {
  const palette = $('piecePalette');
  palette.innerHTML = '';
  for (const piece of ['', 'K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.piece = piece;
    button.setAttribute('aria-label', piece ? `Place ${piece}` : 'Clear square');
    button.setAttribute('aria-pressed', String(piece === selectedPiece));
    if (piece) {
      const image = document.createElement('img'); image.src = fenTools.pieceSrc(piece); image.alt = ''; button.appendChild(image);
    } else button.textContent = '×';
    button.addEventListener('click', () => {
      selectedPiece = piece;
      [...palette.children].forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      $('selectionStatus').textContent = `Selected: ${piece || 'Clear square'}`;
    });
    palette.appendChild(button);
  }
}

function showDiagnostics(prepared) {
  const values = {
    'Model': MODEL.version,
    'Threshold': String(MODEL.occupancyThreshold),
    'Image hash': snapshot.imageHash,
    'Scan ID': snapshot.scanId,
    'Localization': prepared.status
  };
  $('diagnostics').innerHTML = Object.entries(values).map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('');
}

async function selectFile(file, source) {
  if (!file) return;
  generation += 1;
  const activeGeneration = generation;
  runtime.cancelActive('source-replaced');
  activeRecognitionController?.abort();
  activeRecognitionController = null;
  captureType = source;
  const scanId = randomUuid();
  let hash = null;
  if (!runtime.supportsMimeType(file.type)) {
    try {
      hash = await imageHash(file);
      if (generation !== activeGeneration) return;
      const stored = await recordScanFailure({ scanId, hash, stage: 'unsupported-input', code: 'UNSUPPORTED_INPUT', source });
      if (generation !== activeGeneration) return;
      status(stored.synced ? 'Unsupported input recorded. Choose a JPEG, PNG, or WebP image.'
        : 'Unsupported input queued for safe retry. Choose a JPEG, PNG, or WebP image.', 'syncStatus');
    } catch (_) { status('Choose a JPEG, PNG, or WebP image.', 'syncStatus'); }
    return;
  }
  const recognitionController = new AbortController();
  activeRecognitionController = recognitionController;
  show('readingView');
  try {
    hash = await imageHash(file);
    if (generation !== activeGeneration) return;
    const prepared = await runtime.processImage(file, activeGeneration);
    if (generation !== activeGeneration) return;
    let imageStorageReference = null;
    try { imageStorageReference = await uploadImage(file, hash); }
    catch (_) { status('Image sharing is pending; correction collection can continue.', 'syncStatus'); }
    if (generation !== activeGeneration) return;
    const prediction = await recognizeBoard({
      schemaVersion: 'caissa-scanner-beta-recognition-request/1',
      boardEncoding: 'rgba8', boardWidth: 512, boardHeight: 512,
      sourceImageType: file.type,
      boardRgbaBase64: rgbaBase64(prepared.board.pixels), orientation: $('orientation').value
    }, recognitionController.signal);
    if (activeRecognitionController === recognitionController) activeRecognitionController = null;
    if (generation !== activeGeneration) return;
    snapshot = createPredictionSnapshot({
      scanId, timestamp: new Date().toISOString(), imageHash: hash,
      orientation: $('orientation').value, detectedCorners: prepared.board.corners,
      predictedFEN: prediction.predictedFEN, squarePredictions: prediction.squarePredictions,
      modelVersion: prediction.modelVersion, modelChecksum: prediction.modelChecksum,
      occupancyThreshold: prediction.occupancyThreshold
    });
    const metadata = { platform: $('platform').value || null, captureType: source, consent: consent(), clientMetadata: clientMetadata(), imageStorageReference };
    const stored = await submitOrQueue(`scan:${snapshot.scanId}`, '/api/scanner/beta/scan', { snapshot, metadata });
    if (generation !== activeGeneration) return;
    workingFen = snapshot.predictedFEN;
    renderBoard(true);
    showDiagnostics(prepared);
    show('reviewView');
    status(stored.synced ? 'Prediction saved. Confirm the final position.' : 'Offline: prediction queued for safe retry.');
  } catch (error) {
    if (activeRecognitionController === recognitionController) activeRecognitionController = null;
    if (generation !== activeGeneration || error.name === 'AbortError' || ['canceled', 'stale-generation'].includes(error.code)) return;
    if (hash) {
      const classifierFailure = error.message === 'CLASSIFIER_UNAVAILABLE';
      const localizationFailure = /BOARD|CORNER|HOMOGRAPHY|LOCALIZATION|AMBIGUOUS/i.test(String(error.code || error.message));
      try { await recordScanFailure({ scanId, hash, stage: classifierFailure ? 'classifier' : localizationFailure ? 'localization' : 'decode',
        code: error.code || error.message, source }); } catch (_) { /* The visible error remains authoritative. */ }
    }
    if (generation !== activeGeneration) return;
    show('captureView');
    status(error.message === 'CLASSIFIER_UNAVAILABLE' ? 'Internal classifier is unavailable. Try again when connected to the beta server.' : 'Could not read this board. Try another image.', 'syncStatus');
  }
}

async function sendFeedback(type) {
  if (!snapshot) return;
  const diff = fenDiff(snapshot.predictedFEN, workingFen);
  const feedbackType = type || (diff.length ? 'PIECE_CORRECTION' : 'CONFIRMED_CORRECT');
  try {
    const record = createFeedbackRecord({
      feedbackId: randomUuid(), snapshot, feedbackType,
      correctedFEN: feedbackType === 'LOCALIZATION_FAILURE' ? null : workingFen,
      finalPositionConfirmed: !['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(feedbackType),
      localizationValid: feedbackType !== 'LOCALIZATION_FAILURE', consent: consent(),
      platform: $('platform').value || null, captureType, clientMetadata: clientMetadata()
    });
    const stored = await submitOrQueue(`feedback:${record.feedbackId}`, '/api/scanner/beta/feedback', { feedback: record });
    renderBoard(false);
    show('workspaceView');
    status(stored.synced ? '' : 'Feedback is pending-sync and will retry safely.', 'syncStatus');
  } catch (_) { status('Please confirm the corrected position before submitting.'); }
}

function reset() {
  generation += 1;
  runtime.cancelActive('new-scan');
  activeRecognitionController?.abort();
  activeRecognitionController = null;
  snapshot = null; workingFen = ''; selectedPiece = ''; captureType = null;
  $('cameraInput').value = ''; $('galleryInput').value = '';
  $('confirmPosition').textContent = 'Confirm Correct';
  mountBoard($('reviewBoardSlot'));
  $('betaBoard').replaceChildren();
  delete $('betaBoard').dataset.fen;
  delete $('betaBoard').dataset.orientation;
  delete $('betaBoard').dataset.editable;
  $('diagnostics').replaceChildren();
  $('selectionStatus').textContent = 'Selected: Clear square';
  status('', 'submitStatus'); status('', 'syncStatus'); show('captureView'); buildPalette();
}

function openFilePicker(input) {
  input.value = '';
  input.click();
}

function handleFileSelection(input, source) {
  const file = input.files?.item(0) || null;
  input.value = '';
  void selectFile(file, source);
}

$('takePhoto').addEventListener('click', () => openFilePicker($('cameraInput')));
$('choosePhoto').addEventListener('click', () => openFilePicker($('galleryInput')));
$('cameraInput').addEventListener('change', () => handleFileSelection($('cameraInput'), 'camera'));
$('galleryInput').addEventListener('change', () => handleFileSelection($('galleryInput'), 'gallery'));
$('confirmPosition').addEventListener('click', () => sendFeedback());
$('localizationWrong').addEventListener('click', () => sendFeedback('LOCALIZATION_FAILURE'));
$('newScan').addEventListener('click', reset);
$('scanAnother').addEventListener('click', reset);
window.addEventListener('online', async () => {
  const result = await flushSubmissions();
  status(result.pending ? `${result.pending} submission${result.pending === 1 ? '' : 's'} pending-sync.` : 'All beta feedback synced.', 'syncStatus');
});

buildPalette();
fetch('/api/scanner/beta/status').then((response) => { if (!response.ok) throw new Error(); return flushSubmissions(); })
  .then((result) => status(result.pending ? `${result.pending} submission${result.pending === 1 ? '' : 's'} pending-sync.` : '', 'syncStatus'))
  .catch(() => status(`${pendingCount()} queued. Connect to the internal beta server to continue.`, 'syncStatus'));
