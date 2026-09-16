(function (global) {
  'use strict';

  const REFERENCE_BOARD_SIZE = 512;
  const GEOMETRY_FAILURE_TYPE = 'recognition-geometry-failure';
  const HOMOGRAPHY_VERSION = 'caissa-scanner-homography/1';
  const EPSILON = 1e-9;
  const ORIENTATION_STATES = new Set([
    'unresolved',
    'white-at-bottom',
    'black-at-bottom',
    'rotated-90',
    'rotated-270'
  ]);

  class BoardGeometryError extends Error {
    constructor(code, message, diagnostics = null) {
      super(message);
      this.name = 'BoardGeometryError';
      this.code = code;
      this.diagnostics = diagnostics;
    }
  }

  class RecognitionGeometryError extends Error {
    constructor(failure) {
      super(failure.message);
      this.name = 'RecognitionGeometryError';
      this.type = failure.type;
      this.code = failure.code;
      this.received = failure.received;
    }
  }

  function geometryFailure(code, message, received = null) {
    return {
      ok: false,
      error: Object.freeze({ type: GEOMETRY_FAILURE_TYPE, code, message, received })
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function isFinitePoint(point) {
    return Array.isArray(point)
      && point.length === 2
      && point.every((coordinate) => Number.isFinite(coordinate));
  }

  function pointDistance(a, b) {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  }

  function cross(a, b, c) {
    return ((b[0] - a[0]) * (c[1] - a[1])) - ((b[1] - a[1]) * (c[0] - a[0]));
  }

  function polygonSignedArea(points) {
    let sum = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      sum += (current[0] * next[1]) - (next[0] * current[1]);
    }
    return sum / 2;
  }

  function pointsEqual(a, b, epsilon = 1e-7) {
    return pointDistance(a, b) <= epsilon;
  }

  function onSegment(a, b, p) {
    return p[0] >= Math.min(a[0], b[0]) - EPSILON
      && p[0] <= Math.max(a[0], b[0]) + EPSILON
      && p[1] >= Math.min(a[1], b[1]) - EPSILON
      && p[1] <= Math.max(a[1], b[1]) + EPSILON;
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
      && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
    if (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) return true;
    if (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) return true;
    if (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) return true;
    if (Math.abs(cdB) <= EPSILON && onSegment(c, d, b)) return true;
    return false;
  }

  function angleDegrees(previous, current, next) {
    const a = [previous[0] - current[0], previous[1] - current[1]];
    const b = [next[0] - current[0], next[1] - current[1]];
    const denominator = Math.hypot(...a) * Math.hypot(...b);
    if (denominator <= EPSILON) return 0;
    const cosine = clamp(((a[0] * b[0]) + (a[1] * b[1])) / denominator, -1, 1);
    return Math.acos(cosine) * (180 / Math.PI);
  }

  function orderCorners(points) {
    if (!Array.isArray(points) || points.length !== 4 || !points.every(isFinitePoint)) {
      throw new BoardGeometryError('invalid-quadrilateral', 'Exactly four finite corner points are required.');
    }
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        if (pointsEqual(points[left], points[right])) {
          throw new BoardGeometryError('invalid-quadrilateral', 'Quadrilateral corners must be distinct.');
        }
      }
    }
    const center = points.reduce((total, point) => [total[0] + point[0], total[1] + point[1]], [0, 0])
      .map((value) => value / 4);
    let ordered = points.map((point) => [point[0], point[1]])
      .sort((a, b) => Math.atan2(a[1] - center[1], a[0] - center[0])
        - Math.atan2(b[1] - center[1], b[0] - center[0]));
    if (polygonSignedArea(ordered) < 0) ordered = ordered.reverse();
    let start = 0;
    for (let index = 1; index < ordered.length; index += 1) {
      const currentRank = ordered[index][0] + ordered[index][1];
      const bestRank = ordered[start][0] + ordered[start][1];
      if (currentRank < bestRank - EPSILON
        || (Math.abs(currentRank - bestRank) <= EPSILON && ordered[index][1] < ordered[start][1] - EPSILON)
        || (Math.abs(currentRank - bestRank) <= EPSILON
          && Math.abs(ordered[index][1] - ordered[start][1]) <= EPSILON
          && ordered[index][0] < ordered[start][0])) start = index;
    }
    ordered = ordered.slice(start).concat(ordered.slice(0, start));
    return Object.freeze(ordered.map((point) => Object.freeze(point)));
  }

  function validateQuadrilateral(points, options = {}) {
    const rejectionReasons = [];
    if (!Array.isArray(points) || points.length !== 4 || !points.every(isFinitePoint)) {
      return Object.freeze({ ok: false, code: 'invalid-quadrilateral', rejectionReasons: Object.freeze(['four-finite-points-required']) });
    }
    for (let left = 0; left < 4; left += 1) {
      for (let right = left + 1; right < 4; right += 1) {
        if (pointsEqual(points[left], points[right])) rejectionReasons.push('duplicate-corner');
      }
    }
    if (segmentsIntersect(points[0], points[1], points[2], points[3])
      || segmentsIntersect(points[1], points[2], points[3], points[0])) rejectionReasons.push('self-intersection');

    const signedArea = polygonSignedArea(points);
    const area = Math.abs(signedArea);
    if (area <= EPSILON) rejectionReasons.push('zero-area');
    const crosses = points.map((point, index) => cross(point, points[(index + 1) % 4], points[(index + 2) % 4]));
    if (crosses.some((value) => Math.abs(value) <= EPSILON)
      || !(crosses.every((value) => value > 0) || crosses.every((value) => value < 0))) rejectionReasons.push('non-convex');

    const edgeLengths = points.map((point, index) => pointDistance(point, points[(index + 1) % 4]));
    const angles = points.map((point, index) => angleDegrees(points[(index + 3) % 4], point, points[(index + 1) % 4]));
    const imageWidth = options.imageWidth;
    const imageHeight = options.imageHeight;
    const hasImageBounds = Number.isFinite(imageWidth) && imageWidth > 0 && Number.isFinite(imageHeight) && imageHeight > 0;
    const minimumEdge = hasImageBounds
      ? Math.max(options.minimumEdgePixels || 4, Math.min(imageWidth, imageHeight) * (options.minimumEdgeRatio || 0.025))
      : (options.minimumEdgePixels || 1);
    if (edgeLengths.some((length) => length < minimumEdge)) rejectionReasons.push('collapsed-edge');
    if (hasImageBounds && points.some(([x, y]) => x < -EPSILON || y < -EPSILON || x > imageWidth + EPSILON || y > imageHeight + EPSILON)) {
      rejectionReasons.push('out-of-bounds');
    }

    const areaRatio = hasImageBounds ? area / (imageWidth * imageHeight) : null;
    if (areaRatio !== null && areaRatio < (options.minimumAreaRatio ?? 0.035)) rejectionReasons.push('area-too-small');
    if (areaRatio !== null && areaRatio > (options.maximumAreaRatio ?? 1.001)) rejectionReasons.push('area-too-large');

    const opposingRatios = [
      Math.max(edgeLengths[0], edgeLengths[2]) / Math.max(EPSILON, Math.min(edgeLengths[0], edgeLengths[2])),
      Math.max(edgeLengths[1], edgeLengths[3]) / Math.max(EPSILON, Math.min(edgeLengths[1], edgeLengths[3]))
    ];
    if (opposingRatios.some((ratio) => ratio > (options.maximumOpposingEdgeRatio || 6))) rejectionReasons.push('opposing-edges-implausible');
    const averageHorizontal = (edgeLengths[0] + edgeLengths[2]) / 2;
    const averageVertical = (edgeLengths[1] + edgeLengths[3]) / 2;
    const thinness = Math.min(averageHorizontal, averageVertical) / Math.max(averageHorizontal, averageVertical);
    if (thinness < (options.minimumThinness || 0.18)) rejectionReasons.push('quadrilateral-too-thin');
    const minimumAngle = options.minimumAngleDegrees || 18;
    const maximumAngle = options.maximumAngleDegrees || 162;
    if (angles.some((angle) => angle < minimumAngle || angle > maximumAngle)) rejectionReasons.push('corner-angle-implausible');

    const angleError = angles.reduce((sum, angle) => sum + Math.abs(90 - angle), 0) / (4 * 90);
    const oppositionError = opposingRatios.reduce((sum, ratio) => sum + Math.min(1, (ratio - 1) / 5), 0) / 2;
    const geometryScore = clamp(1 - (0.55 * angleError) - (0.3 * oppositionError) - (0.15 * (1 - thinness)), 0, 1);
    const metrics = Object.freeze({
      area,
      areaRatio,
      signedArea,
      edgeLengths: Object.freeze(edgeLengths),
      angles: Object.freeze(angles),
      opposingEdgeRatios: Object.freeze(opposingRatios),
      thinness,
      geometryScore
    });
    return Object.freeze({
      ok: rejectionReasons.length === 0,
      code: rejectionReasons.length ? 'invalid-quadrilateral' : null,
      rejectionReasons: Object.freeze([...new Set(rejectionReasons)]),
      metrics
    });
  }

  function solveLinearSystem(matrix, values) {
    const size = values.length;
    const augmented = matrix.map((row, index) => [...row, values[index]]);
    for (let column = 0; column < size; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (Math.abs(augmented[pivot][column]) <= 1e-10) {
        throw new BoardGeometryError('homography-failed', 'Quadrilateral does not define a stable projective transform.');
      }
      [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
      const divisor = augmented[column][column];
      for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
      for (let row = 0; row < size; row += 1) {
        if (row === column) continue;
        const factor = augmented[row][column];
        for (let entry = column; entry <= size; entry += 1) augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
    return augmented.map((row) => row[size]);
  }

  function computeHomography(sourceCorners, destinationCorners) {
    if (!Array.isArray(sourceCorners) || sourceCorners.length !== 4 || !sourceCorners.every(isFinitePoint)
      || !Array.isArray(destinationCorners) || destinationCorners.length !== 4 || !destinationCorners.every(isFinitePoint)) {
      throw new BoardGeometryError('homography-failed', 'Homography requires four finite source and destination points.');
    }
    const matrix = [];
    const values = [];
    for (let index = 0; index < 4; index += 1) {
      const [x, y] = sourceCorners[index];
      const [u, v] = destinationCorners[index];
      matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      values.push(u);
      matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      values.push(v);
    }
    const solution = solveLinearSystem(matrix, values);
    const transform = Object.freeze([...solution, 1]);
    if (!transform.every(Number.isFinite)) throw new BoardGeometryError('homography-failed', 'Homography coefficients are not finite.');
    return transform;
  }

  function invertHomography(matrix) {
    if (!Array.isArray(matrix) || matrix.length !== 9 || !matrix.every(Number.isFinite)) {
      throw new BoardGeometryError('homography-failed', 'A finite 3 by 3 homography matrix is required.');
    }
    const [a, b, c, d, e, f, g, h, i] = matrix;
    const determinant = a * ((e * i) - (f * h)) - b * ((d * i) - (f * g)) + c * ((d * h) - (e * g));
    if (Math.abs(determinant) <= 1e-12) throw new BoardGeometryError('homography-failed', 'Homography matrix is singular.');
    return Object.freeze([
      ((e * i) - (f * h)) / determinant,
      ((c * h) - (b * i)) / determinant,
      ((b * f) - (c * e)) / determinant,
      ((f * g) - (d * i)) / determinant,
      ((a * i) - (c * g)) / determinant,
      ((c * d) - (a * f)) / determinant,
      ((d * h) - (e * g)) / determinant,
      ((b * g) - (a * h)) / determinant,
      ((a * e) - (b * d)) / determinant
    ]);
  }

  function transformPoint(matrix, point) {
    const [x, y] = point;
    const denominator = (matrix[6] * x) + (matrix[7] * y) + matrix[8];
    if (Math.abs(denominator) <= 1e-12) throw new BoardGeometryError('homography-failed', 'Point maps to projective infinity.');
    return Object.freeze([
      ((matrix[0] * x) + (matrix[1] * y) + matrix[2]) / denominator,
      ((matrix[3] * x) + (matrix[4] * y) + matrix[5]) / denominator
    ]);
  }

  function destinationCorners(boardSize) {
    if (!Number.isSafeInteger(boardSize) || boardSize <= 0 || boardSize % 8 !== 0) {
      throw new BoardGeometryError('geometry-contract-failed', 'Canonical board size must be a positive integer divisible by 8.');
    }
    return Object.freeze([
      Object.freeze([0, 0]),
      Object.freeze([boardSize, 0]),
      Object.freeze([boardSize, boardSize]),
      Object.freeze([0, boardSize])
    ]);
  }

  function buildTransform(sourceCorners, boardSize = REFERENCE_BOARD_SIZE) {
    const destination = destinationCorners(boardSize);
    const sourceToBoard = computeHomography(sourceCorners, destination);
    const boardToSource = invertHomography(sourceToBoard);
    const errors = sourceCorners.map((point, index) => pointDistance(transformPoint(sourceToBoard, point), destination[index]));
    return Object.freeze({
      sourceToBoard,
      boardToSource,
      destinationCorners: destination,
      maxReprojectionError: Math.max(...errors),
      meanReprojectionError: errors.reduce((sum, value) => sum + value, 0) / errors.length
    });
  }

  function sampleBilinearRgba(bytes, width, height, x, y, output, outputOffset) {
    const centeredX = clamp(x - 0.5, 0, width - 1);
    const centeredY = clamp(y - 0.5, 0, height - 1);
    const x0 = Math.floor(centeredX);
    const y0 = Math.floor(centeredY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const dx = centeredX - x0;
    const dy = centeredY - y0;
    const topLeft = ((y0 * width) + x0) * 4;
    const topRight = ((y0 * width) + x1) * 4;
    const bottomLeft = ((y1 * width) + x0) * 4;
    const bottomRight = ((y1 * width) + x1) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const top = (bytes[topLeft + channel] * (1 - dx)) + (bytes[topRight + channel] * dx);
      const bottom = (bytes[bottomLeft + channel] * (1 - dx)) + (bytes[bottomRight + channel] * dx);
      output[outputOffset + channel] = Math.round((top * (1 - dy)) + (bottom * dy));
    }
  }

  function warpPerspectiveRgba({ pixels, width, height, boardSize = REFERENCE_BOARD_SIZE, boardToSource }) {
    if (!(pixels instanceof ArrayBuffer) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width <= 0 || height <= 0 || pixels.byteLength !== width * height * 4) {
      throw new BoardGeometryError('homography-failed', 'RGBA source pixels and dimensions are inconsistent.');
    }
    destinationCorners(boardSize);
    const source = new Uint8ClampedArray(pixels);
    const output = new Uint8ClampedArray(boardSize * boardSize * 4);
    for (let y = 0; y < boardSize; y += 1) {
      for (let x = 0; x < boardSize; x += 1) {
        const sourcePoint = transformPoint(boardToSource, [x + 0.5, y + 0.5]);
        sampleBilinearRgba(source, width, height, sourcePoint[0], sourcePoint[1], output, ((y * boardSize) + x) * 4);
      }
    }
    return output.buffer;
  }

  function validateHomographyOutput(output) {
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return geometryFailure('MISSING_HOMOGRAPHY_OUTPUT', 'Homography output must be an object.', output);
    }
    const { width, height, pixelSpace, sourceCorners, transformMetadata, orientationState } = output;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      return geometryFailure('INVALID_BOARD_DIMENSIONS', 'Normalized board dimensions must be positive safe integers.', { width, height });
    }
    if (width !== height) return geometryFailure('NON_SQUARE_BOARD', 'Normalized board width and height must match.', { width, height });
    if (width % 8 !== 0) {
      return geometryFailure('BOARD_SIZE_NOT_DIVISIBLE_BY_8', 'Normalized board size must be exactly divisible by 8.', { width, height });
    }
    if (typeof pixelSpace !== 'string' || !pixelSpace.trim()) {
      return geometryFailure('INVALID_PIXEL_SPACE', 'Homography output must name its pixel coordinate space.', pixelSpace);
    }
    if (!Array.isArray(sourceCorners) || sourceCorners.length !== 4 || !sourceCorners.every(isFinitePoint)) {
      return geometryFailure('INVALID_SOURCE_CORNERS', 'Homography output must contain four finite source corners in top-left, top-right, bottom-right, bottom-left order.', sourceCorners);
    }
    if (!transformMetadata || typeof transformMetadata !== 'object' || Array.isArray(transformMetadata)) {
      return geometryFailure('INVALID_TRANSFORM_METADATA', 'Homography output must include transform metadata.', transformMetadata);
    }
    if (!ORIENTATION_STATES.has(orientationState)) {
      return geometryFailure('INVALID_ORIENTATION_STATE', 'Homography orientation state is unsupported.', orientationState);
    }
    return {
      ok: true,
      value: Object.freeze({
        width,
        height,
        tileSize: width / 8,
        pixelSpace: pixelSpace.trim(),
        sourceCorners,
        transformMetadata,
        orientationState
      })
    };
  }

  function squareForResolvedOrientation(row, col, orientationState) {
    if (orientationState === 'white-at-bottom') return String.fromCharCode(97 + col) + String(8 - row);
    if (orientationState === 'black-at-bottom') return String.fromCharCode(104 - col) + String(1 + row);
    return null;
  }

  function createTileDescriptors(output) {
    const validation = validateHomographyOutput(output);
    if (!validation.ok) throw new RecognitionGeometryError(validation.error);
    const { width, height, tileSize, pixelSpace, orientationState } = validation.value;
    const tiles = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const index = row * 8 + col;
        const square = squareForResolvedOrientation(row, col, orientationState);
        tiles.push(Object.freeze({
          index,
          row,
          col,
          imageGridCoordinate: `r${row}c${col}`,
          file: square ? square[0] : null,
          rank: square ? Number(square[1]) : null,
          square,
          x: col * tileSize,
          y: row * tileSize,
          x1: (col + 1) * tileSize,
          y1: (row + 1) * tileSize,
          width: tileSize,
          height: tileSize,
          pixelSpace
        }));
      }
    }
    return Object.freeze({
      width,
      height,
      tileSize,
      pixelSpace,
      orientationState,
      tiles: Object.freeze(tiles)
    });
  }

  function rectifyBoard({ pixels, width, height, corners, boardSize = REFERENCE_BOARD_SIZE }) {
    const validation = validateQuadrilateral(corners, { imageWidth: width, imageHeight: height });
    if (!validation.ok) {
      throw new BoardGeometryError('invalid-quadrilateral', 'Board corners failed quadrilateral validation.', validation);
    }
    const transform = buildTransform(corners, boardSize);
    const transformMetadata = Object.freeze({
      version: HOMOGRAPHY_VERSION,
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
    const geometry = createTileDescriptors(homographyOutput);
    const rectifiedPixels = warpPerspectiveRgba({ pixels, width, height, boardSize, boardToSource: transform.boardToSource });
    return Object.freeze({
      pixels: rectifiedPixels,
      width: boardSize,
      height: boardSize,
      sourceCorners: corners,
      transformMetadata,
      orientation: 'unknown',
      geometry
    });
  }

  global.CaissaScannerBoardGeometry = Object.freeze({
    REFERENCE_BOARD_SIZE,
    GEOMETRY_FAILURE_TYPE,
    HOMOGRAPHY_VERSION,
    BoardGeometryError,
    RecognitionGeometryError,
    isFinitePoint,
    polygonSignedArea,
    orderCorners,
    validateQuadrilateral,
    computeHomography,
    invertHomography,
    transformPoint,
    buildTransform,
    warpPerspectiveRgba,
    validateHomographyOutput,
    createTileDescriptors,
    rectifyBoard
  });
})(globalThis);
