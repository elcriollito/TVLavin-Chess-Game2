import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyAssetCatalog, familyChecksum, familyDistanceAudit, silhouetteNearDuplicates, SYMBOLS } from '../scanner/recognition/datasets/pieces/asset-integrity.js';
import { buildSyntheticPlan, labelParts, qualityReport, sha256, stableJson, validateCatalog,
  validateFreshEvaluationCandidates, validatePlatformCoverage, validateSampleManifest, validateThemes } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { renderSyntheticSvg, validateGeneratedSvg } from '../scanner/recognition/datasets/pieces/synthetic-svg.js';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('scanner/recognition/datasets/piece-sets/catalog-v1.json', root)));
const themes = JSON.parse(await readFile(new URL('scanner/recognition/datasets/pieces/catalog/board-themes-v1.json', root)));
const coverage = JSON.parse(await readFile(new URL('scanner/recognition/datasets/pieces/catalog/platform-coverage-v1.json', root)));
const candidates = JSON.parse(await readFile(new URL('scanner/recognition/datasets/pieces/catalog/fresh-evaluation-candidates-v0.1.json', root)));
const clone = structuredClone;
const fixture = () => buildSyntheticPlan(catalog, themes, 306).map((sample) => ({ ...sample,
  imageSha256: sha256(sample.sampleId) }));
const acquired = catalog.pieceSets.filter((set) => set.sourceType === 'open-source-asset');

test('license-first catalog requires complete, pinned 12-class acquisition metadata', () => {
  assert.equal(validateCatalog(catalog), catalog);
  assert.equal(validateThemes(themes), themes);
  assert.equal(validatePlatformCoverage(coverage), coverage);
  assert.equal(validateFreshEvaluationCandidates(candidates), candidates);
  assert.equal(acquired.length, 10);
  assert.equal(catalog.pieceSets.filter((set) => set.trainingRole === 'TRAINING-ELIGIBLE').length, 11);
  assert.equal(catalog.pieceSets.filter((set) => set.trainingRole === 'REFERENCE-ONLY').length, 2);
  assert.ok(acquired.every((set) => SYMBOLS.every((symbol) => set.assetChecksums[symbol])));
  const invalid = clone(catalog);
  invalid.pieceSets.find((set) => set.pieceSetId === 'caissa-current-wikipedia-unverified').trainingRole = 'TRAINING-ELIGIBLE';
  invalid.pieceSets.find((set) => set.pieceSetId === 'caissa-current-wikipedia-unverified').trainingAllowed = true;
  assert.throws(() => validateCatalog(invalid), /unlicensed or incomplete/);
  const missingLicense = clone(catalog);
  missingLicense.pieceSets.find((set) => set.pieceSetId === 'lichess-chessnut').licenseTextSha256 = null;
  assert.throws(() => validateCatalog(missingLicense), /provenance/);
  for (const id of ['livius', 'p4wn-svg', 'kosal']) {
    const incomplete = clone(catalog);
    delete incomplete.pieceSets.find((set) => set.pieceSetId === id).assetChecksums.wK;
    assert.throws(() => validateCatalog(incomplete), /provenance/);
  }
});

test('every acquired original, normalized asset, notice, and license text verifies by SHA-256', async () => {
  const audit = await verifyAssetCatalog(catalog, fileURLToPath(root));
  assert.equal(audit.acquiredFamilies, 10);
  assert.equal(audit.originalAssets, 120);
  assert.equal(audit.normalizedAssets, 120);
  assert.equal(audit.uniqueOriginalHashes, 120);
  assert.equal(audit.uniqueNormalizedHashes, 120);
  assert.deepEqual(audit.exactDuplicates, []);
  assert.deepEqual(audit.nearDuplicates, []);
  assert.equal(audit.structural.pairCount, 45);
  assert.ok(audit.sameFamilyColorShapePairs.length > 0);
});

test('family checksums bind source version, license and all twelve asset hashes', () => {
  for (const set of acquired) {
    assert.equal(set.familyChecksum, familyChecksum(set));
    const changed = clone(set);
    changed.assetChecksums.wK.sourceSha256 = 'A'.repeat(64);
    assert.notEqual(set.familyChecksum, familyChecksum(changed));
  }
});

test('structural screen flags duplicate silhouettes without equating recolor with a new family', () => {
  const masks = new Map([['a', [1, 0, 1, 0, 1, 0, 1, 0]], ['b', [1, 0, 1, 0, 1, 0, 1, 0]],
    ['c', [0, 1, 0, 1, 0, 1, 0, 1]]]);
  assert.deepEqual(silhouetteNearDuplicates(masks), [{ first: 'a', second: 'b', silhouetteDistance: 0 }]);
  const one = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, { mask: [1, 0, 1, 0], edges: [1, 1, 1, 1] }]));
  const other = Object.fromEntries(SYMBOLS.map((symbol) => [symbol, { mask: [0, 1, 0, 1], edges: [0, 0, 0, 0] }]));
  const audit = familyDistanceAudit(new Map([['one', one], ['recolor', one], ['other', other]]));
  assert.deepEqual(audit.nearDuplicates.map((item) => [item.first, item.second]), [['one', 'recolor']]);
});

test('seeded plan is deterministic, 128px, balanced, and whole-family split', () => {
  const plan = fixture();
  assert.equal(plan.length, 5280);
  assert.equal(sha256(stableJson(plan)), sha256(stableJson(fixture())));
  assert.notEqual(sha256(stableJson(plan)), sha256(stableJson(buildSyntheticPlan(catalog, themes, 307))));
  assert.equal(plan.filter((sample) => sample.classLabel === 'empty').length, 2640);
  assert.equal(plan.filter((sample) => sample.occupancy === 'occupied').length, 2640);
  assert.equal(plan.filter((sample) => sample.color === 'white').length, 1320);
  assert.equal(plan.filter((sample) => sample.color === 'black').length, 1320);
  for (const label of 'PNBRQKpnbrqk') assert.equal(plan.filter((sample) => sample.classLabel === label).length, 220);
  assert.deepEqual(Object.fromEntries(['train', 'validation', 'test'].map((split) => [split, plan.filter((sample) => sample.split === split).length])),
    { train: 3360, validation: 960, test: 960 });
  assert.equal(plan.every((sample) => sample.width === 128 && sample.height === 128), true);
  assert.equal(new Set(plan.map((sample) => sample.sampleId.toLowerCase())).size, plan.length);
  assert.equal(validateSampleManifest(plan), plan);
});

test('two genuine whole-family holdouts are unseen by training', () => {
  const groups = Object.groupBy(fixture(), (sample) => sample.pieceFamilyGroup);
  assert.equal(Object.keys(groups).length, 11);
  assert.ok(Object.values(groups).every((samples) => new Set(samples.map((sample) => sample.split)).size === 1));
  assert.deepEqual([...new Set(fixture().filter((sample) => sample.split !== 'train').map((sample) => sample.pieceSetId))].sort(),
    ['lichess-celtic', 'lichess-rhosgfx', 'livius', 'p4wn-svg']);
});

test('paired color, bishop/knight/queen and king-color hard subsets are complete', () => {
  const plan = fixture();
  for (const set of catalog.pieceSets.filter((item) => item.trainingRole === 'TRAINING-ELIGIBLE')) {
    const family = plan.filter((sample) => sample.pieceSetId === set.pieceSetId);
    for (const tone of ['light', 'dark']) for (const label of 'PNBRQK') {
      const whites = family.filter((sample) => sample.squareTone === tone && sample.classLabel === label);
      const blacks = family.filter((sample) => sample.squareTone === tone && sample.classLabel === label.toLowerCase());
      assert.equal(whites.length, 10); assert.equal(blacks.length, 10);
      assert.deepEqual(whites.map((sample) => sample.augmentationId), blacks.map((sample) => sample.augmentationId));
    }
    assert.equal(family.filter((sample) => sample.hardCaseTags.includes('bishop-knight-queen-type')).length, 120);
    assert.equal(family.filter((sample) => sample.hardCaseTags.includes('king-color')).length, 40);
  }
});

test('procedural and acquired tiles preserve RGB, opaque board and byte identity', async () => {
  const plan = fixture();
  const procedural = plan.find((sample) => sample.pieceSetId === 'caissa-procedural-geometry-v1' && sample.classLabel === 'K');
  const acquiredSample = plan.find((sample) => sample.pieceSetId === 'lichess-chessnut' && sample.classLabel === 'K');
  const theme = (sample) => themes.themes.find((item) => item.boardThemeId === sample.boardThemeId);
  const svg = renderSyntheticSvg(procedural, theme(procedural));
  validateGeneratedSvg(svg, sha256(svg), sha256);
  const png = await readFile(new URL('scanner/recognition/datasets/piece-sets/assets/lichess-chessnut/normalized/wK.png', root));
  const licensedSvg = renderSyntheticSvg(acquiredSample, theme(acquiredSample), png);
  validateGeneratedSvg(licensedSvg, sha256(licensedSvg), sha256);
  assert.match(licensedSvg, /href="data:image\/png;base64,/);
  assert.throws(() => renderSyntheticSvg(acquiredSample, theme(acquiredSample)), /PNG required/);
  assert.throws(() => validateGeneratedSvg(licensedSvg.replace('data:image/png;base64,', 'https://example.test/'), sha256(licensedSvg), sha256), /broken/);
});

test('split validator rejects source/family/augmentation/session leakage and exact duplicates', () => {
  const [first, second] = fixture();
  for (const group of ['sourceImageId', 'sourceFamilyGroup', 'pieceFamilyGroup', 'augmentationFamily', 'platformSession']) {
    const a = { ...first, platformSession: 'session-a' };
    const b = { ...second, sampleId: 'second', sourceImageId: 'second', sourceFamilyGroup: 'second', pieceFamilyGroup: 'second',
      augmentationFamily: 'second', platformSession: 'session-b', split: 'test' };
    b[group] = a[group];
    assert.throws(() => validateSampleManifest([a, b]), /leakage/, group);
  }
  const duplicate = { ...second, sampleId: 'other', imageSha256: first.imageSha256 };
  assert.throws(() => validateSampleManifest([first, duplicate]), /duplicate image bytes/);
  assert.throws(() => validateSampleManifest([{ ...first, trainingRole: 'EVALUATION-ONLY' }]), /non-training source/);
  assert.deepEqual(labelParts('n'), { occupancy: 'occupied', color: 'black', pieceType: 'knight' });
});

test('quality report is deterministic and records independent upstreams and balanced holdouts', async () => {
  const samples = fixture();
  const manifest = { catalogSha256: 'A'.repeat(64), boardThemeCatalogSha256: 'B'.repeat(64), samples };
  const audit = await verifyAssetCatalog(catalog, fileURLToPath(root));
  const report = qualityReport(manifest, catalog, themes, coverage, audit, candidates);
  assert.equal(stableJson(report), stableJson(qualityReport(manifest, catalog, themes, coverage, audit, candidates)));
  assert.equal(report.totalSamples, 5280);
  assert.deepEqual(report.trainBalance, { occupied: 1680, empty: 1680, white: 840, black: 840 });
  assert.equal(report.trainingReadiness, 'READY FOR BASELINE TRAINING');
  assert.equal(report.sourceIndependence.upstreamProjectCount, 5);
  assert.equal(report.sourceIndependence.externalUpstreamProjectCount, 4);
  assert.equal(report.sourceIndependence.authorCount, 9);
  assert.equal(report.sourceIndependence.familiesPerUpstream['lichess-org/lila'], 7);
  assert.ok(report.warnings.includes('single-upstream-over-half-of-families'));
  assert.equal(report.familyCountsBySplit.validation, 2);
  assert.equal(report.familyCountsBySplit.test, 2);
  assert.equal(report.platformCoverage.length, 9);
  assert.deepEqual(report.freshEvaluationCandidates, { total: 33, priorCorpusAliases: 14,
    platformIdentified: 0, humanOutcomeVerified: 0, benchmarkEligible: 0 });
  assert.equal(qualityReport(manifest, catalog, themes, coverage, null, candidates).trainingReadiness,
    'NEEDS MORE LICENSING / PROVENANCE WORK');
});

test('fresh real candidates preserve uncertainty and cannot become training or platform truth by inference', () => {
  assert.equal(candidates.candidates.length, 33);
  assert.ok(candidates.candidates.every((item) => item.trainingAllowed === false && item.platformId === null
    && item.referenceOutcome === 'unknown' && item.humanVerifiedOutcome === null));
  const invented = clone(candidates);
  invented.candidates[0].platformId = 'Chess.com';
  assert.throws(() => validateFreshEvaluationCandidates(invented), /platform identity/);
  const inventedOutcome = clone(candidates);
  inventedOutcome.candidates[0].referenceOutcome = 'success';
  assert.throws(() => validateFreshEvaluationCandidates(inventedOutcome), /reference outcome/);
});

test('published v0.3 quality artifact binds the current catalog and immutable real cohort', async () => {
  const bytes = await readFile(new URL('artifacts/scanner-piece-dataset/quality-v0.3.json', root));
  const report = JSON.parse(bytes);
  assert.equal(report.datasetVersion, 'scanner-piece-dataset-v0.3');
  assert.equal(report.catalogSha256, sha256(await readFile(new URL('scanner/recognition/datasets/piece-sets/catalog-v1.json', root))));
  assert.equal(report.totalSamples, 7264);
  assert.equal(report.countsByRole['EVALUATION-ONLY'], 1984);
  assert.equal(report.realEvaluation.boardCount, 31);
  assert.equal(report.realTruthSha256, 'AA471439A1EE78301591424A92FC9C425D3B7C3FCF12AC18A2CFE83B2A4EF855');
  assert.equal(report.assetAudit.exactDuplicates.length, 0);
  assert.equal(report.licenseSummary['TRAINING-ELIGIBLE:MIT'], 3);
  assert.equal(report.licenseSummary['TRAINING-ELIGIBLE:Public-Domain-Dedication'], 1);
  assert.equal(report.familyCompleteness.completeTrainingFamilies.length, 11);
  assert.equal(report.trainingReadiness, 'READY FOR BASELINE TRAINING');
  assert.equal(stableJson(report), bytes.toString('utf8'));
});
