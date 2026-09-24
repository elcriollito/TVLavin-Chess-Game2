import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(lab, '../lc0-preview-relay/engine/dist');
const index = await readFile(path.join(dist, 'index.html'), 'utf8');
const manifestPath = index.match(/name="lc0-manifest-url" content="([^"]+)"/)?.[1];
const manifestSha = index.match(/name="lc0-manifest-sha256" content="([0-9a-f]{64})"/)?.[1];
const clientSri = index.match(/src="[^"]+\/client\.js" integrity="sha256-([A-Za-z0-9+/=]+)"/)?.[1];
assert.ok(manifestPath && manifestSha && clientSri, 'INDEX_INTEGRITY_METADATA_MISSING');

const manifestFile = path.join(dist, manifestPath.replace(/^\//, '').replaceAll('/', path.sep));
const manifestBytes = await readFile(manifestFile);
assert.equal(sha256(manifestBytes), manifestSha, 'MANIFEST_HASH_MISMATCH');
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schemaVersion, 2);
assert.equal(Object.keys(manifest.artifacts).length, 8, 'INCOMPLETE_RUNTIME_MANIFEST');

let totalBytes = 0;
let tamperDetected = false;
for (const [name, artifact] of Object.entries(manifest.artifacts)) {
  assert.equal(artifact.verifyBeforeReady, true, `${name}:VERIFY_BEFORE_READY_REQUIRED`);
  assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
  assert.ok(artifact.license && artifact.sourceUrl, `${name}:PROVENANCE_MISSING`);
  const file = path.resolve(path.dirname(manifestFile), artifact.path);
  const bytes = await readFile(file);
  assert.equal((await stat(file)).size, artifact.bytes, `${name}:BYTE_COUNT_MISMATCH`);
  assert.equal(sha256(bytes), artifact.sha256, `${name}:SHA256_MISMATCH`);
  totalBytes += bytes.length;
  if (!tamperDetected && bytes.length) {
    const tampered = Buffer.from(bytes);
    tampered[Math.floor(tampered.length / 2)] ^= 1;
    tamperDetected = sha256(tampered) !== artifact.sha256;
  }
}
assert.equal(tamperDetected, true, 'TAMPER_SELF_TEST_FAILED');

const client = await readFile(path.join(path.dirname(manifestFile), 'client.js'));
assert.equal(createHash('sha256').update(client).digest('base64'), clientSri,
  'CLIENT_SRI_MISMATCH');
for (const forbidden of ['clerk', 'stripe', 'checkout', 'caissa-primary-navigation'])
  assert.equal(index.toLowerCase().includes(forbidden), false, `APPLIANCE_SURFACE_FORBIDDEN:${forbidden}`);

const config = JSON.parse(await readFile(path.join(dist, 'vercel.json'), 'utf8'));
const deploymentIgnore = await readFile(path.join(dist, '.vercelignore'), 'utf8');
assert.equal(deploymentIgnore, '.vercel\n.env*\n');
const headers = Object.fromEntries(config.headers[0].headers.map(item => [item.key, item.value]));
assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
assert.equal(headers['Cross-Origin-Embedder-Policy'], 'require-corp');
assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-origin');
assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
assert.match(headers['X-Robots-Tag'], /noindex/);

console.log(JSON.stringify({ verified: true, releaseId: manifest.releaseId,
  manifestSha256: manifestSha, artifacts: Object.keys(manifest.artifacts).length,
  totalBytes, tamperSelfTest: 'DETECTED' }));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
