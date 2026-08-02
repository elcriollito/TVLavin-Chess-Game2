(function installPlayV2PostGamePolicy(root) {
    'use strict';
    const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const reasons = freeze({ checkmate: 'By Checkmate', resignation: 'By Resignation', timeout: 'On Time', stalemate: 'By Stalemate',
        repetition: 'By Repetition', 'insufficient-material': 'By Insufficient Material', 'fifty-move-rule': 'By Fifty-Move Rule',
        'draw-agreement': 'By Agreement', aborted: 'Game Aborted', unknown: 'Reason Unavailable' });
    function describe(record) {
        if (!record?.result?.complete || !['completed', 'aborted'].includes(record.status)) return freeze({ valid: false, title: 'Result Unavailable', reason: 'Reason Unavailable' });
        const player = record.player?.color; const winner = record.result.winner;
        const title = record.status === 'aborted' ? 'Game Ended' : winner === null ? 'Draw'
            : !['white', 'black'].includes(player) ? (winner === 'white' ? 'White Won' : 'Black Won')
                : winner === player ? 'You Won' : 'You Lost';
        return freeze({ valid: true, title, reason: reasons[record.result.termination] || reasons.unknown });
    }
    root.CaissaPlayV2PostGamePolicy = freeze({ schemaVersion: '1.0.0', contractId: 'PlayV2PostGamePolicy@1.0.0', owner: 'post-game-core',
        gameRecordRequired: true, finalizedRecordRequired: true, resultFirst: true, terminationReasonRequired: true, boardRemainsVisible: true,
        clocksStopped: true, opponentWorkStopped: true, rematch: 'allowed', newGame: 'allowed', analyze: 'external-continuation', copyPgn: 'allowed',
        downloadPgn: 'allowed', localSavePgn: 'consent-controlled', mentor: 'prohibited-pending-11.6.2', academy: 'prohibited',
        educationalRecommendations: 'prohibited', ratingChange: 'prohibited-without-native-rating-authority', fictitiousRewards: 'prohibited',
        automaticNavigation: 'prohibited', analyticsTransport: 'disabled', resultTitles: ['You Won', 'You Lost', 'White Won', 'Black Won', 'Draw', 'Game Ended'],
        terminationReasons: reasons, actionOrder: ['rematch', 'new-game', 'analyze', 'copy-pgn', 'download-pgn', 'save-game'], describe });
})(typeof window !== 'undefined' ? window : globalThis);
