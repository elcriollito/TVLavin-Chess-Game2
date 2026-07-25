import { CURATED_POOL_REGISTRY } from './curated-pool-registry.js';
import {
    computeCompatibilityFingerprint, deepFreezePool, validatePublishedPoolArtifact
} from './curated-pool-validator.js';
import {
    verifyManifest, verifyPoolDigest, verifySignedManifest
} from './curated-pool-integrity.js';
import { CURATED_POOL_TRUSTED_KEYS } from './curated-pool-trusted-keys.js';

const cache = new Map();
export const DEFAULT_CURATED_POOL = Object.freeze({
    poolId: 'caissa-king-pawn-decisions',
    poolVersion: '1.0.0'
});

export function getCuratedPoolDescriptor(poolId, poolVersion) {
    return CURATED_POOL_REGISTRY.find((entry) =>
        entry.poolId === poolId && entry.poolVersion === poolVersion) || null;
}

export async function loadCuratedPool({
    poolId,
    poolVersion,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    cryptoImpl = globalThis.crypto
} = {}) {
    const descriptor = getCuratedPoolDescriptor(poolId, poolVersion);
    if (!descriptor) throw Object.assign(new Error('pool-unavailable'), { code: 'pool-unavailable' });
    if (typeof fetchImpl !== 'function') throw Object.assign(new Error('pool-unavailable'), { code: 'pool-unavailable' });
    const cacheKey = `${poolId}@${poolVersion}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const loading = (async () => {
        const manifestResponse = await fetchImpl(descriptor.manifestUrl, { cache: 'force-cache' });
        if (!manifestResponse?.ok) throw Object.assign(new Error('manifest-unavailable'), { code: 'manifest-unavailable' });
        const manifest = await manifestResponse.json();
        let manifestValid = false;
        try {
            manifestValid = manifest.signatureStatus === 'signed'
                ? await verifySignedManifest(manifest, CURATED_POOL_TRUSTED_KEYS, cryptoImpl)
                : await verifyManifest(manifest, cryptoImpl);
        } catch (error) {
            if (error.code !== 'crypto-unavailable') throw error;
            if (manifest.signatureStatus === 'signed')
                throw Object.assign(new Error('signature-verification-unavailable'), {
                    code: 'signature-verification-unavailable'
                });
            manifestValid = manifest?.manifestDigest === descriptor.manifestDigest;
        }
        const membership = manifest.pools?.find((entry) =>
            entry.poolId === poolId && entry.poolVersion === poolVersion);
        if (!manifestValid || !membership ||
            membership.runtimePath !== descriptor.url ||
            membership.contentFingerprint !== descriptor.contentFingerprint ||
            membership.contentDigest !== descriptor.contentDigest) {
            throw Object.assign(new Error('manifest-mismatch'), { code: 'manifest-mismatch' });
        }
        const response = await fetchImpl(descriptor.url, { cache: 'force-cache' });
        if (!response?.ok) throw Object.assign(new Error('pool-unavailable'), { code: 'pool-unavailable' });
        const artifact = await response.json();
        const validation = validatePublishedPoolArtifact(artifact, descriptor);
        if (!validation.valid) {
            throw Object.assign(new Error('release-mismatch'), {
                code: 'release-mismatch', diagnostics: validation.errors
            });
        }
        try {
            if (!await verifyPoolDigest(artifact, descriptor.contentDigest, cryptoImpl))
                throw Object.assign(new Error('digest-mismatch'), { code: 'digest-mismatch' });
        } catch (error) {
            if (error.code !== 'crypto-unavailable') throw error;
        }
        return deepFreezePool(artifact);
    })();
    cache.set(cacheKey, loading);
    try {
        return await loading;
    } catch (error) {
        cache.delete(cacheKey);
        throw error;
    }
}

export function selectCuratedPositions(pool, { count = 5, seed = 'quick-challenge' } = {}) {
    if (!pool || !Number.isInteger(count) || count < 1 || count > pool.positions.length)
        throw new TypeError('invalid-position-selection');
    const positions = [...pool.positions];
    let state = Number.parseInt(computeCompatibilityFingerprint({
        pool: pool.contentFingerprint, seed
    }).slice(-8), 16) >>> 0;
    for (let index = positions.length - 1; index > 0; index -= 1) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const target = state % (index + 1);
        [positions[index], positions[target]] = [positions[target], positions[index]];
    }
    return Object.freeze(positions.slice(0, count));
}

export function clearCuratedPoolCacheForTests() {
    cache.clear();
}
