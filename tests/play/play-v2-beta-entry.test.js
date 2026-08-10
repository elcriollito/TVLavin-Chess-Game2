import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { load } from 'cheerio';
import {
    PLAY_V2_BETA_ENTRY, PLAY_V2_BETA_STAGE_ENV, resolvePlayV2BetaEntry
} from '../../js/play/play-v2-beta-entry-gate.js';
import middleware from '../../middleware.js';

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
        coachRuntime: 'allowed-internal-assistance-pending', mentorRuntime: 'blocked', gamesRuntime: 'allowed-internal',
        botsRuntime: 'allowed-internal-uncertified', analyticsTransport: 'disabled', failureMode: 'fail-closed',
        rollbackOwner: 'beta-entry-gate'
    });
    assert.ok(Object.isFrozen(contract));
});

test('gate admits only exact canonical Play paths and every other stage rolls back fail closed', () => {
    const enabled = { [PLAY_V2_BETA_STAGE_ENV]: 'public-beta' };
    for (const [path, mode] of [['/play', 'games'], ['/play/games', 'games'], ['/play/bots', 'bots'], ['/play/coach', 'coach']]) {
        assert.deepEqual({ ...resolvePlayV2BetaEntry(path, enabled) }, {
            requested: true, authorized: true, document: 'play-v2-public-beta.html', mode, reasonCode: 'CANONICAL_PLAY_ENTRY_ALLOWED'
        });
    }
    for (const path of ['/play/mentor', '/play/players', '/play/PLAYERS', '/play//players', '/play/nope', '/play/', '/play//bots', '/play/%62ots']) {
        const result = resolvePlayV2BetaEntry(path, enabled);
        assert.equal(result.authorized, false);
        assert.equal(result.document, 'play-v2-unavailable.html');
    }
    for (const environment of [{}, { [PLAY_V2_BETA_STAGE_ENV]: 'disabled' }, { [PLAY_V2_BETA_STAGE_ENV]: 'internal' }, { [PLAY_V2_BETA_STAGE_ENV]: 'invite-only' }, { [PLAY_V2_BETA_STAGE_ENV]: 'PUBLIC-BETA' }, { [PLAY_V2_BETA_STAGE_ENV]: ' public-beta' }]) {
        const result = resolvePlayV2BetaEntry(new URL('https://caissa.test/play?token=secret#players').pathname, environment);
        assert.equal(result.authorized, false);
        assert.equal(result.document, 'play-v2-unavailable.html');
    }
    assert.equal(PLAY_V2_BETA_ENTRY.failureMode, 'fail-closed');
});

test('server and hosting select canonical Play while retired beta and direct HTML stay controlled', () => {
    const server = read('server.js');
    const vercel = JSON.parse(read('vercel.json'));
    assert.deepEqual(vercel.rewrites.filter(rule => rule.source.startsWith('/play/beta')), [
        { source: '/play/beta/invite', destination: '/play-v2-unavailable.html' },
        { source: '/play/beta/:path*', destination: '/play-v2-unavailable.html' }
    ]);
    assert.equal(vercel.redirects.filter(rule => rule.source.startsWith('/play/beta')).length, 4);
    assert.match(read('middleware.js'), /resolvePlayV2BetaEntry\(url\.pathname, process\.env\)/);
    assert.match(read('middleware.js'), /PLAY_V2_PUBLIC_BETA_DOCUMENT/);
    assert.ok(vercel.rewrites.some(rule => rule.source === '/play-v2.html' && rule.destination === '/play-v2-unavailable.html'));
    assert.ok(vercel.rewrites.some(rule => rule.source === '/play-v2-public-beta.html' && rule.destination === '/play-v2-unavailable.html'));
    assert.equal(vercel.rewrites.some(rule => rule.has?.some(item => item.key === 'simplified')), false);
    assert.ok(vercel.rewrites.some(rule => rule.source === '/play' && rule.destination === '/play-v2-unavailable.html'));
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

test('dedicated public entry excludes invite runtime and prohibited resource graph', () => {
    const html = read('play-v2-public-beta.html');
    assert.match(html,/data-caissa-play-v2-entry="official"/);
    assert.match(html,/play-v2-public-beta-policy\.js/);
    assert.doesNotMatch(html,/play-v2-invite-client\.js|play-v2-invite-redemption\.js/);
    const resources = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
    assert.equal(resources.filter(item => /fics/i.test(item) && !/play-v2-fics-isolation/i.test(item)).length, 0);
    assert.equal(resources.filter(item => /academy|mentor|guided[-_/]?replay|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library)|players|onboarding|js\/play\/coach\//i.test(item)
        && !/play-v2-(?:mentor-review-boundary|native-players-policy|players-presentation-policy)/i.test(item)).length, 0);
});

test('edge middleware owns canonical Play, redirects retired beta, and fails closed elsewhere', async () => {
    const previousStage = process.env.CAISSA_PLAY_V2_BETA_STAGE;
    const previousSha = process.env.VERCEL_GIT_COMMIT_SHA;
    try {
        process.env.CAISSA_PLAY_V2_BETA_STAGE = 'disabled';
        let response = middleware(new Request('https://www.caissa-chess.org/play'));
        assert.equal(response.status, 404);
        assert.match(await response.text(), /Play Beta Unavailable/);

        process.env.CAISSA_PLAY_V2_BETA_STAGE = 'public-beta';
        process.env.VERCEL_GIT_COMMIT_SHA = '8426d0371ff68d4afe81d5be9bc8cfa64f4507f1';
        for (const path of ['/play', '/play/games', '/play/bots', '/play/coach']) {
            response = middleware(new Request(`https://www.caissa-chess.org${path}`));
            const body = await response.text();
            assert.equal(response.status, 200, path);
            assert.match(body, /data-caissa-play-v2-entry="official"/);
            assert.match(body, /name="caissa-build" content="8426d0371ff68d4afe81d5be9bc8cfa64f4507f1"/);
            assert.match(response.headers.get('Content-Security-Policy'), /connect-src 'self'/);
        }
        response = middleware(new Request('https://www.caissa-chess.org/play', { method: 'HEAD' }));
        assert.equal(response.status, 200);
        assert.equal(await response.text(), '');
        response = middleware(new Request('https://www.caissa-chess.org/play', { method: 'POST' }));
        assert.equal(response.status, 404);
        for (const [path,destination] of [['/play/beta','/play'],['/play/beta/games','/play/games'],['/play/beta/bots','/play/bots'],['/play/beta/coach','/play/coach']]) {
            response = middleware(new Request(`https://www.caissa-chess.org${path}`));
            assert.equal(response.status, 308, path); assert.equal(new URL(response.headers.get('location')).pathname,destination);
        }
        for (const path of ['/play/players', '/play/beta/players', '/play/beta/invite', '/play/beta/qa/promotion', '/play/beta/nope']) {
            response = middleware(new Request(`https://www.caissa-chess.org${path}`));
            assert.equal(response.status, 404, path);
            assert.match(await response.text(), /Play Beta Unavailable/);
        }
        response = middleware(new Request('https://www.caissa-chess.org/api/play-beta/status'));
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: 'PLAY_BETA_ENDPOINT_UNAVAILABLE' });
    } finally {
        if (previousStage === undefined) delete process.env.CAISSA_PLAY_V2_BETA_STAGE;
        else process.env.CAISSA_PLAY_V2_BETA_STAGE = previousStage;
        if (previousSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
        else process.env.VERCEL_GIT_COMMIT_SHA = previousSha;
    }
});

test('edge middleware owns every direct Play v2 document before static filesystem routing', async () => {
    const previousStage = process.env.CAISSA_PLAY_V2_BETA_STAGE;
    const direct = ['/play-v2.html', '/play-v2-public-beta.html', '/play-v2-invite.html',
        '/play-v2-promotion-qa.html', '/play-v2-ipad-analyze-diagnostic.html'];
    try {
        for (const stage of [undefined, 'disabled', 'internal', 'invite-only', 'public-beta', 'PUBLIC-BETA']) {
            if (stage === undefined) delete process.env.CAISSA_PLAY_V2_BETA_STAGE;
            else process.env.CAISSA_PLAY_V2_BETA_STAGE = stage;
            for (const path of direct) {
                for (const variant of [path, `${path}?token=fabricated`, `${path}/descendant`, path.replace('.html', '%2Ehtml')]) {
                    const response = middleware(new Request(`https://www.caissa-chess.org${variant}`));
                    assert.equal(response.status, 404, `${stage}:${variant}`);
                    const body = await response.text();
                    assert.match(body, /Play Beta Unavailable/);
                    assert.doesNotMatch(body, /<script\b|data-caissa-play-v2-entry="public-beta"/i);
                    assert.equal(response.headers.get('location'), null);
                }
            }
        }
    } finally {
        if (previousStage === undefined) delete process.env.CAISSA_PLAY_V2_BETA_STAGE;
        else process.env.CAISSA_PLAY_V2_BETA_STAGE = previousStage;
    }
});
