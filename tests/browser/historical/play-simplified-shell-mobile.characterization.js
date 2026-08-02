// Historical characterization only; intentionally not a Playwright *.spec.js owner.
// Current ownership moved to ../play-simplified-shell-mobile.spec.js in Season 11.8.0A.
export const PRE_SEASON_11_MOBILE_CHARACTERIZATION = Object.freeze({
    catalogId: 'PlayV2HistoricalMobileShell@1.0.0',
    sourceBaseline: '55fe81b9feb94cf5ee7ad5989f15f880edeaef0e',
    entry: '/play/games?simplified=1',
    productEra: 'pre-Season-11 Simplified Play compatibility preview',
    currentAcceptanceOwner: false,
    assumptions: Object.freeze([
        'Legacy navigation drawer is visible and owns Help.',
        'A Worker exists immediately after a generic engine start.',
        'The fake-engine harness replies e5 after e4 in every viewport.',
        'The compatibility query, rather than /play/beta, owns mobile acceptance.'
    ]),
    preservedCases: Object.freeze([
        'required phone and tablet geometry is bounded, board-first, and reachable',
        'portrait landscape portrait preserves game identity and requests one resize per stable geometry',
        'drawer, promotion, panel New Game, Settings, Help, and Back coexist with the shell',
        'compact/standard/tablet accepts one legal move and one deterministic engine response'
    ])
});
