import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  DEFAULT_OUTPUT,
  buildPublicRelease,
  loadPublicArtifactManifest
} from './build-public-release.mjs';

const EXPECTED_VERCEL_CLI_VERSION = '59.10.0';
const EXPECTED_VERCEL_PACKAGE_SHA256 = '2305295d019154421b6eb7e88ba4132d20110854a4777f89575841923d071f68';
const EXPECTED_VERCEL_ENUMERATOR = Object.freeze({
  path: 'dist/chunks/chunk-Z44PATWW.js',
  sha256: '5d731ca9bd0cafb0b2a96e1b69e658a51c58cef717c191e3b891b36513be397c'
});
const require = createRequire(import.meta.url);

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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
  const packageBytes = readFileSync(packagePath);
  if (sha256Bytes(packageBytes) !== EXPECTED_VERCEL_PACKAGE_SHA256) {
    throw new Error(`Vercel CLI ${EXPECTED_VERCEL_CLI_VERSION} package metadata failed the release integrity pin.`);
  }
  const packageJson = JSON.parse(packageBytes.toString('utf8'));
  if (packageJson.version !== EXPECTED_VERCEL_CLI_VERSION) {
    throw new Error(
      `Expected Vercel CLI ${EXPECTED_VERCEL_CLI_VERSION}, found ${packageJson.version || '<unknown>'}. Review and update the release verifier before changing versions.`
    );
  }
  const chunkPath = join(vercelRoot, ...EXPECTED_VERCEL_ENUMERATOR.path.split('/'));
  if (!existsSync(chunkPath)) {
    throw new Error(`Pinned Vercel enumerator is missing: ${EXPECTED_VERCEL_ENUMERATOR.path}`);
  }
  const chunkBytes = readFileSync(chunkPath);
  if (sha256Bytes(chunkBytes) !== EXPECTED_VERCEL_ENUMERATOR.sha256) {
    throw new Error(`Pinned Vercel enumerator failed SHA-256 verification: ${EXPECTED_VERCEL_ENUMERATOR.path}`);
  }
  const chunk = require(chunkPath);
  if (typeof chunk.require_dist !== 'function') {
    throw new Error(`Pinned Vercel enumerator is incompatible with CLI ${packageJson.version}.`);
  }
  const client = chunk.require_dist();
  if (typeof client?.buildFileTree !== 'function' || typeof client?.getVercelIgnore !== 'function') {
    throw new Error(`Pinned Vercel enumerator does not expose the required interface for CLI ${packageJson.version}.`);
  }
  return { ...client, version: packageJson.version };
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
