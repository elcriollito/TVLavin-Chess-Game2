export const REFERENCE_BOARD_SIZE = 512;

export const GEOMETRY_FAILURE_TYPE = 'recognition-geometry-failure';

const ORIENTATION_STATES = new Set([
  'unresolved',
  'white-at-bottom',
  'black-at-bottom',
  'rotated-90',
  'rotated-270'
]);

function geometryFailure(code, message, received = null) {
  return {
    ok: false,
    error: Object.freeze({
      type: GEOMETRY_FAILURE_TYPE,
      code,
      message,
      received
    })
  };
}

function isFinitePoint(point) {
  return Array.isArray(point)
    && point.length === 2
    && point.every((coordinate) => Number.isFinite(coordinate));
}

export function validateHomographyOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return geometryFailure('MISSING_HOMOGRAPHY_OUTPUT', 'Homography output must be an object.', output);
  }

  const { width, height, pixelSpace, sourceCorners, transformMetadata, orientationState } = output;

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return geometryFailure(
      'INVALID_BOARD_DIMENSIONS',
      'Normalized board dimensions must be positive safe integers.',
      { width, height }
    );
  }
  if (width !== height) {
    return geometryFailure('NON_SQUARE_BOARD', 'Normalized board width and height must match.', { width, height });
  }
  if (width % 8 !== 0) {
    return geometryFailure(
      'BOARD_SIZE_NOT_DIVISIBLE_BY_8',
      'Normalized board size must be exactly divisible by 8.',
      { width, height }
    );
  }
  if (typeof pixelSpace !== 'string' || !pixelSpace.trim()) {
    return geometryFailure('INVALID_PIXEL_SPACE', 'Homography output must name its pixel coordinate space.', pixelSpace);
  }
  if (!Array.isArray(sourceCorners) || sourceCorners.length !== 4 || !sourceCorners.every(isFinitePoint)) {
    return geometryFailure(
      'INVALID_SOURCE_CORNERS',
      'Homography output must contain four finite source corners in top-left, top-right, bottom-right, bottom-left order.',
      sourceCorners
    );
  }
  if (!transformMetadata || typeof transformMetadata !== 'object' || Array.isArray(transformMetadata)) {
    return geometryFailure(
      'INVALID_TRANSFORM_METADATA',
      'Homography output must include transform metadata.',
      transformMetadata
    );
  }
  if (!ORIENTATION_STATES.has(orientationState)) {
    return geometryFailure(
      'INVALID_ORIENTATION_STATE',
      'Homography orientation state is unsupported.',
      orientationState
    );
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

export class RecognitionGeometryError extends Error {
  constructor(failure) {
    super(failure.message);
    this.name = 'RecognitionGeometryError';
    this.type = failure.type;
    this.code = failure.code;
    this.received = failure.received;
  }
}

function squareForResolvedOrientation(row, col, orientationState) {
  if (orientationState === 'white-at-bottom') {
    return String.fromCharCode(97 + col) + String(8 - row);
  }
  if (orientationState === 'black-at-bottom') {
    return String.fromCharCode(104 - col) + String(1 + row);
  }
  return null;
}

export function createTileDescriptors(output) {
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
