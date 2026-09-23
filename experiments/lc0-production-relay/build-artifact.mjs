import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');
const outputRoot = resolve(repositoryRoot, '.caissa-eae015a-relay');

export const RELAY_FILES = Object.freeze([
  'api/eae011.js',
  'api/cron/eae015a-lc0-cleanup.js',
  'api/_lib/auth.js',
  'experiments/lc0-preview-relay/durable-broker.mjs',
  'experiments/lc0-preview-relay/production-policy.mjs',
  'experiments/lc0-preview-relay/store.mjs',
  'experiments/lc0-production-relay/package.json',
  'experiments/lc0-production-relay/package-lock.json',
  'experiments/lc0-production-relay/vercel.json'
]);

function destination(relativePath) {
  const prefix = 'experiments/lc0-production-relay/';
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : relativePath;
}

export async function buildRelayArtifact({ root = repositoryRoot, output = outputRoot } = {}) {
  const resolvedRoot = resolve(root);
  const resolvedOutput = resolve(output);
  if (resolvedOutput === resolvedRoot || !resolvedOutput.startsWith(`${resolvedRoot}${sep}`))
    throw new Error('RELAY_OUTPUT_MUST_BE_INSIDE_REPOSITORY');
  await rm(resolvedOutput, { recursive: true, force: true });
  const inventory = [];
  for (const sourcePath of RELAY_FILES) {
    const source = resolve(resolvedRoot, sourcePath);
    const targetRelative = destination(sourcePath);
    const target = resolve(resolvedOutput, targetRelative);
    if (!source.startsWith(`${resolvedRoot}${sep}`) || !target.startsWith(`${resolvedOutput}${sep}`))
      throw new Error('RELAY_PATH_ESCAPE');
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target);
    inventory.push(targetRelative.replaceAll('\\', '/'));
  }
  const manifest = {
    schemaVersion: 1,
    purpose: 'EAE-015A isolated Lc0 relay',
    entrypoints: ['api/eae011.js', 'api/cron/eae015a-lc0-cleanup.js'],
    files: inventory.sort()
  };
  await writeFile(join(resolvedOutput, 'artifact-inventory.json'),
    `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { output: resolvedOutput, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildRelayArtifact();
  const config = JSON.parse(await readFile(join(result.output, 'vercel.json'), 'utf8'));
  console.log(JSON.stringify({ output: relative(repositoryRoot, result.output),
    files: result.manifest.files.length, functions: Object.keys(config.functions).sort() }));
}
