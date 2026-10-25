import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { FROZEN_FIELD_CORPUS_SHA256, sha256 } from './cohort.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
if (!args.manifest || !args.browser || !args.private || !args.output) {
  throw new Error('Usage: node build-audit-report.mjs --manifest=<public> --browser=<private diagnostics> '
    + '--private=<private source manifest> --output=<public report>');
}

const manifest = JSON.parse(await readFile(resolve(args.manifest), 'utf8'));
const browser = JSON.parse(await readFile(resolve(args.browser), 'utf8'));
const privateSource = JSON.parse(await readFile(resolve(args.private), 'utf8'));
const inventoryByHash = new Map(manifest.failureInventory
  .filter((record) => record.imageHash)
  .map((record) => [record.imageHash, record]));
const publicSamples = new Map(manifest.samples.map((sample) => [sample.sampleId, sample]));
const held = new Map((privateSource.excludedOrHeld || []).map((item) => [item.sampleId, item]));

const samples = browser.samples.map((diagnostic) => {
  const source = privateSource.records.find((record) => record.sampleId === diagnostic.sampleId);
  if (!source) throw new Error(`${diagnostic.sampleId}:private-source-record-missing`);
  const inventory = inventoryByHash.get(source.imageSha256);
  if (!inventory) throw new Error(`${diagnostic.sampleId}:failure-inventory-record-missing`);
  const selected = diagnostic.candidateSummaries?.[0] || null;
  const runner = diagnostic.candidateSummaries?.[1] || null;
  const published = publicSamples.get(diagnostic.sampleId);
  return {
    sampleId: diagnostic.sampleId,
    imageSha256: source.imageSha256,
    platform: inventory.platform,
    captureType: inventory.captureType,
    orientation: inventory.orientation,
    governanceStatus: published?.governanceStatus || held.get(diagnostic.sampleId)?.governanceStatus || 'review-required',
    split: published?.split || 'held-pending-dedup-review',
    annotationStatus: 'pending-human-playable-field-corners',
    browserPipeline: {
      returnedBoard: diagnostic.ok === true,
      failureCode: diagnostic.errorCode,
      candidateCount: diagnostic.candidateCount,
      acceptedCandidateCount: diagnostic.acceptedCandidateCount,
      selectedCandidateScore: diagnostic.selectedCandidateScore,
      runnerUpCandidateScore: diagnostic.runnerUpCandidateScore,
      scoreMargin: Number.isFinite(diagnostic.scoreMargin)
        ? diagnostic.scoreMargin
        : (Number.isFinite(selected?.candidateScore) && Number.isFinite(runner?.candidateScore)
          ? selected.candidateScore - runner.candidateScore : null),
      selectedSource: diagnostic.selectedSource,
      geometryScore: diagnostic.geometryScore,
      gridScore: diagnostic.gridScore,
      checkerScore: diagnostic.checkerScore,
      gridPhaseScore: diagnostic.gridPhaseScore,
      workingWidth: diagnostic.preprocessing?.workingWidth,
      workingHeight: diagnostic.preprocessing?.workingHeight,
      candidateGenerationMs: diagnostic.timing?.candidateGenerationMs,
      scoringMs: diagnostic.timing?.candidateScoringMs,
      homographyMs: diagnostic.timing?.homographyMs,
      totalGeometryMs: diagnostic.timing?.totalGeometryMs,
      totalClientPreprocessMs: diagnostic.timing?.totalPreprocessMs
    }
  };
});

const group = (key) => Object.fromEntries(Object.entries(samples.reduce((counts, sample) => {
  const value = sample[key] || 'unknown';
  counts[value] = (counts[value] || 0) + 1;
  return counts;
}, {})).sort(([left], [right]) => left.localeCompare(right)));
const mean = (selector) => samples.reduce((sum, sample) => sum + (selector(sample) || 0), 0) / samples.length;
const taxonomy = Object.fromEntries(Object.entries(manifest.failureInventory.reduce((counts, record) => {
  counts[record.taxonomy] = (counts[record.taxonomy] || 0) + 1;
  return counts;
}, {})).sort(([left], [right]) => left.localeCompare(right)));

const report = {
  schemaVersion: 'caissa-scanner-localization-field-hard-audit/1',
  corpusVersion: manifest.corpusVersion,
  sourceRole: 'development-only',
  generatedFromPrivateEvidence: true,
  privateImagesIncluded: false,
  privateStorageReferencesIncluded: false,
  certifiedSource: {
    corpusVersion: 'caissa-scanner-beta-field-v0.1',
    sha256: FROZEN_FIELD_CORPUS_SHA256,
    preserved: true
  },
  classifierFreeze: {
    modelVersion: 'caissa-piece-classifier-v0.5-occupancy-recovery',
    modelSha256: '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
    onnxSha256: 'FFF4C633613997C7C29ACD31FB233CF9A2150D173AAB4E38E0BF650644485211',
    occupancyThreshold: 0.99,
    changed: false
  },
  failureAudit: {
    auditedRecords: manifest.failureInventory.length,
    governedImagesAvailable: samples.length,
    admittedForDevelopment: manifest.counts.admittedDevelopmentImages,
    heldForDedupReview: manifest.counts.heldOrExcludedGovernedImages,
    excludedForMissingEvidenceOrConsent: manifest.counts.excludedFailureRecords,
    taxonomy,
    note: 'UNKNOWN is retained whenever source evidence or human corner truth is insufficient.'
  },
  currentAlgorithm: {
    localizerVersion: 'caissa-scanner-board-localizer/4',
    clientServerBoundary: 'decode/localization/homography client-side; frozen classifier server-side',
    maxAnalysisEdge: 256,
    maxCandidates: 12,
    minCandidateScore: 0.6,
    minGridEvidence: 0.35,
    minCheckerEvidence: 0.24,
    minGridPhaseEvidence: 0.36,
    ambiguityMargin: 0.08,
    topCandidateRectification: true,
    candidateEvidence: ['geometry', '8x8-grid', 'grid-phase', 'checker-support', 'edge', 'playable-field-boundary'],
    homography: 'true-3x3-inverse-mapped-bilinear-rgba',
    boardSize: 512,
    tileSize: 64,
    tileCount: 64,
    centerCropFallback: false
  },
  exactBrowserBaseline: {
    runtime: browser.runtime,
    samples: browser.sampleCount,
    returnedBoard: browser.returnedBoard,
    abstained: browser.abstained,
    correctBoardSelection: 'not-scorable-without-human-corner-truth',
    wrongBoardSelection: 'not-scorable-without-human-corner-truth',
    meanTotalGeometryMs: mean((sample) => sample.browserPipeline.totalGeometryMs),
    meanTotalClientPreprocessMs: mean((sample) => sample.browserPipeline.totalClientPreprocessMs),
    byPlatform: group('platform'),
    byCaptureType: group('captureType'),
    byOrientation: group('orientation')
  },
  experimentMatrix: [
    { id: 'A', variant: 'current-production-v4', result: 'measured-exact-browser-baseline' },
    { id: 'B', variant: 'rectified-grid-ranking', result: 'already-contained-in-current-production-v4' },
    { id: 'C', variant: 'ranking-plus-ambiguity-margin', result: 'already-contained-in-current-production-v4' },
    { id: 'D', variant: 'geometry-grid-checker-composite', result: 'already-contained-in-current-production-v4' }
  ],
  selectionDecision: {
    selectedVariant: 'A-current-production-v4-no-algorithm-change',
    reason: 'All proposed bounded variants are already present in v4, and the 12 recoverable labels lack human corner truth.',
    releaseGatePassed: false,
    decision: 'MORE LOCALIZATION DATA REQUIRED'
  },
  annotationPreparation: {
    workflow: 'existing-crash-safe-four-corner-annotator',
    order: ['TL', 'TR', 'BR', 'BL'],
    truthTarget: 'playable-8x8-field-only',
    preferredUniqueCount: '10-30',
    availableBeforeManualDedup: samples.length,
    admittedAfterAutomatedGovernance: manifest.counts.admittedDevelopmentImages
  },
  samples
};
report.auditSha256 = sha256(`${JSON.stringify(report)}\n`);
await writeFile(resolve(args.output), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output: resolve(args.output), auditSha256: report.auditSha256 }));
