import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { containsProhibitedFeedback } from '../../api/_lib/play-beta-policy.js';
import { acceptedFeedback, rejectedFeedback } from '../fixtures/play-beta-feedback-corpus.js';

const originalPath = new URL('../../supabase/migrations/20260808_play_v2_invite_only.sql', import.meta.url);
const correctivePath = new URL('../../supabase/migrations/20260809_play_v2_feedback_sensitive_rejection.sql', import.meta.url);
const volatilityPath = new URL('../../supabase/migrations/20260810_play_v2_feedback_helper_stable.sql', import.meta.url);
const corpusPath = new URL('../fixtures/play-beta-feedback-corpus.js', import.meta.url);
const originalHash = 'FB1AF3D0978A91CCF48D8D2F77BF42B7CD7D035F29FC5FEBF80C5760A02260BD';
const correctiveHash = 'DF3222A6F1F3AD6373951D12756037E5248A4C40B691AD6010C0F891C5D4E348';
const corpusHash = '8D505A9F32FA38ED02A6566C12F692AEEF6BB3DDAAA2A1A1C0E63578D93D2A2D';

test('shared JS feedback corpus rejects sensitive shapes without broad natural-language false positives', () => {
    for (const value of rejectedFeedback) assert.equal(containsProhibitedFeedback(value), true, `expected rejection: ${value}`);
    for (const value of acceptedFeedback) assert.equal(containsProhibitedFeedback(value), false, `expected acceptance: ${value}`);
});

test('corrective SQL is forward-only and preserves the applied migration byte-for-byte', async () => {
    const crypto = await import('node:crypto');
    const original = fs.readFileSync(originalPath);
    const corrective = fs.readFileSync(correctivePath, 'utf8');
    assert.equal(crypto.createHash('sha256').update(original).digest('hex').toUpperCase(), originalHash);
    assert.match(corrective, /^-- PlayV2InviteOnlyFeedbackSensitivePolicy@1\.0\.0\./);
    assert.match(corrective, /begin;[\s\S]*commit;/);
    assert.doesNotMatch(corrective, /drop\s+(?:table|function)|migration repair|truncate/i);
});

test('forward-only volatility correction changes only the exact helper disposition to STABLE', async () => {
    const crypto = await import('node:crypto');
    const corrective = fs.readFileSync(correctivePath);
    const corpus = fs.readFileSync(corpusPath);
    const sql = fs.readFileSync(volatilityPath, 'utf8');
    assert.equal(crypto.createHash('sha256').update(corrective).digest('hex').toUpperCase(), correctiveHash);
    assert.equal(crypto.createHash('sha256').update(corpus).digest('hex').toUpperCase(), corpusHash);
    assert.match(sql, /^-- PlayV2InviteOnlyFeedbackSensitivePolicy@1\.0\.1\./);
    assert.match(sql, /begin;[\s\S]*alter function public\._play_beta_feedback_contains_prohibited\(text,text,text\) stable;[\s\S]*commit;/);
    assert.doesNotMatch(sql, /\bimmutable\b|create\s+(?:or\s+replace\s+)?function|drop\s+function|grant\s+|revoke\s+|security\s+(?:definer|invoker)|set\s+search_path/i);
    const versions = fs.readdirSync(new URL('../../supabase/migrations/', import.meta.url)).map(name => name.slice(0, 8));
    assert.deepEqual(versions, ['20260808', '20260809', '20260810']);
});

test('SQL helper and RPC retain bounded defense, atomic rate limit, retention, and private grants', () => {
    const sql = fs.readFileSync(correctivePath, 'utf8');
    for (const marker of ['CONTACT_ADDRESS', 'IPV4', 'IPV6', 'CONTACT_URL', 'LABELED_SECRET', 'BEARER',
        'COOKIE_SESSION', 'DEVICE_FINGERPRINT', 'FEN', 'PGN_HEADER', 'NUMBERED_SAN', 'CSV_FORMULA', 'MARKUP', 'CONTROL'])
        assert.match(sql, new RegExp(marker));
    assert.match(sql, /security invoker[\s\S]*set search_path = pg_catalog/);
    assert.match(sql, /revoke all on function public\._play_beta_feedback_contains_prohibited\(text,text,text\) from public/);
    assert.match(sql, /from anon, authenticated, service_role/);
    assert.match(sql, /security definer set search_path=public/);
    assert.match(sql, /beta_sessions where session_hash=p_session_hash and revoked_at is null for update/);
    assert.match(sql, /select count\(\*\) into v_count[\s\S]*if v_count>=5/);
    assert.match(sql, /p_now\+interval '90 days'/);
    assert.match(sql, /return query select false,'FEEDBACK_REJECTED',null::text/);
    assert.match(sql, /revoke all on function public\.submit_play_beta_feedback[\s\S]*from anon, authenticated/);
    assert.match(sql, /grant execute on function public\.submit_play_beta_feedback[\s\S]*to service_role/);
});

test('SQL corpus ownership remains explicit while PostgreSQL behavior awaits QA revalidation', () => {
    const sql = fs.readFileSync(correctivePath, 'utf8');
    assert.match(sql, /octet_length\(v_comment\) \+ octet_length\(v_steps\) \+ octet_length\(v_device\) > 8192/);
    assert.match(sql, /regexp_replace\(trim\(concat_ws\(E'\\n', v_comment, v_steps, v_device\)\), '\[\[:space:\]\]\+'/);
    assert.match(sql, /p_category not in \('Bug','Confusing','Visual','Suggestion','Other'\)/);
    assert.match(sql, /p_mode not in \('games','bots','coach'\)/);
    assert.match(sql, /p_comment is null or btrim\(p_comment\) = ''/);
    assert.match(sql, /p_consent_version is distinct from 'PlayV2BetaFeedbackConsent@1\.0\.0'/);
});
