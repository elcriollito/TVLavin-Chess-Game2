import { readdir, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binaryRoot = resolve(repository, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6');
const supported = new Set(['darwin/arm64', 'linux/arm64', 'linux/x64', 'win32/arm64', 'win32/x64']);
const host = `${process.platform}/${process.arch}`;
if (!supported.has(host)) throw new Error(`UNSUPPORTED_ONNXRUNTIME_HOST:${host}`);

const canonicalRepository = await realpath(repository);
const canonicalRoot = await realpath(binaryRoot);
const expectedPrefix = `${resolve(canonicalRepository, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6')}${sep}`;
if (`${canonicalRoot}${sep}` !== expectedPrefix) throw new Error('ONNXRUNTIME_PRUNE_ROOT_INVALID');

// Linux x64 is the Vercel target. Retain the current host as well so local
// development and parity certification keep working on Windows or macOS.
const retained = new Set(['linux/x64', host]);
let removed = 0;
for (const platformEntry of await readdir(canonicalRoot, { withFileTypes: true })) {
  if (!platformEntry.isDirectory()) continue;
  const platformDirectory = join(canonicalRoot, platformEntry.name);
  for (const architectureEntry of await readdir(platformDirectory, { withFileTypes: true })) {
    if (!architectureEntry.isDirectory()) continue;
    const target = resolve(platformDirectory, architectureEntry.name);
    const key = `${platformEntry.name}/${architectureEntry.name}`;
    const scoped = relative(canonicalRoot, target);
    if (!scoped || scoped.startsWith('..') || resolve(canonicalRoot, scoped) !== target) {
      throw new Error('ONNXRUNTIME_PRUNE_TARGET_INVALID');
    }
    if (!retained.has(key)) {
      await rm(target, { recursive: true, force: false });
      removed += 1;
    }
  }
}
console.log(`onnxruntime-node binaries: retained ${[...retained].sort().join(', ')}; removed ${removed} platform directories`);
