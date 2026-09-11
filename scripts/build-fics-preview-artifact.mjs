import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_GATEWAY_URL = 'wss://fics-gateway.caissa-chess.org/ws';
export const PRODUCTION_CONNECT_SRC = new URL(PRODUCTION_GATEWAY_URL).origin;
const GENERATED_CONFIG = 'js/fics-environment-config.js';
const GENERATED_ROOT = '.caissa-fics-preview';

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function requireExactPreviewOrigin(value) {
  const candidate = String(value || '').trim();
  let url;
  try { url = new URL(candidate); } catch { throw new Error('CAISSA_FICS_PREVIEW_ORIGIN must be one exact HTTPS origin.'); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.origin !== candidate || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || hostname === 'localhost'
      || hostname.includes('*') || hostname.endsWith('.localhost') || hostname.endsWith('.invalid') || isPrivateIpv4(hostname)
      || candidate === 'https://www.caissa-chess.org') {
    throw new Error('CAISSA_FICS_PREVIEW_ORIGIN must be one isolated, public, exact HTTPS origin.');
  }
  return candidate;
}

export function requireExactStagingGateway(value) {
  const candidate = String(value || '').trim();
  let url;
  try { url = new URL(candidate); } catch { throw new Error('CAISSA_FICS_GATEWAY_URL must be one exact WSS /ws URL.'); }
  if (url.protocol !== 'wss:' || url.username || url.password || url.pathname !== '/ws'
      || url.hostname.includes('*') || url.search || url.hash || `${url.origin}/ws` !== candidate
      || candidate === PRODUCTION_GATEWAY_URL) {
    throw new Error('CAISSA_FICS_GATEWAY_URL must be an isolated exact WSS /ws URL, not production.');
  }
  return candidate;
}

function replacePreviewCsp(source, connectSrc, file) {
  const occurrences = source.split(PRODUCTION_CONNECT_SRC).length - 1;
  if (occurrences < 1) throw new Error(`${file} has no production FICS connect-src token to replace.`);
  return source
    .split(PRODUCTION_CONNECT_SRC).join(connectSrc)
    .replaceAll(' ws://127.0.0.1:8787', '');
}

function injectRuntimeConfig(source, file) {
  const marker = /(<script src="js\/fics-client\.js\?v=[^"]+" defer><\/script>)/;
  if (!marker.test(source)) throw new Error(`${file} has no canonical FICS client script marker.`);
  return source.replace(marker, `<script src="${GENERATED_CONFIG}"></script>\n$1`);
}

function assertNoBroadConnectSource(source, file) {
  const directives = [...source.matchAll(/connect-src\s+([^;"]*)/g)].map((match) => match[1]);
  if (!directives.length) throw new Error(`${file} has no connect-src directive.`);
  for (const directive of directives) {
    if (/(^|\s)(?:\*|wss:|https:|\*\.workers\.dev|\*\.vercel\.app)(?:\s|$)/.test(directive)) {
      throw new Error(`${file} contains a broad connect-src token.`);
    }
  }
}

function committedSnapshot(repositoryRoot) {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: repositoryRoot, encoding: 'utf8'
  }).trim();
  if (status) throw new Error('Preview builds require a clean tracked worktree.');
  return {
    files: execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim()
  };
}

export async function buildPreviewArtifact({
  repositoryRoot,
  previewOrigin,
  gatewayUrl,
  files,
  sourceCommit = null
}) {
  const root = resolve(repositoryRoot);
  const generatedRoot = resolve(root, GENERATED_ROOT);
  const output = join(generatedRoot, 'site');
  const outputRelative = relative(root, output);
  if (isAbsolute(outputRelative) || outputRelative.startsWith('..') || !outputRelative.startsWith(`${GENERATED_ROOT}\\`)
      && !outputRelative.startsWith(`${GENERATED_ROOT}/`)) {
    throw new Error('Preview output escaped the fixed generated directory.');
  }

  const exactPreviewOrigin = requireExactPreviewOrigin(previewOrigin);
  const exactGatewayUrl = requireExactStagingGateway(gatewayUrl);
  const connectSrc = new URL(exactGatewayUrl).origin;
  const snapshot = files ? { files, sourceCommit } : committedSnapshot(root);
  const sourceFiles = snapshot.files;

  await rm(generatedRoot, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const file of sourceFiles) {
    const source = resolve(root, file);
    const destination = resolve(output, file);
    const destinationRelative = relative(output, destination);
    if (isAbsolute(destinationRelative) || destinationRelative.startsWith('..')) {
      throw new Error(`Tracked file escaped preview output: ${file}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  for (const file of ['index.html', 'yahoo-classic.html']) {
    const target = join(output, file);
    const source = await readFile(target, 'utf8');
    const rendered = injectRuntimeConfig(replacePreviewCsp(source, connectSrc, file), file);
    assertNoBroadConnectSource(rendered, file);
    await writeFile(target, rendered, 'utf8');
  }

  const vercelTarget = join(output, 'vercel.json');
  const vercelSource = await readFile(vercelTarget, 'utf8');
  const renderedVercel = replacePreviewCsp(vercelSource, connectSrc, 'vercel.json');
  assertNoBroadConnectSource(renderedVercel, 'vercel.json');
  JSON.parse(renderedVercel);
  await writeFile(vercelTarget, renderedVercel, 'utf8');

  const runtimeConfig = `// Generated preview-only config. Do not copy into production source.\n`+
    `window.CAISSA_FICS_GATEWAY_URL = ${JSON.stringify(exactGatewayUrl)};\n`;
  const runtimeTarget = join(output, GENERATED_CONFIG);
  await mkdir(dirname(runtimeTarget), { recursive: true });
  await writeFile(runtimeTarget, runtimeConfig, 'utf8');

  const manifest = Object.freeze({
    schema: 'caissa-fics-preview-artifact@1',
    sourceCommit: snapshot.sourceCommit,
    previewOrigin: exactPreviewOrigin,
    gatewayUrl: exactGatewayUrl,
    connectSrc,
    productionGatewayExcluded: true,
    siteDirectory: output
  });
  await writeFile(join(generatedRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function main() {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
  const manifest = await buildPreviewArtifact({
    repositoryRoot,
    previewOrigin: process.env.CAISSA_FICS_PREVIEW_ORIGIN,
    gatewayUrl: process.env.CAISSA_FICS_GATEWAY_URL
  });
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[preview build blocked] ${error.message}`);
    process.exitCode = 1;
  });
}
