import { MODEL, createFeedbackRecord, createPredictionSnapshot, fenDiff } from './scanner-beta-contract.js';
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
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbaBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(value);
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

function renderBoard() {
  fenTools.renderDraft($('betaBoard'), workingFen, false, (row, col) => {
    const next = fenTools.mutateSquare(workingFen, row, col, selectedPiece);
    if (!next) return;
    workingFen = next;
    renderBoard();
    const count = fenDiff(snapshot.predictedFEN, workingFen).length;
    $('confirmPosition').textContent = count ? 'Position Correct Now' : 'Confirm Correct';
    status(count ? `${count} correction${count === 1 ? '' : 's'} ready to submit.` : 'No corrections. Confirm if the board is exact.');
  });
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
  if (!file || !runtime.supportsMimeType(file.type)) { status('Choose a JPEG, PNG, or WebP image.', 'syncStatus'); return; }
  captureType = source;
  generation += 1;
  const activeGeneration = generation;
  show('readingView');
  try {
    const hash = await imageHash(file);
    const prepared = await runtime.processImage(file, activeGeneration);
    if (generation !== activeGeneration) return;
    let imageStorageReference = null;
    try { imageStorageReference = await uploadImage(file, hash); }
    catch (_) { status('Image sharing is pending; correction collection can continue.', 'syncStatus'); }
    const response = await fetch('/api/scanner/beta/recognize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        boardRgbaBase64: rgbaBase64(prepared.board.pixels), orientation: $('orientation').value
      })
    });
    if (!response.ok) throw new Error('CLASSIFIER_UNAVAILABLE');
    const prediction = await response.json();
    snapshot = createPredictionSnapshot({
      scanId: crypto.randomUUID(), timestamp: new Date().toISOString(), imageHash: hash,
      orientation: $('orientation').value, detectedCorners: prepared.board.corners,
      predictedFEN: prediction.predictedFEN, squarePredictions: prediction.squarePredictions,
      modelVersion: prediction.modelVersion, modelChecksum: prediction.modelChecksum,
      occupancyThreshold: prediction.occupancyThreshold
    });
    const metadata = { platform: $('platform').value || null, captureType, consent: consent(), clientMetadata: clientMetadata(), imageStorageReference };
    const stored = await submitOrQueue(`scan:${snapshot.scanId}`, '/api/scanner/beta/scan', { snapshot, metadata });
    workingFen = snapshot.predictedFEN;
    renderBoard();
    showDiagnostics(prepared);
    show('reviewView');
    status(stored.synced ? 'Prediction saved. Confirm the final position.' : 'Offline: prediction queued for safe retry.');
  } catch (error) {
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
      feedbackId: crypto.randomUUID(), snapshot, feedbackType,
      correctedFEN: feedbackType === 'LOCALIZATION_FAILURE' ? null : workingFen,
      finalPositionConfirmed: !['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(feedbackType),
      localizationValid: feedbackType !== 'LOCALIZATION_FAILURE', consent: consent(),
      platform: $('platform').value || null, captureType, clientMetadata: clientMetadata()
    });
    const stored = await submitOrQueue(`feedback:${record.feedbackId}`, '/api/scanner/beta/feedback', { feedback: record });
    fenTools.renderDraft($('workspaceBoard'), workingFen, false, null);
    show('workspaceView');
    status(stored.synced ? '' : 'Feedback is pending-sync and will retry safely.', 'syncStatus');
  } catch (_) { status('Please confirm the corrected position before submitting.'); }
}

function reset() {
  generation += 1;
  runtime.cancelActive('new-scan');
  snapshot = null; workingFen = ''; selectedPiece = ''; captureType = null;
  $('cameraInput').value = ''; $('galleryInput').value = '';
  $('confirmPosition').textContent = 'Confirm Correct';
  status('', 'submitStatus'); show('captureView'); buildPalette();
}

$('takePhoto').addEventListener('click', () => $('cameraInput').click());
$('choosePhoto').addEventListener('click', () => $('galleryInput').click());
$('cameraInput').addEventListener('change', () => selectFile($('cameraInput').files[0], 'camera'));
$('galleryInput').addEventListener('change', () => selectFile($('galleryInput').files[0], 'gallery'));
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
