import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const integrationMigration = new URL(
    '../../supabase/migrations/20261023203000_caissa_online_guest_rate_limit_principals.sql',
    import.meta.url
);
const onlineApi = new URL('../../api/online.js', import.meta.url);
const sourceBoundary = new URL('../../api/_lib/online-request-source.js', import.meta.url);

test('Account Control permits only the fixed Guest outer rate-limit principals', async () => {
    const [sql, api, source] = await Promise.all([
        readFile(integrationMigration, 'utf8'),
        readFile(onlineApi, 'utf8'),
        readFile(sourceBoundary, 'utf8')
    ]);

    assert.match(sql, /to_regprocedure\('public\.caissa_account_rate_limit_write_barrier\(\)'\)/i);
    assert.match(sql, /CAISSA_ONLINE_RATE_LIMIT_PRINCIPALS_REQUIRE_ACCOUNT_CONTROL/);
    assert.match(sql, /v_subject\s*=\s*'online-global'/i);
    assert.match(sql, /\^online-source:\[0-9a-f\]\{64\}\$/i);
    assert.match(sql, /raise exception 'CAISSA_ACCOUNT_IDENTITY_REQUIRED'/i);
    assert.match(sql, /revoke all on function public\.caissa_account_rate_limit_write_barrier\(\)[\s\S]+from public, anon, authenticated/i);

    assert.match(api, /clerkId:\s*'online-global',\s*bucket:\s*'guest-outer'/);
    assert.match(api, /clerkId:\s*sourceKey,\s*bucket:\s*'guest-outer'/);
    assert.match(source, /return `online-source:\$\{digest\}`/);
});
