import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { createPieceAnnotatorServer } from '../../tools/scanner-piece-label-annotator/serve.mjs';

let running;
let folder;
let outputPath;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();

test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'caissa-piece-browser-'));
  outputPath = join(folder, 'truth', 'piece-labels.json');
  const samples = [];
  for (const [index, name] of ['fixture-a.png', 'fixture-b.png'].entries()) {
    const pixels = Buffer.alloc(512 * 512 * 4);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const offset = (y * 512 + x) * 4;
      const value = (Math.floor(x / 64) + Math.floor(y / 64) + index) % 2 ? 165 : 232;
      pixels[offset] = value;
      pixels[offset + 1] = value - 22;
      pixels[offset + 2] = value - 41;
      pixels[offset + 3] = 255;
    }
    const image = await sharp(pixels, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    const sourcePath = join(folder, name);
    await writeFile(sourcePath, image);
    samples.push({ sampleId: `fixture-${index + 1}`, sourceFilename: name, sourceSha256: sha(image),
      sourcePath, sourceWidth: 512, sourceHeight: 512, cornerManifestSha256: 'C'.repeat(64),
      corners: [[0, 0], [512, 0], [512, 512], [0, 512]], cohort: 'test', sourceCategory: 'digital-2d',
      pieceSetFamily: 'test-only', pieceSetStyle: 'outline', boardThemeFamily: 'test-checker',
      difficultyTags: [], sourcePlatform: null, referenceOutcome: null, referencePredictedFen: null,
      knownWrongSquares: [], classifierFailureTypes: [],
      trustedFenPlacement: index === 1 ? '8/8/8/8/8/8/8/4K3' : null });
  }
  const catalog = { samples, v01CornerManifestSha256: 'C'.repeat(64), v03CornerManifestSha256: 'D'.repeat(64),
    duplicateAliases: [{ sampleId: 'fixture-alias', canonicalSampleId: 'fixture-1', sourceSha256: samples[0].sourceSha256 }],
    outOfScope: ['fixture-3d'] };
  running = await createPieceAnnotatorServer({ port: 0, outputPath, catalog });
});

test.afterAll(async () => {
  await running?.close();
  if (folder) {
    expect(resolve(folder).startsWith(resolve(tmpdir()))).toBe(true);
    await rm(folder, { recursive: true, force: true });
  }
});

test('local tool loads a true 512 board with exactly 64 equal, gapless cells and no external requests', async ({ page }) => {
  const destinations = [];
  page.on('request', (request) => destinations.push(new URL(request.url()).origin));
  await page.goto(running.url);
  await expect(page.locator('#progress')).toContainText('0 / 2 verified');
  await expect(page.locator('#board-image')).toHaveJSProperty('naturalWidth', 512);
  await expect(page.locator('.board-square')).toHaveCount(64);
  const geometry = await page.locator('#board-grid').evaluate((grid) => {
    const rect = grid.getBoundingClientRect();
    const cells = [...grid.children].map((element) => element.getBoundingClientRect());
    return { width: rect.width, height: rect.height, cells: cells.map((cell) => ({ x: cell.left - rect.left,
      y: cell.top - rect.top, width: cell.width, height: cell.height })) };
  });
  expect(geometry.width).toBe(geometry.height);
  expect(geometry.cells).toHaveLength(64);
  const cell = geometry.width / 8;
  geometry.cells.forEach((item, index) => {
    expect(item.width).toBeCloseTo(cell, 3);
    expect(item.height).toBeCloseTo(cell, 3);
    expect(item.x).toBeCloseTo(index % 8 * cell, 3);
    expect(item.y).toBeCloseTo(Math.floor(index / 8) * cell, 3);
  });
  expect(destinations.every((origin) => origin === new URL(running.url).origin)).toBe(true);
  expect(await page.locator('#output-path').textContent()).toContain('piece-labels.json');
  await expect(page.locator('#prefill')).toBeDisabled();
  await expect(page.locator('#trusted-fen')).toHaveAttribute('readonly', '');
});

test('repeated placement, Empty clearing, and orientation remapping preserve visual locations', async ({ page }) => {
  await page.goto(running.url);
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.getByRole('button', { name: 'Select Black Pawn' }).click();
  for (const index of [0, 1, 2]) await page.locator('.board-square').nth(index).click();
  await expect(page.locator('#placement-fen')).toHaveText('ppp5/8/8/8/8/8/8/8');
  await page.getByRole('button', { name: 'Empty / Clear', exact: true }).click();
  await page.locator('.board-square').nth(1).click();
  await expect(page.locator('#placement-fen')).toHaveText('p1p5/8/8/8/8/8/8/8');
  await page.getByRole('button', { name: 'Black at bottom' }).click();
  await expect(page.locator('#orientation-status')).toHaveText('Black at bottom / flipped');
  await expect(page.locator('.board-square').first()).toHaveAttribute('aria-label', /h1: Black Pawn/);
  await expect(page.locator('#placement-fen')).toHaveText('8/8/8/8/8/8/8/5p1p');
  await expect(page.locator('.board-square').first().locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Labels', exact: true }).click();
  await expect(page.locator('#board-stage')).toHaveClass(/mode-labels/);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(page.locator('#board-stage')).toHaveClass(/mode-image/);
});

test('draft save, reload, human review, verified save, incomplete filter, and edit/re-save work from the file manifest', async ({ page }) => {
  await page.goto(running.url);
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.getByRole('button', { name: 'Select White King' }).click();
  await page.locator('.board-square').nth(60).click();
  await expect(page.locator('#placement-fen')).toHaveText('8/8/8/8/8/8/8/4K3');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('#message')).toContainText('Draft saved locally');
  await page.reload();
  await expect(page.locator('#message')).toContainText('Draft restored');
  await expect(page.locator('#placement-fen')).toHaveText('8/8/8/8/8/8/8/4K3');
  await page.getByRole('button', { name: 'Review labels' }).click();
  await expect(page.getByRole('button', { name: 'Confirm verified as Alexander' })).toBeDisabled();
  await page.locator('#review-confirm').check();
  await page.getByRole('button', { name: 'Confirm verified as Alexander' }).click();
  await expect(page.locator('#message')).toContainText('Human-verified truth saved locally');
  await expect(page.locator('#progress')).toContainText('1 / 2 verified');
  let output = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(output.samples).toHaveLength(1);
  expect(output.samples[0].labels[60]).toBe('K');
  expect(output.samples[0].annotation.status).toBe('verified');
  expect(output.samples[0].squareOrder).toBe('a8-to-h1');
  expect(JSON.stringify(output)).not.toContain('updatedAt');
  await page.reload();
  await expect(page.locator('#message')).toContainText('Verified record loaded');
  await page.locator('#incomplete-only').check();
  await expect(page.locator('#sample-select option')).toHaveCount(1);
  await expect(page.locator('#sample-select')).toHaveValue('fixture-2');
  await page.locator('#incomplete-only').uncheck();
  await page.locator('#sample-select').selectOption('fixture-1');
  await page.getByRole('button', { name: 'Empty / Clear', exact: true }).click();
  await page.locator('.board-square').nth(60).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('#message')).toContainText('Draft saved locally');
  output = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(output.samples[0].annotation.status).toBe('draft');
  expect(output.samples[0].labels[60]).toBe('empty');
});

test('invalid verification and cross-origin or malformed writes are blocked; no image upload endpoint exists', async ({ page }) => {
  await page.goto(running.url);
  await page.locator('#sample-select').selectOption('fixture-2');
  await page.getByRole('button', { name: 'Review labels' }).click();
  await page.locator('#review-confirm').check();
  await expect(page.getByRole('button', { name: 'Confirm verified as Alexander' })).toBeDisabled();
  const invalid = await page.evaluate(async () => {
    const response = await fetch('/api/save', { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Caissa-Local-Tool': 'piece-label-annotator'
    }, body: JSON.stringify({ sampleId: 'fixture-2', labels: Array(63).fill('empty'),
      boardOrientation: 'white-at-bottom', status: 'verified', source: 'manual', humanVerifiedBy: 'Alexander',
      confirmation: 'I reviewed all 64 squares' }) });
    return response.status;
  });
  expect(invalid).toBe(400);
  const crossOrigin = await page.request.post(`${running.url}/api/save`, { headers: {
    Origin: 'https://not-caissa.example', 'X-Caissa-Local-Tool': 'piece-label-annotator',
    'Content-Type': 'application/json'
  }, data: { sampleId: 'fixture-2' } });
  expect(crossOrigin.status()).toBe(403);
  const upload = await page.request.post(`${running.url}/api/upload`, { data: 'image-bytes' });
  expect(upload.status()).toBe(405);
});

test('corpus-bound trusted FEN can prefill only an unverified draft until all squares are reviewed', async ({ page }) => {
  await page.goto(running.url);
  await page.locator('#sample-select').selectOption('fixture-2');
  await expect(page.locator('#trusted-fen')).toHaveValue('8/8/8/8/8/8/8/4K3');
  await expect(page.locator('#prefill')).toBeEnabled();
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.locator('#prefill').click();
  await expect(page.locator('#placement-fen')).toHaveText('8/8/8/8/8/8/8/4K3');
  await page.locator('#save-draft').click();
  await expect(page.locator('#message')).toContainText('Draft saved locally');
  let output = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(output.samples.find((sample) => sample.sampleId === 'fixture-2').annotation.source).toBe('fen-prefill-unreviewed');
  await page.locator('#review').click();
  await expect(page.locator('#confirm')).toBeDisabled();
  await page.locator('#review-confirm').check();
  await page.locator('#confirm').click();
  await expect(page.locator('#message')).toContainText('Human-verified truth saved locally');
  output = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(output.samples.find((sample) => sample.sampleId === 'fixture-2').annotation.source).toBe('fen-prefill-reviewed');
});

test('main CAISSA server returns 404 for the dev-only piece annotator path', async ({ request }) => {
  const response = await request.get('/tools/scanner-piece-label-annotator/index.html');
  expect(response.status()).toBe(404);
});
