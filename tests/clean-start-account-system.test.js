import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    ACCOUNT_SYSTEM_MODES,
    cleanStartTokenCutoff,
    publicAccountSystemState,
    resolveAccountSystemMode
} from '../api/_lib/account-system.js';
import syncHandler from '../api/user/sync.js';

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; },
        setHeader() {}
    };
}

test('account mode is explicit, defaults to compatibility, and invalid values fail closed', () => {
    assert.equal(resolveAccountSystemMode({}), ACCOUNT_SYSTEM_MODES.legacy);
    assert.equal(resolveAccountSystemMode({ CAISSA_ACCOUNT_SYSTEM_MODE: 'maintenance' }), ACCOUNT_SYSTEM_MODES.maintenance);
    assert.equal(resolveAccountSystemMode({ CAISSA_ACCOUNT_SYSTEM_MODE: 'clean_start' }), ACCOUNT_SYSTEM_MODES.cleanStart);
    assert.equal(resolveAccountSystemMode({ CAISSA_ACCOUNT_SYSTEM_MODE: 'clean-start' }), ACCOUNT_SYSTEM_MODES.invalid);
    assert.deepEqual(publicAccountSystemState({ CAISSA_ACCOUNT_SYSTEM_MODE: 'wrong' }), {
        mode: 'maintenance', registrationOpen: false, resetNotice: false
    });
});

test('reset notice can only appear after clean-start is active', () => {
    for (const mode of ['', 'legacy', 'maintenance']) {
        assert.equal(publicAccountSystemState({
            CAISSA_ACCOUNT_SYSTEM_MODE: mode,
            CAISSA_ACCOUNT_RESET_NOTICE: 'enabled'
        }).resetNotice, false);
    }
    assert.equal(publicAccountSystemState({
        CAISSA_ACCOUNT_SYSTEM_MODE: 'clean_start',
        CAISSA_ACCOUNT_RESET_NOTICE: 'enabled'
    }).resetNotice, true);
});

test('cutoff parser accepts exact UTC timestamps or ten-digit epochs only', () => {
    assert.equal(cleanStartTokenCutoff({ CAISSA_ACCOUNT_TOKEN_NOT_BEFORE: '2026-10-17T20:00:00Z' }), 1792267200);
    assert.equal(cleanStartTokenCutoff({ CAISSA_ACCOUNT_TOKEN_NOT_BEFORE: '1792267200' }), 1792267200);
    for (const value of ['', 'now', '2026-10-17', '1792267200000', '2026-10-17T20:00:00-04:00']) {
        assert.equal(cleanStartTokenCutoff({ CAISSA_ACCOUNT_TOKEN_NOT_BEFORE: value }), null);
    }
});

test('clean-start sync bypasses SEC-005 resolution and provisions by verified subject', async () => {
    const calls = [];
    const db = { from(name) {
        assert.equal(name, 'users');
        return { upsert(data, options) {
            calls.push({ data, options });
            return { select() { return { single: async () => ({
                data: { clerk_id: data.clerk_id, email: data.email, role: 'member', is_premium: false, credits: 0 },
                error: null
            }) }; } };
        } };
    } };
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: {
            CAISSA_ACCOUNT_SYSTEM_MODE: 'clean_start',
            CAISSA_IDENTITY_MIGRATION_MODE: 'enforced'
        },
        verifyAuth: async () => ({ authenticated: true, userId: 'new-subject', email: 'new@example.test' }),
        getSupabase: () => db
    });
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.clerk_id, 'new-subject');
});

test('maintenance sync is fail-closed before database access', async () => {
    let accessed = false;
    const res = response();
    await syncHandler({ method: 'POST', headers: {}, body: {} }, res, {
        env: { CAISSA_ACCOUNT_SYSTEM_MODE: 'maintenance' },
        verifyAuth: async () => ({ authenticated: true, userId: 'synthetic' }),
        getSupabase: () => { accessed = true; }
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'ACCOUNT_SYSTEM_MAINTENANCE');
    assert.equal(accessed, false);
});

test('browser surfaces contain no functional SEC-005 recovery path', () => {
    const completion = fs.readFileSync('js/auth-complete.js', 'utf8');
    const signin = fs.readFileSync('js/signin-page.js', 'utf8');
    const html = fs.readFileSync('auth-complete.html', 'utf8');
    for (const source of [completion, signin, html]) {
        assert.doesNotMatch(source, /identity-recovery|IDENTITY_MIGRATION_REQUIRED|IDENTITY_RESOLUTION_REQUIRED|Recover existing account/);
    }
    assert.match(completion, /\/api\/user\/public-identity/);
    assert.match(html, /Choose your chess name/);
    assert.match(html, /Choose later/);
});

test('clean-start user-facing artifacts contain no mojibake', () => {
    for (const path of [
        'auth-complete.html',
        'js/auth-complete.js',
        'js/account-reset-notice.js',
        'docs/runbooks/CAISSA_CLEAN_START_RELEASE.md'
    ]) {
        assert.doesNotMatch(fs.readFileSync(path, 'utf8'), /â|Ã|ðŸ|Â/, path);
    }
});
