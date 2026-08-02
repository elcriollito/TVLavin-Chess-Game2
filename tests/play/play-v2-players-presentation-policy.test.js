import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from 'cheerio';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function policy() {
    const window = {}; vm.runInNewContext(read('js/play/play-v2-players-presentation-policy.js'), { window, globalThis: window });
    return window.CaissaPlayV2PlayersPresentationPolicy;
}

test('PlayV2PlayersPresentationPolicy@1.0.0 freezes the complete omission decision', () => {
    const value = policy();
    assert.deepEqual(plain(value), {
        schemaVersion: '1.0.0', contractId: 'PlayV2PlayersPresentationPolicy@1.0.0',
        currentPresentation: 'omitted', publicTab: 'prohibited', disabledTab: 'prohibited',
        comingSoonCard: 'prohibited-until-separate-approval', publicRoute: 'prohibited',
        informationalRoute: 'prohibited', playersPanel: 'prohibited', lobbyPresentation: 'prohibited',
        fictionalUsers: 'prohibited', simulatedPresence: 'prohibited', fabricatedRatings: 'prohibited',
        simulatedChallenges: 'prohibited', fakeMatchmaking: 'prohibited', ficsHandoff: 'prohibited',
        legacyPlayHandoff: 'prohibited', publicReady: false,
        activationRequiresNativeInfrastructureCertification: true, futurePresentationRequiresProductApproval: true,
        analyticsTransport: 'disabled'
    });
    assert.ok(Object.isFrozen(value));
});

test('every presentation, fallback, alias and future activation attempt fails closed', () => {
    const value = policy();
    for (const input of [
        { type: 'route', value: '/play/beta/players' }, { type: 'route', value: '/PLAY//BETA//%70layers' },
        { type: 'tab', value: 'Players' }, { type: 'panel', value: 'players-panel' },
        { type: 'resource', value: 'players-stack' }, { type: 'copy', value: 'Players — Coming Soon' },
        { type: 'metadata', value: 'multiplayer matchmaking' }, { type: 'state', value: '#players' },
        { type: 'handoff', value: 'FICS lobby' }, { type: 'handoff', value: 'Legacy Play players' }
    ]) assert.equal(value.authorize(input).allowed, false, JSON.stringify(input));
    assert.deepEqual(plain(value.evaluateFuturePresentation({})), { allowed: false, reasonCode: 'NATIVE_INFRASTRUCTURE_UNCERTIFIED' });
    assert.deepEqual(plain(value.evaluateFuturePresentation({ nativeInfrastructureCertification: 'certified' })),
        { allowed: false, reasonCode: 'PRODUCT_APPROVAL_MISSING' });
    assert.deepEqual(plain(value.evaluateFuturePresentation({ nativeInfrastructureCertification: 'certified', productApproval: 'approved' })),
        { allowed: false, reasonCode: 'POLICY_VERSION_REQUIRES_EXPLICIT_ACTIVATION' });
});

test('generated Play v2 entry has no Players presentation, legacy lobby, fallback metadata or resource', () => {
    const html = read('play-v2.html'); const page = load(html);
    assert.equal(page('script[src*="play-v2-players-presentation-policy.js"]').length, 1);
    assert.equal(page('[data-shell-mode="players"],[data-play-mode="players"],[data-players-panel],#playersPanel').length, 0);
    assert.equal(page('[data-section="yahooClassic"],[data-section="fics"],[data-section="spectator"]').length, 0);
    for (const selector of ['#yahooClassicSection', '#ficsSection', '#spectatorSection']) {
        assert.equal(page(selector).is('[hidden]'), true); assert.equal(page(selector).is('[inert]'), true);
        assert.equal(page(selector).attr('aria-hidden'), 'true');
    }
    assert.equal(page('meta[content*="Players" i],meta[content*="FICS" i],meta[content*="matchmaking" i]').length, 0);
    assert.equal((html.match(/<(?:script|link)\b[^>]*(?:js\/play\/players\/|players-(?:panel|stack)|fics-client|fics-style)/gi) || []).length, 0);
    assert.match(page('meta[name="robots"]').attr('content'), /noindex/);
});

test('presentation policy is passive and protected legacy owners remain intact', () => {
    const source = read('js/play/play-v2-players-presentation-policy.js');
    assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.|addEventListener|setTimeout|Worker\s*\(|cookie/i);
    const legacy = read('index.html');
    assert.match(legacy, /id="yahooClassicSection"/); assert.match(legacy, /id="ficsSection"/);
    assert.match(legacy, /js\/fics-client\.js/); assert.match(read('yahoo-classic.html'), /CAISSA Classic/i);
});
