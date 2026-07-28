(function installCoachObservationService(global) {
    'use strict';
    const SCHEMA_VERSION = '1.2.0';
    const VALUES = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });
    const PRIORITY = Object.freeze(['immediate-danger', 'hanging-piece', 'king-safety',
        'endgame-pawn-square', 'endgame-opposition', 'endgame-support-passer', 'endgame-activate-king',
        'development-reminder', 'tactical-awareness', 'development-positive']);
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const squarePiece = (board, square) => board[8 - Number(square[1])][square.charCodeAt(0) - 97];
    const phase = (ply, count) => count <= 10 ? 'endgame' : ply <= 16 ? 'opening' : 'middlegame';
    function candidate(data) {
        return global.CaissaCoachInterventionCandidate.create(data).value;
    }
    function observe(input = {}) {
        const session = input.session; const profile = input.profile;
        const policy = global.CaissaCoachInterventionPolicy.get(profile?.interventionPolicyId);
        if (!session || !profile || !policy || input.actor !== 'user' || session.assistanceLevel === 'silent')
            return freeze({ eligible: false, reasonCode: 'INACTIVE_OR_SILENT', candidates: freeze([]) });
        const ply = Number(input.ply) || 0;
        if (session.interventionCount >= policy.maximumInterventions)
            return freeze({ eligible: false, reasonCode: 'LIMIT_REACHED', candidates: freeze([]) });
        let chess;
        try { chess = new global.Chess(input.fen); } catch (_) {
            return freeze({ eligible: false, reasonCode: 'INVALID_POSITION', candidates: freeze([]) });
        }
        const moves = chess.moves({ verbose: true }); const board = chess.board();
        const pieces = board.flat().filter(Boolean); const currentPhase = phase(ply, pieces.length);
        if (!policy.allowedPhases.includes(currentPhase))
            return freeze({ eligible: false, reasonCode: 'PHASE_SUPPRESSED', candidates: freeze([]) });
        const player = input.playerColor === 'black' ? 'b' : 'w';
        const opponent = player === 'w' ? 'b' : 'w';
        const movedPiece = typeof input.move?.to === 'string' ? squarePiece(board, input.move.to) : null;
        const capturesMoved = movedPiece?.color === player
            ? moves.filter(move => move.flags.includes('c') && move.to === input.move.to) : [];
        let hasRecapture = false;
        if (capturesMoved.length) {
            try {
                const reply = new global.Chess(input.fen); reply.move(capturesMoved[0]);
                hasRecapture = reply.moves({ verbose: true }).some(move => move.flags.includes('c') && move.to === input.move.to);
            } catch (_) { hasRecapture = true; }
        }
        const checks = moves.filter(move => /\+|#/.test(move.san));
        const captures = moves.filter(move => move.flags.includes('c'));
        const tacticalFacts = freeze({ opponentLegalChecks: checks.length, opponentLegalCaptures: captures.length,
            movedPieceAttacked: capturesMoved.length > 0, immediateRecaptureAvailable: hasRecapture,
            movedPieceValue: movedPiece ? VALUES[movedPiece.type] : 0 });
        const home = player === 'w'
            ? { n: ['b1', 'g1'], b: ['c1', 'f1'], king: 'e1' }
            : { n: ['b8', 'g8'], b: ['c8', 'f8'], king: 'e8' };
        const undeveloped = [...home.n, ...home.b].filter(square => {
            const piece = squarePiece(board, square);
            return piece?.color === player && (home.n.includes(square) ? piece.type === 'n' : piece.type === 'b');
        });
        const moveFromHomeMinor = [...home.n, ...home.b].includes(input.move?.from);
        const developmentFacts = freeze({ undevelopedMinorCount: undeveloped.length,
            movedHomeMinor: moveFromHomeMinor, openingPhase: currentPhase === 'opening' });
        const king = squarePiece(board, home.king);
        const rights = String(input.fen).split(' ')[2] || '-';
        const canCastle = player === 'w' ? /K|Q/.test(rights) : /k|q/.test(rights);
        const queensPresent = pieces.filter(piece => piece.type === 'q').length === 2;
        const centerOpen = ['d4', 'e4', 'd5', 'e5'].filter(square => !squarePiece(board, square)).length >= 2;
        const kingSafetyFacts = freeze({ kingOnHomeSquare: king?.type === 'k' && king.color === player,
            castlingRightAvailable: canCastle, queensPresent, centerOpen, simplified: pieces.length <= 14 });
        const baseEvidence = { previousFen: null, currentFen: input.fen, userMove: freeze({
            from: input.move?.from || null, to: input.move?.to || null
        }), materialDelta: 0, tacticalFacts, developmentFacts, kingSafetyFacts, conceptId: null };
        const candidates = [];
        if (checks.length) candidates.push(candidate({ triggerCode: 'immediate-danger', category: 'tactical',
            phase: currentPhase, confidence: 'high', severity: 'warning', priority: 1, evidence: baseEvidence,
            messageTemplateId: 'immediate-danger', eligibleAssistanceLevels: ['light', 'guided', 'teaching'],
            cooldownGroup: 'tactical', suppressible: false }));
        if (capturesMoved.length && !hasRecapture && tacticalFacts.movedPieceValue >= 3)
            candidates.push(candidate({ triggerCode: 'hanging-piece', category: 'tactical', phase: currentPhase,
                confidence: 'high', severity: 'warning', priority: 2, evidence: baseEvidence,
                messageTemplateId: 'hanging-piece', eligibleAssistanceLevels: ['light', 'guided', 'teaching'],
                cooldownGroup: 'tactical', suppressible: false }));
        if (currentPhase === 'opening' && ply >= 8 && kingSafetyFacts.kingOnHomeSquare && canCastle
            && queensPresent && centerOpen)
            candidates.push(candidate({ triggerCode: 'king-safety', category: 'king-safety', phase: currentPhase,
                confidence: 'medium', severity: 'notice', priority: 3, evidence: baseEvidence,
                messageTemplateId: 'king-safety', eligibleAssistanceLevels: ['guided', 'teaching'],
                cooldownGroup: 'king-safety', suppressible: true }));
        if (currentPhase === 'opening' && ply >= 6 && undeveloped.length >= 2 && !moveFromHomeMinor)
            candidates.push(candidate({ triggerCode: 'development-reminder', category: 'development', phase: currentPhase,
                confidence: 'medium', severity: 'notice', priority: 4, evidence: baseEvidence,
                messageTemplateId: 'development-reminder', eligibleAssistanceLevels: ['guided', 'teaching'],
                cooldownGroup: 'development', suppressible: true }));
        if (captures.length && (!capturesMoved.length || hasRecapture))
            candidates.push(candidate({ triggerCode: 'tactical-awareness', category: 'tactical', phase: currentPhase,
                confidence: 'medium', severity: 'notice', priority: 5, evidence: baseEvidence,
                messageTemplateId: 'tactical-awareness', eligibleAssistanceLevels: ['guided', 'teaching'],
                cooldownGroup: 'tactical', suppressible: true }));
        if (currentPhase === 'opening' && ply >= 8 && undeveloped.length <= 1 && moveFromHomeMinor)
            candidates.push(candidate({ triggerCode: 'development-positive', category: 'development', phase: currentPhase,
                confidence: 'high', severity: 'positive', priority: 6, evidence: baseEvidence,
                messageTemplateId: 'development-positive', eligibleAssistanceLevels: ['teaching'],
                cooldownGroup: 'positive-reinforcement', suppressible: true }));
        if (profile.teachingFocus === 'endgames') {
            const endgame = global.CaissaEndgameDetectors.evaluate({ fen: input.fen,
                previousFen: input.previousFen || null, ply, playerColor: input.playerColor,
                move: input.move, phase: global.CaissaEndgamePhaseClassifier.classify({ fen: input.fen, ply }),
                tacticalFacts });
            candidates.push(...endgame.candidates);
        }
        const allowed = candidates.filter(item => policy.allowedTriggers.includes(item.triggerCode)
            && item.eligibleAssistanceLevels.includes(session.assistanceLevel));
        const selected = allowed.sort((a, b) => a.priority - b.priority || a.triggerCode.localeCompare(b.triggerCode))[0];
        if (!selected) return freeze({ eligible: false, reasonCode: candidates.length ? 'ASSISTANCE_SUPPRESSED' : 'NO_TRIGGER',
            candidates: freeze(candidates) });
        const groupPly = session.cooldowns?.[selected.cooldownGroup];
        if (Number.isInteger(groupPly) && ply - groupPly < policy.cooldownPlies)
            return freeze({ eligible: false, reasonCode: 'COOLDOWN', candidates: freeze(candidates), selectedCandidate: selected });
        if (session.lastInterventionPly !== null && session.lastInterventionPly !== undefined
            && ply - session.lastInterventionPly < policy.minimumPlyGap && selected.suppressible)
            return freeze({ eligible: false, reasonCode: 'GLOBAL_COOLDOWN', candidates: freeze(candidates), selectedCandidate: selected });
        const message = global.CaissaCoachMessages.create(selected.messageTemplateId,
            session.learnerLevel, session.assistanceLevel);
        const knowledge = global.CaissaEndgameKnowledgeMap?.get?.(selected.triggerCode) || null;
        return freeze({ eligible: true, reasonCode: 'INTERVENTION', trigger: selected.triggerCode,
            triggerCode: selected.triggerCode, category: selected.category, confidence: selected.confidence,
            severity: selected.severity, priority: selected.priority, cooldownGroup: selected.cooldownGroup,
            messageTemplateId: selected.messageTemplateId, evidence: selected.evidence,
            candidate: selected, candidates: freeze(candidates), knowledge,
            ply, phase: currentPhase, message: message ? freeze({ ...message, knowledge }) : null });
    }
    global.CaissaCoachObservationService = freeze({ schemaVersion: SCHEMA_VERSION, priority: PRIORITY, observe });
})(typeof window !== 'undefined' ? window : globalThis);
