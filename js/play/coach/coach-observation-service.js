(function installCoachObservationService(global) {
    'use strict';
    const SCHEMA_VERSION = '1.0.0';
    const PRIORITY = Object.freeze(['hanging-piece', 'tactical-awareness', 'king-safety', 'development-reminder']);
    function phase(ply, pieceCount) { return pieceCount <= 10 ? 'endgame' : ply <= 16 ? 'opening' : 'middlegame'; }
    function observe(input = {}) {
        const session = input.session; const profile = input.profile;
        const policy = global.CaissaCoachInterventionPolicy.get(profile?.interventionPolicyId);
        if (!session || !profile || !policy || input.actor !== 'user' || session.assistanceLevel === 'silent')
            return Object.freeze({ eligible: false, reasonCode: 'INACTIVE_OR_SILENT' });
        const ply = Number(input.ply) || 0;
        if (session.interventionCount >= policy.maximumInterventions) return Object.freeze({ eligible: false, reasonCode: 'LIMIT_REACHED' });
        if (session.lastInterventionPly !== null && ply - session.lastInterventionPly < policy.cooldownPlies)
            return Object.freeze({ eligible: false, reasonCode: 'COOLDOWN' });
        let chess;
        try { chess = new global.Chess(input.fen); } catch (_) { return Object.freeze({ eligible: false, reasonCode: 'INVALID_POSITION' }); }
        const moves = chess.moves({ verbose: true }); const board = chess.board();
        const pieces = board.flat().filter(Boolean); const currentPhase = phase(ply, pieces.length);
        const candidates = [];
        if (typeof input.move?.to === 'string' && moves.some(move => move.flags.includes('c') && move.to === input.move.to))
            candidates.push('hanging-piece');
        if (moves.some(move => move.flags.includes('c') || move.san.includes('+'))) candidates.push('tactical-awareness');
        const player = input.playerColor === 'black' ? 'b' : 'w';
        const homeKing = player === 'w' ? board[7][4] : board[0][4];
        if (ply >= 8 && ply <= 18 && homeKing?.type === 'k' && homeKing.color === player)
            candidates.push('king-safety');
        const minors = player === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
        const undeveloped = minors.filter(square => board[8 - Number(square[1])][square.charCodeAt(0) - 97]).length;
        if (ply >= 6 && ply <= 16 && undeveloped >= 2) candidates.push('development-reminder');
        const selected = PRIORITY.find(trigger => candidates.includes(trigger) && policy.allowedTriggers.includes(trigger));
        if (!selected || !policy.allowedPhases.includes(currentPhase)) return Object.freeze({ eligible: false, reasonCode: 'NO_TRIGGER' });
        const message = global.CaissaCoachMessages.create(selected, session.learnerLevel);
        return Object.freeze({ eligible: true, reasonCode: 'INTERVENTION', trigger: selected, ply, phase: currentPhase, message });
    }
    global.CaissaCoachObservationService = Object.freeze({ schemaVersion: SCHEMA_VERSION, priority: PRIORITY, observe });
})(typeof window !== 'undefined' ? window : globalThis);
