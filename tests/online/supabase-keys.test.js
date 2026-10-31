import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getSupabasePublishableKey,
    getSupabaseServerKey,
    getSupabaseUrl
} from '../../api/_lib/supabase.js';

function legacyKey(role) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
    return `${header}.${payload}.test-signature`;
}

test('modern secret and publishable keys are selected for their exact trust boundary', () => {
    assert.equal(getSupabaseServerKey({ SUPABASE_SECRET_KEY: 'sb_secret_backend' }), 'sb_secret_backend');
    assert.equal(
        getSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser' }),
        'sb_publishable_browser'
    );
    assert.equal(getSupabaseUrl({ SUPABASE_URL: 'https://example.supabase.co///' }), 'https://example.supabase.co');
});

test('legacy keys remain compatible only when their embedded role matches the slot', () => {
    const serviceRole = legacyKey('service_role');
    const anon = legacyKey('anon');
    assert.equal(getSupabaseServerKey({ SUPABASE_SERVICE_ROLE_KEY: serviceRole }), serviceRole);
    assert.equal(getSupabasePublishableKey({ SUPABASE_ANON_KEY: anon }), anon);
    assert.throws(
        () => getSupabaseServerKey({ SUPABASE_SERVICE_ROLE_KEY: anon }),
        /SUPABASE_SERVICE_ROLE_KEY_INVALID_CLASS/
    );
});

test('wrong modern key classes fail closed without falling back or becoming public', () => {
    assert.throws(
        () => getSupabaseServerKey({ SUPABASE_SECRET_KEY: 'sb_publishable_wrong' }),
        /SUPABASE_SECRET_KEY_INVALID_CLASS/
    );
    assert.equal(getSupabasePublishableKey({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_wrong' }), '');
});
