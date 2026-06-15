(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.FICSStyle12 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    const PIECES = new Set('prnbqkPRNBQK'.split(''));

    function rankToFen(rank) {
        if (typeof rank !== 'string' || rank.length !== 8) return null;
        let fen = '';
        let empty = 0;
        for (const square of rank) {
            if (square === '-') {
                empty += 1;
                continue;
            }
            if (!PIECES.has(square)) return null;
            if (empty) fen += empty;
            empty = 0;
            fen += square;
        }
        return fen + (empty || '');
    }

    function parseInteger(value, fallback = 0) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function parseStyle12(line) {
        const normalized = String(line || '').trim();
        if (!normalized.startsWith('<12> ')) return null;

        const fields = normalized.split(/\s+/);
        if (fields.length < 31) return null;

        const ranks = fields.slice(1, 9);
        const fenRanks = ranks.map(rankToFen);
        if (fenRanks.some((rank) => !rank)) return null;

        if (fields[9] !== 'W' && fields[9] !== 'B') return null;
        const sideToMove = fields[9] === 'B' ? 'b' : 'w';
        const doublePushFile = parseInteger(fields[10], -1);
        const castling = [
            fields[11] === '1' ? 'K' : '',
            fields[12] === '1' ? 'Q' : '',
            fields[13] === '1' ? 'k' : '',
            fields[14] === '1' ? 'q' : ''
        ].join('') || '-';
        const enPassant = doublePushFile >= 0 && doublePushFile <= 7
            ? `${String.fromCharCode(97 + doublePushFile)}${sideToMove === 'w' ? '6' : '3'}`
            : '-';
        const relation = parseInteger(fields[19]);
        const moveNumber = Math.max(1, parseInteger(fields[26], 1));
        const fen = `${fenRanks.join('/')} ${sideToMove} ${castling} ${enPassant} ${Math.max(0, parseInteger(fields[15]))} ${moveNumber}`;

        return {
            raw: normalized,
            rawFields: fields,
            ranks,
            sideToMove,
            doublePushFile,
            castling,
            enPassant,
            halfmoveClock: Math.max(0, parseInteger(fields[15])),
            gameNumber: parseInteger(fields[16], null),
            whiteName: fields[17],
            blackName: fields[18],
            relation,
            initialTime: parseInteger(fields[20]),
            increment: parseInteger(fields[21]),
            whiteMaterial: parseInteger(fields[22]),
            blackMaterial: parseInteger(fields[23]),
            whiteClock: parseInteger(fields[24]),
            blackClock: parseInteger(fields[25]),
            moveNumber,
            lastMoveVerbose: fields[27],
            lastMoveTime: fields[28],
            lastMove: fields[29],
            flip: fields[30] === '1',
            userColor: relation === 1
                ? sideToMove
                : relation === -1
                    ? (sideToMove === 'w' ? 'b' : 'w')
                    : null,
            observedGame: relation === 0 || Math.abs(relation) >= 2,
            fen
        };
    }

    return { parseStyle12, rankToFen };
});
