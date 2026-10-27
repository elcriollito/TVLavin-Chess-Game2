import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import handler from '../../api/public-auth-config.js';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('Play v2 reuses the canonical auth core and account identity renderer', () => {
    const play = read('play-v2.html');
    const source = read('index.html');
    const classic = read('yahoo-classic.html');
    assert.match(play, /js\/auth-config\.js/);
    assert.match(play, /js\/caissa-auth\.js/);
    assert.match(play, /css\/caissa-auth\.css/);
    assert.match(play, /js\/caissa-access\.js/);
    assert.match(play, /js\/caissa-ui-auth\.js/);
    for (const document of [source, classic]) {
        assert.match(document, /js\/auth-config\.js/);
        assert.match(document, /js\/caissa-auth\.js/);
        assert.match(document, /js\/caissa-access\.js/);
        assert.match(document, /js\/caissa-ui-auth\.js/);
    }
});

test('builder preserves the canonical auth core and account identity UI', () => {
    const builder = read('scripts/build-play-v2.mjs');
    assert.doesNotMatch(builder, /PROHIBITED_PLAY_V2_AUTH_RESOURCE/);
    assert.doesNotMatch(builder, /PROHIBITED_PLAY_V2_AUTH_BOOTSTRAP/);
    assert.doesNotMatch(builder, /caissa-access\|caissa-ui-auth/);
});

test('passive native Play initialization does not materialize default preferences', () => {
    const app = read('app.js');
    assert.match(app, /window\.localStorage && !nativePlayV2[\s\S]*?localStorage\.setItem\('caissa\.engineId'/);
    assert.match(app, /supportsChess960[\s\S]*?window\.localStorage && !nativePlayV2[\s\S]*?localStorage\.setItem\('caissa\.chess960'/);
});

test('public auth endpoint exposes only its allowlisted public fields', () => {
    const prior = {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        CAISSA_IDENTITY_MIGRATION_MODE: process.env.CAISSA_IDENTITY_MIGRATION_MODE,
        CAISSA_APP_ORIGIN: process.env.CAISSA_APP_ORIGIN,
        CAISSA_SEC005_LEGACY_HANDOFF_ORIGIN: process.env.CAISSA_SEC005_LEGACY_HANDOFF_ORIGIN,
        CAISSA_REGISTRATION_RELEASE: process.env.CAISSA_REGISTRATION_RELEASE,
        CAISSA_CLERK_RESTRICTED_INVITATIONS: process.env.CAISSA_CLERK_RESTRICTED_INVITATIONS,
        CAISSA_REGISTRATION_GATE_SECRET: process.env.CAISSA_REGISTRATION_GATE_SECRET
    };
    Object.assign(process.env, {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_public_identifier',
        CLERK_SECRET_KEY: 'secret-must-not-escape',
        SUPABASE_URL: 'https://private-service.invalid',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-must-not-escape',
        CAISSA_IDENTITY_MIGRATION_MODE: 'enforced',
        CAISSA_APP_ORIGIN: 'https://www.caissa-chess.org',
        CAISSA_SEC005_LEGACY_HANDOFF_ORIGIN: 'https://validation.example.test'
    });
    let status = null;
    let payload = null;
    const response = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
    try {
        handler({ method: 'GET' }, response);
        assert.equal(status, 200);
        assert.deepEqual(Object.keys(payload).sort(), ['clerkPublishableKey', 'identityOwnerHandoff', 'registrationCandidate', 'registrationTracking']);
        assert.equal(payload.clerkPublishableKey, 'pk_live_public_identifier');
        assert.equal(payload.registrationTracking, true);
        assert.deepEqual(payload.identityOwnerHandoff, {
            productionOrigin: 'https://www.caissa-chess.org',
            legacyOrigin: 'https://validation.example.test'
        });
        assert.deepEqual(payload.registrationCandidate, {
            enabled: false,
            policyVersion: 'caissa-account-16-plus-v1',
            input: 'birth_month_year',
            providerMode: 'restricted_invitations'
        });
        assert.doesNotMatch(JSON.stringify(payload), /secret-must-not-escape|service-role-must-not-escape|private-service/);
    } finally {
        for (const [key, value] of Object.entries(prior)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('public auth endpoint rejects non-GET methods without configuration payload', () => {
    let status = null;
    let payload = null;
    const response = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
    handler({ method: 'POST' }, response);
    assert.equal(status, 405);
    assert.deepEqual(payload, { error: 'Method not allowed' });
});
