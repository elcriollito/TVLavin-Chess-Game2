import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { stableStringify } from '../js/endgame-trainer/v2/curated-pool-validator.js';

const argument = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? null : process.argv[index + 1];
};

export function signManifestDigest({ manifest, privateKeyPem, keyId }) {
    if (!keyId) throw Object.assign(new Error('missing-key-id'), { code: 'missing-key-id' });
    let privateKey;
    try {
        privateKey = createPrivateKey(privateKeyPem);
    } catch {
        throw Object.assign(new Error('invalid-private-key'), { code: 'invalid-private-key' });
    }
    if (privateKey.asymmetricKeyType !== 'ed25519')
        throw Object.assign(new Error('unsupported-private-key'), { code: 'unsupported-private-key' });
    const { manifestDigest: _oldDigest, signature: _oldSignature, ...base } = manifest;
    const signable = {
        ...base,
        signatureStatus: 'signed',
        signatureAlgorithm: 'Ed25519',
        keyId
    };
    const manifestDigest = `sha256-${createHash('sha256').update(stableStringify(signable)).digest('hex')}`;
    const signature = sign(null, Buffer.from(manifestDigest, 'utf8'), privateKey).toString('base64');
    const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
    return {
        manifest: {
            ...signable,
            manifestDigest,
            signature
        },
        publicKey
    };
}

if (process.argv[1]?.endsWith('sign-endgame-manifest.mjs')) {
    const input = argument('--manifest');
    const privateKeyPath = argument('--private-key');
    const output = argument('--output');
    const keyId = argument('--key-id');
    if (!input || !privateKeyPath || !output || !keyId)
        throw new Error('usage: --manifest <path> --private-key <external-path> --key-id <id> --output <path>');
    const manifest = JSON.parse(await readFile(input, 'utf8'));
    const privateKeyPem = await readFile(privateKeyPath, 'utf8');
    const signed = signManifestDigest({ manifest, privateKeyPem, keyId });
    await writeFile(output, `${JSON.stringify(signed.manifest)}\n`, 'utf8');
    console.log(`Signed manifest with external key ${keyId}; public key must be reviewed before registry publication.`);
}
