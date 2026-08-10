export const PLAY_V2_BETA_STAGE_ENV = 'CAISSA_PLAY_V2_BETA_STAGE';

export const PLAY_V2_BETA_ENTRY = Object.freeze({
    contractId: 'PlayV2BetaEntry@1.1.0',
    canonicalRoute: '/play',
    entryDocument: 'play-v2-public-beta.html',
    unavailableDocument: 'play-v2-unavailable.html',
    currentStage: 'public-beta',
    failureMode: 'fail-closed',
    rollbackOwner: 'beta-entry-gate'
});

const ALLOWED_PATHS = Object.freeze(new Map([
    ['/play', 'games'],
    ['/play/games', 'games'],
    ['/play/bots', 'bots'],
    ['/play/coach', 'coach']
]));

export function resolvePlayV2BetaEntry(pathname, environment = {}) {
    const path = String(pathname || '');
    let decodedPath = path;
    try { decodedPath = decodeURIComponent(path); } catch (_) { /* malformed beta-shaped paths fail closed below */ }
    const playShape = decodedPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase();
    const requested = playShape === '/play' || playShape.startsWith('/play/');
    if (!requested) return Object.freeze({ requested: false, authorized: false, document: null, mode: null });

    const mode = ALLOWED_PATHS.get(path) || null;
    const enabled = environment[PLAY_V2_BETA_STAGE_ENV] === PLAY_V2_BETA_ENTRY.currentStage;
    const authorized = enabled && mode !== null;
    return Object.freeze({
        requested: true,
        authorized,
        document: authorized ? PLAY_V2_BETA_ENTRY.entryDocument : PLAY_V2_BETA_ENTRY.unavailableDocument,
        mode,
        reasonCode: authorized ? 'CANONICAL_PLAY_ENTRY_ALLOWED' : (enabled ? 'PLAY_ROUTE_PROHIBITED' : 'PLAY_ENTRY_DISABLED')
    });
}
