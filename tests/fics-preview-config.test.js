import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  PRODUCTION_CONNECT_SRC,
  PRODUCTION_GATEWAY_URL,
  buildPreviewArtifact,
  requireExactPreviewOrigin,
  requireExactStagingGateway
} from '../scripts/build-fics-preview-artifact.mjs';

const PREVIEW_ORIGIN = 'https://fics-rc-preview.vercel.app';
const STAGING_GATEWAY = 'wss://caissa-fics-gateway-poc-staging.example.workers.dev/ws';
const STAGING_CONNECT_SRC = new URL(STAGING_GATEWAY).origin;
const csp = `default-src 'self'; connect-src 'self' ws://127.0.0.1:8787 ${PRODUCTION_CONNECT_SRC}; object-src 'none'`;
const html = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}">\n`+
  '<script src="js/fics-client.js?v=1.7.0" defer></script>';

test('preview origin accepts one exact public HTTPS alias', () => {
  assert.equal(requireExactPreviewOrigin(PREVIEW_ORIGIN), PREVIEW_ORIGIN);
});

test('preview origin rejects production, local, LAN, wildcard, path, and insecure values', () => {
  for (const value of [
    '', '*', 'https://*.vercel.app', 'https://www.caissa-chess.org', 'http://fics-rc-preview.vercel.app',
    'https://fics-rc-preview.vercel.app/path', 'http://localhost:3000',
    'http://127.0.0.1:3000', 'http://192.168.1.5:8000', 'https://placeholder.invalid'
  ]) assert.throws(() => requireExactPreviewOrigin(value), undefined, value);
});

test('staging gateway accepts one exact WSS /ws URL and rejects production or broad values', () => {
  assert.equal(requireExactStagingGateway(STAGING_GATEWAY), STAGING_GATEWAY);
  for (const value of [
    '', 'wss:', 'https://staging.example.workers.dev/ws',
    'wss://*.workers.dev/ws', 'wss://staging.example.workers.dev/other',
    'wss://staging.example.workers.dev/ws?token=1', PRODUCTION_GATEWAY_URL
  ]) assert.throws(() => requireExactStagingGateway(value), undefined, value);
});

test('preview artifact derives runtime and every CSP target from the same staging gateway', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caissa-fics-preview-'));
  const files = ['index.html', 'yahoo-classic.html', 'vercel.json'];
  try {
    await writeFile(join(root, 'index.html'), html);
    await writeFile(join(root, 'yahoo-classic.html'), html);
    await writeFile(join(root, 'vercel.json'), JSON.stringify({ headers: [{ headers: [{
      key: 'Content-Security-Policy', value: csp
    }] }] }));
    const originals = await Promise.all(files.map((file) => readFile(join(root, file), 'utf8')));

    const manifest = await buildPreviewArtifact({
      repositoryRoot: root, previewOrigin: PREVIEW_ORIGIN, gatewayUrl: STAGING_GATEWAY,
      files, sourceCommit: 'fixture-commit'
    });
    assert.equal(manifest.sourceCommit, 'fixture-commit');
    assert.equal(manifest.gatewayUrl, STAGING_GATEWAY);
    assert.equal(manifest.connectSrc, STAGING_CONNECT_SRC);
    assert.equal(manifest.previewOrigin, PREVIEW_ORIGIN);

    const output = join(root, '.caissa-fics-preview', 'site');
    const rendered = await Promise.all(files.map((file) => readFile(join(output, file), 'utf8')));
    const runtime = await readFile(join(output, 'js', 'fics-environment-config.js'), 'utf8');
    for (const source of rendered) {
      assert.match(source, new RegExp(STAGING_CONNECT_SRC.replaceAll('.', '\\.')));
      assert.doesNotMatch(source, new RegExp(PRODUCTION_CONNECT_SRC.replaceAll('.', '\\.')));
      assert.doesNotMatch(source, /ws:\/\/127\.0\.0\.1:8787|\*\.workers\.dev|\*\.vercel\.app/);
    }
    assert.match(runtime, new RegExp(STAGING_GATEWAY.replaceAll('.', '\\.')));
    assert.match(rendered[0], /fics-environment-config\.js[\s\S]*fics-client\.js/);
    assert.match(rendered[1], /fics-environment-config\.js[\s\S]*fics-client\.js/);

    const after = await Promise.all(files.map((file) => readFile(join(root, file), 'utf8')));
    assert.deepEqual(after, originals, 'production source files must remain byte-unchanged');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preview build fails closed when a canonical CSP or client marker is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'caissa-fics-preview-invalid-'));
  try {
    await mkdir(join(root, 'js'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html>');
    await writeFile(join(root, 'yahoo-classic.html'), html);
    await writeFile(join(root, 'vercel.json'), JSON.stringify({ csp }));
    await assert.rejects(() => buildPreviewArtifact({
      repositoryRoot: root,
      previewOrigin: PREVIEW_ORIGIN,
      gatewayUrl: STAGING_GATEWAY,
      files: ['index.html', 'yahoo-classic.html', 'vercel.json']
    }), /no production FICS connect-src token|no canonical FICS client script marker/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
