const MAX_PGN_BYTES = 25 * 1024 * 1024;
const i18n = window.CaissaI18n;

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
const logEntries = [{ key: 'polyglot.log.ready', fallback: '[ready] Waiting for PGN upload...', variables: {}, timestamp: null }];
let outputSummaryState = null;
let activeDownloadUrl = '';

if (form) {
    form.addEventListener('submit', handleBuildRequest);
}

setupDownloadLinks();
localizePage();
i18n?.subscribe?.(localizePage);

function setupDownloadLinks() {
    const links = document.querySelectorAll('.poly-download-actions a[href^="https://"]');
    links.forEach(link => {
        link.target = '_blank';
        link.rel = 'noopener';
    });
}

async function handleBuildRequest(event) {
    event.preventDefault();
    resultRow.hidden = true;
    outputSummaryState = null;
    appendLog('polyglot.log.start', '[start] Preparing PGN upload...');

    const file = pgnFileInput?.files?.[0];
    if (!file) {
        appendLog('polyglot.log.selectFile', '[error] Please select a PGN file first');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.pgn')) {
        appendLog('polyglot.log.onlyPgn', '[error] Only .pgn files are allowed');
        return;
    }

    if (file.size > MAX_PGN_BYTES) {
        appendLog('polyglot.log.tooLarge', '[error] PGN exceeds 25 MB upload limit');
        return;
    }

    const payload = {
        fileName: file.name,
        contentType: file.type || 'text/plain',
        pgnText: await file.text(),
        options: {
            maxPly: Number(maxPlyInput.value || 160),
            minCount: Number(minCountInput.value || 1),
            side: sideInput.value || 'both'
        }
    };

    appendLog('polyglot.log.file', '[info] File: {name} ({size})', { name: file.name, size: formatBytes(file.size) });
    appendLog('polyglot.log.uploading', '[info] Uploading PGN to builder API...');
    setBuildPending(true);

    try {
        const response = await fetch('/api/polyglot/build', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorPayload = await safeJson(response);
            const message = localizeBuildError(errorPayload?.error, response.status);
            appendLog('polyglot.log.buildFailed', '[error] {message}', { message });
            return;
        }

        const outputBlob = await response.blob();
        const outputFileName = parseFileName(response.headers.get('content-disposition')) || 'caissa-book.bin';
        const outputBytes = Number(response.headers.get('x-caissa-bin-size')) || outputBlob.size;
        const entryCount = response.headers.get('x-caissa-entries');
        const gameCount = response.headers.get('x-caissa-games');
        const downloadUrl = URL.createObjectURL(outputBlob);

        if (activeDownloadUrl) URL.revokeObjectURL(activeDownloadUrl);
        activeDownloadUrl = downloadUrl;
        downloadOutputBtn.href = downloadUrl;
        downloadOutputBtn.download = outputFileName;
        outputSummaryState = { size: formatBytes(outputBytes), entries: entryCount || '?', games: gameCount || '?' };
        renderOutputSummary();
        resultRow.hidden = false;

        appendLog('polyglot.log.complete', '[ok] BIN build complete');
        appendLog('polyglot.log.output', '[ok] Output: {name} ({size})', { name: outputFileName, size: formatBytes(outputBytes) });

        downloadOutputBtn.click();
    } catch (error) {
        const message = i18n?.getLocale?.() === 'en' && error instanceof Error
            ? error.message : translate('polyglot.error.generic', 'The opening book could not be generated.');
        appendLog('polyglot.log.buildFailed', '[error] {message}', { message });
    } finally {
        setBuildPending(false);
    }
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
        const time = entry.timestamp.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `[${time}] ${line}`;
    }).join('\n');
}

function renderOutputSummary() {
    if (!outputSummaryState) {
        outputSize.textContent = '';
        return;
    }
    outputSize.textContent = translate(
        'polyglot.outputSummary',
        'Output size: {size} | Entries: {entries} | Games parsed: {games}',
        outputSummaryState
    );
}

function localizePage() {
    i18n?.apply?.(document);
    document.title = translate('polyglot.metaTitle', document.title);
    const description = translate('polyglot.metaDescription', '');
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
    const title = translate('polyglot.metaTitle', document.title);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
    renderLog();
    renderOutputSummary();
}

function translate(key, fallback, variables = {}) {
    return i18n?.t?.(key, fallback, variables) || fallback;
}

function setBuildPending(pending) {
    if (!generateBtn) return;
    generateBtn.disabled = pending;
    generateBtn.setAttribute('aria-busy', String(pending));
}

function localizeBuildError(message, status) {
    if (status === 429) return translate('polyglot.error.rateLimit', 'Build limit reached. Please try again shortly.');
    const normalized = String(message || '').toLowerCase();
    const mappings = [
        [/only \.pgn/, 'polyglot.error.onlyPgn'],
        [/unsupported file type/, 'polyglot.error.unsupportedType'],
        [/pgn file is empty/, 'polyglot.error.empty'],
        [/25mb|25 mb|too large|payload too large/, 'polyglot.error.tooLarge'],
        [/no pgn games/, 'polyglot.error.noGames'],
        [/parse any valid pgn|valid pgn games/, 'polyglot.error.noValidGames'],
        [/no opening moves/, 'polyglot.error.noMoves'],
        [/timed out/, 'polyglot.error.timeout'],
        [/invalid request payload|json/, 'polyglot.error.invalidPayload']
    ];
    const match = mappings.find(([pattern]) => pattern.test(normalized));
    if (match) return translate(match[1], message || 'Build failed');
    return translate('polyglot.error.generic', message || 'The opening book could not be generated.');
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function parseFileName(contentDisposition) {
    if (!contentDisposition) return null;
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    return match ? match[1] : null;
}

async function safeJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}
