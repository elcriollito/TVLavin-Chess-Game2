import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildStarterManifest, duplicateGroups, inventoryStaging, serializeStarter,
  sha256, validateStarterManifest
} from '../tools/scanner-localization-corpus-v03.mjs';

const CERTIFIED = process.env.CAISSA_SCANNER_CORPUS_V03
  || 'C:/Users/ALEXANDER/Alexander Projects/caissa_scanner_real_localization_corpus_v0_3';

test('duplicate detection groups same-byte files without deleting them', () => {
  assert.deepEqual(duplicateGroups([
    { folder: 'originals', filename: 'a.jpg', sha256: 'A' },
    { folder: 'references', filename: 'b.png', sha256: 'B' },
    { folder: 'hard-negatives', filename: 'c.jpg', sha256: 'A' }
  ]), [{ sha256: 'A', filenames: ['originals/a.jpg', 'hard-negatives/c.jpg'] }]);
});

test('v0.3 manifest validation rejects role confusion, bad checksums, duplicate IDs and fabricated corners', async () => {
  const makeFile = (folder, filename) => ({ folder, filename, sha256: sha256(Buffer.from(`${folder}/${filename}`)),
    width: 100, height: 200, bytes: 4, detectedFormat: folder === 'references' ? 'png' : 'jpeg',
    extensionFormatMismatch: false });
  const numbered = (number) => String(number).padStart(3, '0');
  const inventory = { folders: {
    originals: Array.from({ length: 33 }, (_, index) => makeFile('originals', `sample_${numbered(index + 1)}_original.jpg`)),
    references: Array.from({ length: 33 }, (_, index) => makeFile('references', `sample_${numbered(index + 1)}_chessvision.png`)),
    'hard-negatives': Array.from({ length: 13 }, (_, index) => makeFile('hard-negatives', `hard-negatives${numbered(index + 1)}.jpeg`))
  }, duplicateGroups: [] };
  const manifest = await buildStarterManifest(inventory);
  assert.deepEqual(validateStarterManifest(manifest, inventory), { sampleCount: 46, referenceCount: 33 });
  assert.equal(serializeStarter(manifest), serializeStarter(await buildStarterManifest(inventory)));
  const tampered = structuredClone(manifest);
  tampered.samples[0].originalSha256 = '0'.repeat(64);
  assert.throws(() => validateStarterManifest(tampered, inventory), /source-integrity/);
  const duplicateId = structuredClone(manifest);
  duplicateId.samples[1].sampleId = duplicateId.samples[0].sampleId;
  assert.throws(() => validateStarterManifest(duplicateId, inventory), /duplicate-id/);
  const wrongRole = structuredClone(manifest);
  wrongRole.samples[0].originalFile = wrongRole.samples[0].referenceScreenshot;
  assert.throws(() => validateStarterManifest(wrongRole, inventory), /source-role/);
  const wrongReference = structuredClone(manifest);
  wrongReference.samples[0].referenceScreenshot = wrongReference.samples[1].referenceScreenshot;
  assert.throws(() => validateStarterManifest(wrongReference, inventory), /pairing-invalid|reference-reused/);
  const fabricatedCorners = structuredClone(manifest);
  fabricatedCorners.samples[0].groundTruth = { playableBoardCorners: {} };
  assert.throws(() => validateStarterManifest(fabricatedCorners, inventory), /positive-state/);
});

test('certified v0.3 source/reference roles, checksums, states and deterministic manifest',
  { skip: !existsSync(CERTIFIED) }, async () => {
  const inventory = await inventoryStaging(CERTIFIED);
  const manifestBytes = await readFile(`${CERTIFIED}/manifest-starter-v0.3.json`);
  const manifest = JSON.parse(manifestBytes);
  const rebuilt = await buildStarterManifest(inventory);
  assert.equal(serializeStarter(rebuilt), manifestBytes.toString('utf8'));
  assert.equal(sha256(manifestBytes), '46700321AFDF531D3D295CC7B31EFC0CFD59DFA68833C505208B0ADC65AD44F1');
  assert.deepEqual(validateStarterManifest(manifest, inventory), { sampleCount: 46, referenceCount: 33 });
  assert.deepEqual(Object.fromEntries(Object.entries(inventory.folders).map(([folder, files]) => [folder, files.length])),
    { originals: 33, references: 33, 'hard-negatives': 13 });
  assert.equal(inventory.duplicateGroups.length, 0);
  assert.equal(manifest.samples.filter((sample) => sample.priorCorpusSampleId).length, 14);
  assert.deepEqual(manifest.samples.filter((sample) => sample.extensionFormatMismatch).map((sample) => sample.sampleId),
    ['real-v03-positive-015', 'real-v03-positive-016', 'real-v03-positive-017', 'real-v03-positive-018']);
  assert.equal(manifest.samples.filter((sample) => sample.boardPresent && sample.annotationStatus === 'pending').length, 33);
  assert.equal(manifest.samples.filter((sample) => !sample.boardPresent && sample.annotationStatus === 'verified-negative').length, 13);

  const tampered = structuredClone(manifest);
  tampered.samples[0].originalSha256 = '0'.repeat(64);
  assert.throws(() => validateStarterManifest(tampered, inventory), /source-integrity/);
  const duplicateId = structuredClone(manifest);
  duplicateId.samples[1].sampleId = duplicateId.samples[0].sampleId;
  assert.throws(() => validateStarterManifest(duplicateId, inventory), /duplicate-id/);
  const wrongRole = structuredClone(manifest);
  wrongRole.samples[0].originalFile = wrongRole.samples[0].referenceScreenshot;
  assert.throws(() => validateStarterManifest(wrongRole, inventory), /source-role/);
  const wrongReference = structuredClone(manifest);
  wrongReference.samples[0].referenceScreenshot = wrongReference.samples[1].referenceScreenshot;
  assert.throws(() => validateStarterManifest(wrongReference, inventory), /reference-reused/);
  const fabricatedCorners = structuredClone(manifest);
  fabricatedCorners.samples[0].groundTruth = { playableBoardCorners: {} };
  assert.throws(() => validateStarterManifest(fabricatedCorners, inventory), /positive-state/);
  });
