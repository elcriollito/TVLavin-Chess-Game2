import { copyFile, mkdir, rm } from 'node:fs/promises';
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
  'knowledge/releases/rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84/release.json'
];

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

export async function buildPublicRelease({ cwd = repositoryRoot, output = DEFAULT_OUTPUT } = {}) {
  const sourceRoot = resolve(cwd);
  const targetRoot = resolve(output);
  if (targetRoot === sourceRoot || sourceRoot.startsWith(`${targetRoot}${sep}`)) {
    throw new Error('Release output must be a dedicated directory outside the repository tree.');
  }
  const files = trackedPublicFiles({ cwd: sourceRoot });
  const audit = auditPublicFiles(files);
  await rm(targetRoot, { recursive: true, force: true });
  for (const path of files) {
    const destination = join(targetRoot, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(sourceRoot, path), destination);
  }
  return { ...audit, output: targetRoot };
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const files = trackedPublicFiles();
  const result = checkOnly ? auditPublicFiles(files) : await buildPublicRelease();
  console.log(checkOnly
    ? `Public release audit passed (${result.files} committed files; ${result.requiredPaths} required paths).`
    : `Public release built at ${result.output} (${result.files} files).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
