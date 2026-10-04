import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/opening-database.js', import.meta.url), 'utf8');

test('localhost resolves the live canonical Opening Database manifest', () => {
  assert.match(
    source,
    /REMOTE_MANIFEST_URL\s*=\s*'https:\/\/downloads\.caissa-chess\.org\/openingdb\/manifest\.json'/
  );
  assert.match(
    source,
    /MANIFEST_OVERRIDE_URL\s*\|\|\s*\(DEV_MODE\s*\?\s*REMOTE_MANIFEST_URL\s*:\s*MANIFEST_URL\)/
  );
});

test('production retains its same-origin manifest and shard proxy', () => {
  assert.match(source, /const MANIFEST_URL\s*=\s*manifestUrl/);
  assert.match(source, /if \(!DEV_MODE\)[\s\S]*baseRoot\s*=\s*`\/openingdb\/shards\/\$\{activeVersion\}`/);
  assert.match(source, /DEV_MODE\s*\?\s*siteManifest\s*:\s*preferSameOriginManifest\(siteManifest\)/);
});

test('manifest cache is scoped to its source URL so the stale local v2 cache is ignored', () => {
  assert.match(source, /openingdb_manifest_cache:\$\{encodeURIComponent\(/);
  assert.match(source, /readManifestFromSession\(siteManifestUrl\)/);
  assert.match(source, /writeManifestToSession\(runtimeManifest, siteManifestUrl\)/);
});
