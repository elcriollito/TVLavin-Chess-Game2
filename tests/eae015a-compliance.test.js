import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const compliance = new URL('experiments/lc0-production-compliance/', root);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('EAE-015B manifest pins the approved corresponding source release', async () => {
  const source = JSON.parse(await readFile(new URL('corresponding-source.json', compliance)));
  assert.equal(source.releaseId, 'lc0-browser-source-v0.1.1');
  assert.equal(source.lc0Version, 'v0.33.0-dev+git.482bb4a');
  assert.equal(source.lc0Commit, '482bb4a830287b726ebe7d42f14ab7f5f17c18a0');
  assert.equal(source.source.commit, source.lc0Commit);
  assert.equal(source.network.sourceCommit, '37de81e2bef89336e03266b3b5f7e1155ba68f5d');
  assert.equal(source.network.sha256,
    'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4');
  assert.equal(source.network.bytes, 1313193);
  assert.equal(source.buildManifestSha256,
    '492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f');
  assert.match(source.publicSourceUrl, /releases\/download\/lc0-browser-source-v0\.1\.1\//);
  assert.equal(source.sourceArchiveSha256,
    '7d0a514f6f212a2d151bb340708d485670fba0ee338145e63f5cc8db46f731ec');
  assert.equal(source.sourceArchiveBytes, 1430117);
  assert.equal(source.releaseImmutable, true);
  assert.deepEqual(source.publicVerification, {
    httpStatus: 200,
    authenticationRequired: false,
    contentLength: 1430117,
    downloadedSha256: source.sourceArchiveSha256,
    archiveExtracted: true
  });
  assert.equal(source.runtimeArtifactCount, 8);
  assert.equal(source.runtimeArtifactBytes, 24785017);
  assert.equal(source.complianceStatus, 'LEGAL_SIGNOFF_REQUIRED');
  const legal = await readFile(new URL('docs/compliance/LC0_PRODUCTION_LEGAL_SIGNOFF.md', root), 'utf8');
  assert.match(legal, /Status: `LEGAL_SIGNOFF_COMPLETE`/);
  assert.match(legal, /\[x\] APPROVED/);
  assert.match(legal, /Review date: 2026-09-22/);
  for (const patch of source.patches) {
    const bytes = await readFile(new URL(`experiments/lc0-browser-lab/patches/${patch.filename}`, root));
    assert.equal(sha256(bytes), patch.sha256, patch.filename);
    assert.equal(patch.upstreamBaseCommit, source.lc0Commit);
  }
});

test('EAE-015A compliance bundle carries upstream license texts and notices', async () => {
  for (const path of [
    'LICENSES/lc0-GPL-3.0-or-later.txt',
    'LICENSES/maia-GPL-3.0.txt',
    'LICENSES/onnxruntime-MIT.txt',
    'LICENSES/emscripten.txt',
    'LICENSES/chess.js-BSD-2-Clause.txt',
    'THIRD_PARTY_NOTICES.md',
    'BUILD.md',
    'network/maia-1100.json',
    'scripts/build-source-archive.ps1',
    'scripts/stage-production-inputs.ps1'
  ]) {
    const text = await readFile(new URL(path, compliance), 'utf8');
    assert.ok(text.length > 100, `${path}: incomplete`);
  }
});
