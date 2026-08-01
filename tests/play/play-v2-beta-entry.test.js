import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from 'cheerio';
import {
    PLAY_V2_BETA_ENTRY, PLAY_V2_BETA_STAGE_ENV, resolvePlayV2BetaEntry
} from '../../js/play/play-v2-beta-entry-gate.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PlayV2BetaEntry@1.0.0 declares the controlled internal contract', () => {
    const window = {};
    vm.runInNewContext(read('js/play/play-v2-beta-entry.js'), { window, globalThis: window });
    const contract = window.CaissaPlayV2BetaEntry;
    assert.equal(contract.contractId, 'PlayV2BetaEntry@1.0.0');
    assert.deepEqual(JSON.parse(JSON.stringify(contract)), {
        schemaVersion: '1.0.0', contractId: 'PlayV2BetaEntry@1.0.0', canonicalRoute: '/play/beta',
        entryDocument: 'play-v2.html', currentStage: 'internal', publicNavigation: 'prohibited',
        publicEnrollment: 'prohibited', defaultPlayReplacement: 'prohibited', homepageReplacement: 'prohibited',
        legacyPlayFallback: 'prohibited', ficsFallback: 'prohibited', playersRuntime: 'blocked',
        coachRuntime: 'blocked', mentorRuntime: 'blocked', gamesRuntime: 'allowed-internal',
        botsRuntime: 'allowed-internal-uncertified', analyticsTransport: 'disabled', failureMode: 'fail-closed',
        rollbackOwner: 'beta-entry-gate'
    });
    assert.ok(Object.isFrozen(contract));
});

test('gate admits only exact internal Games and Bots paths and rolls back fail closed', () => {
    const enabled = { [PLAY_V2_BETA_STAGE_ENV]: 'internal' };
    for (const [path, mode] of [['/play/beta', 'games'], ['/play/beta/games', 'games'], ['/play/beta/bots', 'bots']]) {
        assert.deepEqual({ ...resolvePlayV2BetaEntry(path, enabled) }, {
            requested: true, authorized: true, document: 'play-v2.html', mode, reasonCode: 'INTERNAL_ENTRY_ALLOWED'
        });
    }
    for (const path of ['/play/beta/coach', '/play/beta/mentor', '/play/beta/players', '/play/beta/nope', '/play/beta/', '/play/beta//bots', '/play/beta/%62ots']) {
        const result = resolvePlayV2BetaEntry(path, enabled);
        assert.equal(result.authorized, false);
        assert.equal(result.document, 'play-v2-unavailable.html');
    }
    for (const environment of [{}, { [PLAY_V2_BETA_STAGE_ENV]: 'disabled' }, { [PLAY_V2_BETA_STAGE_ENV]: 'public-beta' }]) {
        const result = resolvePlayV2BetaEntry(new URL('https://caissa.test/play/beta?token=secret#players').pathname, environment);
        assert.equal(result.authorized, false);
        assert.equal(result.document, 'play-v2-unavailable.html');
    }
    assert.equal(PLAY_V2_BETA_ENTRY.failureMode, 'fail-closed');
});

test('server and hosting select beta documents before legacy Play and default hosting stays disabled', () => {
    const server = read('server.js');
    const vercel = JSON.parse(read('vercel.json'));
    assert.ok(server.indexOf('resolvePlayV2BetaEntry(pathname') < server.indexOf("pathname === '/play' || pathname.startsWith('/play/')"));
    assert.deepEqual(vercel.rewrites.filter(rule => rule.source.startsWith('/play/beta')), [
        { source: '/play/beta', destination: '/play-v2-unavailable.html' },
        { source: '/play/beta/:path*', destination: '/play-v2-unavailable.html' }
    ]);
    assert.ok(vercel.rewrites.some(rule => rule.source === '/play' && rule.destination === '/index.html'));
});

test('unavailable response is accessible, non-indexable, non-sensitive, and runtime-free', () => {
    const html = read('play-v2-unavailable.html');
    const page = load(html);
    assert.match(page('title').text(), /Play Beta Unavailable/);
    assert.equal(page('h1').length, 1);
    assert.equal(page('a[href="/"]').length, 1);
    assert.match(page('meta[name="robots"]').attr('content'), /noindex/);
    assert.equal(page('script, link[rel="stylesheet"], iframe, form').length, 0);
    assert.doesNotMatch(html, /CAISSA_PLAY_V2_BETA_STAGE|process\.env|token|secret|cookie|localStorage|sessionStorage/i);
});

test('beta is absent from public navigation, sitemap, robots, and homepage promotion', () => {
    for (const path of ['index.html', 'js/caissa-primary-navigation.js', 'public/sitemap.xml', 'public/robots.txt']) {
        assert.doesNotMatch(read(path), /\/play\/beta/i, path);
    }
});

test('dedicated entry contains the beta contract and no prohibited resource graph', () => {
    const html = read('play-v2.html');
    assert.match(html, /play-v2-beta-entry\.js\?v=1\.0\.0/);
    const resources = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
    assert.equal(resources.filter(item => /fics/i.test(item) && !/play-v2-fics-isolation/i.test(item)).length, 0);
    assert.equal(resources.filter(item => /academy|coach|mentor|guided[-_/]?replay|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library)|players/i.test(item)).length, 0);
});
