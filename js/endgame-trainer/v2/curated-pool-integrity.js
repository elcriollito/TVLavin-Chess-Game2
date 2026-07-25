import { stableStringify } from './curated-pool-validator.js';

export const POOL_MANIFEST_SCHEMA_VERSION = '1.0.0';
export const POOL_MANIFEST_URL = '/data/endgame-pools/manifest-1.0.0.json';

const bytes = (value) => new TextEncoder().encode(stableStringify(value));
const hex = (buffer) => [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, '0')).join('');

export async function sha256Digest(value, cryptoImpl = globalThis.crypto) {
    if (!cryptoImpl?.subtle?.digest) {
        throw Object.assign(new Error('crypto-unavailable'), { code: 'crypto-unavailable' });
    }
    return `sha256-${hex(await cryptoImpl.subtle.digest('SHA-256', bytes(value)))}`;
}

export function unsignedManifestContent(manifest) {
    const { manifestDigest: _digest, signature: _signature, ...content } = manifest;
    return content;
}

export async function verifyManifest(manifest, cryptoImpl = globalThis.crypto) {
    if (manifest?.manifestSchemaVersion !== POOL_MANIFEST_SCHEMA_VERSION ||
        manifest?.publishedStatus !== 'published' ||
        manifest?.signatureStatus !== 'unsigned' ||
        manifest?.signature !== undefined) return false;
    return manifest.manifestDigest ===
        await sha256Digest(unsignedManifestContent(manifest), cryptoImpl);
}

export async function verifyPoolDigest(artifact, expectedDigest, cryptoImpl = globalThis.crypto) {
    return expectedDigest === await sha256Digest(artifact, cryptoImpl);
}
