import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const lab = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(lab, '..', '..');
const engine = path.resolve(lab, '../lc0-preview-relay/engine');
const dist = path.join(engine, 'dist');
const template = JSON.parse(await readFile(path.join(engine,
  'release-manifest.template.json'), 'utf8'));
const releaseRoot = `/assets/lc0/${template.releaseId}`;
const releaseDir = path.join(dist, 'assets', 'lc0', template.releaseId);
const relayOrigin = origin(process.env.EAE015A_RELAY_ORIGIN, 'EAE015A_RELAY_ORIGIN');
const mainOrigin = origin(process.env.EAE015A_MAIN_ORIGIN, 'EAE015A_MAIN_ORIGIN');

await rm(dist, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

await Promise.all([
  build({ entryPoints: [path.join(engine, 'client-source.js')],
    outfile: path.join(releaseDir, 'client.js'), bundle: true, format: 'esm',
    platform: 'browser', target: ['es2022'], legalComments: 'none', absWorkingDir: repository,
    nodePaths: [path.join(lab, 'node_modules')] }),
  build({ entryPoints: [path.join(lab, 'src/lc0-worker.js')],
    outfile: path.join(releaseDir, 'lc0-worker.js'), bundle: true, format: 'esm',
    platform: 'browser', target: ['es2022'], legalComments: 'none', absWorkingDir: repository,
    nodePaths: [path.join(lab, 'node_modules')] })
]);

const copies = [
  ['runtime/lc0.js', 'artifacts/runtime/lc0.js'],
  ['runtime/lc0.wasm', 'artifacts/runtime/lc0.wasm'],
  ['runtime/lc0.worker.mjs', 'artifacts/runtime/lc0.worker.mjs'],
  ['ort/ort-wasm-simd-threaded.mjs', 'artifacts/ort/ort-wasm-simd-threaded.mjs'],
  ['ort/ort-wasm-simd-threaded.wasm', 'artifacts/ort/ort-wasm-simd-threaded.wasm'],
  ['network/maia-1100.pb.gz', 'artifacts/network/maia-1100.pb.gz']
];
for (const [source, target] of copies) {
  const destination = path.join(releaseDir, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(engine, 'artifacts', source), destination);
}

const artifactMetadata = {
  'client.js': { path: './client.js', role: 'runtime-client', license: 'GPL-3.0-or-later',
    sourceUrl: 'repository:experiments/lc0-preview-relay/engine/client-source.js' },
  'lc0-worker.js': { path: './lc0-worker.js', role: 'runtime-worker', license: 'GPL-3.0-or-later',
    sourceUrl: 'repository:experiments/lc0-browser-lab/src/lc0-worker.js' },
  'lc0.js': { path: './artifacts/runtime/lc0.js', role: 'lc0-loader', license: 'GPL-3.0-or-later',
    sourceUrl: template.source.repository },
  'lc0.wasm': { path: './artifacts/runtime/lc0.wasm', role: 'lc0-wasm', license: 'GPL-3.0-or-later',
    sourceUrl: template.source.repository },
  'lc0.worker.mjs': { path: './artifacts/runtime/lc0.worker.mjs', role: 'emscripten-pthread-worker',
    license: 'GPL-3.0-or-later', sourceUrl: template.source.repository },
  'ort-wasm-simd-threaded.mjs': { path: './artifacts/ort/ort-wasm-simd-threaded.mjs',
    role: 'onnxruntime-loader', license: 'MIT',
    sourceUrl: template.toolchain.onnxruntimeWeb.sourceUrl },
  'ort-wasm-simd-threaded.wasm': { path: './artifacts/ort/ort-wasm-simd-threaded.wasm',
    role: 'onnxruntime-wasm', license: 'MIT',
    sourceUrl: template.toolchain.onnxruntimeWeb.sourceUrl },
  'maia-1100.pb.gz': { path: './artifacts/network/maia-1100.pb.gz', role: 'maia-network',
    license: 'GPL-3.0', sourceUrl: template.network.sourceUrl }
};

const manifest = { ...template, generatedBy: 'build-production-appliance.mjs', artifacts: {} };
for (const [name, metadata] of Object.entries(artifactMetadata)) {
  const file = path.join(releaseDir, metadata.path.replace(/^\.\//, ''));
  manifest.artifacts[name] = { ...metadata, ...await digest(file), verifyBeforeReady: true };
}
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestFile = path.join(releaseDir, 'release-manifest.json');
await writeFile(manifestFile, manifestText);
const manifestDigest = createHash('sha256').update(manifestText).digest('hex');
const clientBytes = await readFile(path.join(releaseDir, 'client.js'));
const clientSri = `sha256-${createHash('sha256').update(clientBytes).digest('base64')}`;

const index = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="lc0-base-path" content="${releaseRoot}">
  <meta name="lc0-asset-base" content="${releaseRoot}/artifacts">
  <meta name="lc0-relay-origin" content="${relayOrigin}">
  <meta name="lc0-main-origin" content="${mainOrigin}">
  <meta name="lc0-manifest-url" content="${releaseRoot}/release-manifest.json">
  <meta name="lc0-manifest-sha256" content="${manifestDigest}">
  <meta name="lc0-worker-path" content="${releaseRoot}/lc0-worker.js">
  <title>CAISSA isolated Lc0 runtime</title>
  <link rel="stylesheet" href="/appliance.css">
  <script type="module" src="${releaseRoot}/client.js" integrity="${clientSri}" crossorigin="anonymous"></script>
</head>
<body>
  <main>
    <h1>CAISSA isolated Lc0 runtime</h1>
    <p>Dedicated preview appliance. No CAISSA navigation, login, payments, or unrelated application surfaces.</p>
    <p id="environment"></p>
    <button id="disconnect" disabled>Disconnect engine stream</button>
    <button id="reconnect" disabled>Reconnect engine stream</button>
    <p id="status" role="status">Waiting for a one-use claim.</p>
    <pre id="log" aria-live="polite"></pre>
  </main>
</body>
</html>\n`;
await writeFile(path.join(dist, 'index.html'), index);
await writeFile(path.join(dist, 'appliance.css'),
  'body{font:16px system-ui;max-width:820px;margin:3rem auto;padding:0 1rem}button{margin:.3rem;padding:.6rem}pre{white-space:pre-wrap;word-break:break-word;background:#eee;padding:1rem;min-height:8rem}\n');
await writeFile(path.join(dist, 'health.json'), `${JSON.stringify({ ok: true,
  releaseId: template.releaseId, manifestSha256: manifestDigest })}\n`);

const isolationHeaders = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' ${relayOrigin}; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }
];
const vercel = { cleanUrls: true, headers: [
  { source: '/(.*)', headers: isolationHeaders },
  { source: '/', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
  { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
  { source: `/assets/lc0/${template.releaseId}/:path*`, headers: [
    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }
  ] }
] };
await writeFile(path.join(dist, 'vercel.json'), `${JSON.stringify(vercel, null, 2)}\n`);
// Vercel CLI otherwise inherits the repository's broad dist/ ignore rule and
// silently uploads only the shell. This deployment allowlist is generated with
// the appliance so every manifest-listed asset is present on the origin.
await writeFile(path.join(dist, '.vercelignore'), ['.vercel', '.env*', ''].join('\n'));
console.log(JSON.stringify({ releaseId: template.releaseId, releaseRoot, relayOrigin,
  mainOrigin, manifestSha256: manifestDigest, clientSri, artifacts: manifest.artifacts }, null, 2));

function origin(value, name) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.pathname !== '/')
    throw new Error(`${name}_INVALID`);
  return url.origin;
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { bytes: (await stat(file)).size, sha256: hash.digest('hex') };
}
