import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('docs/legal-remediation-season-1-1/ip-provenance-manifest.json', root), 'utf8'));

function digest(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(new URL(path, root))).digest('hex');
}

test('every verified artifact remains byte-for-byte bound to the manifest', () => {
  for (const component of manifest.components) {
    for (const file of component.files || []) {
      const bytes = fs.statSync(new URL(file.path, root)).size;
      assert.equal(bytes, file.bytes, `${file.path} byte length`);
      assert.equal(digest(file.path), file.sha256, `${file.path} SHA-256`);
    }
  }
});

test('known unresolved distributions remain blocked instead of inheriting a blanket license', () => {
  const byId = Object.fromEntries(manifest.components.map(item => [item.id, item]));
  assert.equal(byId['js-dos'].status, 'blocked-version-drift');
  assert.equal(byId['gnu-chess-dos'].status, 'placeholder-only');
  assert.equal(byId['pgn-media-collections'].status, 'collection-review-required');
  assert.match(manifest.scope, /does not relicense/i);
});

test('GNU Chess documentation no longer claims placeholder bytes are executable', () => {
  const readme = fs.readFileSync(new URL('public/dos/games/gnuchess/README.md', root), 'utf8');
  assert.match(readme, /does \*\*not\*\* currently distribute a GNU Chess executable/);
  assert.doesNotMatch(readme, /This bundle contains:\s*- `GNUCHESS\.EXE`/);
});
