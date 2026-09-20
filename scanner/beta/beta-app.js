import {
  MODEL, analyzeStructuralPosition, createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord, fenDiff
} from './scanner-beta-contract.js';
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
let selectedFileMetadata = null;
let structuralAcknowledged = false;

const RECOGNITION_TIMEOUT_MS = 25_000;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSION_TYPES = Object.freeze({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/x-heic', 'image/x-heif']);

function show(id) { views.forEach((view) => { $(view).hidden = view !== id; }); }
function consent() { return { shareImageForImprovement: $('shareImage').checked, shareCorrectionForImprovement: $('shareCorrection').checked }; }
function clientMetadata() {
  return {
    viewport: { width: innerWidth, height: innerHeight },
    screenOrientation: screen.orientation?.type || null,
    browser: navigator.userAgent.slice(0, 180),
    selectedImage: selectedFileMetadata ? { ...selectedFileMetadata } : null
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

function typedError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function responseError(statusCode, body = {}, retryAfter = null) {
  const serverCode = String(body?.error || '').toUpperCase();
  if (statusCode === 401) return typedError('AUTH_REQUIRED', { statusCode });
  if (statusCode === 403) return typedError('BETA_ACCESS_DENIED', { statusCode });
  if (statusCode === 404) return typedError('BETA_DISABLED', { statusCode });
  if (statusCode === 413) return typedError('PAYLOAD_TOO_LARGE', { statusCode });
  if (statusCode === 415) return typedError('UNSUPPORTED_IMAGE', { statusCode });
  if (statusCode === 422) return typedError('INVALID_PAYLOAD', { statusCode });
  if (statusCode === 429 || serverCode === 'RATE_LIMITED') {
    return typedError('RATE_LIMIT', { statusCode, retryAfter });
  }
  if (statusCode === 504 || serverCode === 'TIMEOUT') return typedError('TIMEOUT', { statusCode });
  if (serverCode === 'INVALID_IMAGE' || serverCode === 'INVALID_PAYLOAD') {
    return typedError('INVALID_PAYLOAD', { statusCode });
  }
  return typedError('INFERENCE_FAILURE', { statusCode });
}

async function recognizeBoard(body, parentSignal) {
  if (parentSignal.aborted) throw new DOMException('Recognition canceled.', 'AbortError');
  const requestController = new AbortController();
  let timedOut = false;
  const cancelRequest = () => requestController.abort();
  parentSignal.addEventListener('abort', cancelRequest, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, RECOGNITION_TIMEOUT_MS);
  try {
    const response = await fetch('/api/scanner/beta/recognize', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: requestController.signal
    });
    let responseBody = {};
    try { responseBody = await response.json(); } catch (_) { /* Status remains authoritative. */ }
    if (!response.ok) throw responseError(response.status, responseBody, response.headers.get('Retry-After'));
    return responseBody;
  } catch (error) {
    if (timedOut) throw typedError('TIMEOUT');
    if (parentSignal.aborted) throw new DOMException('Recognition canceled.', 'AbortError');
    if (error?.code) throw error;
    throw typedError('NETWORK_FAILURE');
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener('abort', cancelRequest);
  }
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

function extensionOf(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

function normalizeSelectedFile(file, source) {
  const declaredType = String(file?.type || '').trim().toLowerCase();
  const extension = extensionOf(file?.name);
  const observed = { source, name: String(file?.name || ''), type: declaredType, size: Number(file?.size || 0) };
  console.info('caissa_scanner_selected_file', observed);
  selectedFileMetadata = Object.freeze({
    declaredType: declaredType || null,
    resolvedType: SUPPORTED_IMAGE_TYPES.has(declaredType) ? declaredType : (!declaredType ? EXTENSION_TYPES[extension] || null : null),
    extension: extension || null,
    size: observed.size
  });
  if (HEIC_TYPES.has(declaredType) || ['heic', 'heif'].includes(extension)) throw typedError('UNSUPPORTED_IMAGE');
  const resolvedType = selectedFileMetadata.resolvedType;
  if (!resolvedType) throw typedError('UNSUPPORTED_IMAGE');
  return Object.freeze({
    blob: declaredType === resolvedType ? file : file.slice(0, file.size, resolvedType),
    sourceImageType: resolvedType
  });
}

function failureCode(value) {
  return String(value || 'UNKNOWN_FAILURE').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 80) || 'UNKNOWN_FAILURE';
}

function normalizedFailure(error) {
  const raw = String(error?.code || error?.message || 'DECODE_FAILURE');
  if (/UNSUPPORTED|HEIC|HEIF/i.test(raw)) return { code: 'UNSUPPORTED_IMAGE', stage: 'unsupported-input' };
  if (/BOARD|CORNER|HOMOGRAPHY|LOCALIZATION|AMBIGUOUS/i.test(raw)) return { code: 'LOCALIZATION_FAILURE', stage: 'localization' };
  if (/RATE_LIMIT/i.test(raw)) return { code: 'RATE_LIMIT', stage: 'rate-limit' };
  if (/AUTH_REQUIRED|ACCESS_DENIED/i.test(raw)) return { code: raw.toUpperCase(), stage: 'authorization' };
  if (/NETWORK/i.test(raw)) return { code: 'NETWORK_FAILURE', stage: 'network' };
  if (/INFERENCE|MODEL_INTEGRITY/i.test(raw)) return { code: 'INFERENCE_FAILURE', stage: 'classifier' };
  if (/TIMEOUT|BETA_DISABLED|PAYLOAD|HTTP_5/i.test(raw)) return { code: failureCode(raw), stage: 'service' };
  return { code: 'DECODE_FAILURE', stage: 'decode' };
}

function userMessage(code) {
  const messages = {
    UNSUPPORTED_IMAGE: 'Unsupported photo format. Choose a JPEG, PNG, or WebP image.',
    DECODE_FAILURE: 'Could not read this image. Choose another photo.',
    LOCALIZATION_FAILURE: 'Board could not be detected. Try another image.',
    INFERENCE_FAILURE: 'Recognition service temporarily unavailable. Try again in a moment.',
    RATE_LIMIT: 'Too many scan attempts. Wait a moment and try again.',
    NETWORK_FAILURE: 'Could not reach the recognition service. Check your connection and try again.',
    TIMEOUT: 'Recognition service took too long. Try again.',
    AUTH_REQUIRED: 'Your beta session expired. Sign in again and retry.',
    BETA_ACCESS_DENIED: 'This account does not have Scanner beta access.',
    BETA_DISABLED: 'Scanner beta is temporarily unavailable.',
    PAYLOAD_TOO_LARGE: 'This photo is too large to process.',
    INVALID_PAYLOAD: 'This image could not be prepared for recognition.'
  };
  return messages[code] || 'Could not read this image. Choose another photo.';
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
  structuralAcknowledged = false;
  renderBoard(true);
  renderStructuralGuardrail();
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

function renderStructuralGuardrail() {
  const panel = $('structuralWarning');
  const acknowledgeRow = $('structuralAcknowledgeRow');
  const acknowledge = $('structuralAcknowledge');
  const result = analyzeStructuralPosition(workingFen);
  panel.dataset.status = result.status;
  if (result.status === 'NORMAL') {
    panel.hidden = true;
    acknowledgeRow.hidden = true;
    acknowledge.checked = false;
    $('confirmPosition').disabled = false;
    return result;
  }
  const required = result.status === 'REVIEW_REQUIRED';
  panel.hidden = false;
  $('structuralWarningTitle').textContent = required
    ? 'Review required — unusual position detected.'
    : 'Review recommended — unusual material detected.';
  $('structuralWarningMessage').textContent = required
    ? 'CAISSA detected a structural issue such as a missing or duplicate king.'
    : 'Promotions can create unusual material. Please check the position before confirming.';
  acknowledgeRow.hidden = !required;
  acknowledge.checked = required && structuralAcknowledged;
  $('confirmPosition').disabled = required && !structuralAcknowledged;
  return result;
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
  const structural = snapshot.structuralGuardrails;
  const values = {
    'Model': MODEL.version,
    'Threshold': String(MODEL.occupancyThreshold),
    'Image hash': snapshot.imageHash,
    'Scan ID': snapshot.scanId,
    'Localization': prepared.status,
    'Structural review': structural.status,
    'Structural warnings': structural.warningCodes.join(', ') || 'None'
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
  selectedFileMetadata = null;
  const scanId = randomUuid();
  let hash = null;
  const recognitionController = new AbortController();
  activeRecognitionController = recognitionController;
  try {
    const selected = normalizeSelectedFile(file, source);
    if (!runtime.supportsMimeType(selected.sourceImageType)) throw typedError('UNSUPPORTED_IMAGE');
    show('readingView');
    hash = await imageHash(file);
    if (generation !== activeGeneration) return;
    const prepared = await runtime.processImage(selected.blob, activeGeneration);
    if (generation !== activeGeneration) return;
    let imageStorageReference = null;
    try { imageStorageReference = await uploadImage(selected.blob, hash); }
    catch (_) { status('Image sharing is pending; correction collection can continue.', 'syncStatus'); }
    if (generation !== activeGeneration) return;
    const prediction = await recognizeBoard({
      schemaVersion: 'caissa-scanner-beta-recognition-request/1',
      boardEncoding: 'rgba8', boardWidth: 512, boardHeight: 512,
      sourceImageType: selected.sourceImageType,
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
    structuralAcknowledged = false;
    renderBoard(true);
    renderStructuralGuardrail();
    showDiagnostics(prepared);
    show('reviewView');
    status(stored.synced ? 'Prediction saved. Confirm the final position.' : 'Offline: prediction queued for safe retry.');
  } catch (error) {
    if (activeRecognitionController === recognitionController) activeRecognitionController = null;
    if (generation !== activeGeneration || error.name === 'AbortError' || ['canceled', 'stale-generation'].includes(error.code)) return;
    const failure = normalizedFailure(error);
    if (!hash) {
      try { hash = await imageHash(file); } catch (_) { /* Empty or unreadable files cannot be recorded. */ }
    }
    if (hash) {
      try { await recordScanFailure({ scanId, hash, stage: failure.stage, code: failure.code, source }); }
      catch (_) { /* The visible error remains authoritative. */ }
    }
    if (generation !== activeGeneration) return;
    show('captureView');
    status(userMessage(failure.code), 'syncStatus');
  }
}

async function sendFeedback(type) {
  if (!snapshot) return;
  const structural = analyzeStructuralPosition(workingFen);
  if (structural.status === 'REVIEW_REQUIRED' && !structuralAcknowledged && type !== 'LOCALIZATION_FAILURE') {
    status('Review and acknowledge the structural warning before confirming.');
    return;
  }
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
  snapshot = null; workingFen = ''; selectedPiece = ''; captureType = null; selectedFileMetadata = null;
  structuralAcknowledged = false;
  $('cameraInput').value = ''; $('galleryInput').value = '';
  $('confirmPosition').textContent = 'Confirm Correct';
  $('confirmPosition').disabled = false;
  $('structuralAcknowledge').checked = false;
  $('structuralAcknowledgeRow').hidden = true;
  $('structuralWarning').hidden = true;
  delete $('structuralWarning').dataset.status;
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
$('structuralAcknowledge').addEventListener('change', (event) => {
  structuralAcknowledged = event.currentTarget.checked;
  renderStructuralGuardrail();
});
$('newScan').addEventListener('click', reset);
$('scanAnother').addEventListener('click', reset);
window.addEventListener('online', async () => {
  const result = await flushSubmissions();
  status(result.pending ? `${result.pending} submission${result.pending === 1 ? '' : 's'} pending-sync.` : 'All beta feedback synced.', 'syncStatus');
});

buildPalette();
const bootstrapGeneration = generation;
fetch('/api/scanner/beta/status').then((response) => { if (!response.ok) throw new Error(); return flushSubmissions(); })
  .then((result) => {
    if (generation !== bootstrapGeneration || $('syncStatus').textContent) return;
    status(result.pending ? `${result.pending} submission${result.pending === 1 ? '' : 's'} pending-sync.` : '', 'syncStatus');
  })
  .catch(() => {
    if (generation === bootstrapGeneration && !$('syncStatus').textContent) {
      status(`${pendingCount()} queued. Connect to the internal beta server to continue.`, 'syncStatus');
    }
  });
