const DEFAULT_FILE_NAME = 'CAISSA-Player.pgn';

function normalizedFileName(value) {
    const candidate = String(value || DEFAULT_FILE_NAME)
        .replace(/[\r\n]/g, '')
        .normalize('NFC')
        .trim();
    return candidate || DEFAULT_FILE_NAME;
}

function asciiFallback(fileName) {
    const fallback = fileName
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\/;=]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return fallback || DEFAULT_FILE_NAME;
}

function encodeRfc5987(value) {
    return encodeURIComponent(value)
        .replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function inlineContentDisposition(fileName) {
    const normalized = normalizedFileName(fileName);
    return `inline; filename="${asciiFallback(normalized)}"; filename*=UTF-8''${encodeRfc5987(normalized)}`;
}
