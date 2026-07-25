import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OUTPUT,
  auditPublicFiles,
  isProtectedPublicPath,
  trackedPublicFiles
} from '../scripts/build-public-release.mjs';
import { resolve } from 'node:path';

test('public release excludes internal architecture and authored Knowledge sources', () => {
  for (const path of [
    'docs/architecture/SEASON_9_2_PUBLIC_DISCLOSURE_REVIEW_AND_GUIDED_STUDY_ENTRY.md',
    'PROJECT_ARCHITECTURE.md',
    'knowledge/AUTHORING.md',
    'knowledge/domains/endgames/example/unit.js',
    'knowledge/schema/knowledge-unit.js',
    'knowledge/consumer/library-reader.js'
  ]) assert.equal(isProtectedPublicPath(path), true, `${path} was not protected`);
});

test('public release preserves runtime pages and immutable release assets', () => {
  for (const path of [
    'index.html',
    'endgame-library.html',
    'js/endgame-library/browser-library-reader.js',
    'knowledge/releases/rel-example/release.json',
    'knowledge/generated/endgames-library-browser.json'
  ]) assert.equal(isProtectedPublicPath(path), false, `${path} was incorrectly protected`);
});

test('committed-tree audit has no protected paths and all required runtime files', () => {
  const files = trackedPublicFiles();
  const result = auditPublicFiles(files);
  assert.equal(result.protectedPaths, 0);
  assert.equal(result.requiredPaths, 6);
  assert.ok(result.files > 700);
});

test('default release output is outside the repository to prevent parent-worktree scanning', () => {
  assert.equal(DEFAULT_OUTPUT.startsWith(`${resolve('.') }\\`), false);
});

test('audit rejects a leaked protected path and a missing required path', () => {
  assert.throws(
    () => auditPublicFiles(['docs/architecture/private.md']),
    /Protected paths: docs\/architecture\/private\.md[\s\S]*Missing runtime paths:/
  );
});
