(function installCoachMessages(global) {
    'use strict';
    const SCHEMA_VERSION = '1.2.0';
    const TEMPLATE_VERSION = 'coach-message-templates@1.2.0';
    const templates = Object.freeze({
        'development-reminder': Object.freeze({
            beginner: 'Several minor pieces are still at home. Can a new piece join the game?',
            novice: 'Development is still incomplete. Before choosing a plan, consider activating another piece.',
            why: 'Active pieces provide more choices and help the rest of your position work together.'
        }),
        'development-positive': Object.freeze({
            beginner: 'Your minor pieces are joining the game. Keep coordinating them.',
            novice: 'Your development is taking shape; keep the pieces coordinated.',
            why: 'Completing development connects your pieces without claiming that one move was uniquely correct.'
        }),
        'king-safety': Object.freeze({
            beginner: 'The center is opening while your king remains there. Include king safety in your next check.',
            novice: 'With queens present and central lines opening, reassess your king before beginning another plan.',
            why: 'Open central lines can give checking pieces quicker access to an uncastled king.'
        }),
        'immediate-danger': Object.freeze({
            beginner: 'Your opponent has a checking move available. Check their forcing replies first.',
            novice: 'A forcing check is available to your opponent. Re-scan their checks, captures, and threats.',
            why: 'Checks restrict your replies, so they belong at the start of an opponent-threat scan.'
        }),
        'tactical-awareness': Object.freeze({
            beginner: 'The position contains an immediate capture. Recheck checks, captures, and threats.',
            novice: 'A legal capture is available to your opponent. What changed in their forcing options?',
            why: 'Legal captures are concrete tactical facts, but their consequences still need to be calculated.'
        }),
        'hanging-piece': Object.freeze({
            beginner: 'The piece you moved can be captured without an immediate recapture. Recheck loose pieces.',
            novice: 'Your moved piece is immediately capturable and no legal recapture is available. Compare attackers and defenders.',
            why: 'An attacked piece becomes especially vulnerable when a legal capture cannot be answered at once.'
        }),
        'endgame-activate-king': Object.freeze({
            beginner: 'With less material, your king can become an active piece. Can it move closer to the center or the pawns?',
            novice: 'The position is simplified and your king remains distant. Consider how it can take a more active role.',
            intermediate: 'In this reduced position, assess whether your king can improve its access to the center or the pawns.',
            why: 'In reduced-material positions, the king often becomes an important attacking and defensive piece.'
        }),
        'endgame-opposition': Object.freeze({
            novice: 'The kings are in direct opposition. Which king is required to give way?',
            intermediate: 'Direct opposition is present. Account for the side to move before judging the king entry.',
            why: 'With one square between aligned kings, the move obligation determines which king must yield.'
        }),
        'endgame-support-passer': Object.freeze({
            novice: 'You have an unblocked passed pawn that is not yet supported by the king. Think about coordination.',
            intermediate: 'The passed pawn is clear of opposing pawns but lacks king support. Compare king and pawn timing.',
            why: 'A passed pawn is usually more useful when its king helps control the approach and promotion route.'
        }),
        'endgame-pawn-square': Object.freeze({
            novice: 'A lone pawn race is present. Check whether the defending king is inside the pawn’s square.',
            intermediate: 'Use the pawn’s square and the side to move to estimate whether the king can catch it.',
            why: 'The pawn’s square converts king distance and promotion distance into a quick geometric check.'
        })
    });
    function create(trigger, level, assistance = 'guided') {
        const group = templates[trigger]; const message = group?.[level] || group?.novice || group?.intermediate || null;
        if (!message || typeof message !== 'string' || message.length > 220) return null;
        const explanation = assistance === 'teaching' ? group.why : null;
        return Object.freeze({ schemaVersion: SCHEMA_VERSION, templateVersion: TEMPLATE_VERSION,
            templateId: trigger, trigger, message, explanation, revealsMove: false, includesPv: false });
    }
    const getExplanation = (id, assistance) => assistance === 'teaching' ? templates[id]?.why || null : null;
    global.CaissaCoachMessages = Object.freeze({ schemaVersion: SCHEMA_VERSION, templateVersion: TEMPLATE_VERSION,
        templates, create, getExplanation });
})(typeof window !== 'undefined' ? window : globalThis);
