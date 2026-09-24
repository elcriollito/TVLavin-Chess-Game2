import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelayArtifact, RELAY_FILES } from '../experiments/lc0-production-relay/build-artifact.mjs';

async function files(root, prefix = '') {
  const found = [];
  for (const item of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = join(prefix, item.name);
    if (item.isDirectory()) found.push(...await files(root, name));
    else found.push(name.replaceAll('\\', '/'));
  }
  return found.sort();
}

test('EAE-015A relay artifact contains only the explicit function allowlist', async () => {
  const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const output = await mkdtemp(join(repositoryRoot, '.caissa-eae015a-relay-test-'));
  try {
    const result = await buildRelayArtifact({ output });
    const actual = await files(output);
    assert.deepEqual(actual, [...result.manifest.files, 'artifact-inventory.json'].sort());
    assert.equal(RELAY_FILES.length, 10);
    const config = JSON.parse(await readFile(join(output, 'vercel.json'), 'utf8'));
    assert.deepEqual(Object.keys(config.functions).sort(),
      ['api/cron/eae015a-lc0-cleanup.js', 'api/eae011.js']);
    assert.equal(actual.some(path => path.startsWith('api/mentor/')), false);
    assert.equal(actual.some(path => path === 'api/eae013.js'), false);
    assert.equal(actual.some(path => path.endsWith('.html')), false);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
