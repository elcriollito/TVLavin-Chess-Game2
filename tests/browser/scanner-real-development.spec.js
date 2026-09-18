import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { auditInventory } from '../../tools/scanner-real-development/core.mjs';
import { createDevelopmentAnnotatorServer } from '../../tools/scanner-real-development/serve.mjs';

let folder, sourceRoot, outputPath, running, sourceHashes;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const emptyProtected = () => ({ sources: [], protectedIds: new Set(), protectedFinalHashes: new Set() });

test.beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'caissa-real-dev-browser-'));
  sourceRoot = join(folder, 'sources'); await mkdir(sourceRoot);
  outputPath = join(folder, 'annotations', 'real-development-v0.1.annotations.json');
  const samples = [];
  sourceHashes = [];
  for (let index = 0; index < 2; index++) {
    const pixels = Buffer.alloc(512 * 512 * 4);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const offset = (y * 512 + x) * 4;
      const shade = (Math.floor(x / 64) + Math.floor(y / 64) + index) % 2 ? 155 : 220;
      pixels[offset] = shade; pixels[offset + 1] = shade - 15; pixels[offset + 2] = shade - 25;
      pixels[offset + 3] = 255;
    }
    const bytes = await sharp(pixels, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    const name = `fixture-${index + 1}.png`;
    await writeFile(join(sourceRoot, name), bytes);
    const digest = sha(bytes); sourceHashes.push(digest);
    samples.push({ sampleId: `dev-real-v0.1-${String(index + 1).padStart(3, '0')}`,
      sourceFilename: name, extension: '.png', sourceBytes: bytes.length, sourceWidth: 512,
      sourceHeight: 512, sourceSha256: digest,
      fingerprint: { fullDhash64: index ? 'FFFFFFFFFFFFFFFF' : '0000000000000000',
        centerDhash64: index ? 'FFFFFFFFFFFFFFFF' : '0000000000000000' } });
  }
  running = await createDevelopmentAnnotatorServer({ port: 0, sourceRoot, outputPath,
    manifest: auditInventory({ samples, unsupported: [] }, emptyProtected()),
    protectedCatalog: emptyProtected() });
});

test.afterEach(async () => {
  await running?.close();
  for (let index = 0; index < sourceHashes.length; index++) {
    expect(sha(await readFile(join(sourceRoot, `fixture-${index + 1}.png`)))).toBe(sourceHashes[index]);
  }
  expect(resolve(folder).startsWith(resolve(tmpdir()))).toBe(true);
  await rm(folder, { recursive: true, force: true });
  running = undefined;
});

test('local 2D cohort autosaves corners, resumes labels, and indexes only verified split truth', async ({ page }) => {
  const origins = [];
  page.on('request', (request) => origins.push(new URL(request.url()).origin));
  await page.goto(running.url);
  await expect(page.locator('#progress')).toContainText('0 / 2 human-verified');
  await expect(page.locator('#source-image')).toHaveJSProperty('naturalWidth', 512);
  await expect(page.locator('#piece-panel')).toBeHidden();
  for (const [x, y] of [[.08, .08], [.92, .08], [.92, .92], [.08, .92]]) {
    const rect = await page.locator('#source-image').boundingBox();
    await page.locator('#source-image').click({ position: { x: rect.width * x, y: rect.height * y } });
  }
  await expect(page.locator('#corner-overlay circle')).toHaveCount(4);
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.reload();
  await expect(page.locator('#corner-overlay circle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Verify corners as Alexander' }).click();
  await expect(page.locator('#piece-panel')).toBeVisible();
  await expect(page.locator('#board-image')).toHaveJSProperty('naturalWidth', 512);
  await expect(page.locator('#board-grid button')).toHaveCount(64);
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.getByRole('button', { name: 'Select White King' }).click();
  await page.locator('#board-grid button').nth(60).click();
  await expect(page.locator('#placement-fen')).toHaveText('8/8/8/8/8/8/8/4K3');
  await page.locator('#split').selectOption('train-development');
  await page.locator('#subtype-tags input[value="plain-digital"]').check();
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.reload();
  await expect(page.locator('#placement-fen')).toHaveText('8/8/8/8/8/8/8/4K3');
  await expect(page.locator('#split')).toHaveValue('train-development');
  await page.getByRole('button', { name: 'Review 64 labels' }).click();
  await page.locator('#all64-reviewed').check();
  await page.getByRole('button', { name: 'Save human-verified truth' }).click();
  await expect(page.locator('#progress')).toContainText('1 / 2 human-verified');
  const truth = JSON.parse(await readFile(outputPath));
  expect(truth.samples[0].status).toBe('human-verified');
  expect(truth.samples[0].labels).toHaveLength(64);
  expect(truth.samples[0].orientation).toBe('white-at-bottom');
  expect(truth.samples[0].metadata.subtypeTags).toContain('plain-digital');
  const indexes = await (await page.request.get(`${running.url}/api/indexes`)).json();
  expect(indexes.empty).toHaveLength(63);
  expect(indexes.occupied).toHaveLength(1);
  expect(indexes.kingContrast).toHaveLength(64);
  expect(origins.every((origin) => origin === new URL(running.url).origin)).toBe(true);
});

test('writes reject cross-origin calls and source bytes never enter public Scanner', async ({ page }) => {
  await page.goto(running.url);
  const wrongOrigin = await page.request.post(`${running.url}/api/save`, { headers: {
    Origin: 'https://example.invalid', 'Content-Type': 'application/json',
    'X-Caissa-Local-Tool': 'real-development-annotator'
  }, data: { record: {} } });
  expect(wrongOrigin.status()).toBe(403);
  expect((await page.request.post(`${running.url}/api/upload`, { data: 'image-bytes' })).status()).toBe(405);
  const source = await page.request.get(`${running.url}/api/source/dev-real-v0.1-001`);
  expect(source.status()).toBe(200);
  expect(sha(await source.body())).toBe(sourceHashes[0]);
});
