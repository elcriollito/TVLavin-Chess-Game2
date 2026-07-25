import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    sha256Digest, verifyManifest, verifyPoolDigest, verifySignedManifest
} from '../../js/endgame-trainer/v2/curated-pool-integrity.js';
import { generateKeyPairSync } from 'node:crypto';
import { signManifestDigest } from '../../scripts/sign-endgame-manifest.mjs';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const pool = await json('../../public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json');
const manifest = await json('../../public/data/endgame-pools/manifest-1.0.0.json');

test('manifest and pool SHA-256 values reproduce exactly', async () => {
    assert.equal(await verifyManifest(manifest), true);
    assert.equal(await verifyPoolDigest(pool, manifest.pools[0].contentDigest), true);
    assert.match(await sha256Digest(pool), /^sha256-[a-f0-9]{64}$/);
});

test('external Ed25519 signing verifies allowlisted keys and rejects invalid trust', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const signed = signManifestDigest({
        manifest,
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        keyId: 'test-key-1'
    });
    const keys = [{
        keyId: 'test-key-1',
        algorithm: 'Ed25519',
        publicKey: signed.publicKey,
        status: 'active'
    }];
    assert.equal(await verifySignedManifest(signed.manifest, keys), true);
    await assert.rejects(verifySignedManifest(signed.manifest, []), { code: 'unknown-signing-key' });
    await assert.rejects(verifySignedManifest(signed.manifest, [{ ...keys[0], status: 'revoked' }]),
        { code: 'untrusted-signing-key' });
    const changed = { ...signed.manifest, signature: `${signed.manifest.signature.slice(0, -2)}AA` };
    await assert.rejects(verifySignedManifest(changed, keys), { code: 'invalid-manifest-signature' });
});

test('production manifest remains honestly unsigned', async () => {
    await assert.rejects(verifySignedManifest(manifest, []), { code: 'unsigned-manifest' });
});

test('cryptographic checks detect pool and manifest mutation', async () => {
    const changedPool = structuredClone(pool);
    changedPool.label += ' changed';
    assert.equal(await verifyPoolDigest(changedPool, manifest.pools[0].contentDigest), false);
    const changedManifest = structuredClone(manifest);
    changedManifest.pools[0].positionCount += 1;
    assert.equal(await verifyManifest(changedManifest), false);
});
