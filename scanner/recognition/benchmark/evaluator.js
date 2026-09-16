import {
  PIECE_CLASSES,
  labelsToFenPlacement,
  validateBenchmarkManifest
} from './manifest.js';
import { validateHomographyOutput } from './geometry.js';

export const REPORT_SCHEMA_VERSION = 'caissa-scanner-benchmark-report/1';

const EMPTY = 'empty';
const CLASS_INDEX = new Map(PIECE_CLASSES.map((label, index) => [label, index]));

function ratio(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function colorOf(label) {
  if (label === EMPTY) return null;
  return label === label.toUpperCase() ? 'white' : 'black';
}

function pieceTypeOf(label) {
  return label === EMPTY ? null : label.toLowerCase();
}

function emptyConfusionMatrix() {
  return Object.fromEntries(PIECE_CLASSES.map((truth) => [
    truth,
    Object.fromEntries(PIECE_CLASSES.map((prediction) => [prediction, 0]))
  ]));
}

function normalizedCornerError(truthCorners, predictedCorners, imageWidth, imageHeight) {
  if (!Array.isArray(truthCorners) || !Array.isArray(predictedCorners) || truthCorners.length !== 4 || predictedCorners.length !== 4) return null;
  const diagonal = Math.hypot(imageWidth, imageHeight);
  if (!diagonal) return null;
  const errors = truthCorners.map((truth, index) => Math.hypot(
    truth[0] - predictedCorners[index][0],
    truth[1] - predictedCorners[index][1]
  ) / diagonal);
  return { rmse: Math.sqrt(mean(errors.map((value) => value * value))), worst: Math.max(...errors) };
}

function confidenceFor(output, index, predictedLabel) {
  const vector = output.probabilitiesBySquare?.[index];
  if (vector && Number.isFinite(vector[predictedLabel])) return vector[predictedLabel];
  const confidence = output.confidenceBySquare?.[index];
  return Number.isFinite(confidence) ? confidence : null;
}

function brierFor(vector, truthLabel) {
  if (!vector || PIECE_CLASSES.some((label) => !Number.isFinite(vector[label]))) return null;
  return PIECE_CLASSES.reduce((sum, label) => {
    const target = label === truthLabel ? 1 : 0;
    return sum + ((vector[label] - target) ** 2);
  }, 0) / PIECE_CLASSES.length;
}

function calibrationError(observations, binCount = 10) {
  if (!observations.length) return null;
  let weightedError = 0;
  for (let bin = 0; bin < binCount; bin += 1) {
    const lower = bin / binCount;
    const upper = (bin + 1) / binCount;
    const members = observations.filter(({ confidence }) => confidence >= lower && (bin === binCount - 1 ? confidence <= upper : confidence < upper));
    if (!members.length) continue;
    const accuracy = members.filter(({ correct }) => correct).length / members.length;
    weightedError += (members.length / observations.length) * Math.abs(accuracy - mean(members.map(({ confidence }) => confidence)));
  }
  return weightedError;
}

function correctionBuckets(counts) {
  return {
    zero: counts.filter((count) => count === 0).length,
    one: counts.filter((count) => count === 1).length,
    two: counts.filter((count) => count === 2).length,
    threeOrMore: counts.filter((count) => count >= 3).length
  };
}

function deterministicCounts(values) {
  const counts = {};
  [...values].sort().forEach((value) => {
    counts[value] = (counts[value] || 0) + 1;
  });
  return counts;
}

export function createBenchmarkReport({
  manifest,
  outputs,
  manifestChecksum,
  recognizer,
  confidenceThreshold = 0.6
}) {
  const manifestValidation = validateBenchmarkManifest(manifest);
  if (!manifestValidation.ok) {
    const error = new Error('Benchmark manifest is invalid.');
    error.code = 'INVALID_BENCHMARK_MANIFEST';
    error.details = manifestValidation.errors;
    throw error;
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(manifestChecksum || '')) throw new Error('A valid immutable manifest checksum is required.');
  if (!recognizer || !recognizer.modelVersion || !recognizer.preprocessingVersion || !recognizer.backend) {
    throw new Error('Recognizer modelVersion, preprocessingVersion, and backend are required.');
  }

  const outputById = new Map();
  for (const output of outputs || []) {
    if (!output?.sampleId || outputById.has(output.sampleId)) throw new Error('Recognizer outputs require unique sampleId values.');
    outputById.set(output.sampleId, output);
  }

  const confusionMatrix = emptyConfusionMatrix();
  const categoryValues = manifest.samples.flatMap((sample) => sample.categories);
  const correctionCounts = [];
  const latencies = [];
  const peakMemoryValues = [];
  const cornerRmse = [];
  const cornerWorst = [];
  const brierScores = [];
  const calibrationObservations = [];
  const failedCategories = [];
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let geometrySuccess = 0;
  let geometryFailure = 0;
  let orientationKnown = 0;
  let orientationCorrect = 0;
  let orientationAmbiguous = 0;
  let squareCount = 0;
  let squareCorrect = 0;
  let occupancyCorrect = 0;
  let occupiedTruthCount = 0;
  let colorCorrect = 0;
  let pieceTypeCorrect = 0;
  let exactBoardCount = 0;
  let exactFenPlacementCount = 0;
  let recognizedPositiveCount = 0;
  let wrongSquareCount = 0;
  let lowConfidenceWrongSquares = 0;
  let errorSamples = 0;
  let reviewCapturedErrorSamples = 0;

  for (const sample of manifest.samples) {
    const output = outputById.get(sample.sampleId) || { sampleId: sample.sampleId, status: 'missing', boardDetected: false };
    const truthPresent = sample.groundTruth.boardPresent;
    const detected = output.boardDetected === true || output.status === 'candidate';
    if (truthPresent && detected) truePositive += 1;
    else if (!truthPresent && !detected) trueNegative += 1;
    else if (!truthPresent && detected) falsePositive += 1;
    else falseNegative += 1;

    if (detected) {
      const geometryValidation = validateHomographyOutput(output.geometry);
      if (geometryValidation.ok) geometrySuccess += 1;
      else geometryFailure += 1;
    }

    const cornerError = normalizedCornerError(
      sample.groundTruth.boardCorners,
      output.boardCorners,
      sample.imageWidth,
      sample.imageHeight
    );
    if (cornerError) {
      cornerRmse.push(cornerError.rmse);
      cornerWorst.push(cornerError.worst);
    }

    const truthOrientation = sample.groundTruth.orientation;
    if (truthPresent && truthOrientation && truthOrientation !== 'unknown') {
      orientationKnown += 1;
      if (!output.orientation || output.orientation === 'unknown') orientationAmbiguous += 1;
      else if (output.orientation === truthOrientation) orientationCorrect += 1;
    }

    let sampleExact = false;
    let sampleHasError = truthPresent && !detected;
    let sampleReviewCaptured = false;
    if (truthPresent && Array.isArray(output.squareLabels) && output.squareLabels.length === 64) {
      recognizedPositiveCount += 1;
      let corrections = 0;
      for (let index = 0; index < 64; index += 1) {
        const truth = sample.groundTruth.squareLabels[index];
        const predicted = output.squareLabels[index];
        if (!CLASS_INDEX.has(predicted)) throw new Error(`Recognizer output for ${sample.sampleId} has an invalid class at index ${index}.`);
        confusionMatrix[truth][predicted] += 1;
        squareCount += 1;
        const correct = truth === predicted;
        if (correct) squareCorrect += 1;
        else {
          corrections += 1;
          wrongSquareCount += 1;
          sampleHasError = true;
        }
        if ((truth === EMPTY) === (predicted === EMPTY)) occupancyCorrect += 1;
        if (truth !== EMPTY) {
          occupiedTruthCount += 1;
          if (colorOf(truth) === colorOf(predicted)) colorCorrect += 1;
          if (pieceTypeOf(truth) === pieceTypeOf(predicted)) pieceTypeCorrect += 1;
        }

        const confidence = confidenceFor(output, index, predicted);
        if (confidence !== null) {
          calibrationObservations.push({ confidence, correct });
          if (!correct && confidence < confidenceThreshold) {
            lowConfidenceWrongSquares += 1;
            sampleReviewCaptured = true;
          }
        }
        const brier = brierFor(output.probabilitiesBySquare?.[index], truth);
        if (brier !== null) brierScores.push(brier);
      }
      correctionCounts.push(corrections);
      sampleExact = corrections === 0;
      if (sampleExact) exactBoardCount += 1;
      const labelsFen = labelsToFenPlacement(output.squareLabels);
      if (output.candidateFenPlacement && output.candidateFenPlacement !== labelsFen) {
        throw new Error(`Recognizer output for ${sample.sampleId} has inconsistent square labels and candidate FEN placement.`);
      }
      const predictedFen = output.candidateFenPlacement || labelsFen;
      if (predictedFen === sample.groundTruth.fenPlacement) exactFenPlacementCount += 1;
    }

    if (sampleHasError) {
      errorSamples += 1;
      if (sampleReviewCaptured || output.status !== 'candidate' || output.requiresReview === true) reviewCapturedErrorSamples += 1;
    }
    if (truthPresent && !sampleExact) failedCategories.push(...sample.categories);
    if (!truthPresent && detected) failedCategories.push(...sample.categories);

    if (Number.isFinite(output.timingsMs?.total)) latencies.push(output.timingsMs.total);
    if (Number.isFinite(output.peakMemoryBytes)) peakMemoryValues.push(output.peakMemoryBytes);
  }

  const positiveSamples = manifest.samples.filter((sample) => sample.groundTruth.boardPresent).length;
  const negativeSamples = manifest.samples.length - positiveSamples;
  const detectedSamples = truePositive + falsePositive;
  const buckets = correctionBuckets(correctionCounts);

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    benchmarkVersion: manifest.benchmarkVersion,
    manifestChecksum,
    recognizer: { ...recognizer },
    sampleCount: manifest.samples.length,
    categoryCounts: deterministicCounts(categoryValues),
    detection: {
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
      successRate: ratio(truePositive + trueNegative, manifest.samples.length),
      falsePositiveRate: ratio(falsePositive, negativeSamples),
      falseNegativeRate: ratio(falseNegative, positiveSamples)
    },
    localization: {
      evaluatedCount: cornerRmse.length,
      meanNormalizedCornerRmse: mean(cornerRmse),
      meanNormalizedWorstCornerError: mean(cornerWorst),
      quadrilateralOverlap: null
    },
    geometry: {
      evaluatedDetectedCount: detectedSamples,
      successCount: geometrySuccess,
      failureCount: geometryFailure,
      successRate: ratio(geometrySuccess, detectedSamples),
      equalCellInvariantRequired: true
    },
    orientation: {
      evaluatedKnownCount: orientationKnown,
      correctCount: orientationCorrect,
      accuracy: ratio(orientationCorrect, orientationKnown),
      ambiguousCount: orientationAmbiguous,
      ambiguityRate: ratio(orientationAmbiguous, orientationKnown)
    },
    squares: {
      evaluatedSampleCount: recognizedPositiveCount,
      evaluatedSquareCount: squareCount,
      fullClassAccuracy: ratio(squareCorrect, squareCount),
      occupiedVsEmptyAccuracy: ratio(occupancyCorrect, squareCount),
      colorAccuracy: ratio(colorCorrect, occupiedTruthCount),
      pieceTypeAccuracy: ratio(pieceTypeCorrect, occupiedTruthCount),
      confusionMatrix
    },
    positions: {
      positiveSampleCount: positiveSamples,
      exactBoardCount,
      exactBoardAccuracy: ratio(exactBoardCount, positiveSamples),
      exactFenPlacementCount,
      exactFenPlacementAccuracy: ratio(exactFenPlacementCount, positiveSamples),
      wrongSquareCount
    },
    correctionBurden: {
      evaluatedCount: correctionCounts.length,
      zeroCorrections: buckets.zero,
      oneCorrection: buckets.one,
      twoCorrections: buckets.two,
      threeOrMoreCorrections: buckets.threeOrMore,
      zeroCorrectionRate: ratio(buckets.zero, correctionCounts.length),
      oneCorrectionRate: ratio(buckets.one, correctionCounts.length),
      twoCorrectionRate: ratio(buckets.two, correctionCounts.length),
      threeOrMoreCorrectionRate: ratio(buckets.threeOrMore, correctionCounts.length),
      meanCorrections: mean(correctionCounts),
      medianCorrections: median(correctionCounts)
    },
    confidence: {
      confidenceThreshold,
      evaluatedPredictionCount: calibrationObservations.length,
      brierScore: mean(brierScores),
      expectedCalibrationError: calibrationError(calibrationObservations),
      lowConfidenceRecall: ratio(lowConfidenceWrongSquares, wrongSquareCount),
      errorCaptureRate: ratio(reviewCapturedErrorSamples, errorSamples)
    },
    performance: {
      evaluatedLatencyCount: latencies.length,
      meanLatencyMs: mean(latencies),
      medianLatencyMs: median(latencies),
      peakMemoryBytes: peakMemoryValues.length ? Math.max(...peakMemoryValues) : null
    },
    failuresByCategory: deterministicCounts(failedCategories)
  };
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortRecursively(value[key])]));
}

export function serializeBenchmarkReport(report) {
  return `${JSON.stringify(sortRecursively(report), null, 2)}\n`;
}

function percent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

export function summarizeBenchmarkReport(report) {
  return [
    `${report.benchmarkVersion} (${report.sampleCount} samples)`,
    `Detection success: ${percent(report.detection.successRate)}`,
    `Per-square accuracy: ${percent(report.squares.fullClassAccuracy)}`,
    `Exact-board accuracy: ${percent(report.positions.exactBoardAccuracy)}`,
    `Zero-correction rate: ${percent(report.correctionBurden.zeroCorrectionRate)}`,
    `Median corrections: ${report.correctionBurden.medianCorrections ?? 'n/a'}`,
    `Median latency: ${report.performance.medianLatencyMs ?? 'n/a'} ms`
  ].join('\n');
}
