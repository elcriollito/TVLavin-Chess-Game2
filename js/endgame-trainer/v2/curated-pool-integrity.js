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

const decodeBase64 = (value) => {
    if (typeof atob === 'function') return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return Uint8Array.from(Buffer.from(value, 'base64'));
};

export async function verifySignedManifest(
    manifest,
    trustedKeys,
    cryptoImpl = globalThis.crypto,
    now = new Date()
) {
    if (manifest?.signatureStatus !== 'signed' || manifest?.signatureAlgorithm !== 'Ed25519')
        throw Object.assign(new Error('unsigned-manifest'), { code: 'unsigned-manifest' });
    const key = trustedKeys?.find((entry) => entry.keyId === manifest.keyId);
    if (!key) throw Object.assign(new Error('unknown-signing-key'), { code: 'unknown-signing-key' });
    if (key.status === 'revoked' || key.status === 'test-only')
        throw Object.assign(new Error('untrusted-signing-key'), { code: 'untrusted-signing-key' });
    if (key.algorithm !== 'Ed25519')
        throw Object.assign(new Error('unsupported-signature-algorithm'), { code: 'unsupported-signature-algorithm' });
    if (manifest.manifestDigest !== await sha256Digest(unsignedManifestContent(manifest), cryptoImpl))
        throw Object.assign(new Error('signed-manifest-digest-mismatch'), { code: 'signed-manifest-digest-mismatch' });
    if ((key.validFrom && now < new Date(key.validFrom)) || (key.validUntil && now > new Date(key.validUntil)))
        throw Object.assign(new Error('signing-key-outside-validity'), { code: 'signing-key-outside-validity' });
    const publicKey = await cryptoImpl.subtle.importKey(
        'spki', decodeBase64(key.publicKey), { name: 'Ed25519' }, false, ['verify']
    );
    const valid = await cryptoImpl.subtle.verify(
        'Ed25519',
        publicKey,
        decodeBase64(manifest.signature),
        new TextEncoder().encode(manifest.manifestDigest)
    );
    if (!valid) throw Object.assign(new Error('invalid-manifest-signature'), { code: 'invalid-manifest-signature' });
    return true;
}

export async function verifyPoolDigest(artifact, expectedDigest, cryptoImpl = globalThis.crypto) {
    return expectedDigest === await sha256Digest(artifact, cryptoImpl);
}
