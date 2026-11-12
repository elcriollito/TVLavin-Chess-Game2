import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHESS_TV_CONTRACTS,
  DEFAULT_OUTPUT,
  auditChessTVContracts,
  auditPublicFiles,
  buildPublicRelease,
  isUnapprovedPublicBinaryPath,
  isProtectedPublicPath,
  loadPublicArtifactManifest,
  renderVercelIgnore,
  sha256File,
  trackedPublicFiles,
  validatePublicSourceFile
} from '../scripts/build-public-release.mjs';
import {
  assertNoRepositoryVercelState,
  compareExactSets,
  enumerateRegularFiles,
  validateVercelExecutable
} from '../scripts/verify-public-release-vercel.mjs';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('public release excludes internal architecture and authored Knowledge sources', () => {
  for (const path of [
    'docs/architecture/SEASON_9_2_PUBLIC_DISCLOSURE_REVIEW_AND_GUIDED_STUDY_ENTRY.md',
    'docs/architecture/SEASON_9_3_1_LEARNING_EVIDENCE_CONSENT_AND_PROGRESS_CONTRACTS.md',
    'PROJECT_ARCHITECTURE.md',
    'SECURITY_SCAN_REPORT.md',
    'RELEASE_MANIFEST.json',
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
    'data/eco/eco_codes.json',
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
  assert.doesNotMatch(about, /Supabase|serverless|open source|auditable on GitHub/i);
  assert.match(about, /Vercel Web Analytics/);
  assert.doesNotMatch(roadmap, /schema|provider integration|season 9|API endpoint/i);
  assert.match(premium, /Coming Soon|not represented as currently available/i);
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
    'public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json',
    'public/data/endgame-pools/manifest-1.0.0.json'
  ]) assert.equal(isProtectedPublicPath(path), false, `${path} was incorrectly protected`);
});

test('committed-tree audit has no protected paths and all required runtime files', () => {
  const files = trackedPublicFiles();
  const result = auditPublicFiles(files);
  assert.equal(result.protectedPaths, 0);
  assert.equal(result.requiredPaths, 23);
  assert.equal(result.manifestPaths, files.length);
  assert.ok(result.files > 500);
});

test('the exact public manifest controls staging while repository-root deployment is blocked', () => {
  const manifest = loadPublicArtifactManifest();
  const manifestPaths = manifest.files.map(item => item.path);
  const ignore = renderVercelIgnore(manifest);
  const rules = ignore.split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  const exactFiles = rules.filter(line => line.startsWith('!/') && !rules.includes(`${line.slice(1)}/*`));
  const unescapePath = path => path.replace(/\\([*?\[\]])/g, '$1');
  assert.equal(readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8'), ignore);
  assert.match(ignore, /Default-deny Vercel upload policy/);
  assert.equal(rules[0], '/*');
  assert.deepEqual(exactFiles.map(line => unescapePath(line.slice(2))), manifestPaths);
  assert.deepEqual(manifestPaths, [...manifestPaths].sort());
});

test('public Home local assets are pinned in the release manifest with current digests', () => {
  const home = readFileSync(new URL('../home.html', import.meta.url), 'utf8');
  const manifest = loadPublicArtifactManifest();
  const manifestEntries = new Map(manifest.files.map(item => [item.path, item.sha256]));
  const documentOrigin = 'https://caissa-release-contract.invalid';
  const assetPaths = [...home.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="([^"]+)"/gi)]
    .map(match => new URL(match[1], documentOrigin))
    .filter(url => url.origin === documentOrigin)
    .map(url => url.pathname.replace(/^\/+/, ''));

  assert.ok(assetPaths.includes('css/home/mobile-home.css'));
  assert.ok(assetPaths.includes('js/home/mobile-home.js'));
  for (const path of assetPaths) {
    assert.equal(manifestEntries.get(path), sha256File(path, resolve('.')), `${path} is absent or stale in the public release manifest`);
  }
});

test('Vercel staging verification does not execute installed CLI internals', () => {
  const verifier = readFileSync(new URL('../scripts/verify-public-release-vercel.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /EXPECTED_VERCEL_PACKAGE_SHA256 = '[a-f0-9]{64}'/);
  assert.match(verifier, /enumerateRegularFiles\(built\.output\)/);
  assert.match(verifier, /without executing installed CLI internals/);
  assert.match(verifier, /packageJson\.bin\?\.vercel/);
  assert.match(verifier, /Repository-root \.vercel state is prohibited/);
  assert.doesNotMatch(verifier, /createRequire|require\(chunkPath\)|dist\/chunks|EXPECTED_VERCEL_ENUMERATOR/);
});

test('release staging enumeration is exact and rejects filesystem indirection', () => {
  const stagingRoot = mkdtempSync(join(tmpdir(), 'caissa-vercel-enumeration-'));
  const outsideRoot = mkdtempSync(join(tmpdir(), 'caissa-vercel-enumeration-outside-'));
  try {
    mkdirSync(join(stagingRoot, 'nested'));
    writeFileSync(join(stagingRoot, 'index.html'), 'safe');
    writeFileSync(join(stagingRoot, 'nested', 'asset.js'), 'safe');
    assert.deepEqual(enumerateRegularFiles(stagingRoot), ['index.html', 'nested/asset.js']);
    assert.deepEqual(
      compareExactSets(new Set(['index.html']), new Set(['nested/asset.js'])),
      { missing: ['index.html'], extra: ['nested/asset.js'] }
    );

    writeFileSync(join(outsideRoot, 'private.txt'), 'outside');
    symlinkSync(outsideRoot, join(stagingRoot, 'linked'), 'junction');
    assert.throws(() => enumerateRegularFiles(stagingRoot), /symbolic link or junction|resolves outside/);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('Vercel compatibility checks require an executable and reject implicit root state', () => {
  const packageRoot = mkdtempSync(join(tmpdir(), 'caissa-vercel-package-'));
  const repositoryRoot = mkdtempSync(join(tmpdir(), 'caissa-vercel-root-state-'));
  const packageJson = { bin: { vercel: './dist/vc.js' } };
  try {
    assert.throws(() => validateVercelExecutable(packageRoot, packageJson), /ENOENT/);
    mkdirSync(join(packageRoot, 'dist'));
    writeFileSync(join(packageRoot, 'dist', 'vc.js'), 'safe entrypoint');
    assert.equal(validateVercelExecutable(packageRoot, packageJson), join(packageRoot, 'dist', 'vc.js'));

    assert.doesNotThrow(() => assertNoRepositoryVercelState(repositoryRoot));
    mkdirSync(join(repositoryRoot, '.vercel'));
    writeFileSync(join(repositoryRoot, '.vercel', 'routes.json'), '{}');
    assert.throws(() => assertNoRepositoryVercelState(repositoryRoot), /\.vercel state is prohibited/);
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test('built staging omits the repository-root Vercel allowlist', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'caissa-vercel-stage-'));
  await buildPublicRelease({ output });
  await assert.rejects(stat(resolve(output, '.vercelignore')), { code: 'ENOENT' });
});

test('public release audit enforces all permanent Chess TV contracts', () => {
  const files = trackedPublicFiles();
  const result = auditChessTVContracts({ files });
  assert.equal(CHESS_TV_CONTRACTS.length, 24);
  assert.equal(result.chessTvContracts, 24);
  assert.deepEqual(files.filter(path => path.endsWith('/eco_codes.json')), ['public/data/eco/eco_codes.json']);
});

test('Chess TV guard rejects a missing board control and a duplicate ECO catalog', () => {
  const files = trackedPublicFiles();
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.throws(
    () => auditChessTVContracts({
      files,
      sources: { 'index.html': index.replace('id="spectatorFullscreenBtn"', 'id="removedFullscreenBtn"') }
    }),
    /board controls include Flip, Theater, Fullscreen, and Refresh/
  );
  assert.throws(
    () => auditChessTVContracts({ files: [...files, 'data/eco/eco_codes.json'] }),
    /public artifact contains one eco_codes\.json/
  );
});

test('default release output is outside the repository to prevent parent-worktree scanning', () => {
  assert.equal(DEFAULT_OUTPUT.startsWith(`${resolve('.') }\\`), false);
});

test('release output rejects a child directory inside the repository', async () => {
  await assert.rejects(
    buildPublicRelease({ output: resolve('.public-release-unsafe-child') }),
    /dedicated directory outside the repository tree/
  );
});

test('audit rejects a leaked protected path and a missing required path', () => {
  assert.throws(
    () => auditPublicFiles(['docs/architecture/private.md']),
    /Protected paths: docs\/architecture\/private\.md[\s\S]*Missing runtime paths:/
  );
});

test('audit blocks unapproved executables and archives even outside protected directories', () => {
  for (const path of ['public/new-tool.exe', 'public/legacy.com', 'assets/release.zip', 'js/native.node', 'models/new.onnx', 'books/new.bin']) {
    assert.equal(isUnapprovedPublicBinaryPath(path), true, path);
  }
  const files = trackedPublicFiles();
  assert.throws(() => auditPublicFiles([...files, 'public/new-tool.exe']), /Unapproved public paths: public\/new-tool\.exe/);
});

test('audit blocks disguised archive magic without a risky extension', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'caissa-release-magic-'));
  const artifact = 'public/not-a-text-file.dat';
  const absoluteArtifact = join(temporaryRoot, artifact);
  try {
    mkdirSync(dirname(absoluteArtifact), { recursive: true });
    writeFileSync(absoluteArtifact, Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 0]));
    assert.throws(
      () => auditPublicFiles([artifact], { cwd: temporaryRoot, manifest: { schemaVersion: 1, files: [] } }),
      /Unapproved executable\/archive artifacts: public\/not-a-text-file\.dat/
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('audit blocks an empty ZIP disguised without an archive extension', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'caissa-release-empty-zip-'));
  const artifact = 'public/empty-archive.dat';
  const absoluteArtifact = join(temporaryRoot, artifact);
  try {
    mkdirSync(dirname(absoluteArtifact), { recursive: true });
    writeFileSync(absoluteArtifact, Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0]));
    assert.throws(
      () => auditPublicFiles([artifact], { cwd: temporaryRoot, manifest: { schemaVersion: 1, files: [] } }),
      /Unapproved executable\/archive artifacts: public\/empty-archive\.dat/
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('audit blocks unmanifested disk images and deep ISO signatures', () => {
  for (const path of ['public/release.iso', 'public/disk.img', 'public/system.vhd', 'public/system.vhdx']) {
    assert.equal(isUnapprovedPublicBinaryPath(path), true, path);
  }
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'caissa-release-iso-'));
  const artifact = 'public/unpublished.dat';
  const absoluteArtifact = join(temporaryRoot, artifact);
  try {
    mkdirSync(dirname(absoluteArtifact), { recursive: true });
    const bytes = Buffer.alloc(0x8006);
    bytes.write('CD001', 0x8001, 'ascii');
    writeFileSync(absoluteArtifact, bytes);
    assert.throws(
      () => auditPublicFiles([artifact], { cwd: temporaryRoot, manifest: { schemaVersion: 1, files: [] } }),
      /Unapproved executable\/archive artifacts: public\/unpublished\.dat/
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('audit rejects every unmanifested file even when its format is unknown', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'caissa-release-positive-manifest-'));
  const artifact = 'public/unreviewed.opaque';
  const absoluteArtifact = join(temporaryRoot, artifact);
  try {
    mkdirSync(dirname(absoluteArtifact), { recursive: true });
    writeFileSync(absoluteArtifact, 'not in the reviewed manifest');
    assert.throws(
      () => auditPublicFiles([artifact], { cwd: temporaryRoot, manifest: { schemaVersion: 1, files: [] } }),
      /Unapproved public paths: public\/unreviewed\.opaque/
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('release source validation rejects files reached through a directory junction', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'caissa-release-containment-'));
  const outsideRoot = mkdtempSync(join(tmpdir(), 'caissa-release-outside-'));
  try {
    writeFileSync(join(outsideRoot, 'private.txt'), 'protected external bytes');
    symlinkSync(outsideRoot, join(temporaryRoot, 'public'), 'junction');
    assert.throws(
      () => validatePublicSourceFile('public/private.txt', temporaryRoot),
      /resolves outside the repository/
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('release source validation accepts an ordinary contained file', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'caissa-release-regular-'));
  try {
    mkdirSync(join(temporaryRoot, 'public'));
    writeFileSync(join(temporaryRoot, 'public', 'safe.txt'), 'approved bytes');
    const validated = validatePublicSourceFile('public/safe.txt', temporaryRoot);
    assert.equal(validated.resolvedRelative, 'public/safe.txt');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
