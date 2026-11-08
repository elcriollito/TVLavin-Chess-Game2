const MAX_PGN_BYTES = 25 * 1024 * 1024;
const WORKER_MEMORY_BUDGET_BYTES = 128 * 1024 * 1024;
const i18n = window.CaissaI18n;
const expansionI18n = window.CaissaExpansionI18n;

const form = document.getElementById('polyForm');
const pgnFileInput = document.getElementById('pgnFile');
const maxPlyInput = document.getElementById('maxPly');
const minCountInput = document.getElementById('minCount');
const sideInput = document.getElementById('side');
const buildLog = document.getElementById('buildLog');
const resultRow = document.getElementById('resultRow');
const outputSize = document.getElementById('outputSize');
const downloadOutputBtn = document.getElementById('downloadOutputBtn');
const generateBtn = document.getElementById('generateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressRegion = document.getElementById('buildProgress');
const progressBar = document.getElementById('buildProgressBar');
const progressLabel = document.getElementById('buildProgressLabel');
const progressStats = document.getElementById('buildProgressStats');
const logEntries = [{ key: 'polyglot.log.ready', fallback: '[ready] Waiting for a local PGN file...', variables: {}, timestamp: null }];

let outputSummaryState = null;
let activeDownloadUrl = '';
let activeWorker = null;
let activeReader = null;
let activeRequests = new Map();
let requestSequence = 0;
let canceled = false;
let progressState = null;

form?.addEventListener('submit', handleBuildRequest);
cancelBtn?.addEventListener('click', cancelActiveBuild);
window.addEventListener('beforeunload', cleanupActiveResources);

setupDownloadLinks();
localizePage();
i18n?.subscribe?.(localizePage);

async function handleBuildRequest(event) {
    event.preventDefault();
    clearPreviousResult();

    const file = pgnFileInput?.files?.[0];
    if (!file) return appendLog('polyglot.log.selectFile', '[error] Please select a PGN file first');
    if (!file.name.toLowerCase().endsWith('.pgn')) return appendLog('polyglot.log.onlyPgn', '[error] Only .pgn files are allowed');
    if (file.size === 0) return appendLog('polyglot.error.empty', '[error] The selected PGN file is empty');
    if (file.size > MAX_PGN_BYTES) return appendLog('polyglot.log.tooLarge', '[error] PGN exceeds the tested 25 MiB online limit');

    canceled = false;
    appendLog('polyglot.log.start', '[start] Preparing private on-device conversion...');
    appendLog('polyglot.log.file', '[info] File: {name} ({size})', { name: file.name, size: formatBytes(file.size) });
    appendLog('polyglot.log.local', '[info] Conversion runs in this browser; the PGN is not uploaded.');
    setBuildPending(true);
    updateProgress({ bytesProcessed: 0, fileBytes: file.size, gamesParsed: 0, gamesSkipped: 0, movesUsed: 0, uniqueRecords: 0 });

    try {
        startWorker();
        await callWorker('start', {
            options: {
                maxPly: Number(maxPlyInput.value || 160),
                minCount: Number(minCountInput.value || 1),
                side: sideInput.value || 'both',
                memoryBudgetBytes: WORKER_MEMORY_BUDGET_BYTES
            }
        });

        activeReader = file.stream().getReader();
        while (true) {
            const { done, value } = await activeReader.read();
            if (done) break;
            if (canceled) throw abortError();
            const buffer = value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
                ? value.buffer
                : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            await callWorker('chunk', { buffer }, [buffer]);
        }

        const result = await callWorker('finish');
        if (canceled) throw abortError();
        publishResult(file.name, result.buffer, result.summary);
    } catch (error) {
        if (error?.name === 'AbortError' || canceled) {
            appendLog('polyglot.log.canceled', '[canceled] Conversion canceled; no output file was created.');
        } else {
            appendLog('polyglot.log.buildFailed', '[error] {message}', {
                message: localizeBuildError(error?.message, error?.code)
            });
        }
    } finally {
        await activeReader?.cancel?.().catch(() => {});
        activeReader = null;
        terminateWorker();
        setBuildPending(false);
    }
}

function startWorker() {
    terminateWorker();
    activeWorker = new Worker('/js/polyglot-worker.js?v=1.0.0', { type: 'module', name: 'caissa-polyglot-builder' });
    activeWorker.addEventListener('message', handleWorkerMessage);
    activeWorker.addEventListener('error', event => {
        rejectAllRequests(new Error(event.message || 'The local conversion worker stopped unexpectedly.'));
    });
}

function callWorker(type, payload = {}, transfer = []) {
    if (!activeWorker) return Promise.reject(new Error('The local conversion worker is unavailable.'));
    const requestId = ++requestSequence;
    return new Promise((resolve, reject) => {
        activeRequests.set(requestId, { resolve, reject });
        activeWorker.postMessage({ type, requestId, ...payload }, transfer);
    });
}

function handleWorkerMessage(event) {
    const message = event.data || {};
    if (message.type === 'progress') {
        updateProgress({ ...message, fileBytes: pgnFileInput?.files?.[0]?.size || 0 });
        return;
    }

    const request = activeRequests.get(message.replyTo);
    if (!request) return;
    activeRequests.delete(message.replyTo);

    if (message.type === 'error') {
        const error = new Error(message.message || 'Polyglot conversion failed');
        error.code = message.code;
        error.summary = message.summary;
        request.reject(error);
        return;
    }
    request.resolve(message);
}

function publishResult(inputName, buffer, summary) {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const outputFileName = `${sanitizeBaseName(inputName)}.bin`;
    const downloadUrl = URL.createObjectURL(blob);
    if (activeDownloadUrl) URL.revokeObjectURL(activeDownloadUrl);
    activeDownloadUrl = downloadUrl;
    downloadOutputBtn.href = downloadUrl;
    downloadOutputBtn.download = outputFileName;
    outputSummaryState = {
        size: formatBytes(blob.size),
        entries: summary.entriesWritten,
        games: summary.gamesParsed,
        skipped: summary.gamesSkipped
    };
    renderOutputSummary();
    resultRow.hidden = false;
    updateProgress({ ...progressState, bytesProcessed: progressState?.fileBytes || 0, complete: true });
    appendLog('polyglot.log.complete', '[ok] Local BIN build complete');
    appendLog('polyglot.log.output', '[ok] Output: {name} ({size})', { name: outputFileName, size: formatBytes(blob.size) });
    if (summary.gamesSkipped) {
        appendLog('polyglot.log.skipped', '[warning] Skipped games: {count}', { count: summary.gamesSkipped });
    }
    downloadOutputBtn.click();
}

function cancelActiveBuild() {
    if (!activeWorker) return;
    canceled = true;
    activeReader?.cancel?.().catch(() => {});
    rejectAllRequests(abortError());
    terminateWorker();
}

function terminateWorker() {
    activeWorker?.terminate();
    activeWorker = null;
    if (activeRequests.size) rejectAllRequests(abortError());
}

function rejectAllRequests(error) {
    for (const request of activeRequests.values()) request.reject(error);
    activeRequests.clear();
}

function cleanupActiveResources() {
    terminateWorker();
    if (activeDownloadUrl) URL.revokeObjectURL(activeDownloadUrl);
}

function clearPreviousResult() {
    resultRow.hidden = true;
    outputSummaryState = null;
    progressState = null;
    if (activeDownloadUrl) URL.revokeObjectURL(activeDownloadUrl);
    activeDownloadUrl = '';
    downloadOutputBtn.removeAttribute('href');
}

function updateProgress(next) {
    progressState = { ...(progressState || {}), ...next };
    const fileBytes = progressState.fileBytes || 0;
    const bytesProcessed = Math.min(progressState.bytesProcessed || 0, fileBytes || Number.MAX_SAFE_INTEGER);
    const percent = progressState.complete ? 100 : fileBytes ? Math.min(99, Math.floor((bytesProcessed / fileBytes) * 100)) : 0;
    progressRegion.hidden = false;
    progressBar.value = percent;
    progressLabel.textContent = translate('polyglot.progress.percent', '{percent}% processed locally', { percent });
    progressStats.textContent = translate(
        'polyglot.progress.stats',
        '{games} games parsed · {skipped} skipped · {moves} moves · {records} unique records',
        {
            games: progressState.gamesParsed || 0,
            skipped: progressState.gamesSkipped || 0,
            moves: progressState.movesUsed || 0,
            records: progressState.uniqueRecords || progressState.entriesWritten || 0
        }
    );
}

function setBuildPending(pending) {
    generateBtn.disabled = pending;
    generateBtn.setAttribute('aria-busy', String(pending));
    cancelBtn.hidden = !pending;
    cancelBtn.disabled = !pending;
    for (const control of [pgnFileInput, maxPlyInput, minCountInput, sideInput]) control.disabled = pending;
}

function setupDownloadLinks() {
    document.querySelectorAll('.poly-download-actions a[href^="https://"]').forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener';
    });
}

function appendLog(key, fallback, variables = {}) {
    logEntries.push({ key, fallback, variables, timestamp: new Date() });
    renderLog();
    buildLog.scrollTop = buildLog.scrollHeight;
}

function renderLog() {
    const locale = i18n?.getLocale?.() || 'en';
    buildLog.textContent = logEntries.map(entry => {
        const line = translate(entry.key, entry.fallback, entry.variables);
        if (!entry.timestamp) return line;
        return `[${entry.timestamp.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${line}`;
    }).join('\n');
}

function renderOutputSummary() {
    if (!outputSummaryState) return void (outputSize.textContent = '');
    outputSize.textContent = translate(
        'polyglot.outputSummary',
        'Output: {size} · Entries: {entries} · Games parsed: {games} · Skipped: {skipped}',
        outputSummaryState
    );
}

function localizePage() {
    i18n?.apply?.(document);
    expansionI18n?.apply?.(document);
    const title = translate('polyglot.metaTitle', document.title);
    const description = translate('polyglot.metaDescription', document.querySelector('meta[name="description"]')?.content || '');
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    renderLog();
    renderOutputSummary();
    if (progressState) updateProgress(progressState);
}

function localizeBuildError(message, code) {
    if (code === 'POLYGLOT_MEMORY_BUDGET') return translate('polyglot.error.memory', message);
    const normalized = String(message || '').toLowerCase();
    const mappings = [
        [/only \.pgn/, 'polyglot.error.onlyPgn'],
        [/empty/, 'polyglot.error.empty'],
        [/too many unique|memory budget/, 'polyglot.error.memory'],
        [/parse any valid pgn|valid pgn games/, 'polyglot.error.noValidGames'],
        [/no opening moves/, 'polyglot.error.noMoves'],
        [/timed out/, 'polyglot.error.timeout']
    ];
    const match = mappings.find(([pattern]) => pattern.test(normalized));
    return match ? translate(match[1], message) : translate('polyglot.error.generic', message || 'The opening book could not be generated.');
}

function translate(key, fallback, variables = {}) {
    const expanded = expansionI18n?.t?.(key, '', variables);
    return expanded || i18n?.t?.(key, fallback, variables) || fallback;
}

function sanitizeBaseName(inputName) {
    const noExt = String(inputName || 'caissa-book').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    return noExt.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'caissa-book';
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function abortError() {
    return new DOMException('Conversion canceled', 'AbortError');
}
