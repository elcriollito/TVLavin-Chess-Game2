import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUTPUT = join(tmpdir(), 'caissa-public-release');

const protectedFiles = new Set([
  'PROJECT_ARCHITECTURE.md',
  'PROJECT_HISTORY.md',
  'RELEASE_PROCESS.md',
  'TOOLING_MIGRATION_PLAN.md',
  'knowledge/AUTHORING.md'
]);
const protectedDirectories = [
  'docs/',
  'knowledge/authoring/',
  'knowledge/consumer/',
  'knowledge/domains/',
  'knowledge/indexes/',
  'knowledge/loaders/',
  'knowledge/release/',
  'knowledge/schema/',
  'knowledge/snapshots/',
  'knowledge/taxonomy/',
  'knowledge/validation/'
];
const requiredFiles = [
  'index.html',
  'about.html',
  'help.html',
  'endgame-library.html',
  'endgame-trainer.html',
  'vercel.json',
  'knowledge/releases/rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1/release.json'
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
