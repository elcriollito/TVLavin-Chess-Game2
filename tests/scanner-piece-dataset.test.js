import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSyntheticPlan, labelParts, qualityReport, sha256, stableJson, validateCatalog,
  validatePlatformCoverage, validateSampleManifest, validateThemes } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { renderSyntheticSvg, validateGeneratedSvg } from '../scanner/recognition/datasets/pieces/synthetic-svg.js';

const catalog = JSON.parse(await readFile(new URL('../scanner/recognition/datasets/piece-sets/catalog-v1.json', import.meta.url)));
const themes = JSON.parse(await readFile(new URL('../scanner/recognition/datasets/pieces/catalog/board-themes-v1.json', import.meta.url)));
const coverage = JSON.parse(await readFile(new URL('../scanner/recognition/datasets/pieces/catalog/platform-coverage-v1.json', import.meta.url)));
const clone = (value) => structuredClone(value);
const fixture = () => buildSyntheticPlan(catalog, themes, 306).map((sample) => ({ ...sample,
  imageSha256: sha256(renderSyntheticSvg(sample, themes.themes.find((theme) => theme.boardThemeId === sample.boardThemeId))) }));

test('catalog records explicit rights, roles, and withheld candidate assets', () => {
  assert.equal(validateCatalog(catalog), catalog);
  assert.equal(validateThemes(themes), themes);
  assert.equal(validatePlatformCoverage(coverage), coverage);
  assert.equal(catalog.pieceSets.filter((set) => set.trainingRole === 'TRAINING-ELIGIBLE').length, 1);
  assert.equal(catalog.pieceSets.filter((set) => set.trainingRole === 'REFERENCE-ONLY').length, 4);
  const invalid = clone(catalog);
  invalid.pieceSets[3].trainingRole = 'TRAINING-ELIGIBLE';
  invalid.pieceSets[3].trainingAllowed = true;
  assert.throws(() => validateCatalog(invalid), /unlicensed or incomplete/);
  invalid.pieceSets[3].license = '';
  assert.throws(() => validateCatalog(invalid), /rights metadata/);
});

test('seeded independent-square plan is deterministic and balances occupancy, color and all types', () => {
  const plan = fixture();
  assert.equal(plan.length, 432);
  assert.equal(sha256(stableJson(plan)), sha256(stableJson(fixture())));
  assert.notEqual(sha256(stableJson(plan)), sha256(stableJson(buildSyntheticPlan(catalog, themes, 307))));
  assert.equal(plan.filter((sample) => sample.classLabel === 'empty').length, 216);
  assert.equal(plan.filter((sample) => sample.occupancy === 'occupied').length, 216);
  assert.equal(plan.filter((sample) => sample.color === 'white').length, 108);
  assert.equal(plan.filter((sample) => sample.color === 'black').length, 108);
  for (const label of 'PNBRQKpnbrqk') assert.equal(plan.filter((sample) => sample.classLabel === label).length, 18);
  assert.equal(plan.every((sample) => sample.split === 'train' && sample.width === 128 && sample.height === 128), true);
  assert.equal(new Set(plan.map((sample) => sample.sampleId.toLowerCase())).size, 432);
});

test('SVG tiles preserve RGB detail, opaque background, dimensions and byte identity', () => {
  const plan = fixture();
  const piece = plan.find((sample) => sample.classLabel === 'K' && sample.squareTone === 'dark');
  const empty = plan.find((sample) => sample.classLabel === 'empty');
  const theme = themes.themes.find((item) => item.boardThemeId === piece.boardThemeId);
  const svg = renderSyntheticSvg(piece, theme);
  assert.equal(svg, renderSyntheticSvg(piece, theme));
  assert.match(svg, /width="128" height="128"/);
  assert.match(svg, /<rect width="128" height="128" fill="#/);
  assert.match(svg, /<g fill=/);
  assert.doesNotMatch(renderSyntheticSvg(empty, themes.themes[0]), /<g fill=/);
  validateGeneratedSvg(svg, sha256(svg), sha256);
  assert.throws(() => validateGeneratedSvg(svg.replace('width="128"', 'width="32"'), sha256(svg), sha256), /broken/);
  assert.throws(() => validateGeneratedSvg('<svg width="128" height="128"></svg>', sha256(svg), sha256), /broken/);
});

test('split validator rejects source, piece-family, theme, augmentation and platform-session leakage', () => {
  const [first, second] = fixture();
  const cases = ['sourceImageId', 'sourceFamilyGroup', 'pieceFamilyGroup', 'boardThemeFamily', 'augmentationFamily', 'platformSession'];
  for (const group of cases) {
    const a = { ...first, platformSession: 'session-a' };
    const b = { ...second, sampleId: 'second', sourceImageId: 'second', sourceFamilyGroup: 'second', pieceFamilyGroup: 'second',
      boardThemeFamily: 'second', augmentationFamily: 'second', platformSession: 'session-b', split: 'test' };
    b[group] = a[group];
    assert.throws(() => validateSampleManifest([a, b]), /leakage/, group);
  }
});

test('validator blocks training-role violations, exact duplicates, invalid labels and split aliases', () => {
  const [first, second] = fixture();
  const evalInTrain = { ...first, trainingRole: 'EVALUATION-ONLY' };
  assert.throws(() => validateSampleManifest([evalInTrain]), /non-training source/);
  assert.throws(() => validateSampleManifest([{ ...first, classLabel: 'X' }]), /invalid/);
  assert.throws(() => validateSampleManifest([{ ...first, color: 'black' }]), /invalid/);
  assert.throws(() => validateSampleManifest([{ ...first, width: 32, imageSha256: 'A'.repeat(64) }]), /broken image metadata/);
  const a = { ...first, imageSha256: 'A'.repeat(64) };
  const b = { ...second, sampleId: 'other', imageSha256: 'A'.repeat(64) };
  assert.throws(() => validateSampleManifest([a, b]), /duplicate image bytes/);
  assert.deepEqual(labelParts('empty'), { occupancy: 'empty', color: null, pieceType: null });
  assert.deepEqual(labelParts('n'), { occupancy: 'occupied', color: 'black', pieceType: 'knight' });
});

test('quality report is deterministic and refuses a one-family training-readiness claim', () => {
  const samples = fixture();
  const manifest = { catalogSha256: 'A'.repeat(64), boardThemeCatalogSha256: 'B'.repeat(64), samples };
  const report = qualityReport(manifest, catalog, themes, coverage);
  assert.equal(stableJson(report), stableJson(qualityReport(manifest, catalog, themes, coverage)));
  assert.equal(report.totalSamples, 432);
  assert.deepEqual(report.trainBalance, { occupied: 216, empty: 216, white: 108, black: 108 });
  assert.equal(report.trainingReadiness, 'NEEDS MORE PIECE-SET DIVERSITY');
  assert.ok(report.warnings.includes('no-credible-whole-family-validation-and-test-holdouts'));
  assert.equal(report.platformCoverage.length, 9);
});
