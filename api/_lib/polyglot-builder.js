import {
    buildPolyglotBookFromText,
    normalizePolyglotOptions,
    sanitizePolyglotBaseName
} from '../../js/polyglot-core.js';

const ALLOWED_PGN_MIME = new Set([
    'application/x-chess-pgn',
    'application/vnd.chess-pgn',
    'text/plain',
    'application/octet-stream'
]);

export const DEFAULT_OPTIONS = Object.freeze({
    maxPly: 160,
    minCount: 1,
    normalize: 'cap',
    side: 'both'
});

export function sanitizeBaseFileName(inputName = 'caissa-book') {
    return sanitizePolyglotBaseName(inputName);
}

export function validatePgnMetadata(fileName, contentType) {
    const normalizedType = String(contentType || '').toLowerCase().trim();
    const lowerName = String(fileName || '').toLowerCase();
    if (!lowerName.endsWith('.pgn')) return { ok: false, error: 'Only .pgn files are accepted' };
    if (normalizedType && !ALLOWED_PGN_MIME.has(normalizedType)) {
        return { ok: false, error: 'Unsupported file type. Please upload a PGN file' };
    }
    return { ok: true };
}

export function normalizeBuildOptions(rawOptions = {}) {
    const normalized = normalizePolyglotOptions(rawOptions);
    return {
        maxPly: normalized.maxPly,
        minCount: normalized.minCount,
        normalize: 'cap',
        side: normalized.side,
        memoryBudgetBytes: normalized.memoryBudgetBytes
    };
}

export function buildPolyglotBookFromPgn(pgnText, rawOptions = {}, timeoutMs = 90000) {
    const options = normalizeBuildOptions(rawOptions);
    const { buffer, summary } = buildPolyglotBookFromText(pgnText, options, {
        deadlineAt: Date.now() + timeoutMs
    });
    return {
        buffer: Buffer.from(buffer),
        summary: {
            ...summary,
            options: {
                maxPly: options.maxPly,
                minCount: options.minCount,
                normalize: options.normalize,
                side: options.side
            }
        }
    };
}
