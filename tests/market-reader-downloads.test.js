import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
    MARKET_READER_DOWNLOAD_TTL_MS,
    MARKET_READER_PRODUCT_ID,
    MARKET_READER_RC1_BLOB_PATHNAME,
    MARKET_READER_RC1_RELEASE_ID,
    MARKET_READER_RC1_SHA256,
    MARKET_READER_RC1_SIZE,
    isMarketReaderStagingEnabled,
    parseMarketReleaseRequest,
    resolveMarketReaderRelease
} from '../api/_lib/market-reader-releases.js';
import {
    createMarketReaderDownloadAuthorizer,
    isTemporaryMarketDownloadValid,
    MarketReaderDownloadError
} from '../api/_lib/market-reader-downloads.js';
import { createMarketReaderDownloadHandler } from '../api/account/downloads.js';
import { createMarketReaderReleaseListingHandler } from '../api/account/products/[productId]/releases.js';

const env = Object.freeze({
    VERCEL_ENV: 'preview',
    VERCEL_TARGET_ENV: 'staging',
    CAISSA_MARKET_STAGING_ENABLED: 'true',
    PRODUCTION_MARKET_DOWNLOADS_ENABLED: 'false',
    CLERK_SECRET_KEY: 'fixture-clerk-server-key',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-supabase-server-key',
    CAISSA_MARKET_STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/',
    BLOB_STORE_ID: 'store_fixture123',
    BLOB_READ_WRITE_TOKEN: 'fixture-server-token',
    MARKET_READER_BLOB_HOST: 'fixture123.private.blob.vercel-storage.com'
});
const now = Date.parse('2026-08-31T18:00:00.000Z');
const delegationToken = `${Buffer.from(JSON.stringify({ storeId: 'fixture123' })).toString('base64url')}.fixture`;

function responseHarness() {
    const headers = new Map();
    return {
        statusCode: 200,
        body: undefined,
        setHeader(name, value) { headers.set(name.toLowerCase(), value); },
        getHeader(name) { return headers.get(name.toLowerCase()); },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; }
    };
}

function authenticated() {
    return Promise.resolve({ authenticated: true, userId: 'user_staging_entitled' });
}

test('certified RC1 release mapping is literal and private pathname stays server-owned', () => {
    const release = resolveMarketReaderRelease({
        productId: MARKET_READER_PRODUCT_ID,
        releaseId: MARKET_READER_RC1_RELEASE_ID
    });
    assert.equal(release.pathname, MARKET_READER_RC1_BLOB_PATHNAME);
    assert.equal(release.size, MARKET_READER_RC1_SIZE);
    assert.equal(release.sha256, MARKET_READER_RC1_SHA256);
    assert.equal(release.authenticode, 'NotSigned');
    assert.equal(parseMarketReleaseRequest({ productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID }).productId, MARKET_READER_PRODUCT_ID);
    assert.equal(parseMarketReleaseRequest({ productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID, pathname: 'attacker.zip' }), null);
    assert.equal(resolveMarketReaderRelease({ productId: MARKET_READER_PRODUCT_ID, releaseId: 'invalid' }), null);
});

test('staging requires the Vercel custom target and exact production-off gate', () => {
    assert.equal(isMarketReaderStagingEnabled(env), true);
    assert.equal(isMarketReaderStagingEnabled({ ...env, VERCEL_TARGET_ENV: 'preview' }), false);
    assert.equal(isMarketReaderStagingEnabled({ ...env, VERCEL_ENV: 'production' }), false);
    assert.equal(isMarketReaderStagingEnabled({ ...env, PRODUCTION_MARKET_DOWNLOADS_ENABLED: 'true' }), false);
    assert.equal(isMarketReaderStagingEnabled({ ...env, CAISSA_MARKET_STAGING_ENABLED: 'false' }), false);
    assert.equal(isMarketReaderStagingEnabled({ ...env, SUPABASE_URL: 'https://production-project.supabase.co/' }), false);
    assert.equal(isMarketReaderStagingEnabled({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }), false);
});

test('entitled account receives one exact GET-only Blob URL capped at ten minutes', async () => {
    let issuance;
    let presigning;
    const authorize = createMarketReaderDownloadAuthorizer({
        env,
        lookupEntitlement: async () => ({ status: 'active' }),
        clock: () => now,
        issueSignedToken: async (options) => {
            issuance = options;
            return { delegationToken, clientSigningToken: 'signing', validUntil: options.validUntil };
        },
        presignUrl: async (signedToken, options) => {
            presigning = { signedToken, options };
            return {
                presignedUrl: `https://${env.MARKET_READER_BLOB_HOST}/${MARKET_READER_RC1_BLOB_PATHNAME}?vercel-blob-delegation=${encodeURIComponent(delegationToken)}&vercel-blob-signature=signature&cache=0`
            };
        }
    });
    const result = await authorize({
        clerkId: 'user_staging_entitled',
        body: { productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID }
    });

    assert.deepEqual(issuance.operations, ['get']);
    assert.equal(issuance.pathname, MARKET_READER_RC1_BLOB_PATHNAME);
    assert.equal(issuance.validUntil, now + MARKET_READER_DOWNLOAD_TTL_MS);
    assert.equal(presigning.options.operation, 'get');
    assert.equal(presigning.options.access, 'private');
    assert.equal(presigning.options.pathname, MARKET_READER_RC1_BLOB_PATHNAME);
    assert.equal(presigning.options.validUntil, issuance.validUntil);
    assert.equal(result.expiresAt, '2026-08-31T18:10:00.000Z');
    assert.equal(result.sha256, MARKET_READER_RC1_SHA256);
    assert.equal('pathname' in result, false);
    assert.equal(isTemporaryMarketDownloadValid({ expiresAt: result.expiresAt, now: issuance.validUntil - 1 }), true);
    assert.equal(isTemporaryMarketDownloadValid({ expiresAt: result.expiresAt, now: issuance.validUntil }), false);
});

test('unexpected signed host or public Blob host fails closed', async () => {
    for (const hostname of ['attacker.example', 'fixture123.public.blob.vercel-storage.com']) {
        const authorize = createMarketReaderDownloadAuthorizer({
            env,
            lookupEntitlement: async () => ({ status: 'active' }),
            clock: () => now,
            issueSignedToken: async (options) => ({ delegationToken, clientSigningToken: 's', validUntil: options.validUntil }),
            presignUrl: async () => ({
                presignedUrl: `https://${hostname}/${MARKET_READER_RC1_BLOB_PATHNAME}?vercel-blob-delegation=${encodeURIComponent(delegationToken)}&vercel-blob-signature=s`
            })
        });
        await assert.rejects(
            authorize({ clerkId: 'user', body: { productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID } }),
            (error) => error instanceof MarketReaderDownloadError && error.status === 503
        );
    }
});

test('no entitlement and invalid release produce 403 without signing or URL', async () => {
    let signingCalls = 0;
    const authorize = createMarketReaderDownloadAuthorizer({
        env,
        lookupEntitlement: async () => null,
        issueSignedToken: async () => { signingCalls += 1; }
    });
    for (const body of [
        { productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID },
        { productId: MARKET_READER_PRODUCT_ID, releaseId: 'missing' },
        { productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID, pathname: 'other.zip' }
    ]) {
        await assert.rejects(authorize({ clerkId: 'user', body }), (error) => error.status === 403);
    }
    assert.equal(signingCalls, 0);
});

test('POST authorization returns generic 403 with no URL when account is not entitled', async () => {
    const handler = createMarketReaderDownloadHandler({
        env,
        authenticateRequest: authenticated,
        lookupEntitlement: async () => null,
        checkRateLimit: () => ({ allowed: true }),
        audit: () => {}
    });
    const res = responseHarness();
    await handler({
        method: 'POST', headers: {},
        body: { productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'Download is not available.' });
    assert.equal(JSON.stringify(res.body).includes('url'), false);
    assert.equal(res.getHeader('Cache-Control'), 'private, no-store, max-age=0');
});

test('authenticated release listing returns only public metadata', async () => {
    const handler = createMarketReaderReleaseListingHandler({
        env,
        authenticateRequest: authenticated,
        lookupEntitlement: async () => ({ status: 'active', productId: MARKET_READER_PRODUCT_ID }),
        audit: () => {}
    });
    const res = responseHarness();
    await handler({ method: 'GET', headers: {}, query: { productId: MARKET_READER_PRODUCT_ID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.releases.length, 1);
    assert.equal(res.body.releases[0].sha256, MARKET_READER_RC1_SHA256);
    assert.equal('pathname' in res.body.releases[0], false);
    assert.deepEqual(res.body.entitlement, {
        productId: MARKET_READER_PRODUCT_ID,
        status: 'active'
    });
    assert.equal('entitlementId' in res.body.entitlement, false);
});

test('live staging RC1 signed GET verifies bytes and SHA when explicitly configured', {
    skip: !(process.env.CAISSA_MARKET_STAGING_BASE_URL && process.env.CAISSA_MARKET_STAGING_CLERK_TOKEN)
}, async () => {
    const base = new URL(process.env.CAISSA_MARKET_STAGING_BASE_URL);
    const authorization = `Bearer ${process.env.CAISSA_MARKET_STAGING_CLERK_TOKEN}`;
    const response = await fetch(new URL('/api/account/downloads', base), {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID })
    });
    assert.equal(response.status, 200);
    const authorized = await response.json();
    const blob = await fetch(authorized.downloadUrl, { method: 'GET' });
    assert.equal(blob.status, 200);
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.equal(bytes.byteLength, MARKET_READER_RC1_SIZE);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), MARKET_READER_RC1_SHA256);
});

test('an explicitly supplied expired staging URL is rejected with 403', {
    skip: !process.env.CAISSA_MARKET_STAGING_EXPIRED_DOWNLOAD_URL
}, async () => {
    const response = await fetch(process.env.CAISSA_MARKET_STAGING_EXPIRED_DOWNLOAD_URL, { method: 'GET' });
    assert.equal(response.status, 403);
});

test('live staging invalid release is denied without a URL when explicitly configured', {
    skip: !(process.env.CAISSA_MARKET_STAGING_BASE_URL && process.env.CAISSA_MARKET_STAGING_CLERK_TOKEN)
}, async () => {
    const response = await fetch(new URL('/api/account/downloads', process.env.CAISSA_MARKET_STAGING_BASE_URL), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.CAISSA_MARKET_STAGING_CLERK_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productId: MARKET_READER_PRODUCT_ID, releaseId: 'invalid' })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.text()).toLowerCase().includes('url'), false);
});

test('live staging account without entitlement is denied without a URL when explicitly configured', {
    skip: !(process.env.CAISSA_MARKET_STAGING_BASE_URL && process.env.CAISSA_MARKET_STAGING_UNENTITLED_CLERK_TOKEN)
}, async () => {
    const response = await fetch(new URL('/api/account/downloads', process.env.CAISSA_MARKET_STAGING_BASE_URL), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.CAISSA_MARKET_STAGING_UNENTITLED_CLERK_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productId: MARKET_READER_PRODUCT_ID, releaseId: MARKET_READER_RC1_RELEASE_ID })
    });
    assert.equal(response.status, 403);
    assert.equal((await response.text()).toLowerCase().includes('url'), false);
});

test('Market pages expose prelaunch/My Downloads and never enable Buy', () => {
    const market = fs.readFileSync('market.html', 'utf8');
    const downloads = fs.readFileSync('account-downloads.html', 'utf8');
    const client = fs.readFileSync('js/caissa-my-downloads.js', 'utf8');
    assert.match(market, /Prelaunch/);
    assert.match(market, /Buy — not enabled/);
    assert.match(market, /button type="button" disabled/);
    assert.match(downloads, /My Downloads/);
    assert.match(client, /productId: PRODUCT_ID, releaseId: release\.releaseId/);
    assert.doesNotMatch(client, /pathname\s*:/);
});
