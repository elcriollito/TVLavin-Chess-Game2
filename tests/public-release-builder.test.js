import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OUTPUT,
  auditPublicFiles,
  buildPublicRelease,
  isProtectedPublicPath,
  trackedPublicFiles
} from '../scripts/build-public-release.mjs';
import { resolve } from 'node:path';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('public release excludes internal architecture and authored Knowledge sources', () => {
  for (const path of [
    'docs/architecture/SEASON_9_2_PUBLIC_DISCLOSURE_REVIEW_AND_GUIDED_STUDY_ENTRY.md',
    'docs/architecture/SEASON_9_3_1_LEARNING_EVIDENCE_CONSENT_AND_PROGRESS_CONTRACTS.md',
    'PROJECT_ARCHITECTURE.md',
    'knowledge/AUTHORING.md',
    'knowledge/domains/endgames/example/unit.js',
    'endgame-pools/authoring/pools/private.json',
    'endgame-pools/private/reviews/private.json',
    'knowledge/schema/knowledge-unit.js',
    'knowledge/consumer/library-reader.js',
    'DIAGNOSTIC.html',
    'TEST_ENGINE.html',
    'endgame-board-harness.html',
    'endgame-engine-harness.html',
    'test-hash.html',
    'test-pgn-load.html',
    'tests/public-release-builder.test.js',
    'scripts/build-public-release.mjs',
    'tools/indexnow-ping.mjs',
    'client/package.json',
    'supabase-schema.sql',
    'TVLavin-Chess-Game2.zip'
  ]) assert.equal(isProtectedPublicPath(path), true, `${path} was not protected`);
});

test('built artifact enforces disclosure boundaries on rendered public content', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'caissa-disclosure-'));
  await buildPublicRelease({ output });
  const readOutput = path => readFile(resolve(output, path), 'utf8');
  const about = await readOutput('about.html');
  const roadmap = await readOutput('data/roadmap.json');
  const premium = await readOutput('premium.html');
  const classic = await readOutput('yahoo-classic.html');
  const vault = await readOutput('vault.html');
  assert.doesNotMatch(about, /Supabase|Vercel|serverless|open source|auditable on GitHub/i);
  assert.doesNotMatch(roadmap, /schema|provider integration|season 9|API endpoint/i);
  assert.match(premium, /not currently available/i);
  assert.doesNotMatch(premium, /No tracking, no selling/i);
  assert.doesNotMatch(classic, /No data is sent to external servers/i);
  assert.doesNotMatch(vault, /github\.com\/anthropics\/caissa/i);
  for (const path of ['DIAGNOSTIC.html', 'TEST_ENGINE.html', 'endgame-board-harness.html']) {
    await assert.rejects(stat(resolve(output, path)), { code: 'ENOENT' });
  }
});

test('public release preserves runtime pages and immutable release assets', () => {
  for (const path of [
    'index.html',
    'endgame-library.html',
    'js/endgame-library/browser-library-reader.js',
    'js/learning/learning-progress-contracts.js',
    'js/learning/guided-study-event-session.js',
    'knowledge/releases/rel-example/release.json',
    'knowledge/generated/endgames-library-browser.json',
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json',
    'public/data/endgame-pools/manifest-1.0.0.json'
  ]) assert.equal(isProtectedPublicPath(path), false, `${path} was incorrectly protected`);
});

test('committed-tree audit has no protected paths and all required runtime files', () => {
  const files = trackedPublicFiles();
  const result = auditPublicFiles(files);
  assert.equal(result.protectedPaths, 0);
  assert.equal(result.requiredPaths, 14);
  assert.ok(result.files > 500);
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
