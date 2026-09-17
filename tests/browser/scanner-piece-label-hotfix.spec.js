import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { createPieceAnnotatorServer } from '../../tools/scanner-piece-label-annotator/serve.mjs';

test.describe.configure({ mode: 'serial' });
let folder;
let outputPath;
let catalog;
let running;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const sampleId = (index) => `board-${String(index).padStart(2, '0')}`;

test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'caissa-piece-reliability-browser-'));
  outputPath = join(folder, 'truth', 'piece-labels-v0.1.json');
  const samples = [];
  for (let index = 1; index <= 32; index++) {
    const sourcePath = join(folder, `${sampleId(index)}.png`);
    const pixels = Buffer.alloc(128 * 128 * 4);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const offset = (y * 128 + x) * 4;
      const shade = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 110 : 210;
      pixels[offset] = shade; pixels[offset + 1] = shade - index; pixels[offset + 2] = shade - 35;
      pixels[offset + 3] = 255;
    }
    const bytes = await sharp(pixels, { raw: { width: 128, height: 128, channels: 4 } }).png().toBuffer();
    await writeFile(sourcePath, bytes);
    samples.push({ sampleId: sampleId(index), sourceFilename: `${sampleId(index)}.png`, sourcePath,
      sourceSha256: sha(bytes), sourceWidth: 128, sourceHeight: 128, cornerManifestSha256: 'C'.repeat(64),
      corners: [[0, 0], [128, 0], [128, 128], [0, 128]], cohort: 'test', sourceCategory: 'digital-2d',
      pieceSetFamily: 'test-only', pieceSetStyle: 'outline', boardThemeFamily: 'test-checker',
      difficultyTags: [], sourcePlatform: null, referenceOutcome: null, referencePredictedFen: null,
      knownWrongSquares: [], classifierFailureTypes: [], trustedFenPlacement: null });
  }
  catalog = { samples, v01CornerManifestSha256: 'C'.repeat(64), v03CornerManifestSha256: 'D'.repeat(64),
    duplicateAliases: [], outOfScope: [] };
  running = await createPieceAnnotatorServer({ port: 0, outputPath, catalog });
});

test.afterAll(async () => {
  await running?.close();
  for (const sample of catalog?.samples || []) {
    expect(sha(await readFile(sample.sourcePath))).toBe(sample.sourceSha256);
  }
  if (folder) { expect(resolve(folder).startsWith(resolve(tmpdir()))).toBe(true); await rm(folder, { recursive: true, force: true }); }
});

test('orientation and one-square autosave survive reload without a manual Save draft', async ({ page }) => {
  await page.goto(running.url);
  await expect(page.locator('#sample-select')).toHaveValue(sampleId(1));
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.getByRole('button', { name: 'Select Black Pawn' }).click();
  await page.locator('.board-square').first().click();
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.reload();
  await expect(page.locator('#sample-select')).toHaveValue(sampleId(1));
  await expect(page.locator('.board-square').first()).toHaveAttribute('aria-label', /a8: Black Pawn/);
  await page.getByRole('button', { name: 'Black at bottom' }).click();
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.reload();
  await expect(page.locator('#orientation-status')).toHaveText('Black at bottom / flipped');
  await expect(page.locator('.board-square').first()).toHaveAttribute('aria-label', /h1: Black Pawn/);
  const manifest = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(manifest.samples[0].annotation.status).toBe('draft');
  expect(manifest.samples[0].labels[63]).toBe('p');
});

test('Next, Previous, Jump, and incomplete-only navigation flush; failed save blocks movement', async ({ page }) => {
  await page.goto(running.url);
  await page.getByRole('button', { name: 'Select White Rook' }).click();
  await page.locator('.board-square').nth(1).click();
  await page.locator('#next').click();
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(2));
  await page.locator('#previous').click();
  await expect(page.locator('.board-square').nth(1)).toHaveAttribute('aria-label', /White Rook/);
  await page.locator('#sample-select').selectOption(sampleId(3));
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(3));
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.getByRole('button', { name: 'Select White Knight' }).click();
  await page.locator('.board-square').nth(2).click();
  await page.locator('#incomplete-only').check();
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.locator('#sample-select').selectOption(sampleId(4));
  await page.locator('#previous').click();
  await expect(page.locator('.board-square').nth(2)).toHaveAttribute('aria-label', /White Knight/);
  await page.route('**/api/save', (route) => route.fulfill({ status: 500, contentType: 'application/json',
    body: '{"error":"simulated-disk-failure"}' }));
  await page.getByRole('button', { name: 'Select White Bishop' }).click();
  await page.locator('.board-square').nth(3).click();
  await page.locator('#next').click();
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(3));
  await expect(page.locator('#save-status')).toContainText('Save failed');
  await page.unroute('**/api/save');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.locator('#next').click();
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(4));
});

test('server restart returns to last active sample with its saved orientation and labels', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(running.url);
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(4));
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await page.getByRole('button', { name: 'Select White Queen' }).click();
  await page.locator('.board-square').nth(28).click();
  await expect(page.locator('#save-status')).toContainText('Saved');
  await page.goto('about:blank');
  running.server.closeAllConnections();
  await running.close();
  running = await createPieceAnnotatorServer({ port: 0, outputPath, catalog });
  await page.goto(running.url);
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(4));
  await expect(page.locator('.board-square').nth(28)).toHaveAttribute('aria-label', /White Queen/);
  await expect(page.locator('#progress')).toContainText('0 / 32 verified');
});

test('verified record wins over autosaved working edit across restart', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(running.url);
  await page.locator('#incomplete-only').uncheck();
  await expect(page.locator('#review')).toBeEnabled();
  await page.locator('#review').click();
  await page.locator('#review-confirm').check();
  await page.locator('#confirm').click();
  await expect(page.locator('#progress')).toContainText('1 / 32 verified');
  let manifest = JSON.parse(await readFile(outputPath, 'utf8'));
  const verified = manifest.samples.find((item) => item.sampleId === sampleId(4));
  expect(verified.annotation.status).toBe('verified');
  expect(verified.labels[28]).toBe('Q');
  await page.getByRole('button', { name: 'Empty / Clear', exact: true }).click();
  await page.locator('.board-square').nth(28).click();
  await expect(page.locator('#save-status')).toContainText('verified truth protected');
  manifest = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(manifest.samples.find((item) => item.sampleId === sampleId(4))).toEqual(verified);
  const beforeRestart = await running.store.readState();
  expect(beforeRestart.workspace.lastActiveSampleId).toBe(sampleId(4));
  expect(beforeRestart.workspace.verifiedDrafts).toHaveLength(1);
  await page.goto('about:blank');
  running.server.closeAllConnections();
  await running.close();
  running = await createPieceAnnotatorServer({ port: 0, outputPath, catalog });
  const afterRestart = await running.store.readState();
  expect(afterRestart.workspace.lastActiveSampleId).toBe(sampleId(4));
  expect(afterRestart.workspace.verifiedDrafts).toHaveLength(1);
  const resumePayload = await (await page.request.get(`${running.url}/api/samples`)).json();
  expect(resumePayload.workspace.lastActiveSampleId).toBe(sampleId(4));
  expect(resumePayload.workingDrafts.map((item) => item.sampleId)).toContain(sampleId(4));
  await page.goto(running.url);
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(4));
  await expect(page.locator('.board-square').nth(28)).toHaveAttribute('aria-label', /Empty/);
  await expect(page.locator('#progress')).toContainText('1 / 32 verified');
  await page.locator('#review').click();
  await page.locator('#review-confirm').check();
  await page.locator('#confirm').click();
  await expect(page.locator('#save-status')).toContainText('human-verified truth');
  manifest = JSON.parse(await readFile(outputPath, 'utf8'));
  expect(manifest.samples.find((item) => item.sampleId === sampleId(4)).labels[28]).toBe('empty');
  expect(manifest.samples.find((item) => item.sampleId === sampleId(4)).annotation.status).toBe('verified');
});

test('five 32-board cycles and rapid labeling keep one stable grid and one save action', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(running.url);
  await expect(page.locator('.board-square')).toHaveCount(64);
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(5));
  if (await page.locator('#incomplete-only').isChecked()) {
    await page.locator('#incomplete-only').uncheck();
  }
  await expect(page.locator('#sample-select option')).toHaveCount(32);
  await page.evaluate(() => { window.__firstSquare = document.querySelector('.board-square'); });
  for (let cycle = 0; cycle < 5; cycle++) {
    for (let index = 1; index <= 32; index++) {
      const id = sampleId(index);
      if (await page.locator('#sample-select').inputValue() !== id) await page.locator('#sample-select').selectOption(id);
      await expect(page.locator('#sample-heading')).toHaveText(id);
    }
  }
  const structure = await page.evaluate(() => ({ sameSquare: window.__firstSquare === document.querySelector('.board-square'),
    squares: document.querySelectorAll('.board-square').length,
    images: document.querySelectorAll('#board-image').length,
    pieceOverlays: document.querySelectorAll('.board-square img').length }));
  expect(structure.sameSquare).toBe(true);
  expect(structure.squares).toBe(64);
  expect(structure.images).toBe(1);
  expect(structure.pieceOverlays).toBeLessThanOrEqual(64);
  let saveRequests = 0;
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/save') saveRequests++; });
  await page.getByRole('button', { name: 'White at bottom' }).click();
  await expect(page.locator('#save-status')).toContainText('Saved');
  saveRequests = 0;
  await page.evaluate(() => {
    document.querySelector('[data-label="P"]').click();
    for (let index = 0; index < 30; index++) document.querySelectorAll('.board-square')[index].click();
    document.querySelector('[data-label="b"]').click();
    for (let index = 30; index < 50; index++) document.querySelectorAll('.board-square')[index].click();
  });
  await page.locator('#sample-select').selectOption(sampleId(31));
  await expect(page.locator('#sample-heading')).toHaveText(sampleId(31));
  await page.locator('#sample-select').selectOption(sampleId(32));
  await expect(page.locator('.board-square').nth(0)).toHaveAttribute('aria-label', /White Pawn/);
  await expect(page.locator('.board-square').nth(29)).toHaveAttribute('aria-label', /White Pawn/);
  await expect(page.locator('.board-square').nth(30)).toHaveAttribute('aria-label', /Black Bishop/);
  await expect(page.locator('.board-square').nth(49)).toHaveAttribute('aria-label', /Black Bishop/);
  expect(saveRequests).toBe(1);
  const files = await (await import('node:fs/promises')).readdir(join(folder, 'truth', 'checkpoints'));
  expect(files.filter((name) => name.startsWith('manifest-')).length).toBeLessThanOrEqual(3);
  expect(files.filter((name) => name.startsWith('workspace-')).length).toBeLessThanOrEqual(3);
});

test('truncated temporary manifest recovers latest checkpoint and shows Recovered', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('about:blank');
  running.server.closeAllConnections();
  await running.close();
  await writeFile(outputPath, '{"partial":');
  running = await createPieceAnnotatorServer({ port: 0, outputPath, catalog });
  await page.goto(running.url);
  await expect(page.locator('#save-status')).toContainText('Recovered');
  await expect(page.locator('#progress')).toContainText('1 / 32 verified');
  await expect(page.locator('#message')).toContainText('Recovered from a valid local checkpoint');
  const state = await running.store.readState();
  expect(state.recovery.some((item) => item.status === 'recovered-from-backup')).toBe(true);
});
