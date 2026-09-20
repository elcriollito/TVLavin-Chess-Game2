import { copyFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUTPUT = join(tmpdir(), 'caissa-public-release');

const protectedFiles = new Set([
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
  'chess-llm-platform/',
  'client/',
  'cloudflare-worker/',
  'deployment/',
  'docs/',
  'downloads-worker/',
  'endgame-pools/authoring/',
  'endgame-pools/private/',
  'experimental/',
  'gateway/',
  'history/',
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
  'tests/',
  'tools/'
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
  protectedFiles.has(path) || protectedDirectories.some(prefix => path.startsWith(prefix));

export function trackedPublicFiles({ cwd = repositoryRoot } = {}) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to read committed files.');
  return result.stdout.split('\0').filter(Boolean).filter(path => !isProtectedPublicPath(path));
}

export function auditPublicFiles(files) {
  const leaked = files.filter(isProtectedPublicPath);
  const missing = requiredFiles.filter(path => !files.includes(path));
  if (leaked.length || missing.length) {
    throw new Error([
      leaked.length ? `Protected paths: ${leaked.join(', ')}` : '',
      missing.length ? `Missing runtime paths: ${missing.join(', ')}` : ''
    ].filter(Boolean).join('\n'));
  }
  return { files: files.length, protectedPaths: 0, requiredPaths: requiredFiles.length };
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
  if (targetRoot === sourceRoot || sourceRoot.startsWith(`${targetRoot}${sep}`)) {
    throw new Error('Release output must be a dedicated directory outside the repository tree.');
  }
  const files = trackedPublicFiles({ cwd: sourceRoot });
  const audit = auditPublicFiles(files);
  const chessTv = auditChessTVContracts({ cwd: sourceRoot, files });
  await rm(targetRoot, { recursive: true, force: true });
  for (const path of files) {
    const destination = join(targetRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(sourceRoot, path), destination);
  }
  return { ...audit, ...chessTv, output: targetRoot };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const files = trackedPublicFiles();
  const result = checkOnly
    ? { ...auditPublicFiles(files), ...auditChessTVContracts({ files }) }
    : await buildPublicRelease();
  console.log(checkOnly
    ? `Public release audit passed (${result.files} committed files; ${result.requiredPaths} required paths; ${result.chessTvContracts} Chess TV contracts).`
    : `Public release built at ${result.output} (${result.files} files; ${result.chessTvContracts} Chess TV contracts).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
