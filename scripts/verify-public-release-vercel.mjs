import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  DEFAULT_OUTPUT,
  buildPublicRelease,
  loadPublicArtifactManifest
} from './build-public-release.mjs';

const EXPECTED_VERCEL_CLI_VERSION = '59.10.0';
const require = createRequire(import.meta.url);

function loadPinnedVercelClient() {
  let globalRoot;
  if (process.platform === 'win32') {
    const whereResult = spawnSync('where.exe', ['vercel'], { encoding: 'utf8' });
    if (whereResult.status !== 0) {
      throw new Error(whereResult.stderr || whereResult.error?.message || 'Unable to locate the Vercel CLI.');
    }
    const commandPath = whereResult.stdout.split(/\r?\n/).find(Boolean);
    globalRoot = join(dirname(commandPath), 'node_modules');
  } else {
    const globalRootResult = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
    if (globalRootResult.status !== 0) {
      throw new Error(globalRootResult.stderr || globalRootResult.error?.message || 'Unable to resolve the global npm module directory.');
    }
    globalRoot = globalRootResult.stdout.trim();
  }
  const vercelRoot = join(globalRoot, 'vercel');
  const packagePath = join(vercelRoot, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error(`Vercel CLI ${EXPECTED_VERCEL_CLI_VERSION} is required for release verification.`);
  }
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (packageJson.version !== EXPECTED_VERCEL_CLI_VERSION) {
    throw new Error(
      `Expected Vercel CLI ${EXPECTED_VERCEL_CLI_VERSION}, found ${packageJson.version || '<unknown>'}. Review and update the release verifier before changing versions.`
    );
  }
  const chunksRoot = join(vercelRoot, 'dist', 'chunks');
  for (const name of readdirSync(chunksRoot).filter(name => name.endsWith('.js'))) {
    const chunkPath = join(chunksRoot, name);
    const source = readFileSync(chunkPath, 'utf8');
    if (!source.includes('buildFileTree') || !source.includes('getVercelIgnore')) continue;
    const chunk = require(chunkPath);
    if (typeof chunk.require_dist !== 'function') continue;
    const client = chunk.require_dist();
    if (typeof client?.buildFileTree === 'function' && typeof client?.getVercelIgnore === 'function') {
      return { ...client, version: packageJson.version };
    }
  }
  throw new Error(`Unable to load the file enumerator from Vercel CLI ${packageJson.version}.`);
}

function relativeFileSet(root, files) {
  return new Set(files.map(path => relative(root, path).split(sep).join('/')));
}

function compareExactSets(expected, actual) {
  return {
    missing: [...expected].filter(path => !actual.has(path)),
    extra: [...actual].filter(path => !expected.has(path))
  };
}

async function main() {
  const repositoryRoot = resolve('.');
  const manifest = loadPublicArtifactManifest({ cwd: repositoryRoot });
  const expected = new Set(manifest.files.map(item => item.path));
  const client = loadPinnedVercelClient();
  const built = await buildPublicRelease({ cwd: repositoryRoot, output: DEFAULT_OUTPUT });

  if (existsSync(join(built.output, '.vercelignore'))) {
    throw new Error('The audited staging tree must not contain the repository-root deployment block.');
  }

  const stagedTree = await client.buildFileTree(
    built.output,
    { isDirectory: true, prebuilt: false },
    () => {}
  );
  const staged = relativeFileSet(built.output, stagedTree.fileList);
  const stagedMismatch = compareExactSets(expected, staged);
  if (stagedMismatch.missing.length || stagedMismatch.extra.length) {
    throw new Error([
      `Vercel staging inventory mismatch for CLI ${client.version}.`,
      stagedMismatch.missing.length ? `Missing: ${stagedMismatch.missing.join(', ')}` : '',
      stagedMismatch.extra.length ? `Extra: ${stagedMismatch.extra.join(', ')}` : ''
    ].filter(Boolean).join('\n'));
  }

  const repositoryTree = await client.buildFileTree(
    repositoryRoot,
    { isDirectory: true, prebuilt: false },
    () => {}
  );
  if (repositoryTree.fileList.length !== 0) {
    throw new Error(`Repository-root deployment block failed: Vercel enumerated ${repositoryTree.fileList.length} files.`);
  }

  console.log(
    `Vercel release input verified with CLI ${client.version}: ${staged.size} exact manifest files at ${built.output}; repository-root upload blocked.`
  );
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
