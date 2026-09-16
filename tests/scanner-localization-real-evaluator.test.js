import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateLocalization,
  failureTaxonomy,
  qualityBucket
} from '../scanner/recognition/benchmark/localization-real-evaluator.js';
import {
  orderedAnnotationCorners,
  validateLocalizationCorpus
} from '../scanner/recognition/benchmark/localization-real-corpus.js';

function annotatedSample(index) {
  const sampleId = `sample-${index}`;
  return {
    sampleId,
    originalFile: `originals/${sampleId}.png`,
    originalSha256: `HASH-${index}`,
    sourceFilename: `${sampleId}.png`,
    sourceSha256: `HASH-${index}`,
    sourceWidth: 100,
    sourceHeight: 100,
    boardPresent: true,
    humanVerifiedByAlexander: true,
    groundTruth: {
      playableBoardCorners: {
        topLeft: { pixels: { x: 10, y: 10 }, normalized: { x: 0.1, y: 0.1 } },
        topRight: { pixels: { x: 90, y: 10 }, normalized: { x: 0.9, y: 0.1 } },
        bottomRight: { pixels: { x: 90, y: 90 }, normalized: { x: 0.9, y: 0.9 } },
        bottomLeft: { pixels: { x: 10, y: 90 }, normalized: { x: 0.1, y: 0.9 } }
      }
    },
    annotation: {
      annotationStatus: 'verified',
      sampleStatus: 'board-present',
      cornerOrder: 'tl-tr-br-bl'
    }
  };
}

function corpusFixture() {
  const samples = Array.from({ length: 14 }, (_, index) => annotatedSample(index));
  return {
    manifest: {
      sampleCount: 14,
      annotationSchemaVersion: 'annotations/1',
      annotationManifest: { sha256: 'ANNOTATION' },
      sourceManifest: { sha256: 'SOURCE' },
      samples: samples.map((sample, index) => ({
        sampleId: sample.sampleId,
        sha256: sample.originalSha256,
        split: index < 10 ? 'development' : 'holdout'
      }))
    },
    annotation: { schemaVersion: 'annotations/1', samples },
    source: {
      samples: samples.map((sample) => ({
        sampleId: sample.sampleId,
        originalFile: sample.originalFile,
        originalSha256: sample.originalSha256,
        boardPresent: true
      }))
    }
  };
}

test('quality buckets use conservative normalized corner thresholds', () => {
  assert.equal(qualityBucket({ normalizedCornerRmse: 0.012, normalizedWorstCornerError: 0.02 }), 'excellent');
  assert.equal(qualityBucket({ normalizedCornerRmse: 0.03, normalizedWorstCornerError: 0.05 }), 'acceptable');
  assert.equal(qualityBucket({ normalizedCornerRmse: 0.06, normalizedWorstCornerError: 0.1 }), 'review-needed');
  assert.equal(qualityBucket({ normalizedCornerRmse: 0.061, normalizedWorstCornerError: 0.05 }), 'failed');
  assert.equal(qualityBucket(null), 'failed');
});

test('failure taxonomy preserves typed failures and specific scoring stages', () => {
  const failure = (code, reasons = []) => ({
    ok: false,
    error: { code, diagnostics: { candidateSummaries: [{ rejectionReasons: reasons }] } }
  });
  assert.equal(failureTaxonomy(failure('multiple-board-candidates')), 'multiple-board-candidates');
  assert.equal(failureTaxonomy(failure('board-not-found', ['candidate-score-too-low'])), 'candidate-score-too-low');
  assert.equal(failureTaxonomy(failure('board-not-found', ['insufficient-grid-evidence'])), 'grid-score-too-low');
  assert.equal(failureTaxonomy(failure('board-not-found', ['insufficient-checker-evidence'])), 'checker-score-too-low');
});

test('failure taxonomy distinguishes outer frames from other wrong boards', () => {
  const result = { ok: true };
  const failed = { normalizedCornerRmse: 0.2, normalizedWorstCornerError: 0.2 };
  const truth = [[10, 10], [90, 10], [90, 90], [10, 90]];
  assert.equal(failureTaxonomy(result, failed, [[0, 0], [100, 0], [100, 100], [0, 100]], truth), 'outer-frame-selected');
  assert.equal(failureTaxonomy(result, failed, [[20, 20], [80, 20], [80, 80], [20, 80]], truth), 'wrong-board-selected');
});

test('aggregate metrics separate detection from accepted localization', () => {
  const samples = [
    { sampleId: 'a', detected: true, localizationAccepted: true, ambiguity: false, failureTaxonomy: null, cornerRmse: 0.01, worstCornerError: 0.02, homographySuccess: true, geometryContractSuccess: true, qualityBucket: 'excellent', timingsMs: { totalGeometry: 10 } },
    { sampleId: 'b', detected: true, localizationAccepted: false, ambiguity: false, failureTaxonomy: 'corner-position-error', cornerRmse: 0.05, worstCornerError: 0.08, homographySuccess: true, geometryContractSuccess: true, qualityBucket: 'review-needed', timingsMs: { totalGeometry: 30 } },
    { sampleId: 'c', detected: false, localizationAccepted: false, ambiguity: true, failureTaxonomy: 'multiple-board-candidates', cornerRmse: null, worstCornerError: null, homographySuccess: false, geometryContractSuccess: false, qualityBucket: 'failed', timingsMs: { totalGeometry: 20 } }
  ];
  const metrics = aggregateLocalization(samples);
  assert.equal(metrics.boardFoundRate, 0.666667);
  assert.equal(metrics.localizationAcceptedRate, 0.333333);
  assert.equal(metrics.multipleBoardAmbiguityRate, 0.333333);
  assert.equal(metrics.cornerAccuracy.medianNormalizedRmse, 0.03);
  assert.equal(metrics.latencyMs.median, 20);
});

test('corpus validator certifies the immutable 14-sample 10/4 contract', () => {
  const fixture = corpusFixture();
  const result = validateLocalizationCorpus({
    ...fixture,
    annotationSha256: 'ANNOTATION',
    sourceSha256: 'SOURCE'
  });
  assert.deepEqual(result, {
    sampleCount: 14,
    developmentCount: 10,
    holdoutCount: 4,
    annotationSha256: 'ANNOTATION',
    sourceSha256: 'SOURCE'
  });
  assert.deepEqual(orderedAnnotationCorners(fixture.annotation.samples[0]), [[10, 10], [90, 10], [90, 90], [10, 90]]);
});

test('corpus validator rejects checksum identity drift', () => {
  const fixture = corpusFixture();
  fixture.annotation.samples[4].sourceSha256 = 'CHANGED';
  assert.throws(() => validateLocalizationCorpus({
    ...fixture,
    annotationSha256: 'ANNOTATION',
    sourceSha256: 'SOURCE'
  }), /sample-4:checksum-identity-mismatch/);
});

test('corpus validator rejects non-convex or out-of-range annotations', () => {
  const fixture = corpusFixture();
  fixture.annotation.samples[2].groundTruth.playableBoardCorners.bottomRight = {
    pixels: { x: 20, y: 20 }, normalized: { x: 1.2, y: 0.2 }
  };
  assert.throws(() => validateLocalizationCorpus({
    ...fixture,
    annotationSha256: 'ANNOTATION',
    sourceSha256: 'SOURCE'
  }), /sample-2:normalized-corner-out-of-range/);
});
