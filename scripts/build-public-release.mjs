import { copyFile, mkdir, rm } from 'node:fs/promises';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUTPUT = join(tmpdir(), 'caissa-public-release');
export const PUBLIC_RELEASE_MANIFEST_PATH = 'PUBLIC_RELEASE_ARTIFACT_MANIFEST.json';

const protectedFiles = new Set([
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.vercelignore',
  'AGENTS.md',
  'DIAGNOSTIC.html',
  'DEBUG_BOARD.html',
  'LAUNCH_CHESS_GAME.html',
  'PROJECT_ARCHITECTURE.md',
  'PROJECT_HISTORY.md',
  'playwright.config.js',
  'QUICK_START.txt',
  'README.md',
  'RELEASE_PROCESS.md',
  'START_SERVER.bat',
  'TEST_ENGINE.html',
  'TVLavin-Chess-Game2.zip',
  'TOOLING_MIGRATION_PLAN.md',
  'CHANGELOG.md',
  'CAISSA_DOWNLOADS_IMPLEMENTATION_REPORT.md',
  'DEPENDENCY_MANIFEST.md',
  'HUMAN_ACCEPTANCE_CHECKLIST.md',
  'OPEN_SOURCE_LICENSE_AUDIT.md',
  'POLYGLOT_COMPATIBILITY_REPORT.md',
  'POLYGLOT_ONLINE_ARCHITECTURE.md',
  'PORTABLE_PERFORMANCE_BENCHMARK.md',
  'PORTABLE_SOURCE_AUDIT.md',
  PUBLIC_RELEASE_MANIFEST_PATH,
  'RELEASE_MANIFEST.json',
  'RELEASE_NOTES.md',
  'ROLLBACK_PLAN.md',
  'SECURITY_SCAN_REPORT.md',
  'SHA256SUMS.txt',
  'SOURCE_AVAILABILITY.md',
  'THIRD_PARTY_NOTICES.md',
  'VIRUSTOTAL_VERIFICATION_STATUS.md',
  'JUGAR_AJEDREZ.bat',
  'LEEME_PRIMERO.txt',
  'chess-llm-platform-complete.tar.gz',
  'create-book-simple.cjs',
  'create-book.cjs',
  'data/eco/eco_codes.json',
  'endgame-board-harness.html',
  'endgame-engine-harness.html',
  'endgame-trainer-integration-harness.html',
  'knowledge/AUTHORING.md',
  'supabase-schema-v2.sql',
  'supabase-schema.sql',
  'test-hash.html',
  'test-pgn-load.html'
]);
const protectedDirectories = [
  '.claude/',
  '.codex/',
  '.github/',
  '.vercel/',
  '.wrangler/',
  'chess-llm-platform/',
  'client/',
  'cloudflare-worker/',
  'coverage/',
  'data/openingdb/shards/',
  'data/openingdb/shards_build/',
  'data/openingdb/subshards_build/',
  'data/openingdb_games/',
  'data/pgn/',
  'data/pgn_db/',
  'deployment/',
  'docs/',
  'downloads-worker/',
  'endgame-pools/authoring/',
  'endgame-pools/private/',
  'experimental/',
  'experiments/',
  'gateway/',
  'history/',
  'internal-assets/',
  'knowledge/authoring/',
  'knowledge/consumer/',
  'knowledge/domains/',
  'knowledge/indexes/',
  'knowledge/loaders/',
  'knowledge/release/',
  'knowledge/schema/',
  'knowledge/snapshots/',
  'knowledge/taxonomy/',
  'knowledge/validation/',
  'scripts/',
  'playwright-report/',
  'supabase/',
  'test-results/',
  'tests/',
  'tools/'
];
const protectedFilePatterns = [
  /^\.env(?:\.|$)/i,
  /^[^/]+\.md$/i,
  /(?:^|\/)[^/]*(?:credential|credentials|secrets)[^/]*$/i,
  /\.(?:sqlite|sqlite3|zst|zst\.part|csv|csv\.part|db|dump|backup|pgdump|sql\.gz|log|pfx|pem|key|cer)$/i
];
const requiredFiles = [
  'index.html',
  'css/spectator-tv-2.css',
  'js/eco-opening-resolver.js',
  'js/fics-client.js',
  'js/spectator-tv-section.js',
  'about.html',
  'help.html',
  'endgame-library.html',
  'endgame-trainer.html',
  'js/learning/learning-progress-contracts.js',
  'js/learning/guided-study-event-session.js',
  'js/learning/local-learning-store.js',
  'js/learning/review-explanations.js',
  'js/learning/released-activity-runtime.js',
  'vercel.json',
  'public/data/endgame-pools/caissa-king-pawn-decisions/1.0.0.json',
  'public/data/endgame-pools/caissa-king-pawn-decisions/1.1.0.json',
  'public/data/endgame-pools/manifest-1.0.0.json',
  'public/data/endgame-pilots/kp-coordinate-support-promote/1.0.0.json',
  'public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json',
  'public/data/endgame-runs/endgame-run-technical-two-item/1.0.0.json',
  'public/data/eco/eco_codes.json',
  'knowledge/releases/rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84/release.json'
];

const unapprovedBinaryPattern = /\.(?:exe|com|dll|scr|cpl|ocx|sys|msi|msix|appx|apk|dmg|pkg|deb|rpm|zip|7z|rar|tar|tgz|gz|bz2|xz|cab|iso|img|vhd|vhdx|qcow|qcow2|jar|war|class|node|wasm|onnx|bin|so|dylib|ps1|bat|cmd|vbs|vbe|hta)$/i;

export const isUnapprovedPublicBinaryPath = path =>
  unapprovedBinaryPattern.test(path);

function hasExecutableOrArchiveMagic(path, cwd) {
  const absolutePath = join(cwd, path);
  if (!existsSync(absolutePath)) return false;
  const bytes = Buffer.alloc(64 * 1024);
  const descriptor = openSync(absolutePath, 'r');
  try {
    readSync(descriptor, bytes, 0, bytes.length, 0);
  } finally {
    closeSync(descriptor);
  }
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  const hasTarMagic = bytes.subarray(257, 262).equals(Buffer.from('ustar'));
  const hasIso9660Magic = bytes.subarray(0x8001, 0x8006).equals(Buffer.from('CD001'));
  return starts(0x4d, 0x5a)
    || starts(0x50, 0x4b, 0x03, 0x04)
    || starts(0x50, 0x4b, 0x05, 0x06)
    || starts(0x50, 0x4b, 0x07, 0x08)
    || starts(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)
    || starts(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07)
    || starts(0x7f, 0x45, 0x4c, 0x46)
    || starts(0x1f, 0x8b)
    || starts(0x42, 0x5a, 0x68)
    || starts(0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00)
    || starts(0x4d, 0x53, 0x43, 0x46)
    || starts(0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a)
    || starts(0x00, 0x61, 0x73, 0x6d)
    || starts(0xcf, 0xfa, 0xed, 0xfe)
    || starts(0xfe, 0xed, 0xfa, 0xcf)
    || starts(0xca, 0xfe, 0xba, 0xbe)
    || hasTarMagic
    || hasIso9660Magic;
}

export function sha256File(path, cwd) {
  const descriptor = openSync(join(cwd, path), 'r');
  const hash = createHash('sha256');
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      hash.update(chunk.subarray(0, bytesRead));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest('hex');
}

function normalizePublicManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('Public release manifest must use schemaVersion 1 and a files array.');
  }
  const entries = new Map();
  for (const item of manifest.files) {
    const path = String(item?.path || '');
    const sha256 = String(item?.sha256 || '').toLowerCase();
    if (!path || path.includes('\\') || path.startsWith('/') || path.split('/').includes('..')) {
      throw new Error(`Invalid public release manifest path: ${path || '<empty>'}`);
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error(`Invalid public release manifest digest: ${path}`);
    }
    if (entries.has(path)) throw new Error(`Duplicate public release manifest path: ${path}`);
    entries.set(path, sha256);
  }
  return entries;
}

export function createPublicArtifactManifest(files, { cwd = repositoryRoot } = {}) {
  return {
    schemaVersion: 1,
    policy: 'exact-path-and-sha256',
    files: [...new Set(files)].sort().map(path => ({ path, sha256: sha256File(path, cwd) }))
  };
}

export function loadPublicArtifactManifest({ cwd = repositoryRoot } = {}) {
  const manifestPath = join(cwd, PUBLIC_RELEASE_MANIFEST_PATH);
  if (!existsSync(manifestPath)) throw new Error(`Missing public release manifest: ${PUBLIC_RELEASE_MANIFEST_PATH}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  normalizePublicManifest(manifest);
  return manifest;
}

function manifestParentDirectories(paths) {
  const directories = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'));
    }
  }
  return [...directories].sort((left, right) => {
    const depthDifference = left.split('/').length - right.split('/').length;
    return depthDifference || left.localeCompare(right);
  });
}

function escapeVercelIgnorePath(path) {
  return path.replace(/([*?\[\]])/g, '\\$1');
}

export function renderVercelIgnore(manifest = loadPublicArtifactManifest()) {
  const paths = [...normalizePublicManifest(manifest).keys()].sort();
  const directories = manifestParentDirectories(paths);
  return [
    '# Default-deny Vercel upload policy generated from PUBLIC_RELEASE_ARTIFACT_MANIFEST.json.',
    '# Every allowed directory is re-closed before exact manifest files are re-included.',
    '# Regenerate only with `npm run release:public:manifest` and verify before deployment.',
    '/*',
    ...directories.flatMap(path => {
      const pattern = escapeVercelIgnorePath(path);
      return [`!/${pattern}`, `/${pattern}/*`];
    }),
    ...paths.map(path => `!/${escapeVercelIgnorePath(path)}`),
    ''
  ].join('\n');
}

export const CHESS_TV_CONTRACTS = Object.freeze([
  'route /spectator-tv exists',
  'visible identity is Chess TV',
  'sidebar identity is Chess TV',
  'sidebar link targets /spectator-tv',
  'HEAD, BODY, and FOOT regions exist',
  'only BODY owns workspace scrolling',
  'FOOT remains fixed outside the scrolling row',
  'board controls include Flip, Theater, Fullscreen, and Refresh',
  'exactly two player bars exist',
  'each player bar owns exactly one clock',
  'legacy White | Black clock summary is absent',
  'Game Details uses compact two-column desktop rows',
  'FOOT excludes Refresh and Watch featured',
  'Watch offers Exit table',
  'Exit table sends unobserve through the canonical client',
  'Watch to Channels invalidates late events',
  'the board has one persistent root',
  'Chess TV does not create a second FICS socket',
  'Opening and ECO use the canonical catalog',
  'Opening renders a real internal link',
  'Opening links target /eco/<ECO>',
  'the public artifact contains one eco_codes.json',
  'the layout prevents horizontal overflow',
  'anti-jitter guards remain active'
]);

export const isProtectedPublicPath = path =>
  protectedFiles.has(path)
  || protectedDirectories.some(prefix => path.startsWith(prefix))
  || protectedFilePatterns.some(pattern => pattern.test(path));

function isPathInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function validatePublicSourceFile(path, cwd = repositoryRoot) {
  const sourceRoot = realpathSync(resolve(cwd));
  const lexicalPath = resolve(sourceRoot, path);
  if (!isPathInside(sourceRoot, lexicalPath)) {
    throw new Error(`Public release source escapes the repository: ${path}`);
  }
  const sourceStat = lstatSync(lexicalPath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Public release source must be a regular file: ${path}`);
  }
  const resolvedPath = realpathSync(lexicalPath);
  if (!isPathInside(sourceRoot, resolvedPath)) {
    throw new Error(`Public release source resolves outside the repository: ${path}`);
  }
  const resolvedRelative = relative(sourceRoot, resolvedPath).split(sep).join('/');
  if (isProtectedPublicPath(path) || isProtectedPublicPath(resolvedRelative)) {
    throw new Error(`Public release source resolves to a protected path: ${path}`);
  }
  return Object.freeze({ lexicalPath, resolvedPath, resolvedRelative });
}

export function trackedPublicFiles({ cwd = repositoryRoot } = {}) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to read committed files.');
  const files = result.stdout
    .split('\0')
    .filter(Boolean)
    .filter(path => existsSync(join(cwd, path)))
    .filter(path => !isProtectedPublicPath(path));
  for (const path of files) validatePublicSourceFile(path, cwd);
  return files;
}

export function auditPublicFiles(files, { cwd = repositoryRoot, manifest = loadPublicArtifactManifest({ cwd }) } = {}) {
  const manifestEntries = normalizePublicManifest(manifest);
  const fileSet = new Set(files);
  const leaked = files.filter(isProtectedPublicPath);
  const unapprovedPaths = files.filter(path => !manifestEntries.has(path));
  const unapprovedBinaries = unapprovedPaths.filter(path =>
    isUnapprovedPublicBinaryPath(path) || hasExecutableOrArchiveMagic(path, cwd)
  );
  const manifestMissingPaths = [...manifestEntries.keys()].filter(path => !fileSet.has(path));
  const manifestDigestMismatches = files.filter(path => manifestEntries.has(path)).filter(path => {
    const absolutePath = join(cwd, path);
    if (!existsSync(absolutePath)) return true;
    validatePublicSourceFile(path, cwd);
    return sha256File(path, cwd) !== manifestEntries.get(path);
  });
  const missing = requiredFiles.filter(path => !files.includes(path));
  if (leaked.length || unapprovedPaths.length || manifestMissingPaths.length || manifestDigestMismatches.length || missing.length) {
    throw new Error([
      leaked.length ? `Protected paths: ${leaked.join(', ')}` : '',
      unapprovedPaths.length ? `Unapproved public paths: ${unapprovedPaths.join(', ')}` : '',
      unapprovedBinaries.length ? `Unapproved executable/archive artifacts: ${unapprovedBinaries.join(', ')}` : '',
      manifestMissingPaths.length ? `Manifest paths missing from release: ${manifestMissingPaths.join(', ')}` : '',
      manifestDigestMismatches.length ? `Manifest digest mismatch: ${manifestDigestMismatches.join(', ')}` : '',
      missing.length ? `Missing runtime paths: ${missing.join(', ')}` : ''
    ].filter(Boolean).join('\n'));
  }
  return { files: files.length, protectedPaths: 0, requiredPaths: requiredFiles.length, manifestPaths: manifestEntries.size };
}

export function auditChessTVContracts({ cwd = repositoryRoot, files = trackedPublicFiles({ cwd }), sources = {} } = {}) {
  const read = path => sources[path] ?? readFileSync(join(cwd, path), 'utf8');
  const index = read('index.html');
  const css = read('css/spectator-tv-2.css');
  const spectator = read('js/spectator-tv-section.js');
  const ficsClient = read('js/fics-client.js');
  const resolver = read('js/eco-opening-resolver.js');
  const vercel = read('vercel.json');
  const sourceEco = read('data/eco/eco_codes.json');
  const publicEco = read('public/data/eco/eco_codes.json');
  const workspaceFoot = index.match(/<div class="spectator-workspace-foot">[\s\S]*?<\/div>\s*<\/aside>/)?.[0] || '';
  const playerBars = index.match(/class="spectator-player-bar\b/g) || [];
  const playerClocks = index.match(/class="spectator-player-clock"/g) || [];
  const publicEcoFiles = files.filter(path => /(^|\/)eco_codes\.json$/.test(path));

  const checks = [
    /"source"\s*:\s*"\/spectator-tv"[\s\S]*?"destination"\s*:\s*"\/index\.html"/.test(vercel),
    /class="spectator-title"[^>]*>[\s\S]*?Chess TV\s*<\/h2>/.test(index),
    /data-nav-key="spectator"[^>]*aria-label="Chess TV"/.test(index) && />Chess TV<\/span>/.test(index),
    /<a href="\/spectator-tv"[^>]*data-nav-key="spectator"/.test(index),
    /class="spectator-workspace-head"/.test(index) && /class="spectator-workspace-body"/.test(index) && /class="spectator-workspace-foot"/.test(index),
    /\.spectator-v2 \.spectator-workspace\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/.test(css)
      && /\.spectator-v2 \.spectator-workspace-body\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?\}/.test(css),
    /\.spectator-v2 \.spectator-workspace\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto;[\s\S]*?\}/.test(css),
    ['spectatorFlipBoardBtn', 'spectatorTheaterBtn', 'spectatorFullscreenBtn', 'spectatorBoardRefreshBtn'].every(id => index.includes(`id="${id}"`)),
    playerBars.length === 2,
    playerClocks.length === 2,
    !/spectator-clock-row|spectatorWhiteClock|spectatorBlackClock/.test(index),
    /\.spectator-v2 \.spectator-context-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?\}/.test(css),
    !/spectatorRefreshFeaturedBtn|spectatorWatchFeaturedBtn|Watch featured/.test(workspaceFoot),
    /Exit table/.test(spectator),
    /exitObservedGame[\s\S]*?client\.leaveObservedGame\(unobserveGameId\)/.test(spectator)
      && /leaveObservedGame\(gameNumber = null\)[\s\S]*?this\.send\(`unobserve \$\{target\}`\)/.test(ficsClient),
    /this\.selectionGeneration \+= 1;/.test(spectator)
      && /selectionGeneration !== this\.selectionGeneration/.test(spectator),
    (index.match(/id="spectatorBoard"/g) || []).length === 1
      && /if \(!this\.elements\.board \|\| this\.board \|\| typeof Chessboard/.test(spectator)
      && /createFicsBoardView/.test(spectator),
    !/new WebSocket|gatewayUrl/.test(spectator) && /window\.CaissaFICSClient/.test(spectator),
    /CATALOG_URL = '\/data\/eco\/eco_codes\.json'/.test(resolver)
      && /CaissaEcoOpeningResolver/.test(spectator)
      && sourceEco === publicEco,
    /<a class="spectator-opening-link"/.test(spectator),
    /href:\s*`\/eco\/\$\{eco\}`/.test(resolver),
    publicEcoFiles.length === 1 && publicEcoFiles[0] === 'public/data/eco/eco_codes.json',
    /\.spectator-layout\.spectator-v2\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/.test(css)
      && /\.spectator-v2 \.spectator-workspace-body\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?\}/.test(css),
    /if \(this\.boardResizeFrame !== null\) return;/.test(spectator)
      && /const unchanged = this\.lastBoardGeometry/.test(spectator)
      && /if \(unchanged\) return;/.test(spectator)
      && /if \(this\.contextSnapshot === snapshot\) return;/.test(spectator)
  ];

  const failed = CHESS_TV_CONTRACTS.filter((_, index) => !checks[index]);
  if (failed.length) throw new Error(`Chess TV release contracts failed: ${failed.join('; ')}`);
  return { chessTvContracts: CHESS_TV_CONTRACTS.length };
}

export async function buildPublicRelease({ cwd = repositoryRoot, output = DEFAULT_OUTPUT } = {}) {
  const sourceRoot = resolve(cwd);
  const targetRoot = resolve(output);
  if (
    targetRoot === sourceRoot
    || targetRoot.startsWith(`${sourceRoot}${sep}`)
    || sourceRoot.startsWith(`${targetRoot}${sep}`)
  ) {
    throw new Error('Release output must be a dedicated directory outside the repository tree.');
  }
  const files = trackedPublicFiles({ cwd: sourceRoot });
  const manifest = loadPublicArtifactManifest({ cwd: sourceRoot });
  const audit = auditPublicFiles(files, { cwd: sourceRoot, manifest });
  const chessTv = auditChessTVContracts({ cwd: sourceRoot, files });
  await rm(targetRoot, { recursive: true, force: true });
  for (const path of files) {
    const source = validatePublicSourceFile(path, sourceRoot);
    const destination = join(targetRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source.resolvedPath, destination);
  }
  auditPublicFiles(files, { cwd: targetRoot, manifest });
  return { ...audit, ...chessTv, output: targetRoot };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const files = trackedPublicFiles();
  const result = checkOnly
    ? { ...auditPublicFiles(files, { cwd: repositoryRoot }), ...auditChessTVContracts({ files }) }
    : await buildPublicRelease();
  console.log(checkOnly
    ? `Public release audit passed (${result.files} committed files; ${result.requiredPaths} required paths; ${result.chessTvContracts} Chess TV contracts).`
    : `Public release built at ${result.output} (${result.files} files; ${result.chessTvContracts} Chess TV contracts).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
