import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const compliance = new URL('experiments/lc0-production-compliance/', root);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('EAE-015A compliance bundle pins corresponding source and stays pending legal review', async () => {
  const source = JSON.parse(await readFile(new URL('corresponding-source.json', compliance)));
  assert.equal(source.lc0.commit, '482bb4a830287b726ebe7d42f14ab7f5f17c18a0');
  assert.equal(source.maiaNetwork.commit, '37de81e2bef89336e03266b3b5f7e1155ba68f5d');
  assert.equal(source.maiaNetwork.sha256,
    'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4');
  assert.equal(source.runtimeManifestSha256,
    '492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f');
  assert.equal(source.correspondingSourceLocation, null);
  assert.equal(source.legalStatus, 'LEGAL_SIGNOFF_REQUIRED');
  for (const patch of source.patches) {
    const bytes = await readFile(new URL(patch.path, root));
    assert.equal(sha256(bytes), patch.sha256, patch.path);
  }
});

test('EAE-015A compliance bundle carries upstream license texts and notices', async () => {
  for (const path of [
    'LICENSES/lc0-GPL-3.0-or-later.txt',
    'LICENSES/maia-GPL-3.0.txt',
    'LICENSES/onnxruntime-MIT.txt',
    'LICENSES/emscripten.txt',
    'THIRD_PARTY_NOTICES.md',
    'BUILD.md'
  ]) {
    const text = await readFile(new URL(path, compliance), 'utf8');
    assert.ok(text.length > 100, `${path}: incomplete`);
  }
});
