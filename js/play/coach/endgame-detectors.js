(function installEndgameDetectors(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const FILES = 'abcdefgh';
    const SUPPORTED_PHASES = new Set(['endgame', 'simplified-endgame', 'pawn-ending']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const coords = square => ({ file: FILES.indexOf(square[0]), rank: Number(square[1]) - 1 });
    const square = (file, rank) => `${FILES[file]}${rank + 1}`;
    const distance = (a, b) => Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
    function scan(chess) {
        const found = [];
        chess.board().forEach((rank, row) => rank.forEach((piece, file) => {
            if (piece) found.push({ type: piece.type, color: piece.color, square: square(file, 7 - row),
                file, rank: 7 - row });
        }));
        return found;
    }
    function candidate(input, triggerCode, category, confidence, priority, facts, assistance, group) {
        const mapping = global.CaissaEndgameKnowledgeMap.get(triggerCode);
        return global.CaissaCoachInterventionCandidate.create({
            triggerCode, category, phase: 'endgame', confidence, severity: 'notice', priority,
            evidence: { previousFen: input.previousFen || null, currentFen: input.fen,
                userMove: { from: input.move?.from || null, to: input.move?.to || null },
                materialDelta: 0, tacticalFacts: input.tacticalFacts || {}, developmentFacts: {},
                kingSafetyFacts: {}, endgameFacts: facts, conceptId: mapping?.unitId || null },
            messageTemplateId: triggerCode, eligibleAssistanceLevels: assistance,
            cooldownGroup: group, suppressible: true,
            diagnostics: { detectorVersion: SCHEMA_VERSION, phaseReason: input.phase.reasonCode }
        }).value;
    }
    function evaluate(input = {}) {
        const classification = input.phase || global.CaissaEndgamePhaseClassifier.classify(input);
        if (!SUPPORTED_PHASES.has(classification.phase) || classification.confidence === 'low')
            return freeze({ schemaVersion: SCHEMA_VERSION, supported: false, reasonCode: 'PHASE_UNSUPPORTED',
                phase: classification, candidates: freeze([]), facts: null });
        let chess;
        try { chess = new global.Chess(input.fen); } catch (_) {
            return freeze({ schemaVersion: SCHEMA_VERSION, supported: false, reasonCode: 'INVALID_POSITION',
                phase: classification, candidates: freeze([]), facts: null });
        }
        const pieces = scan(chess); const player = input.playerColor === 'black' ? 'b' : 'w';
        const opponent = player === 'w' ? 'b' : 'w';
        const kings = pieces.filter(piece => piece.type === 'k');
        const playerKing = kings.find(piece => piece.color === player);
        const opponentKing = kings.find(piece => piece.color === opponent);
        const pawns = pieces.filter(piece => piece.type === 'p');
        const nonPawnNonKing = pieces.filter(piece => !['p', 'k'].includes(piece.type));
        const opponentForcing = chess.moves({ verbose: true }).filter(move => /\+|#/.test(move.san)
            || move.flags.includes('c')).length;
        const candidates = []; const opposition = {
            aligned: false, direct: false, axis: null, sideToMove: chess.turn(),
            reservePawnMoves: chess.moves({ verbose: true }).filter(move => move.piece === 'p' && !move.flags.includes('c')).length
        };
        if (playerKing && opponentKing) {
            const fileGap = Math.abs(playerKing.file - opponentKing.file);
            const rankGap = Math.abs(playerKing.rank - opponentKing.rank);
            opposition.aligned = fileGap === 0 || rankGap === 0;
            opposition.direct = (fileGap === 0 && rankGap === 2) || (rankGap === 0 && fileGap === 2);
            opposition.axis = fileGap === 0 ? 'file' : rankGap === 0 ? 'rank' : null;
        }
        if (classification.phase === 'pawn-ending' && opposition.direct && nonPawnNonKing.length === 0
            && pawns.length <= 2 && opposition.reservePawnMoves <= 1)
            candidates.push(candidate({ ...input, phase: classification }, 'endgame-opposition', 'opposition',
                'high', 5, { phase: classification, kings: { player: playerKing.square, opponent: opponentKing.square },
                    pawns: pawns.map(item => item.square), opposition, passedPawns: [], pawnSquare: null },
                ['light', 'guided', 'teaching'], 'opposition'));
        const passed = pawns.filter(pawn => pawn.color === player).map(pawn => {
            const direction = player === 'w' ? 1 : -1;
            const opposingAhead = pawns.some(other => other.color === opponent
                && Math.abs(other.file - pawn.file) <= 1 && (other.rank - pawn.rank) * direction > 0);
            const aheadRank = pawn.rank + direction;
            const blocked = aheadRank < 0 || aheadRank > 7
                || pieces.some(piece => piece.file === pawn.file && piece.rank === aheadRank);
            const kingSupported = playerKing && distance(playerKing, pawn) <= 1;
            const pawnSupported = pawns.some(other => other !== pawn && other.color === player
                && Math.abs(other.file - pawn.file) === 1 && other.rank === pawn.rank - direction);
            return { square: pawn.square, passed: !opposingAhead, blocked, kingSupported, pawnSupported,
                promotionDistance: player === 'w' ? 7 - pawn.rank : pawn.rank };
        });
        const unsupportedPasser = passed.find(item => item.passed && !item.blocked
            && !item.kingSupported && item.promotionDistance >= 2);
        if (classification.phase === 'pawn-ending' && unsupportedPasser && opponentForcing === 0)
            candidates.push(candidate({ ...input, phase: classification }, 'endgame-support-passer', 'passed-pawn',
                'medium', 6, { phase: classification, kings: { player: playerKing.square, opponent: opponentKing.square },
                    pawns: pawns.map(item => item.square), opposition, passedPawns: passed, pawnSquare: null },
                ['guided', 'teaching'], 'passed-pawn'));
        if (classification.phase === 'pawn-ending' && pawns.length === 1 && nonPawnNonKing.length === 0) {
            const pawn = pawns[0]; const defenderKing = kings.find(item => item.color !== pawn.color);
            const steps = pawn.color === 'w' ? 7 - pawn.rank : pawn.rank;
            const tempo = chess.turn() === pawn.color ? 0 : 1;
            const promotion = { file: pawn.file, rank: pawn.color === 'w' ? 7 : 0 };
            const pawnSquare = { pawn: pawn.square, promotion: square(promotion.file, promotion.rank),
                kingDistance: distance(defenderKing, promotion), pawnSteps: steps,
                defenderInside: distance(defenderKing, promotion) <= steps - tempo, sideToMove: chess.turn() };
            candidates.push(candidate({ ...input, phase: classification }, 'endgame-pawn-square', 'pawn-race',
                'high', 4, { phase: classification, kings: { player: playerKing.square, opponent: opponentKing.square },
                    pawns: [pawn.square], opposition, passedPawns: passed, pawnSquare },
                ['light', 'guided', 'teaching'], 'pawn-race'));
        }
        const center = [{ file: 3, rank: 3 }, { file: 4, rank: 3 }, { file: 3, rank: 4 }, { file: 4, rank: 4 }];
        const centerDistance = playerKing ? Math.min(...center.map(target => distance(playerKing, target))) : 0;
        if (playerKing && centerDistance >= 2 && nonPawnNonKing.length === 0 && opponentForcing === 0) {
            const parts = String(input.fen).split(' '); parts[1] = player;
            let legalKingMoves = 0;
            try { legalKingMoves = new global.Chess(parts.join(' ')).moves({ verbose: true })
                .filter(move => move.piece === 'k').length; } catch (_) { legalKingMoves = 0; }
            if (legalKingMoves > 0)
                candidates.push(candidate({ ...input, phase: classification }, 'endgame-activate-king', 'king-activity',
                    'medium', 7, { phase: classification, kings: { player: playerKing.square, opponent: opponentKing.square },
                        pawns: pawns.map(item => item.square), opposition, passedPawns: passed, pawnSquare: null,
                        kingActivity: { centerDistance, legalKingMoves } },
                    ['guided', 'teaching'], 'king-activity'));
        }
        return freeze({ schemaVersion: SCHEMA_VERSION, supported: true, reasonCode: candidates.length
            ? 'CANDIDATES_FOUND' : 'NO_SUPPORTED_LESSON', phase: classification,
            candidates: freeze(candidates.filter(Boolean)), facts: freeze({ opposition, passed }) });
    }
    global.CaissaEndgameDetectors = freeze({ schemaVersion: SCHEMA_VERSION, evaluate });
})(typeof window !== 'undefined' ? window : globalThis);
