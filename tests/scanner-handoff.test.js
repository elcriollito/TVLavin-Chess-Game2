import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {
  SCANNER_PRODUCTION_URL,
  createScannerHandoff,
  getScannerHandoffUrl,
  scannerHandoffHeaders
} from '../api/_lib/scanner-handoff.js';

const PREVIEW_URL = 'https://tv-lavin-chess-game2-env-staging-elcriollitos-projects.vercel.app/scanner?_vercel_share=PreviewToken_1234567890';
const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';

async function decodeQr(url) {
  const png = await QRCode.toBuffer(url, { type: 'png', width: 208, margin: 2, errorCorrectionLevel: 'M' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)?.data || null;
}

test('production handoff is canonical even when a preview URL is configured', () => {
  const env = { VERCEL_ENV: 'production', CAISSA_SCANNER_PREVIEW_HANDOFF_URL: PREVIEW_URL };
  assert.equal(getScannerHandoffUrl(env), SCANNER_PRODUCTION_URL);
  assert.deepEqual(createScannerHandoff(env), {
    schemaVersion: 'caissa-scanner-handoff/1', environment: 'production', url: SCANNER_PRODUCTION_URL
  });
});

test('preview handoff requires one protected Vercel Scanner share URL', () => {
  const env = {
    VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging', CAISSA_SCANNER_PUBLIC_STAGE: 'public-beta',
    CAISSA_SCANNER_PREVIEW_HANDOFF_URL: PREVIEW_URL, VERCEL_GIT_COMMIT_SHA: SOURCE_SHA,
    VERCEL_URL: 'tv-lavin-chess-game2-example-elcriollitos-projects.vercel.app'
  };
  const handoff = createScannerHandoff(env);
  assert.equal(handoff.url, PREVIEW_URL);
  assert.deepEqual(handoff.buildIdentity, {
    sourceSha: SOURCE_SHA, publicStage: 'public-beta', targetEnvironment: 'staging',
    deploymentHost: 'tv-lavin-chess-game2-example-elcriollitos-projects.vercel.app'
  });
  assert.equal(scannerHandoffHeaders(handoff)['X-Caissa-Scanner-Build'], SOURCE_SHA);
  for (const invalid of [
    'https://www.caissa-chess.org/scanner?_vercel_share=PreviewToken_1234567890',
    'https://example.vercel.app/not-scanner?_vercel_share=PreviewToken_1234567890',
    'https://example.vercel.app/scanner',
    'https://example.vercel.app/scanner?_vercel_share=short',
    'https://example.vercel.app/scanner?_vercel_share=PreviewToken_1234567890&next=https://evil.example'
  ]) {
    assert.throws(() => getScannerHandoffUrl({ VERCEL_ENV: 'preview', CAISSA_SCANNER_PREVIEW_HANDOFF_URL: invalid }),
      /SCANNER_PREVIEW_HANDOFF_URL_INVALID/);
  }
});

test('production and protected-preview QR payloads decode to their exact handoff URLs', async () => {
  assert.equal(await decodeQr(SCANNER_PRODUCTION_URL), SCANNER_PRODUCTION_URL);
  assert.equal(await decodeQr(PREVIEW_URL), PREVIEW_URL);
});
