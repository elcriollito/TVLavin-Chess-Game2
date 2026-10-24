import { createHash } from 'node:crypto';

export const CORPUS_VERSION = 'caissa-scanner-localization-field-hard-v0.1';
export const SCHEMA_VERSION = 'caissa-scanner-localization-field-hard-manifest/1';
export const FROZEN_FIELD_CORPUS_SHA256 = 'B5104B8445F3DC932A0B9BDE8A69CDCBD31A2259A8154F46C51AEAD43656B267';

export const FAILURE_TAXONOMY = Object.freeze({
  A: 'no-board-candidate',
  B: 'wrong-board-candidate',
  C: 'incomplete-board-crop',
  D: 'bad-corner-estimation',
  E: 'projective-warp-failure',
  F: 'multiple-board-ambiguity',
  G: 'screen-or-ui-border-mistaken-for-board',
  H: 'perspective-too-strong',
  I: 'low-contrast',
  J: 'glare-or-reflection',
  K: 'moire',
  L: 'partial-board',
  M: 'rotated-orientation-related',
  N: 'other',
  UNKNOWN: 'insufficient-evidence'
});

const HASH = /^[A-F0-9]{64}$/;
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

export function pseudonym(value, prefix = '') {
  return `${prefix}${sha256(String(value)).slice(0, 16)}`;
}

export function ownerScopeHash(userId) {
  return sha256(String(userId)).slice(0, 12);
}

export function stableSplit(groupKey) {
  const bucket = Number.parseInt(sha256(`field-hard-v0.1:${groupKey}`).slice(0, 8), 16) % 10;
  return bucket < 7 ? 'development' : 'held-out-validation';
}

function sortByTimeThenKey(left, right) {
  return String(left.submitted_at || left.created_at).localeCompare(String(right.submitted_at || right.created_at))
    || String(left.feedback_id).localeCompare(String(right.feedback_id));
}

function evidenceState({ feedback, scan }) {
  if (!feedback.share_image_for_improvement) return { admitted: false, reason: 'image-consent-not-granted' };
  if (!scan) return { admitted: false, reason: 'source-scan-not-found' };
  if (scan.consent_state?.shareImageForImprovement !== true) return { admitted: false, reason: 'scan-image-consent-not-granted' };
  if (!scan.image_storage_reference) return { admitted: false, reason: 'private-storage-reference-missing' };
  if (!HASH.test(String(scan.image_hash || '').toUpperCase())) return { admitted: false, reason: 'image-hash-invalid' };
  return { admitted: true, reason: null };
}

export function buildInventory({ scans, feedback, failures, ownerId, cutoff }) {
  const owned = (row) => row.user_id === ownerId && Date.parse(row.submitted_at) <= Date.parse(cutoff);
  const ownedScans = scans.filter(owned);
  const ownedFeedback = feedback.filter(owned);
  const ownedFailures = failures.filter(owned);
  const scansById = new Map(ownedScans.map((row) => [row.scan_id, row]));
  const records = [];

  for (const row of ownedFeedback.filter((item) => item.feedback_type === 'LOCALIZATION_FAILURE').sort(sortByTimeThenKey)) {
    const scan = scansById.get(row.scan_id);
    const evidence = evidenceState({ feedback: row, scan });
    records.push({
      recordType: 'post-localization-feedback',
      recordKey: pseudonym(row.feedback_id, 'feedback-'),
      scanKey: pseudonym(row.scan_id, 'scan-'),
      submittedAt: row.submitted_at,
      imageHash: scan?.image_hash?.toUpperCase() || null,
      platform: row.platform || scan?.platform || 'unknown',
      captureType: row.capture_type || scan?.capture_type || 'unknown',
      orientation: scan?.snapshot?.orientation || 'unknown',
      consentVerified: row.share_image_for_improvement === true
        && scan?.consent_state?.shareImageForImprovement === true,
      ownerVerified: true,
      privateStorageReferenceVerified: Boolean(scan?.image_storage_reference),
      protectedBenchmarkRestriction: false,
      technicalRetry: false,
      evidenceAvailable: evidence.admitted,
      exclusionReason: evidence.reason,
      taxonomy: 'UNKNOWN',
      taxonomyLabel: FAILURE_TAXONOMY.UNKNOWN,
      taxonomyEvidence: 'pending-image-audit',
      private: evidence.admitted ? {
        feedbackId: row.feedback_id,
        scanId: row.scan_id,
        storageReference: scan.image_storage_reference,
        userId: row.user_id,
        clientMetadata: scan.client_metadata || row.client_metadata || null
      } : null
    });
  }

  for (const row of ownedFailures.filter((item) => item.failure_stage === 'localization').sort(sortByTimeThenKey)) {
    const multiple = String(row.error_code || '').toUpperCase().includes('MULTIPLE');
    records.push({
      recordType: 'standalone-localization-failure',
      recordKey: pseudonym(row.feedback_id, 'failure-'),
      scanKey: pseudonym(row.scan_id, 'scan-'),
      submittedAt: row.submitted_at,
      imageHash: row.image_hash?.toUpperCase() || null,
      platform: row.platform || 'unknown',
      captureType: row.capture_type || 'unknown',
      orientation: row.orientation || 'unknown',
      errorCode: row.error_code,
      consentVerified: row.share_image_for_improvement === true,
      ownerVerified: true,
      privateStorageReferenceVerified: false,
      protectedBenchmarkRestriction: false,
      technicalRetry: false,
      evidenceAvailable: false,
      exclusionReason: 'private-storage-reference-missing-pre-upload',
      taxonomy: multiple ? 'F' : 'UNKNOWN',
      taxonomyLabel: multiple ? FAILURE_TAXONOMY.F : FAILURE_TAXONOMY.UNKNOWN,
      taxonomyEvidence: multiple ? 'stable-runtime-error-code' : 'source-image-unavailable',
      private: null
    });
  }

  const firstByHash = new Map();
  for (const record of records) {
    if (!record.imageHash) continue;
    const first = firstByHash.get(record.imageHash);
    if (first) {
      record.technicalRetry = true;
      record.duplicateOf = first.recordKey;
      if (record.evidenceAvailable) {
        record.evidenceAvailable = false;
        record.exclusionReason = 'exact-image-duplicate-or-technical-retry';
      }
    } else firstByHash.set(record.imageHash, record);
  }

  assert(records.length === 27, `expected-27-localization-records-got-${records.length}`);
  return { records, sourceCounts: {
    scans: ownedScans.length,
    feedback: ownedFeedback.length,
    failures: ownedFailures.length,
    localizationRelated: records.length
  } };
}

export function publicManifest({ inventory, ownerHash, cutoff, samples, exclusions, deduplication }) {
  const admitted = samples.filter((sample) => sample.governanceStatus === 'admitted');
  const failureInventory = inventory.records.map(({ private: _private, ...record }) => record);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    corpusVersion: CORPUS_VERSION,
    sourceRole: 'development-only',
    classifierTrainingUseAllowed: false,
    finalBenchmarkUseAllowed: false,
    redistributionAllowed: false,
    sourceImagesIncluded: false,
    privateStorageReferencesIncluded: false,
    frozenSourceCorpus: {
      corpusVersion: 'caissa-scanner-beta-field-v0.1',
      sha256: FROZEN_FIELD_CORPUS_SHA256,
      cutoff,
      preserved: true
    },
    governance: {
      accountScopeHash: ownerHash,
      imageConsentRequired: true,
      ownerMatchRequired: true,
      privateReferenceRequired: true,
      exactHashVerified: true,
      noAutomaticTrainingPromotion: true
    },
    sourceCounts: inventory.sourceCounts,
    counts: {
      governedImagesAvailable: samples.length,
      admittedDevelopmentImages: admitted.length,
      excludedFailureRecords: exclusions.length,
      heldOrExcludedGovernedImages: samples.length - admitted.length,
      development: admitted.filter((sample) => sample.split === 'development').length,
      heldOutValidation: admitted.filter((sample) => sample.split === 'held-out-validation').length
    },
    deduplication,
    failureInventory,
    samples: admitted.map(({ privatePath: _privatePath, ...sample }) => sample),
    exclusions
  };
  manifest.corpusSha256 = sha256(`${JSON.stringify(manifest)}\n`);
  return manifest;
}

export function validatePublicManifest(manifest) {
  assert(manifest?.schemaVersion === SCHEMA_VERSION, 'manifest-schema-invalid');
  assert(manifest.corpusVersion === CORPUS_VERSION, 'corpus-version-invalid');
  assert(manifest.sourceRole === 'development-only' && manifest.finalBenchmarkUseAllowed === false
    && manifest.classifierTrainingUseAllowed === false, 'development-boundary-invalid');
  assert(manifest.sourceImagesIncluded === false && manifest.privateStorageReferencesIncluded === false,
    'private-evidence-leak');
  assert(manifest.frozenSourceCorpus?.sha256 === FROZEN_FIELD_CORPUS_SHA256
    && manifest.frozenSourceCorpus?.preserved === true, 'frozen-field-corpus-invalid');
  assert(manifest.sourceCounts?.localizationRelated === 27, 'failure-inventory-incomplete');
  assert(Array.isArray(manifest.failureInventory) && manifest.failureInventory.length === 27,
    'failure-inventory-detail-incomplete');
  assert(manifest.failureInventory.every((record) => !Object.hasOwn(record, 'private')),
    'failure-inventory-private-field-leak');
  const ids = new Set();
  for (const sample of manifest.samples) {
    assert(!ids.has(sample.sampleId), 'duplicate-sample-id');
    ids.add(sample.sampleId);
    assert(HASH.test(sample.imageSha256), 'sample-hash-invalid');
    assert(sample.consentVerified && sample.ownerVerified && sample.privateStorageReferenceVerified,
      'sample-governance-invalid');
    assert(sample.governanceStatus === 'admitted', 'non-admitted-sample-published');
    assert(['development', 'held-out-validation'].includes(sample.split), 'sample-split-invalid');
    assert(!Object.hasOwn(sample, 'storageReference') && !Object.hasOwn(sample, 'userId')
      && !Object.hasOwn(sample, 'privatePath'), 'private-field-leak');
  }
  assert(manifest.counts.admittedDevelopmentImages === manifest.samples.length,
    'admitted-count-mismatch');
  return manifest;
}
