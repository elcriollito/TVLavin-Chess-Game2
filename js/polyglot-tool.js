const DOWNLOAD_BASE = 'https://downloads.caissa-chess.org/download';
const MAX_PGN_BYTES = 25 * 1024 * 1024;

const form = document.getElementById('polyForm');
const pgnFileInput = document.getElementById('pgnFile');
const maxPlyInput = document.getElementById('maxPly');
const minCountInput = document.getElementById('minCount');
const normalizeInput = document.getElementById('normalize');
const sideInput = document.getElementById('side');
const buildLog = document.getElementById('buildLog');
const resultRow = document.getElementById('resultRow');
const outputSize = document.getElementById('outputSize');
const downloadOutputBtn = document.getElementById('downloadOutputBtn');
const copyShaBtn = document.getElementById('copyShaBtn');
const releaseSha = document.getElementById('releaseSha');

if (copyShaBtn && releaseSha) {
    copyShaBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(releaseSha.textContent || '');
            copyShaBtn.textContent = 'Copied';
            setTimeout(() => {
                copyShaBtn.textContent = 'Copy';
            }, 1200);
        } catch {
            appendLog('[warn] Clipboard copy failed');
        }
    });
}

if (form) {
    form.addEventListener('submit', handleBuildRequest);
}

setupDownloadLinks();

function setupDownloadLinks() {
    const links = document.querySelectorAll('a[href*="downloads.caissa-chess.org/download/"]');
    links.forEach(link => {
        if (link.href.includes('/polyglot-book-creator-changelog')) {
            link.href = `${DOWNLOAD_BASE}/polyglot-book-creator-changelog`;
        }
        if (link.href.includes('/polyglot-book-creator-sha256')) {
            link.href = `${DOWNLOAD_BASE}/polyglot-book-creator-sha256`;
        }
        if (link.href.includes('/polyglot-book-creator') && !link.href.includes('sha256') && !link.href.includes('changelog')) {
            link.href = `${DOWNLOAD_BASE}/polyglot-book-creator`;
        }
    });
}

async function handleBuildRequest(event) {
    event.preventDefault();
    resultRow.hidden = true;
    appendLog('[start] Preparing PGN upload...');

    const file = pgnFileInput?.files?.[0];
    if (!file) {
        appendLog('[error] Please select a PGN file first');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.pgn')) {
        appendLog('[error] Only .pgn files are allowed');
        return;
    }

    if (file.size > MAX_PGN_BYTES) {
        appendLog('[error] PGN exceeds 25MB upload limit');
        return;
    }

    const payload = {
        fileName: file.name,
        contentType: file.type || 'text/plain',
        pgnText: await file.text(),
        options: {
            maxPly: Number(maxPlyInput.value || 160),
            minCount: Number(minCountInput.value || 1),
            normalize: normalizeInput.value || 'cap',
            side: sideInput.value || 'both'
        }
    };

    appendLog(`[info] File: ${file.name} (${formatBytes(file.size)})`);
    appendLog('[info] Uploading PGN to builder API...');

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
            appendLog(`[error] ${errorPayload?.error || 'Build failed'}`);
            return;
        }

        const outputBlob = await response.blob();
        const outputFileName = parseFileName(response.headers.get('content-disposition')) || 'caissa-book.bin';
        const outputBytes = Number(response.headers.get('x-caissa-bin-size')) || outputBlob.size;
        const entryCount = response.headers.get('x-caissa-entries');
        const gameCount = response.headers.get('x-caissa-games');
        const downloadUrl = URL.createObjectURL(outputBlob);

        downloadOutputBtn.href = downloadUrl;
        downloadOutputBtn.download = outputFileName;
        outputSize.textContent = `Output size: ${formatBytes(outputBytes)} | Entries: ${entryCount || '?'} | Games parsed: ${gameCount || '?'}`;
        resultRow.hidden = false;

        appendLog('[ok] BIN build complete');
        appendLog(`[ok] Output: ${outputFileName} (${formatBytes(outputBytes)})`);

        downloadOutputBtn.click();
    } catch (error) {
        appendLog(`[error] ${error instanceof Error ? error.message : 'Network error'}`);
    }
}

function appendLog(line) {
    const prefix = new Date().toLocaleTimeString();
    const current = buildLog.textContent || '';
    buildLog.textContent = `${current}\n[${prefix}] ${line}`.trimStart();
    buildLog.scrollTop = buildLog.scrollHeight;
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
