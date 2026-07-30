import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const identitySource = fs.readFileSync(new URL('js/play/ui/play-visual-identity.js', root), 'utf8');
const componentSource = fs.readFileSync(new URL('js/play/ui/play-visual-components.js', root), 'utf8');
const css = fs.readFileSync(new URL('css/play-visual-components.css', root), 'utf8');
const tokens = fs.readFileSync(new URL('css/play-visual-tokens.css', root), 'utf8');
const playBoundaryFiles = [
    'js/play/ui/play-visual-identity.js', 'js/play/ui/play-visual-components.js',
    'js/play/simplified-play-shell.js', 'js/play/games-panel.js', 'js/play/bots-panel.js',
    'js/play/coach-panel.js', 'js/play/players-panel.js', 'js/play/post-game-experience.js',
    'css/play-visual-components.css', 'css/play-visual-tokens.css'
];
const playBoundary = playBoundaryFiles.map(file => fs.readFileSync(new URL(file, root), 'utf8')).join('\n');

function load() {
    const window = {};
    vm.runInNewContext(identitySource, { window, globalThis: window, WeakSet, Set, Reflect });
    return window.CaissaPlayIdentityRules;
}

test('identity policy is versioned, immutable, complete, and validates itself', () => {
    const api = load(), policy = api.getPolicy();
    assert.equal(api.schemaVersion, '1.0.0');
    assert.equal(api.policySchemaVersion, '1.0.0');
    assert.equal(policy.principleId, 'caissa-board-first');
    for (const field of ['preserve', 'caissaExpression', 'prohibitedSimilarities', 'requiredDistinctives', 'evidence'])
        assert.ok(policy[field].length >= 4);
    assert.equal(api.validate(policy).ok, true);
    assert.ok(Object.isFrozen(api) && Object.isFrozen(policy) && Object.isFrozen(policy.requiredDistinctives));
});

test('unknown versions, hostile keys, unknown principles, and malformed vocabularies fail closed', () => {
    const api = load(), valid = JSON.parse(JSON.stringify(api.getPolicy()));
    assert.equal(api.validate({ ...valid, schemaVersion: '2.0.0' }).reasonCode, 'UNSUPPORTED_SCHEMA_VERSION');
    assert.equal(api.validate({ ...valid, principleId: 'unknown' }).reasonCode, 'UNKNOWN_PRINCIPLE');
    const hostile = JSON.parse('{"schemaVersion":"1.0.0","principleId":"caissa-board-first","preserve":[],"caissaExpression":[],"prohibitedSimilarities":[],"requiredDistinctives":[],"evidence":[],"__proto__":{"polluted":true}}');
    assert.equal(api.validate(hostile).reasonCode, 'INVALID_IDENTITY_POLICY');
    assert.equal(api.validate({ ...valid, preserve: ['Not Valid'] }).reasonCode, 'INVALID_IDENTITY_POLICY');
});

test('production identity contract contains no competitor names and owns no runtime or resources', () => {
    assert.doesNotMatch(identitySource, /chess\.com|lichess|chess24|chessable/i);
    assert.doesNotMatch(identitySource, /\bApp\b|navigate|startNewGame|GameLifecycle|FairPlay|Chessboard|Engine|Worker|WebSocket|fetch|localStorage|sessionStorage|setTimeout|setInterval|requestAnimationFrame/);
    assert.doesNotMatch(identitySource, /document\.|createElement|querySelector|addEventListener/);
});

test('Simplified Play visual boundary contains no foreign product branding or external visual assets', () => {
    assert.doesNotMatch(playBoundary, /chess\.com|lichess|chess24|chessable/i);
    assert.doesNotMatch(playBoundary, /(?:src|href)\s*=\s*["']https?:\/\//i);
    assert.doesNotMatch(playBoundary, /\.(?:png|jpe?g|webp|gif|svg)(?:\?|["'])/i);
    assert.doesNotMatch(playBoundary, /copied-(?:asset|icon|avatar|wording)-marker/i);
});

test('components expose CAISSA expressions and the distinct rail variant', () => {
    assert.match(componentSource, /'caissa-rail'/);
    for (const expression of ['inscribed-mode-rail', 'identity-first-profile', 'rating-ledger',
        'score-sheet-controls', 'separated-primary-command', 'learning-continuation',
        'open-file-state', 'notched-readiness', 'ledger-wash'])
        assert.match(componentSource, new RegExp(expression));
});

test('CSS uses scoped CAISSA values without global leakage or the superseded value cluster', () => {
    assert.match(tokens, /--play-vc-space-1: \.375rem/);
    assert.match(tokens, /--play-vc-radius: \.625rem \.1875rem/);
    assert.match(css, /caissa-vc-ledger-wash 980ms/);
    assert.match(css, /@media \(max-width: 42rem\)/);
    assert.doesNotMatch(css, /border-radius:\s*999px|@media \(max-width:\s*600px\)|caissa-vc-loading 1\.2s/);
    assert.doesNotMatch(css, /(^|})\s*(?:html|body(?!\.caissa-simplified-play-active)|\*|button|section)\s*(?:,|\{)/m);
});

test('protected architecture documents remain outside the identity implementation scope', () => {
    const audit = fs.readFileSync(new URL('docs/design/PLAY_VISUAL_ORIGINALITY_AUDIT.md', root), 'utf8');
    for (const pattern of ['Mode tabs', 'Profile cards', 'Time controls', 'CTA footer', 'PostGame',
        'Loading skeleton', 'Empty state', 'Locked state', 'Evaluation rail', 'Mobile stacking'])
        assert.match(audit, new RegExp(pattern, 'i'));
});
