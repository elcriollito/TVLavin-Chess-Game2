export const VERSION = 'PlayV2CoachAssistanceCorpus@1.0.0';
const base = { sideToMove: 'white', configuration: { level: 'standard', focus: 'balanced', timing: 'on-request', timeControl: 'blitz-5', color: 'white' },
    prohibitedDisclosure: ['best-move', 'origin-square', 'destination-square', 'principal-variation', 'mate-sequence', 'future-opponent-move'],
    provenance: 'repository-authored synthetic Season 11.5.2 fixture' };
const fixture = (id, fen, category, suppressionExpectation = null, overrides = {}) => Object.freeze({ ...base, ...overrides, id, fen, event: { type: 'user-turn',
    category, severity: 'medium', confidence: 'high', requested: true, timing: 'on-request', ...overrides.event }, allowedCategory: suppressionExpectation ? null : category,
    suppressionExpectation });
export const corpus = Object.freeze([
    fixture('hanging-piece', '4k3/8/8/8/8/8/4q3/4K3 w - - 0 1', 'vulnerable-piece'),
    fixture('king-exposure', '4k3/8/8/8/8/8/8/4K2r w - - 0 1', 'king-safety'),
    fixture('tactical-opportunity', '4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1', 'forcing-moves'),
    fixture('unsafe-forcing-move', '4k3/8/8/8/8/8/4r3/3QK3 w - - 0 1', 'opponent-threat'),
    fixture('quiet-position', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'opponent-threat', 'CONFIDENCE_SUPPRESSED', { event: { confidence: 'low' } }),
    fixture('forced-move', '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', 'king-safety'),
    fixture('promotion', '4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'material-change', 'PROMOTION_SUPPRESSED', { event: { promotionPending: true } }),
    fixture('check', '4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', 'king-safety'),
    fixture('low-time', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'low-time', null, { configuration: { ...base.configuration, focus: 'time-awareness' }, event: { lowTime: true, severity: 'high' } }),
    fixture('terminal', '4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'material-change', 'TERMINAL_SUPPRESSED', { event: { terminal: true } }),
    fixture('ambiguous', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'opponent-threat', 'CONFIDENCE_SUPPRESSED', { event: { confidence: 'low' } }),
    fixture('no-action', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'opponent-threat', 'TIMING_SUPPRESSED', { event: { requested: false } })
]);
