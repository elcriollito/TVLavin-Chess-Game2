export const PLAY_V2_BETA_STAGE_ENV = 'CAISSA_PLAY_V2_BETA_STAGE';

export const PLAY_V2_BETA_ENTRY = Object.freeze({
    contractId: 'PlayV2BetaEntry@1.0.0',
    canonicalRoute: '/play/beta',
    entryDocument: 'play-v2.html',
    unavailableDocument: 'play-v2-unavailable.html',
    currentStage: 'internal',
    failureMode: 'fail-closed',
    rollbackOwner: 'beta-entry-gate'
});

const ALLOWED_PATHS = Object.freeze(new Map([
    ['/play/beta', 'games'],
    ['/play/beta/games', 'games'],
    ['/play/beta/bots', 'bots'],
    ['/play/beta/coach', 'coach']
]));

export function resolvePlayV2BetaEntry(pathname, environment = {}) {
    const path = String(pathname || '');
    const requested = path === '/play/beta' || path.startsWith('/play/beta/');
    if (!requested) return Object.freeze({ requested: false, authorized: false, document: null, mode: null });

    const mode = ALLOWED_PATHS.get(path) || null;
    const enabled = environment[PLAY_V2_BETA_STAGE_ENV] === PLAY_V2_BETA_ENTRY.currentStage;
    const authorized = enabled && mode !== null;
    return Object.freeze({
        requested: true,
        authorized,
        document: authorized ? PLAY_V2_BETA_ENTRY.entryDocument : PLAY_V2_BETA_ENTRY.unavailableDocument,
        mode,
        reasonCode: authorized ? 'INTERNAL_ENTRY_ALLOWED' : (enabled ? 'BETA_ROUTE_PROHIBITED' : 'BETA_ENTRY_DISABLED')
    });
}
