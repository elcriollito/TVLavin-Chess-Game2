import { issueSignedToken, parseStoreIdFromDelegationToken, presignUrl } from '@vercel/blob';
import {
    MARKET_READER_DOWNLOAD_TTL_MS,
    isMarketReaderStagingEnabled,
    parseMarketReleaseRequest,
    resolveMarketReaderRelease,
    toPublicRelease
} from './market-reader-releases.js';

export class MarketReaderDownloadError extends Error {
    constructor(code, status) {
        super(code);
        this.name = 'MarketReaderDownloadError';
        this.code = code;
        this.status = status;
    }
}

function fail(code, status) {
    throw new MarketReaderDownloadError(code, status);
}

function requireFunction(value, code) {
    if (typeof value !== 'function') throw new TypeError(code);
    return value;
}

function validStoreId(storeId) {
    const value = String(storeId || '');
    return /^(?:store_)?[A-Za-z0-9]+$/.test(value);
}

function normalizedConfiguredStoreId(storeId) {
    if (!validStoreId(storeId)) return null;
    const value = String(storeId);
    return value.startsWith('store_') ? value.slice('store_'.length) : value;
}

function normalizePrivateBlobHost(value) {
    const host = String(value || '').trim().toLowerCase();
    return /^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(host) ? host : null;
}

function validatePresignedGetUrl(value, release, expectedHost) {
    let url;
    try { url = new URL(value); } catch { fail('DOWNLOAD_SIGNING_FAILED', 503); }
    const expectedPathname = `/${release.pathname.split('/').map(encodeURIComponent).join('/')}`;
    if (!expectedHost
        || url.protocol !== 'https:'
        || url.hostname !== expectedHost
        || url.username
        || url.password
        || url.pathname !== expectedPathname
        || !url.searchParams.has('vercel-blob-delegation')
        || !url.searchParams.has('vercel-blob-signature')) {
        fail('DOWNLOAD_SIGNING_FAILED', 503);
    }
    return url.toString();
}

export function isTemporaryMarketDownloadValid({ expiresAt, now = Date.now() }) {
    const expiry = Date.parse(String(expiresAt || ''));
    return Number.isSafeInteger(now) && Number.isFinite(expiry) && now < expiry;
}

export function createMarketReaderDownloadAuthorizer(dependencies = {}) {
    const env = dependencies.env || process.env;
    const lookupEntitlement = requireFunction(dependencies.lookupEntitlement, 'ENTITLEMENT_LOOKUP_REQUIRED');
    const resolveRelease = dependencies.resolveRelease || resolveMarketReaderRelease;
    const issueToken = dependencies.issueSignedToken || issueSignedToken;
    const createPresignedUrl = dependencies.presignUrl || presignUrl;
    const parseDelegationStoreId = dependencies.parseStoreIdFromDelegationToken || parseStoreIdFromDelegationToken;
    const clock = dependencies.clock || (() => Date.now());
    const ttlMs = dependencies.ttlMs ?? MARKET_READER_DOWNLOAD_TTL_MS;

    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > MARKET_READER_DOWNLOAD_TTL_MS) {
        throw new TypeError('DOWNLOAD_TTL_INVALID');
    }

    return async function authorize({ clerkId, body }) {
        if (!isMarketReaderStagingEnabled(env)) fail('DOWNLOAD_ENVIRONMENT_DISABLED', 403);
        const request = parseMarketReleaseRequest(body);
        if (!request) fail('DOWNLOAD_NOT_AVAILABLE', 403);
        const release = resolveRelease(request);
        if (!release) fail('DOWNLOAD_NOT_AVAILABLE', 403);

        let entitlement;
        try {
            entitlement = await lookupEntitlement({ clerkId, productId: release.productId });
        } catch {
            fail('DOWNLOAD_NOT_ENTITLED', 403);
        }
        if (entitlement?.status !== 'active') fail('DOWNLOAD_NOT_ENTITLED', 403);

        const storeId = String(env.BLOB_STORE_ID || '');
        const token = String(env.BLOB_READ_WRITE_TOKEN || '');
        const expectedHost = normalizePrivateBlobHost(env.MARKET_READER_BLOB_HOST);
        if (!validStoreId(storeId) || !token || !expectedHost) fail('DOWNLOAD_CONFIGURATION_UNAVAILABLE', 503);
        const issuedAt = clock();
        if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) fail('DOWNLOAD_SIGNING_FAILED', 503);
        const validUntil = issuedAt + ttlMs;

        try {
            const signedToken = await issueToken({
                token,
                storeId,
                pathname: release.pathname,
                operations: ['get'],
                validUntil
            });
            if (!signedToken
                || typeof signedToken.delegationToken !== 'string'
                || typeof signedToken.clientSigningToken !== 'string'
                || signedToken.validUntil !== validUntil) {
                fail('DOWNLOAD_SIGNING_FAILED', 503);
            }
            if (parseDelegationStoreId(signedToken.delegationToken) !== normalizedConfiguredStoreId(storeId)) {
                fail('DOWNLOAD_SIGNING_FAILED', 503);
            }
            const signed = await createPresignedUrl(signedToken, {
                access: 'private',
                operation: 'get',
                pathname: release.pathname,
                validUntil,
                useCache: false
            });
            const downloadUrl = validatePresignedGetUrl(signed?.presignedUrl, release, expectedHost);
            return Object.freeze({
                ...toPublicRelease(release),
                downloadUrl,
                expiresAt: new Date(validUntil).toISOString()
            });
        } catch (error) {
            if (error instanceof MarketReaderDownloadError) throw error;
            fail('DOWNLOAD_SIGNING_FAILED', 503);
        }
    };
}
