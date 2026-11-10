import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  DEFAULT_OUTPUT,
  buildPublicRelease,
  loadPublicArtifactManifest,
  renderVercelIgnore
} from './build-public-release.mjs';

const EXPECTED_VERCEL_CLI_VERSION = '59.10.0';
const EXPECTED_VERCEL_PACKAGE_SHA256 = '2305295d019154421b6eb7e88ba4132d20110854a4777f89575841923d071f68';

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateVercelExecutable(vercelRoot, packageJson) {
  const entryRelative = packageJson.bin?.vercel;
  if (typeof entryRelative !== 'string' || !entryRelative) {
    throw new Error(`Vercel CLI ${EXPECTED_VERCEL_CLI_VERSION} has no declared executable entrypoint.`);
  }
  const entryPath = join(vercelRoot, ...entryRelative.replace(/^\.\//, '').split('/'));
  const entryStats = lstatSync(entryPath);
  if (!entryStats.isFile() || entryStats.isSymbolicLink()) {
    throw new Error(`Vercel CLI ${EXPECTED_VERCEL_CLI_VERSION} executable entrypoint is not a regular file.`);
  }
  assertContained(realpathSync(vercelRoot), realpathSync(entryPath));
  return entryPath;
}

export function inspectVercelCliPackage() {
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
  const entryPath = validateVercelExecutable(vercelRoot, packageJson);
  return { version: packageJson.version, entryPath };
}

function assertContained(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === '') return;
  if (isAbsolute(pathFromRoot) || pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Release staging path resolves outside the audited root: ${candidate}`);
  }
}

export function enumerateRegularFiles(root) {
  const absoluteRoot = resolve(root);
  const realRoot = realpathSync(absoluteRoot);
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = join(directory, entry.name);
      const stats = lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Release staging contains a symbolic link or junction: ${relative(absoluteRoot, absolutePath)}`);
      }
      const realPath = realpathSync(absolutePath);
      assertContained(realRoot, realPath);
      if (stats.isDirectory()) {
        visit(absolutePath);
      } else if (stats.isFile()) {
        files.push(relative(absoluteRoot, absolutePath).split(sep).join('/'));
      } else {
        throw new Error(`Release staging contains an unsupported filesystem entry: ${relative(absoluteRoot, absolutePath)}`);
      }
    }
  }

  visit(absoluteRoot);
  return files;
}

export function compareExactSets(expected, actual) {
  return {
    missing: [...expected].filter(path => !actual.has(path)),
    extra: [...actual].filter(path => !expected.has(path))
  };
}

export function assertNoRepositoryVercelState(repositoryRoot) {
  if (existsSync(join(repositoryRoot, '.vercel'))) {
    throw new Error('Repository-root .vercel state is prohibited because Vercel can include it outside normal ignore filtering.');
  }
}

async function main() {
  const repositoryRoot = resolve('.');
  const manifest = loadPublicArtifactManifest({ cwd: repositoryRoot });
  const expected = new Set(manifest.files.map(item => item.path));
  const cliPackage = inspectVercelCliPackage();
  assertNoRepositoryVercelState(repositoryRoot);
  const built = await buildPublicRelease({ cwd: repositoryRoot, output: DEFAULT_OUTPUT });

  if (existsSync(join(built.output, '.vercelignore'))) {
    throw new Error('The audited staging tree must not contain the repository-root deployment block.');
  }

  const staged = new Set(enumerateRegularFiles(built.output));
  const stagedMismatch = compareExactSets(expected, staged);
  if (stagedMismatch.missing.length || stagedMismatch.extra.length) {
    throw new Error([
      `Release staging inventory mismatch for Vercel CLI package ${cliPackage.version}.`,
      stagedMismatch.missing.length ? `Missing: ${stagedMismatch.missing.join(', ')}` : '',
      stagedMismatch.extra.length ? `Extra: ${stagedMismatch.extra.join(', ')}` : ''
    ].filter(Boolean).join('\n'));
  }

  const rootIgnorePath = join(repositoryRoot, '.vercelignore');
  if (!existsSync(rootIgnorePath) || readFileSync(rootIgnorePath, 'utf8') !== renderVercelIgnore(manifest)) {
    throw new Error('Repository-root default-deny allowlist does not match the reviewed public manifest.');
  }

  console.log(
    `Release staging verified for Vercel CLI package ${cliPackage.version} without executing installed CLI internals: ${staged.size} exact manifest files at ${built.output}; repository-root upload is manifest-allowlisted.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
