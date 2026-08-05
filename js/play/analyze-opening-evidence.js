(function installAnalyzeOpeningEvidence(root) {
    'use strict';
    const VERSION = '1.0.0';
    const MAX_PLY = 20;
    const TRUSTED_SOURCES = Object.freeze(['eco_codes', 'eco_details', 'known_lines']);
    const freeze = value => Object.freeze(value);

    function normalizeFen(fen) {
        const parts = String(fen || '').trim().split(/\s+/);
        if (parts.length < 4) return '';
        let ep = parts[3];
        if (/^[a-h][36]$/.test(ep)) {
            const ranks = []; for (const rank of parts[0].split('/')) {
                const row = []; for (const token of rank) {
                    if (/\d/.test(token)) row.push(...Array(Number(token)).fill(null)); else row.push(token);
                } ranks.push(row);
            }
            const file = ep.charCodeAt(0) - 97;
            const pawnRank = parts[1] === 'w' ? 3 : 4;
            const pawn = parts[1] === 'w' ? 'P' : 'p';
            const capturable = [file - 1, file + 1].some(candidate => candidate >= 0 && candidate < 8
                && ranks[8 - pawnRank]?.[candidate] === pawn);
            if (!capturable) ep = '-';
        }
        return `${parts[0]} ${parts[1]} ${parts[2]} ${ep}`;
    }
    function hashFen(fen) {
        const normalized = normalizeFen(fen);
        if (!normalized) return null;
        let hash = 0xcbf29ce484222325n;
        const prime = 0x100000001b3n;
        for (let index = 0; index < normalized.length; index += 1) {
            hash ^= BigInt(normalized.charCodeAt(index));
            hash = (hash * prime) & 0xffffffffffffffffn;
        }
        return hash.toString(16).padStart(16, '0');
    }
    function reject(reasonCode) { return freeze({ ok: false, reasonCode, book: false }); }
    function lookup(input = {}) {
        if (!Number.isInteger(input.ply) || input.ply < 1 || input.ply > MAX_PLY) return reject('PLY_OUT_OF_WINDOW');
        if (!input.recordId || !Number.isInteger(input.generation) || input.generation < 1)
            return reject('ATTRIBUTION_MISSING');
        if (input.stale === true) return reject('STALE_EVIDENCE');
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(String(input.playedUci || '')))
            return reject('UCI_INVALID');
        if (!String(input.playedSan || '').trim() || /[^\x20-\x7e]/.test(String(input.playedSan)))
            return reject('SAN_INVALID');
        if (!input.legal || !input.lookupComplete || !input.positionMap || typeof input.positionMap !== 'object')
            return reject(input.legal ? 'LOOKUP_INCOMPLETE' : 'MOVE_ILLEGAL');
        const positionHash = hashFen(input.fenAfter);
        const row = positionHash ? input.positionMap[positionHash] : null;
        if (!row) return reject('CONTINUATION_UNRECOGNIZED');
        const eco = String(row.eco || '').toUpperCase();
        const name = String(row.name || '').trim();
        const source = String(row.source || '');
        if (!/^[A-E]\d{2}$/.test(eco) || !name || !TRUSTED_SOURCES.includes(source))
            return reject('EVIDENCE_CONTRADICTORY');
        if (eco === 'A00' && source !== 'known_lines') return reject('GENERIC_A00_INSUFFICIENT');
        if (Number(row.depth) < 1 || Number(row.depth) > MAX_PLY) return reject('DEPTH_INVALID');
        return freeze({ ok: true, reasonCode: 'TRUSTED_CONTINUATION', book: true, eco, name,
            source, depth: Number(row.depth), positionHash, recordId: input.recordId,
            generation: input.generation, transposition: Number(row.depth) !== input.ply });
    }
    root.CaissaAnalyzeOpeningEvidence = freeze({ schemaVersion: VERSION,
        contractId: `AnalyzeOpeningEvidence@${VERSION}`, maximumPly: MAX_PLY,
        trustedSources: TRUSTED_SOURCES, normalizeFen, hashFen, lookup });
})(typeof window !== 'undefined' ? window : globalThis);
