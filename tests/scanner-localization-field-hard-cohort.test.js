import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInventory, FAILURE_TAXONOMY, FROZEN_FIELD_CORPUS_SHA256, publicManifest, stableSplit,
  validatePublicManifest
} from '../tools/scanner-localization-field-hard/cohort.mjs';

const ownerId = 'owner-a';
const cutoff = '2026-09-26T22:35:59.429Z';
const hash = (digit) => digit.repeat(64);
function fixtures() {
  const scans = Array.from({ length: 13 }, (_, index) => ({
    scan_id: `scan-${index}`,
    user_id: ownerId,
    submitted_at: '2026-09-20T00:00:00.000Z',
    image_hash: hash(String(index % 10)),
    image_storage_reference: index === 12 ? null : `supabase://scanner-beta-images/${index}`,
    consent_state: { shareImageForImprovement: index !== 11 },
    snapshot: { orientation: index % 2 ? 'black-at-bottom' : 'white-at-bottom' }
  }));
  const feedback = scans.map((scan, index) => ({
    feedback_id: `feedback-${index}`,
    scan_id: scan.scan_id,
    user_id: ownerId,
    submitted_at: '2026-09-20T00:01:00.000Z',
    feedback_type: 'LOCALIZATION_FAILURE',
    share_image_for_improvement: index !== 11
  }));
  const failures = Array.from({ length: 14 }, (_, index) => ({
    feedback_id: `failure-${index}`,
    scan_id: `failed-scan-${index}`,
    user_id: ownerId,
    submitted_at: '2026-09-20T00:02:00.000Z',
    image_hash: hash(String((index + 3) % 10)),
    failure_stage: 'localization',
    error_code: index === 0 ? 'MULTIPLE-BOARD-CANDIDATES' : 'LOCALIZATION_FAILURE',
    share_image_for_improvement: true
  }));
  return { scans, feedback, failures };
}

test('inventory audits all 27 records and fails closed without consent or storage evidence', () => {
  const inventory = buildInventory({ ...fixtures(), ownerId, cutoff });
  assert.equal(inventory.records.length, 27);
  assert.equal(inventory.records.filter((record) => record.recordType === 'post-localization-feedback').length, 13);
  assert.equal(inventory.records.filter((record) => record.recordType === 'standalone-localization-failure').length, 14);
  assert.equal(inventory.records.filter((record) => record.evidenceAvailable).length, 9);
  assert.equal(inventory.records.filter((record) => record.exclusionReason === 'exact-image-duplicate-or-technical-retry').length, 2);
  assert.equal(inventory.records.find((record) => record.errorCode?.includes('MULTIPLE')).taxonomy, 'F');
  assert.equal(FAILURE_TAXONOMY.F, 'multiple-board-ambiguity');
});

test('split assignment is deterministic for a governed session group key', () => {
  assert.equal(stableSplit(hash('A')), stableSplit(hash('A')));
  assert.match(stableSplit(hash('B')), /^(development|held-out-validation)$/);
});

test('public manifest preserves frozen corpus and contains no private fields', () => {
  const inventory = buildInventory({ ...fixtures(), ownerId, cutoff });
  const sample = {
    sampleId: 'field-hard-v0.1-001', imageSha256: hash('A'), consentVerified: true,
    ownerVerified: true, privateStorageReferenceVerified: true, governanceStatus: 'admitted',
    split: 'development'
  };
  const manifest = publicManifest({ inventory, ownerHash: 'A'.repeat(12), cutoff,
    samples: [{ ...sample, privatePath: 'never-publish' }], exclusions: [], deduplication: {} });
  assert.equal(manifest.frozenSourceCorpus.sha256, FROZEN_FIELD_CORPUS_SHA256);
  assert.equal(manifest.failureInventory.length, 27);
  assert.equal(manifest.counts.governedImagesAvailable, 1);
  assert.equal(manifest.counts.heldOrExcludedGovernedImages, 0);
  assert.equal(manifest.samples[0].privatePath, undefined);
  assert.equal(validatePublicManifest(manifest), manifest);
});
