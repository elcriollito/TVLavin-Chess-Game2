import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditPublicFiles, isUnapprovedPublicBinaryPath, trackedPublicFiles } from '../scripts/build-public-release.mjs';
import downloadsWorker from '../downloads-worker/worker.js';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const approvedPortableSha256 = '58e12d34644f223c905583318961c3d8dde33644445a78d750709a923ffa4b38';
const approvedPortableSha256Bytes = Uint8Array.from(
  approvedPortableSha256.match(/../g).map(value => Number.parseInt(value, 16))
).buffer;

test('downloads worker does not trust caller-selected premium tiers or advertise missing v1 objects', () => {
  const source = read('downloads-worker/worker.js');
  assert.doesNotMatch(source, /function getTier|x-caissa-tier|searchParams\.get\('tier'\)/);
  assert.match(source, /const cap = 10/);
  assert.match(source, /const sizeCapBytes = 15 \* 1024 \* 1024/);
  assert.match(source, /config\.deprecated \|\| config\.unavailable/);
  assert.match(source, /status:\s*410/);
  assert.match(source, /58e12d34644f223c905583318961c3d8dde33644445a78d750709a923ffa4b38/);
  assert.match(source, /Release integrity metadata mismatch/);
});

test('downloads catalog exposes only the present release and fails closed on integrity drift', async () => {
  const catalogResponse = await downloadsWorker.fetch(new Request('https://downloads.caissa-chess.org/catalog'), {});
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.deepEqual(Object.keys(catalog), ['caissa-book-creator']);
  assert.equal(catalog['caissa-book-creator'].sha256, '58e12d34644f223c905583318961c3d8dde33644445a78d750709a923ffa4b38');

  const unavailable = await downloadsWorker.fetch(new Request('https://downloads.caissa-chess.org/download/polyglot-book-creator'), {});
  assert.equal(unavailable.status, 410);

  const env = {
    VAULT_BUCKET: {
      get: async () => ({
        body: new Uint8Array([1, 2, 3]),
        size: 244203091,
        etag: '1c3e28de1490a11cf13e9f6453e396c7',
        checksums: { sha256: approvedPortableSha256Bytes }
      })
    }
  };
  const present = await downloadsWorker.fetch(new Request('https://downloads.caissa-chess.org/download/caissa-book-creator'), env);
  assert.equal(present.status, 200);
  assert.equal(present.headers.get('x-caissa-sha256'), '58e12d34644f223c905583318961c3d8dde33644445a78d750709a923ffa4b38');
  assert.equal(present.headers.get('digest'), 'sha-256=WOEtNGRPIjyQVYMxiWHD2N3jNkREWnjXUHCakj/6Szg=');

  env.VAULT_BUCKET.get = async () => ({ body: new Uint8Array([1]), size: 1, etag: 'changed' });
  const drifted = await downloadsWorker.fetch(new Request('https://downloads.caissa-chess.org/download/caissa-book-creator'), env);
  assert.equal(drifted.status, 503);

  env.VAULT_BUCKET.get = async () => ({
    body: new Uint8Array([1, 2, 3]),
    size: 244203091,
    etag: '1c3e28de1490a11cf13e9f6453e396c7',
    checksums: {}
  });
  const missingChecksum = await downloadsWorker.fetch(new Request('https://downloads.caissa-chess.org/download/caissa-book-creator'), env);
  assert.equal(missingChecksum.status, 503);
});

test('anonymous OpeningDB ZIP generation is retired before body or R2 access', async () => {
  let bucketReads = 0;
  const request = new Request('https://downloads.caissa-chess.org/openingdb/games/v1/download.zip?tier=premium', {
    method: 'POST',
    body: JSON.stringify({ fenHash: '0123456789abcdef', limit: 200 }),
    headers: { 'Content-Type': 'application/json', 'x-caissa-tier': 'premium' }
  });
  const response = await downloadsWorker.fetch(request, {
    OPENINGDB_BUCKET: { get: async () => { bucketReads += 1; return null; } }
  });
  assert.equal(response.status, 410);
  assert.equal(bucketReads, 0);
});

test('GameSearch metadata is escaped and download URLs are restricted before HTML rendering', () => {
  const source = read('js/opening-database.js');
  assert.match(source, /function safeGamePgnUrl/);
  assert.match(source, /url\.origin === 'https:\/\/downloads\.caissa-chess\.org'/);
  for (const token of ['row.white', 'row.black', 'row.result', 'row.event', 'row.site', 'row.eco', 'row.gameId']) {
    assert.match(source, new RegExp(`escapeHtml\\([^\\n]*${token.replace('.', '\\.')}|${token.replace('.', '\\.')}[^\\n]*escapeHtml`), token);
  }
  assert.doesNotMatch(source, /href="\$\{row\.pgnUrl\}"/);
  assert.match(source, /const remoteUrl = safeGamePgnUrl\(row\.pgnUrl\)/);
});

test('public release audit rejects executable and archive extensions outside legacy denylists', () => {
  for (const value of ['public/tool.exe', 'public/legacy.com', 'assets/native.dll', 'downloads/new.zip', 'js/addon.node', 'model.onnx', 'books/new.bin']) {
    assert.equal(isUnapprovedPublicBinaryPath(value), true, value);
  }
  const files = trackedPublicFiles();
  assert.throws(() => auditPublicFiles([...files, 'public/tool.exe']), /Unapproved executable\/archive artifacts: public\/tool\.exe/);
});

test('public release audit binds approved opaque artifacts to exact SHA-256 digests', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'caissa-release-audit-'));
  const artifact = 'public/dos/games/gnuchess/gnuchess.zip';
  const absoluteArtifact = path.join(temporaryRoot, artifact);
  try {
    fs.mkdirSync(path.dirname(absoluteArtifact), { recursive: true });
    fs.writeFileSync(absoluteArtifact, 'not-the-reviewed-artifact');
    assert.throws(
      () => auditPublicFiles([artifact], {
        cwd: temporaryRoot,
        manifest: {
          schemaVersion: 1,
          files: [{ path: artifact, sha256: '9d9aebe75cb38da6c0bf7b0f0e438eef317182b52eaa38b191dd827de1074d20' }]
        }
      }),
      /Manifest digest mismatch: public\/dos\/games\/gnuchess\/gnuchess\.zip/
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
