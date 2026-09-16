(function (global) {
  'use strict';

  const geometry = global.CaissaScannerBoardGeometry;
  if (!geometry) throw new Error('CAISSA Scanner board geometry must load before localization.');

  const LOCALIZER_VERSION = 'caissa-scanner-board-localizer/1';
  const MAX_ANALYSIS_EDGE = 256;
  const MAX_CANDIDATES = 12;
  const MIN_CANDIDATE_SCORE = 0.5;
  const MIN_GRID_EVIDENCE = 0.35;
  const MIN_CHECKER_EVIDENCE = 0.24;
  const AMBIGUITY_MARGIN = 0.08;
  const SCORE_SAMPLE_SIZE = 80;

  function clamp(value, minimum = 0, maximum = 1) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function standardDeviation(values, average = mean(values)) {
    if (!values.length) return 0;
    return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
  }

  function percentile(values, fraction) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.min(ordered.length - 1, Math.max(0, Math.floor((ordered.length - 1) * fraction)))];
  }

  function rgbaToAnalysis(pixels, width, height) {
    const source = new Uint8ClampedArray(pixels);
    const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(width, height));
    const analysisWidth = Math.max(1, Math.round(width * scale));
    const analysisHeight = Math.max(1, Math.round(height * scale));
    const gray = new Float32Array(analysisWidth * analysisHeight);
    for (let y = 0; y < analysisHeight; y += 1) {
      const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / analysisHeight));
      for (let x = 0; x < analysisWidth; x += 1) {
        const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / analysisWidth));
        const offset = ((sourceY * width) + sourceX) * 4;
        gray[(y * analysisWidth) + x] = (0.2126 * source[offset])
          + (0.7152 * source[offset + 1])
          + (0.0722 * source[offset + 2]);
      }
    }
    return Object.freeze({
      gray,
      width: analysisWidth,
      height: analysisHeight,
      scaleX: width / analysisWidth,
      scaleY: height / analysisHeight
    });
  }

  function sobelEdges(gray, width, height) {
    const magnitude = new Float32Array(width * height);
    const nonzero = [];
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const rowAbove = (y - 1) * width;
        const row = y * width;
        const rowBelow = (y + 1) * width;
        const gx = -gray[rowAbove + x - 1] + gray[rowAbove + x + 1]
          - (2 * gray[row + x - 1]) + (2 * gray[row + x + 1])
          - gray[rowBelow + x - 1] + gray[rowBelow + x + 1];
        const gy = -gray[rowAbove + x - 1] - (2 * gray[rowAbove + x]) - gray[rowAbove + x + 1]
          + gray[rowBelow + x - 1] + (2 * gray[rowBelow + x]) + gray[rowBelow + x + 1];
        const value = Math.abs(gx) + Math.abs(gy);
        magnitude[row + x] = value;
        if (value > 0.5) nonzero.push(value);
      }
    }
    const threshold = Math.max(5, percentile(nonzero, 0.58) * 0.72);
    const softThreshold = Math.max(3, threshold * 0.35);
    const binary = new Uint8Array(width * height);
    const softBinary = new Uint8Array(width * height);
    for (let index = 0; index < magnitude.length; index += 1) {
      binary[index] = magnitude[index] >= threshold ? 1 : 0;
      softBinary[index] = magnitude[index] >= softThreshold ? 1 : 0;
    }
    return Object.freeze({ magnitude, binary, softBinary, threshold, softThreshold });
  }

  function dilate(binary, width, height) {
    const output = new Uint8Array(binary.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width) + x;
        if (!binary[index]) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) output[index + (dy * width) + dx] = 1;
        }
      }
    }
    return output;
  }

  function connectedComponents(binary, originalEdges, width, height) {
    const visited = new Uint8Array(binary.length);
    const components = [];
    const minimumPixels = Math.max(32, Math.floor(width * height * 0.0015));
    for (let start = 0; start < binary.length; start += 1) {
      if (!binary[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      const points = [];
      let count = 0;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        count += 1;
        const x = index % width;
        const y = Math.floor(index / width);
        if (originalEdges[index]) points.push([x + 0.5, y + 0.5]);
        for (let dy = -1; dy <= 1; dy += 1) {
          const nextY = y + dy;
          if (nextY < 0 || nextY >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nextX = x + dx;
            if (nextX < 0 || nextX >= width) continue;
            const nextIndex = (nextY * width) + nextX;
            if (binary[nextIndex] && !visited[nextIndex]) {
              visited[nextIndex] = 1;
              queue.push(nextIndex);
            }
          }
        }
      }
      if (count >= minimumPixels && points.length >= 16) components.push({ count, points });
    }
    return components.sort((a, b) => b.count - a.count).slice(0, MAX_CANDIDATES * 2);
  }

  function convexHull(points) {
    const sorted = points.map((point) => [point[0], point[1]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length <= 1) return sorted;
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && ((lower[lower.length - 1][0] - lower[lower.length - 2][0]) * (point[1] - lower[lower.length - 2][1])
        - (lower[lower.length - 1][1] - lower[lower.length - 2][1]) * (point[0] - lower[lower.length - 2][0])) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const point = sorted[index];
      while (upper.length >= 2 && ((upper[upper.length - 1][0] - upper[upper.length - 2][0]) * (point[1] - upper[upper.length - 2][1])
        - (upper[upper.length - 1][1] - upper[upper.length - 2][1]) * (point[0] - upper[upper.length - 2][0])) <= 0) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function reduceHull(hull, maximum = 24) {
    if (hull.length <= maximum) return hull;
    const reduced = [];
    for (let index = 0; index < maximum; index += 1) reduced.push(hull[Math.floor((index * hull.length) / maximum)]);
    return reduced;
  }

  function maximumAreaQuadrilateral(hull) {
    const points = reduceHull(hull);
    if (points.length < 4) return null;
    let best = null;
    let bestArea = 0;
    for (let a = 0; a < points.length - 3; a += 1) {
      for (let b = a + 1; b < points.length - 2; b += 1) {
        for (let c = b + 1; c < points.length - 1; c += 1) {
          for (let d = c + 1; d < points.length; d += 1) {
            const candidate = [points[a], points[b], points[c], points[d]];
            const area = Math.abs(geometry.polygonSignedArea(candidate));
            if (area > bestArea) {
              bestArea = area;
              best = candidate;
            }
          }
        }
      }
    }
    return best ? geometry.orderCorners(best) : null;
  }

  function cornersNear(left, right, tolerance = 5) {
    return left.every((point, index) => Math.hypot(point[0] - right[index][0], point[1] - right[index][1]) <= tolerance);
  }

  function generateCandidateSeeds(edgeResult, width, height) {
    const seeds = [{
      source: 'full-frame-grid-hypothesis',
      corners: geometry.orderCorners([[0, 0], [width, 0], [width, height], [0, height]])
    }];
    const passes = [
      ['strong', edgeResult.binary],
      ['soft', edgeResult.softBinary]
    ];
    for (const [label, binary] of passes) {
      const expanded = dilate(binary, width, height);
      const components = connectedComponents(expanded, binary, width, height);
      for (const [index, component] of components.entries()) {
        const corners = maximumAreaQuadrilateral(convexHull(component.points));
        if (!corners || seeds.some((seed) => cornersNear(seed.corners, corners))) continue;
        seeds.push({ source: `edge-component-${label}-${index + 1}`, corners });
        if (seeds.length >= MAX_CANDIDATES) break;
      }
      if (seeds.length >= MAX_CANDIDATES) break;
    }
    return seeds;
  }

  function sampleGray(gray, width, height, x, y) {
    const px = clamp(x - 0.5, 0, width - 1);
    const py = clamp(y - 0.5, 0, height - 1);
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const dx = px - x0;
    const dy = py - y0;
    const top = (gray[(y0 * width) + x0] * (1 - dx)) + (gray[(y0 * width) + x1] * dx);
    const bottom = (gray[(y1 * width) + x0] * (1 - dx)) + (gray[(y1 * width) + x1] * dx);
    return (top * (1 - dy)) + (bottom * dy);
  }

  function rectifyGraySample(gray, width, height, corners, size = SCORE_SAMPLE_SIZE) {
    const transform = geometry.buildTransform(corners, size);
    const output = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const [sourceX, sourceY] = geometry.transformPoint(transform.boardToSource, [x + 0.5, y + 0.5]);
        output[(y * size) + x] = sampleGray(gray, width, height, sourceX, sourceY);
      }
    }
    return output;
  }

  function scoreRectifiedGrid(sample, size) {
    const cell = size / 8;
    const evenCells = [];
    const oddCells = [];
    const ringOffsets = [[0.22, 0.22], [0.78, 0.22], [0.22, 0.78], [0.78, 0.78], [0.5, 0.5]];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const values = ringOffsets.map(([offsetX, offsetY]) => sampleGray(
          sample,
          size,
          size,
          (col + offsetX) * cell,
          (row + offsetY) * cell
        ));
        ((row + col) % 2 ? oddCells : evenCells).push(mean(values));
      }
    }
    const allCells = evenCells.concat(oddCells);
    const overallStd = standardDeviation(allCells);
    const evenMean = mean(evenCells);
    const oddMean = mean(oddCells);
    const parityDifference = Math.abs(evenMean - oddMean);
    const withinParity = (standardDeviation(evenCells, evenMean) + standardDeviation(oddCells, oddMean)) / 2;
    const paritySeparation = clamp(parityDifference / Math.max(4, overallStd));
    const parityConsistency = parityDifference > 2
      ? clamp(1 - (withinParity / Math.max(8, parityDifference * 1.5)))
      : 0;
    const checkerEvidenceScore = clamp((0.72 * paritySeparation) + (0.28 * parityConsistency));

    const verticalBoundaries = [];
    const horizontalBoundaries = [];
    const verticalInterior = [];
    const horizontalInterior = [];
    const delta = Math.max(0.75, cell * 0.08);
    for (let boundary = 1; boundary < 8; boundary += 1) {
      let verticalSum = 0;
      let horizontalSum = 0;
      let verticalOffSum = 0;
      let horizontalOffSum = 0;
      const samples = 32;
      for (let index = 0; index < samples; index += 1) {
        const along = ((index + 0.5) / samples) * size;
        const boundaryPosition = boundary * cell;
        const interiorPosition = (boundary - 0.5) * cell;
        verticalSum += Math.abs(sampleGray(sample, size, size, boundaryPosition - delta, along)
          - sampleGray(sample, size, size, boundaryPosition + delta, along));
        horizontalSum += Math.abs(sampleGray(sample, size, size, along, boundaryPosition - delta)
          - sampleGray(sample, size, size, along, boundaryPosition + delta));
        verticalOffSum += Math.abs(sampleGray(sample, size, size, interiorPosition - delta, along)
          - sampleGray(sample, size, size, interiorPosition + delta, along));
        horizontalOffSum += Math.abs(sampleGray(sample, size, size, along, interiorPosition - delta)
          - sampleGray(sample, size, size, along, interiorPosition + delta));
      }
      verticalBoundaries.push(verticalSum / samples);
      horizontalBoundaries.push(horizontalSum / samples);
      verticalInterior.push(verticalOffSum / samples);
      horizontalInterior.push(horizontalOffSum / samples);
    }
    const verticalMean = mean(verticalBoundaries);
    const horizontalMean = mean(horizontalBoundaries);
    const boundaryMean = (verticalMean + horizontalMean) / 2;
    const offGridMean = (mean(verticalInterior) + mean(horizontalInterior)) / 2;
    const directionBalance = Math.max(verticalMean, horizontalMean) > 1
      ? Math.min(verticalMean, horizontalMean) / Math.max(verticalMean, horizontalMean)
      : 0;
    const boundaryConsistency = boundaryMean > 1
      ? clamp(1 - ((standardDeviation(verticalBoundaries) + standardDeviation(horizontalBoundaries)) / (2 * boundaryMean)))
      : 0;
    const boundaryContrast = clamp((boundaryMean - (0.45 * offGridMean)) / Math.max(5, overallStd));
    const gridEvidenceScore = clamp((0.62 * boundaryContrast) + (0.23 * directionBalance) + (0.15 * boundaryConsistency));
    return Object.freeze({
      gridEvidenceScore,
      checkerEvidenceScore,
      edgeEvidenceScore: clamp(boundaryMean / Math.max(1, boundaryMean + offGridMean)),
      diagnostics: Object.freeze({
        parityDifference,
        withinParity,
        overallStd,
        verticalBoundaryMean: verticalMean,
        horizontalBoundaryMean: horizontalMean,
        offGridMean,
        directionBalance,
        boundaryConsistency
      })
    });
  }

  function scoreCandidate(seed, analysis) {
    const validation = geometry.validateQuadrilateral(seed.corners, {
      imageWidth: analysis.width,
      imageHeight: analysis.height,
      minimumAreaRatio: 0.035
    });
    if (!validation.ok) {
      return Object.freeze({
        source: seed.source,
        corners: seed.corners,
        accepted: false,
        candidateScore: 0,
        geometryScore: validation.metrics?.geometryScore || 0,
        gridEvidenceScore: 0,
        checkerEvidenceScore: 0,
        edgeEvidenceScore: 0,
        boundingArea: validation.metrics?.area ?? null,
        areaRatio: validation.metrics?.areaRatio ?? null,
        shapeMetrics: validation.metrics || null,
        rejectionReasons: validation.rejectionReasons
      });
    }
    let evidence;
    try {
      const sample = rectifyGraySample(analysis.gray, analysis.width, analysis.height, seed.corners);
      evidence = scoreRectifiedGrid(sample, SCORE_SAMPLE_SIZE);
    } catch (_) {
      return Object.freeze({
        source: seed.source,
        corners: seed.corners,
        accepted: false,
        candidateScore: 0,
        geometryScore: validation.metrics.geometryScore,
        gridEvidenceScore: 0,
        checkerEvidenceScore: 0,
        edgeEvidenceScore: 0,
        boundingArea: validation.metrics.area,
        areaRatio: validation.metrics.areaRatio,
        shapeMetrics: validation.metrics,
        rejectionReasons: Object.freeze(['homography-scoring-failed'])
      });
    }
    const candidateScore = clamp((0.54 * evidence.gridEvidenceScore)
      + (0.31 * evidence.checkerEvidenceScore)
      + (0.1 * validation.metrics.geometryScore)
      + (0.05 * evidence.edgeEvidenceScore));
    const rejectionReasons = [];
    if (evidence.gridEvidenceScore < MIN_GRID_EVIDENCE) rejectionReasons.push('insufficient-grid-evidence');
    if (evidence.checkerEvidenceScore < MIN_CHECKER_EVIDENCE) rejectionReasons.push('insufficient-checker-evidence');
    if (candidateScore < MIN_CANDIDATE_SCORE) rejectionReasons.push('candidate-score-too-low');
    return Object.freeze({
      source: seed.source,
      corners: seed.corners,
      accepted: rejectionReasons.length === 0,
      candidateScore,
      geometryScore: validation.metrics.geometryScore,
      gridEvidenceScore: evidence.gridEvidenceScore,
      checkerEvidenceScore: evidence.checkerEvidenceScore,
      edgeEvidenceScore: evidence.edgeEvidenceScore,
      boundingArea: validation.metrics.area,
      areaRatio: validation.metrics.areaRatio,
      shapeMetrics: validation.metrics,
      evidenceDiagnostics: evidence.diagnostics,
      rejectionReasons: Object.freeze(rejectionReasons)
    });
  }

  function toWorkingCorners(corners, analysis) {
    return Object.freeze(corners.map(([x, y]) => Object.freeze([x * analysis.scaleX, y * analysis.scaleY])));
  }

  function summarizeCandidate(candidate, analysis) {
    return Object.freeze({
      source: candidate.source,
      corners: toWorkingCorners(candidate.corners, analysis),
      accepted: candidate.accepted,
      boundingArea: candidate.boundingArea === undefined ? null : candidate.boundingArea * analysis.scaleX * analysis.scaleY,
      areaRatio: candidate.areaRatio ?? null,
      geometryScore: candidate.geometryScore,
      gridEvidenceScore: candidate.gridEvidenceScore,
      checkerEvidenceScore: candidate.checkerEvidenceScore,
      edgeEvidenceScore: candidate.edgeEvidenceScore,
      candidateScore: candidate.candidateScore,
      shapeMetrics: candidate.shapeMetrics ? Object.freeze({
        edgeLengths: candidate.shapeMetrics.edgeLengths,
        angles: candidate.shapeMetrics.angles,
        opposingEdgeRatios: candidate.shapeMetrics.opposingEdgeRatios,
        thinness: candidate.shapeMetrics.thinness
      }) : null,
      rejectionReasons: candidate.rejectionReasons
    });
  }

  function failure(code, message, diagnostics, timing) {
    return Object.freeze({
      ok: false,
      status: 'recognition-error',
      error: Object.freeze({ code, message, diagnostics: Object.freeze(diagnostics || {}) }),
      timing: Object.freeze(timing)
    });
  }

  function localizeAndRectify({ pixels, width, height, boardSize = geometry.REFERENCE_BOARD_SIZE, now = () => global.performance.now() }) {
    const startedAt = now();
    if (!(pixels instanceof ArrayBuffer) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width <= 0 || height <= 0 || pixels.byteLength !== width * height * 4) {
      return failure('geometry-contract-failed', 'Working RGBA pixels are invalid.', {}, {
        localizationMs: 0, candidateScoringMs: 0, homographyMs: 0, geometryValidationMs: 0, totalGeometryMs: 0
      });
    }
    let analysis;
    let seeds;
    try {
      analysis = rgbaToAnalysis(pixels, width, height);
      seeds = generateCandidateSeeds(sobelEdges(analysis.gray, analysis.width, analysis.height), analysis.width, analysis.height);
    } catch (error) {
      return failure('board-not-found', 'No board localization candidate could be generated.', { reason: error?.message || 'candidate-generation-failed' }, {
        localizationMs: Math.max(0, now() - startedAt), candidateScoringMs: 0, homographyMs: 0, geometryValidationMs: 0, totalGeometryMs: Math.max(0, now() - startedAt)
      });
    }
    const candidatesGeneratedAt = now();
    const scored = seeds.map((seed) => scoreCandidate(seed, analysis))
      .sort((left, right) => right.candidateScore - left.candidateScore || left.source.localeCompare(right.source));
    const scoringCompletedAt = now();
    const accepted = scored.filter((candidate) => candidate.accepted);
    const summaries = Object.freeze(scored.slice(0, MAX_CANDIDATES).map((candidate) => summarizeCandidate(candidate, analysis)));
    const baseTiming = {
      localizationMs: Math.max(0, candidatesGeneratedAt - startedAt),
      candidateScoringMs: Math.max(0, scoringCompletedAt - candidatesGeneratedAt),
      homographyMs: 0,
      geometryValidationMs: 0,
      totalGeometryMs: Math.max(0, scoringCompletedAt - startedAt)
    };
    if (!accepted.length) {
      return failure('board-not-found', 'No candidate contains sufficient 8 by 8 board evidence.', {
        candidateCount: scored.length,
        candidateSummaries: summaries
      }, baseTiming);
    }
    if (accepted.length > 1 && accepted[0].candidateScore - accepted[1].candidateScore < AMBIGUITY_MARGIN) {
      return failure('multiple-board-candidates', 'Multiple board candidates are too similar to select safely.', {
        candidateCount: accepted.length,
        scoreSeparation: accepted[0].candidateScore - accepted[1].candidateScore,
        requiredScoreSeparation: AMBIGUITY_MARGIN,
        candidateSummaries: summaries
      }, baseTiming);
    }

    const selected = accepted[0];
    const corners = toWorkingCorners(selected.corners, analysis);
    const validation = geometry.validateQuadrilateral(corners, { imageWidth: width, imageHeight: height });
    if (!validation.ok) {
      return failure('invalid-quadrilateral', 'Selected board corners failed working-image validation.', {
        rejectionReasons: validation.rejectionReasons,
        candidateSummaries: summaries
      }, baseTiming);
    }
    let transform;
    let rectifiedPixels;
    const homographyStartedAt = now();
    try {
      transform = geometry.buildTransform(corners, boardSize);
      rectifiedPixels = geometry.warpPerspectiveRgba({ pixels, width, height, boardSize, boardToSource: transform.boardToSource });
    } catch (error) {
      return failure('homography-failed', 'The selected board could not be rectified.', {
        reason: error?.code || error?.message || 'homography-failed',
        candidateSummaries: summaries
      }, { ...baseTiming, homographyMs: Math.max(0, now() - homographyStartedAt), totalGeometryMs: Math.max(0, now() - startedAt) });
    }
    const homographyCompletedAt = now();
    const geometryStartedAt = now();
    const transformMetadata = Object.freeze({
      version: geometry.HOMOGRAPHY_VERSION,
      interpolation: 'bilinear-rgba',
      edgeMode: 'clamp-to-source-edge',
      alphaHandling: 'bilinear-preserve',
      sourceToBoard: transform.sourceToBoard,
      boardToSource: transform.boardToSource,
      maxReprojectionError: transform.maxReprojectionError,
      meanReprojectionError: transform.meanReprojectionError
    });
    const homographyOutput = Object.freeze({
      width: boardSize,
      height: boardSize,
      pixelSpace: 'canonical-board-rgba',
      sourceCorners: corners,
      transformMetadata,
      orientationState: 'unresolved'
    });
    let tileGeometry;
    try {
      tileGeometry = geometry.createTileDescriptors(homographyOutput);
    } catch (error) {
      return failure('geometry-contract-failed', 'Rectified board violates the equal-square geometry contract.', {
        reason: error?.code || error?.message || 'geometry-contract-failed',
        candidateSummaries: summaries
      }, {
        ...baseTiming,
        homographyMs: Math.max(0, homographyCompletedAt - homographyStartedAt),
        geometryValidationMs: Math.max(0, now() - geometryStartedAt),
        totalGeometryMs: Math.max(0, now() - startedAt)
      });
    }
    const completedAt = now();
    return Object.freeze({
      ok: true,
      status: 'board-localized',
      board: Object.freeze({
        pixels: rectifiedPixels,
        corners,
        boardSize,
        width: boardSize,
        height: boardSize,
        geometryScore: selected.geometryScore,
        candidateScore: selected.candidateScore,
        gridEvidenceScore: selected.gridEvidenceScore,
        checkerEvidenceScore: selected.checkerEvidenceScore,
        edgeEvidenceScore: selected.edgeEvidenceScore,
        orientation: 'unknown',
        transformMetadata,
        geometry: tileGeometry
      }),
      diagnostics: Object.freeze({
        localizerVersion: LOCALIZER_VERSION,
        analysisWidth: analysis.width,
        analysisHeight: analysis.height,
        candidateCount: scored.length,
        acceptedCandidateCount: accepted.length,
        scoreSeparation: accepted.length > 1 ? accepted[0].candidateScore - accepted[1].candidateScore : null,
        candidateSummaries: summaries
      }),
      timing: Object.freeze({
        localizationMs: Math.max(0, candidatesGeneratedAt - startedAt),
        candidateScoringMs: Math.max(0, scoringCompletedAt - candidatesGeneratedAt),
        homographyMs: Math.max(0, homographyCompletedAt - homographyStartedAt),
        geometryValidationMs: Math.max(0, completedAt - geometryStartedAt),
        totalGeometryMs: Math.max(0, completedAt - startedAt)
      })
    });
  }

  function cornerErrorMetrics(predicted, expected, imageWidth, imageHeight) {
    if (!Array.isArray(predicted) || !Array.isArray(expected) || predicted.length !== 4 || expected.length !== 4) return null;
    const diagonal = Math.hypot(imageWidth, imageHeight);
    if (!(diagonal > 0)) return null;
    const errors = predicted.map((point, index) => Math.hypot(point[0] - expected[index][0], point[1] - expected[index][1]) / diagonal);
    return Object.freeze({
      normalizedCornerRmse: Math.sqrt(errors.reduce((sum, value) => sum + (value ** 2), 0) / errors.length),
      normalizedWorstCornerError: Math.max(...errors)
    });
  }

  function toBenchmarkOutput(sampleId, result) {
    if (!result?.ok) {
      return Object.freeze({
        sampleId,
        status: 'no-board',
        boardDetected: false,
        failureCode: result?.error?.code || 'board-not-found',
        geometry: null,
        predictedCorners: null,
        timingsMs: Object.freeze({ total: result?.timing?.totalGeometryMs || 0 })
      });
    }
    return Object.freeze({
      sampleId,
      status: 'candidate',
      boardDetected: true,
      predictedCorners: result.board.corners,
      geometry: Object.freeze({
        width: result.board.width,
        height: result.board.height,
        pixelSpace: result.board.geometry.pixelSpace,
        sourceCorners: result.board.corners,
        transformMetadata: result.board.transformMetadata,
        orientationState: 'unresolved'
      }),
      localization: Object.freeze({
        candidateScore: result.board.candidateScore,
        geometryScore: result.board.geometryScore,
        gridEvidenceScore: result.board.gridEvidenceScore,
        localizerVersion: result.diagnostics.localizerVersion
      }),
      timingsMs: Object.freeze({
        localize: result.timing.localizationMs + result.timing.candidateScoringMs,
        warp: result.timing.homographyMs,
        total: result.timing.totalGeometryMs
      })
    });
  }

  global.CaissaScannerBoardLocalizer = Object.freeze({
    LOCALIZER_VERSION,
    MAX_ANALYSIS_EDGE,
    MAX_CANDIDATES,
    MIN_CANDIDATE_SCORE,
    MIN_GRID_EVIDENCE,
    MIN_CHECKER_EVIDENCE,
    AMBIGUITY_MARGIN,
    rgbaToAnalysis,
    scoreRectifiedGrid,
    cornerErrorMetrics,
    toBenchmarkOutput,
    localizeAndRectify
  });
})(globalThis);
