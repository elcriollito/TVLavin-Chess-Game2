import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLASSES } from '../scanner/recognition/datasets/pieces/dataset-core.js';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('v0.4 certification preserves rights-cleared v0.3 families, separate holdouts and deterministic empty diversity', async () => {
  const config = await readJson('../scanner/recognition/classifier-revision/config-v0.2.json');
  const cert = await readJson('../artifacts/scanner-piece-classifier-v0.2/dataset-certification.json');
  const v03 = await readJson('../artifacts/scanner-piece-dataset/quality-v0.3.json');
  assert.equal(cert.datasetVersion, 'scanner-piece-dataset-v0.4');
  assert.equal(cert.sourceManifestSha256, config.sourceManifestSha256);
  assert.equal(cert.sourceManifestSha256, v03.manifestSha256);
  assert.equal(cert.generatedMetadataSha256, config.datasetMetadataSha256);
  assert.equal(cert.generatedPixelsSha256, config.datasetPixelsSha256);
  assert.equal(cert.independentBuildCount, 3);
  assert.equal(cert.independentBuildsByteIdentical, true);
  assert.deepEqual(config.classOrder, CLASSES);
  assert.deepEqual([cert.familySplit.train.length, cert.familySplit.validation.length, cert.familySplit.test.length], [7, 2, 2]);
  assert.equal(new Set(Object.values(cert.familySplit).flat()).size, 11);
  assert.deepEqual(cert.familySplit.validation, config.training.validationFamilies);
  assert.deepEqual(cert.familySplit.test, config.training.testFamilies);
  assert.deepEqual(cert.splitTiles, { train: 5040, validation: 1440, test: 1440 });
  assert.deepEqual(cert.splitEmptyTiles, { train: 3360, validation: 960, test: 960 });
  assert.deepEqual(cert.splitOccupiedTiles, { train: 1680, validation: 480, test: 480 });
  assert.equal(cert.emptySubtypeNames.length, 12);
  assert.equal(cert.additionalEmptyTiles, 2640);
  assert.equal(cert.hardNegativeTiles, 2420);
  assert.equal(cert.realEvaluationTilesIncluded, 0);
  assert.equal(cert.generatedPixelsCommitted, false);
});
