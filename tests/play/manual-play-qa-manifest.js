const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
};

export const MANUAL_PLAY_QA_VERSION = 'ManualPlayQA@1.0.0';
export const MANUAL_PLAY_QA_RESULTS = freeze([
    'pass', 'fail', 'blocked', 'not-run', 'external', 'physical-device', 'manual-certification'
]);
export const MANUAL_PLAY_QA_SEVERITIES = freeze(['blocker', 'critical', 'major', 'minor', 'cosmetic']);
export const MANUAL_PLAY_QA_PRIORITIES = freeze(['release-blocking', 'before-production', 'follow-up', 'accepted limitation']);

const scenario = (scenarioId, area, title, result, evidence, notes, options = {}) => ({
    scenarioId, area, title,
    prerequisites: options.prerequisites || 'Local static server; deterministic Play harness; Simplified Play QA flag where applicable.',
    steps: options.steps || ['Open the named surface.', 'Perform the named interaction.', 'Compare the visible and state result with the expected behavior.'],
    expectedResult: options.expectedResult || title,
    actualResult: options.actualResult || notes,
    evidence, result, notes,
    severity: options.severity || null,
    priority: options.priority || null,
    defectId: options.defectId || null,
    retestResult: options.retestResult || 'not-required'
});

export const MANUAL_PLAY_QA_SCENARIOS = freeze([
    scenario('NAV-01', 'navigation', 'Classic and Legacy Play remain defaults; QA routes, modes, direct routes, Back/Forward, and refresh remain stable.', 'pass', 'Written observation plus focused browser suites.', 'No blank panel, duplicate board, route flicker, or sidebar loss observed.'),
    scenario('BOARD-01', 'board', 'Board, pieces, selection, legal indicators, drag/tap paths, flip, resize, theme, and route continuity remain usable.', 'pass', 'Desktop/compact observation captures and ChessboardAdapter browser evidence.', 'Functional interaction remained stable; subjective feel was direct and board-first.'),
    scenario('RULE-01', 'rules', 'Legal moves succeed, illegal moves fail, side-to-move and check state remain correct.', 'pass', 'Controlled local positions and browser state inspection.', 'No duplicate move or illegal acceptance observed.'),
    scenario('RULE-02', 'rules', 'Kingside/queenside castling rules, castling-through-check rejection, and en passant are correct.', 'pass', 'Controlled local FEN characterization.', 'Legal special moves succeeded and illegal king transit remained rejected.'),
    scenario('RULE-03', 'rules', 'Queen promotion and rook, bishop, and knight underpromotion remain selectable and correct.', 'pass', 'Promotion dialog interaction and controlled local FEN.', 'Promotion paused play and each supported piece choice remained reachable.'),
    scenario('RULE-04', 'rules', 'Checkmate, stalemate, insufficient material, custom FEN, and terminal result text are correct.', 'pass', 'Controlled local positions and PostGame observation.', 'Visible result and termination matched the position.'),
    scenario('RULE-05', 'rules', 'Threefold repetition through public history injection.', 'blocked', 'Known browser characterization boundary.', 'The public UI exposes no deterministic history-injection path.', { priority: 'accepted limitation' }),
    scenario('RULE-06', 'rules', 'Fifty-move rule through public history injection.', 'blocked', 'Known browser characterization boundary.', 'The public UI exposes no deterministic history-injection path.', { priority: 'accepted limitation' }),
    scenario('CLOCK-01', 'clocks', '1+0, 3+2, 5+0, and longer controls initialize, switch, increment, stop, reset, and never go negative.', 'pass', 'ClockService unit/browser evidence plus visible clock observation.', 'Correct active side, promotion pause, terminal stop, Rematch, and New Game resets observed.'),
    scenario('GAMES-01', 'games', 'Games configuration, primary CTA, board readiness, lifecycle, rail, terminal flow, New Game, and Rematch are clear.', 'pass', 'Desktop and compact observation captures.', 'The surface reads as a simple play setup rather than a control panel.'),
    scenario('BOTS-01', 'bots', 'Lazy load, Bot selection, controls, response, identity, terminal flow, and retained Rematch configuration are truthful.', 'pass', 'Cross-browser smoke and detailed Bots browser evidence.', 'No duplicate response observed; no exact-Elo certification claimed.'),
    scenario('COACH-01', 'coach', 'Coach configuration and messages remain readable, bounded, non-blocking, and reveal no move or PV.', 'pass', 'Cross-browser smoke and detailed Coach browser evidence.', 'Functional messages were technically bounded; instructional quality remains foundation-level.'),
    scenario('PLAYERS-01', 'players', 'Players is QA-only, production-blocked, provider-qualified, frozen, and starts no proprietary human game.', 'pass', 'Visible Players observation plus hard-invariant evidence.', 'Unavailable reason was visible; machine game state remained unaffected.'),
    scenario('FAIR-01', 'fairplay', 'Machine evaluation is policy-bound; human readiness exposes no numeric, mate, request, or stale value.', 'pass', 'Rail state observation and hard-invariant evidence.', 'No transient human-evaluation leak observed.'),
    scenario('POST-01', 'postgame', 'Checkmate, timeout, and feasible draw results expose one truthful PostGame card and correct actions.', 'pass', 'Controlled terminal positions and PostGame capture.', 'Result, winner, termination, identity, actions, and stable route were coherent.'),
    scenario('REMATCH-01', 'rematch', 'Games, Bots, and Coach Rematch invoke once and retain intended configuration with fresh state.', 'pass', 'PostGame and lifecycle browser evidence.', 'One board and at most one Worker remained.'),
    scenario('NEW-01', 'new-game', 'New Game stops active work and clears board history, clocks, PostGame, and stale state.', 'pass', 'Lifecycle browser evidence and visible reset.', 'No stale move, clock, listener, or duplicate lifecycle observed.'),
    scenario('PGN-01', 'pgn', 'PGN copy/download, filename, headers, moves, result, custom-FEN headers, and failure messaging are bounded.', 'pass', 'PostGame browser side-effect evidence.', 'One download/object URL lifecycle; no cloud-save claim.'),
    scenario('ANALYZE-01', 'analyze', 'Opaque Analyze handoff restores the same game, survives refresh/Back, and preserves runtime isolation.', 'pass', 'Cross-browser smoke and Analyze handoff browser evidence.', 'No raw PGN/FEN appeared in the URL.'),
    scenario('MENTOR-01', 'mentor', 'Explicit Mentor request is correlated, deduplicated, technically bounded, and failure-safe.', 'pass', 'Mentor pipeline browser/unit evidence and PostGame observation.', 'Foundation request is truthful; unrestricted generated review is not claimed.'),
    scenario('REPLAY-01', 'guided-replay', 'Replay position, prompt, attempts, reveal, navigation, restart, Back, focus, and hidden-answer boundary hold.', 'pass', 'Guided Replay browser evidence.', 'No duplicate replay board or pre-attempt accessibility answer leak.'),
    scenario('SUMMARY-01', 'mentor-summary', 'Summary is explicit, same-game, bounded, concept-linked, and readable on desktop/compact.', 'pass', 'Mentor Summary deterministic fixtures and responsive browser evidence.', 'No invented quote, external claim, or unrestricted prose drift.'),
    scenario('THEME-01', 'themes', 'Dark, Light, and System preserve state and geometry with readable rail, focus, and primary CTA.', 'pass', 'Theme captures, WCAG token assertion, and browser evidence.', 'Recently fixed light primary contrast remained readable.'),
    scenario('A11Y-01', 'accessibility', 'Keyboard tabs, controls, dialogs, actions, focus restoration, visible focus, and non-color state remain usable.', 'pass', 'Keyboard browser interaction and visual focus inspection.', 'No clipped focus or unreachable essential control observed.'),
    scenario('A11Y-02', 'accessibility', 'Named screen-reader certification.', 'manual-certification', 'No screen reader was available in this environment.', 'NVDA, JAWS, VoiceOver, and TalkBack were not claimed.', { priority: 'before-production' }),
    scenario('RESP-01', 'responsive', '320x568, 390x844, 768x1024, 1024x768, 1440x900, landscape, constrained height, and 200% reflow remain usable.', 'pass', 'Responsive browser matrix plus desktop/compact visual captures.', 'Board and essential controls remained visible and reachable without horizontal overflow.'),
    scenario('DEVICE-01', 'physical-device', 'Real iPhone, Android, or tablet validation.', 'physical-device', 'No physical mobile or tablet device was connected.', 'Emulation was not represented as physical evidence.', { priority: 'before-production' }),
    scenario('EXT-01', 'external', 'Deployed Worker integration.', 'external', 'WORKER_URL was not configured.', 'Deterministic local Worker coverage remained green.', { priority: 'before-production' }),
    scenario('EXT-02', 'external', 'Live FICS gateway integration.', 'external', 'No local/configured FICS gateway was available.', 'No opponent, presence, or challenge was fabricated.', { priority: 'before-production' }),
    scenario('EXT-03', 'external', 'Live tablebase integration.', 'external', 'Explicit network opt-in was not enabled.', 'Deterministic local Endgame coverage remained authoritative.', { priority: 'before-production' })
]);

export const MANUAL_PLAY_QA_DEFECTS = freeze([]);
