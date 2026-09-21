import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'lab-manifest.json'), 'utf8'));
const runtimeArg = process.argv.indexOf('--runtime-dir');
const runtimeDir = runtimeArg >= 0 ? path.resolve(process.argv[runtimeArg + 1]) : null;
if (!runtimeDir) throw new Error('Usage: node scripts/prepare-assets.mjs --runtime-dir <lc0 build directory>');

const artifactRoot = path.join(root, '.artifacts');
const runtimeTarget = path.join(artifactRoot, 'runtime');
const ortTarget = path.join(artifactRoot, 'ort');
const networkTarget = path.join(artifactRoot, 'network');
await Promise.all([runtimeTarget, ortTarget, networkTarget].map(directory => mkdir(directory, { recursive: true })));

for (const name of ['lc0.js', 'lc0.wasm', 'lc0.worker.mjs']) {
  await copyFile(path.join(runtimeDir, name), path.join(runtimeTarget, name));
}

const ortSource = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  await copyFile(path.join(ortSource, name), path.join(ortTarget, name));
}

const networkPath = path.join(networkTarget, 'maia-1100.pb.gz');
let validNetwork = false;
try {
  const existing = await digest(networkPath);
  validNetwork = existing.sha256 === manifest.network.sha256 && existing.bytes === manifest.network.bytes;
} catch {}
if (!validNetwork) {
  const response = await fetch(manifest.network.sourceUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Network download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== manifest.network.sha256 || bytes.byteLength !== manifest.network.bytes) {
    throw new Error(`Network integrity failure: ${actual}/${bytes.byteLength}`);
  }
  await writeFile(networkPath, bytes);
}

const stagedFiles = {
  lc0Js: path.join(runtimeTarget, 'lc0.js'),
  lc0Wasm: path.join(runtimeTarget, 'lc0.wasm'),
  lc0PthreadWorker: path.join(runtimeTarget, 'lc0.worker.mjs'),
  ortWasm: path.join(ortTarget, 'ort-wasm-simd-threaded.wasm'),
  ortModule: path.join(ortTarget, 'ort-wasm-simd-threaded.mjs'),
  network: networkPath
};
const evidence = { generatedAt: new Date().toISOString(), files: {} };
for (const [label, file] of Object.entries(stagedFiles)) {
  const actual = await digest(file);
  const expected = manifest.artifacts[path.basename(file)];
  if (!expected || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(`Artifact integrity failure for ${path.basename(file)}: ${actual.sha256}/${actual.bytes}`);
  }
  evidence.files[label] = actual;
}
await writeFile(path.join(artifactRoot, 'manifest.actual.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { path: path.relative(root, file).replaceAll('\\', '/'), bytes: (await stat(file)).size, sha256: hash.digest('hex') };
}
