import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STABLE_LOCALIZATION_CODES,
  localizationDiagnostics,
  stableLocalizationFailure
} from '../scanner/beta/scanner-localization-diagnostics.js';

const candidate = (score, overrides = {}) => ({
  source: 'grid-periodicity-search',
  accepted: true,
  candidateScore: score,
  geometryScore: 0.91,
  gridEvidenceScore: 0.88,
  checkerEvidenceScore: 0.72,
  gridPhaseEvidenceScore: 0.8,
  rejectionReasons: [],
  ...overrides
});

test('stable localization codes cover every required typed failure', () => {
  assert.deepEqual(STABLE_LOCALIZATION_CODES, [
    'NO_BOARD_FOUND',
    'AMBIGUOUS_BOARD',
    'LOW_LOCALIZATION_CONFIDENCE',
    'INVALID_QUAD',
    'HOMOGRAPHY_FAILURE',
    'MULTIPLE_BOARD_CANDIDATES'
  ]);
  assert.equal(stableLocalizationFailure({ code: 'board-not-found', diagnostics: { candidateCount: 0 } }).code, 'NO_BOARD_FOUND');
  assert.equal(stableLocalizationFailure({ code: 'board-not-found', diagnostics: { candidateCount: 4 } }).code, 'LOW_LOCALIZATION_CONFIDENCE');
  assert.equal(stableLocalizationFailure({ code: 'ambiguous-board' }).code, 'AMBIGUOUS_BOARD');
  assert.equal(stableLocalizationFailure({ code: 'multiple-board-candidates' }).code, 'MULTIPLE_BOARD_CANDIDATES');
  assert.equal(stableLocalizationFailure({ code: 'invalid-quadrilateral' }).code, 'INVALID_QUAD');
  assert.equal(stableLocalizationFailure({ code: 'homography-failed' }).code, 'HOMOGRAPHY_FAILURE');
});

test('diagnostics preserve bounded deterministic ranking evidence', () => {
  const summarized = localizationDiagnostics({ diagnostics: {
    localizerVersion: 'v4',
    candidateCount: 3,
    acceptedCandidateCount: 2,
    scoreSeparation: 0.04,
    candidateSummaries: [candidate(0.91), candidate(0.87), candidate(0.6)]
  } });
  assert.deepEqual(summarized, {
    schemaVersion: 'caissa-scanner-localization-diagnostics/1',
    localizerVersion: 'v4',
    candidateCount: 3,
    acceptedCandidateCount: 2,
    selectedCandidateScore: 0.91,
    runnerUpCandidateScore: 0.87,
    scoreMargin: 0.04,
    geometryScore: 0.91,
    gridScore: 0.88,
    checkerScore: 0.72,
    gridPhaseScore: 0.8,
    candidates: [
      {
        source: 'grid-periodicity-search', accepted: true, candidateScore: 0.91,
        geometryScore: 0.91, gridScore: 0.88, checkerScore: 0.72, gridPhaseScore: 0.8,
        rejectionReasons: []
      },
      {
        source: 'grid-periodicity-search', accepted: true, candidateScore: 0.87,
        geometryScore: 0.91, gridScore: 0.88, checkerScore: 0.72, gridPhaseScore: 0.8,
        rejectionReasons: []
      }
    ]
  });
  assert(Object.isFrozen(summarized));
  assert.equal(summarized.candidates.length, 2);
});

test('unknown non-localization failures remain outside the mapper', () => {
  assert.equal(stableLocalizationFailure({ code: 'NETWORK_FAILURE' }), null);
});
