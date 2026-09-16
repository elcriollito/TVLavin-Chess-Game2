import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../scanner/recognition/scanner-board-geometry.js';
import '../scanner/recognition/scanner-board-localizer.js';
import { validateHomographyOutput } from '../scanner/recognition/benchmark/geometry.js';
import {
  createLocalizationFixtures,
  genericGridImage,
  renderBoards,
  singleRectangleImage,
  solidImage,
  stripedImage
} from './fixtures/scanner-localization-fixtures.js';
import { createV02DevelopmentFixtures } from './fixtures/scanner-localization-hard-v02-fixtures.js';

const geometry = globalThis.CaissaScannerBoardGeometry;
const localizer = globalThis.CaissaScannerBoardLocalizer;
const fixtures = createLocalizationFixtures();

function rounded(points) {
  const round = (value) => {
    const result = Math.round(value * 1e6) / 1e6;
    return Object.is(result, -0) ? 0 : result;
  };
  if (typeof points[0] === 'number') return points.map(round);
  return points.map((point) => point.map(round));
}

function checksum(buffer) {
  return createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
}

function run(fixture, boardSize = 512) {
  return localizer.localizeAndRectify({
    pixels: fixture.pixels.slice(0),
    width: fixture.width,
    height: fixture.height,
    boardSize,
    now: (() => { let clock = 0; return () => ++clock; })()
  });
}

function assertExactTileCoverage(board) {
  const { geometry: grid } = board;
  assert.equal(grid.tiles.length, 64);
  assert.equal(grid.width, grid.height);
  assert.equal(grid.width % 8, 0);
  assert.equal(grid.tileSize, grid.width / 8);
  const coverage = new Uint8Array(grid.width * grid.height);
  for (const tile of grid.tiles) {
    assert.equal(tile.width, grid.tileSize);
    assert.equal(tile.height, grid.tileSize);
    for (let y = tile.y; y < tile.y1; y += 1) {
      for (let x = tile.x; x < tile.x1; x += 1) coverage[(y * grid.width) + x] += 1;
    }
  }
  assert.equal(coverage.every((count) => count === 1), true);
  assert.deepEqual(grid.tiles.at(-1), {
    index: 63,
    row: 7,
    col: 7,
    imageGridCoordinate: 'r7c7',
    file: null,
    rank: null,
    square: null,
    x: grid.width - grid.tileSize,
    y: grid.height - grid.tileSize,
    x1: grid.width,
    y1: grid.height,
    width: grid.tileSize,
    height: grid.tileSize,
    pixelSpace: 'canonical-board-rgba'
  });
}

test('corner ordering is deterministic for clockwise, counter-clockwise, and random rectangle inputs', () => {
  const expected = [[10, 10], [90, 10], [90, 70], [10, 70]];
  const cases = [
    expected,
    [[10, 10], [10, 70], [90, 70], [90, 10]],
    [[90, 70], [10, 10], [10, 70], [90, 10]],
    [[90, 10], [10, 70], [10, 10], [90, 70]]
  ];
  for (const input of cases) assert.deepEqual(geometry.orderCorners(input), expected);
});

test('corner ordering handles perspective trapezoids and diamond-like rotations', () => {
  const trapezoid = [[35, 210], [235, 42], [64, 28], [270, 226]];
  assert.deepEqual(geometry.orderCorners(trapezoid), [[64, 28], [235, 42], [270, 226], [35, 210]]);
  const diamond = [[100, 10], [190, 100], [100, 190], [10, 100]];
  assert.deepEqual(geometry.orderCorners([diamond[2], diamond[0], diamond[3], diamond[1]]), diamond);
});

test('quadrilateral validation reports strict typed rejection reasons', () => {
  const bowTie = geometry.validateQuadrilateral([[10, 10], [90, 90], [90, 10], [10, 90]], { imageWidth: 100, imageHeight: 100 });
  assert.equal(bowTie.ok, false);
  assert.ok(bowTie.rejectionReasons.includes('self-intersection'));
  for (const corners of fixtures.degenerateCorners) {
    const result = geometry.validateQuadrilateral(corners, { imageWidth: 100, imageHeight: 100 });
    assert.equal(result.ok, false);
    assert.ok(result.rejectionReasons.length > 0);
  }
  const outside = geometry.validateQuadrilateral([[-1, 10], [90, 10], [90, 90], [10, 90]], { imageWidth: 100, imageHeight: 100 });
  assert.ok(outside.rejectionReasons.includes('out-of-bounds'));
});

test('identity homography maps canonical corners and interior points exactly', () => {
  const corners = [[0, 0], [512, 0], [512, 512], [0, 512]];
  const transform = geometry.buildTransform(corners, 512);
  assert.deepEqual(rounded(corners.map((point) => geometry.transformPoint(transform.sourceToBoard, point))), corners);
  assert.deepEqual(rounded(geometry.transformPoint(transform.sourceToBoard, [173.25, 318.75])), [173.25, 318.75]);
  assert.ok(transform.maxReprojectionError < 1e-8);
});

test('identity RGBA warp preserves color and alpha at pixel centers', () => {
  const bytes = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const offset = ((y * 64) + x) * 4;
      bytes.set([x * 4, y * 4, (x + y) * 2, (x * 3 + y * 5) % 256], offset);
    }
  }
  const result = geometry.rectifyBoard({
    pixels: bytes.buffer.slice(0),
    width: 64,
    height: 64,
    corners: [[0, 0], [64, 0], [64, 64], [0, 64]],
    boardSize: 64
  });
  assert.deepEqual(new Uint8ClampedArray(result.pixels), bytes);
});

test('true projective homography maps a trapezoid to a square and round-trips interior points', () => {
  const corners = [[70, 28], [242, 48], [274, 231], [35, 218]];
  const transform = geometry.buildTransform(corners, 512);
  const destinations = [[0, 0], [512, 0], [512, 512], [0, 512]];
  assert.deepEqual(rounded(corners.map((point) => geometry.transformPoint(transform.sourceToBoard, point))), destinations);
  for (const destination of [[256, 256], [64, 128], [448, 384]]) {
    const source = geometry.transformPoint(transform.boardToSource, destination);
    const roundTrip = geometry.transformPoint(transform.sourceToBoard, source);
    assert.ok(Math.hypot(roundTrip[0] - destination[0], roundTrip[1] - destination[1]) < 1e-7);
  }
  assert.notEqual(transform.sourceToBoard[6], 0);
});

test('rotated homography is deterministic and degenerate transforms fail closed', () => {
  const corners = fixtures.rotated.corners;
  assert.deepEqual(geometry.buildTransform(corners, 512), geometry.buildTransform(corners, 512));
  assert.throws(
    () => geometry.computeHomography([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]]),
    (error) => error.code === 'homography-failed'
  );
});

test('manual-corner seam uses the same projective rectification core', () => {
  const fixture = fixtures.perspective;
  const result = geometry.rectifyBoard({
    pixels: fixture.pixels.slice(0),
    width: fixture.width,
    height: fixture.height,
    corners: fixture.corners,
    boardSize: 256
  });
  assert.equal(result.width, 256);
  assert.equal(result.height, 256);
  assert.equal(result.orientation, 'unknown');
  assert.equal(result.pixels.byteLength, 256 * 256 * 4);
  assertExactTileCoverage(result);
});

test('successful automatic fixtures recover corners within documented synthetic tolerance', () => {
  for (const name of ['axisAligned', 'rotated', 'perspective', 'surroundingPage', 'lowContrast']) {
    const fixture = fixtures[name];
    const result = run(fixture, 128);
    assert.equal(result.ok, true, `${name}: ${result.error?.code}`);
    const quality = localizer.cornerErrorMetrics(result.board.corners, fixture.corners, fixture.width, fixture.height);
    assert.ok(quality.normalizedCornerRmse <= 0.012, `${name} RMSE ${quality.normalizedCornerRmse}`);
    assert.ok(quality.normalizedWorstCornerError <= 0.02, `${name} worst ${quality.normalizedWorstCornerError}`);
  }
});

test('localization is luminance-structure based across board color families', () => {
  const variants = [
    { light: [241, 241, 241], dark: [45, 45, 45] },
    { light: [225, 211, 166], dark: [117, 77, 52] },
    { light: [209, 229, 216], dark: [47, 112, 75] },
    { light: [215, 224, 244], dark: [54, 78, 139] }
  ];
  for (const colors of variants) {
    const fixture = {
      width: 240,
      height: 240,
      pixels: renderBoards({
        width: 240,
        height: 240,
        background: [24, 30, 38],
        boards: [{ corners: [[28, 28], [212, 28], [212, 212], [28, 212]], ...colors }]
      })
    };
    assert.equal(run(fixture, 128).ok, true);
  }
});

test('canonical board output defaults to configurable 512 square RGBA', () => {
  const result = run(fixtures.perspective);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'board-localized');
  assert.equal(result.board.boardSize, 512);
  assert.equal(result.board.width, 512);
  assert.equal(result.board.height, 512);
  assert.equal(result.board.pixels.byteLength, 512 * 512 * 4);
  assert.equal(result.board.orientation, 'unknown');
  assert.equal(result.board.transformMetadata.interpolation, 'bilinear-rgba');
  assert.ok(result.board.transformMetadata.maxReprojectionError < 1e-7);
});

test('every successful homography produces exactly 64 equal gapless tiles with full coverage', () => {
  for (const name of ['axisAligned', 'rotated', 'perspective', 'surroundingPage', 'lowContrast']) {
    const result = run(fixtures[name], 128);
    assert.equal(result.ok, true);
    assertExactTileCoverage(result.board);
  }
});

test('homography output runs through the shared recognition geometry contract', () => {
  const result = run(fixtures.axisAligned, 256);
  const validation = validateHomographyOutput({
    width: result.board.width,
    height: result.board.height,
    pixelSpace: result.board.geometry.pixelSpace,
    sourceCorners: result.board.corners,
    transformMetadata: result.board.transformMetadata,
    orientationState: 'unresolved'
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.value.tileSize, 32);
});

test('plain images, stripes, single rectangles, and non-checker grids are rejected', () => {
  const negatives = [
    fixtures.nonBoard,
    { width: 256, height: 256, pixels: stripedImage() },
    { width: 256, height: 256, pixels: singleRectangleImage() },
    { width: 256, height: 256, pixels: genericGridImage() },
    { width: 256, height: 256, pixels: solidImage(256, 256, [250, 250, 250, 255]) }
  ];
  for (const fixture of negatives) {
    const result = run(fixture, 128);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'board-not-found');
  }
});

test('playable 8x8 field outranks a decorative outer frame and displaced grid phase', () => {
  const fixture = createV02DevelopmentFixtures().find((item) => item.id === 'synthetic-thick-coordinate-frame');
  const playable = localizer.scoreSourceCorners(fixture);
  const frame = localizer.scoreSourceCorners({ ...fixture,
    corners: [[27, 24], [293, 24], [293, 290], [27, 290]] });
  const shifted = localizer.scoreSourceCorners({ ...fixture,
    corners: fixture.corners.map(([x, y]) => [x + 12, y]) });
  assert.ok(playable.candidateScore > frame.candidateScore + 0.2);
  assert.ok(playable.gridPhaseEvidenceScore > shifted.gridPhaseEvidenceScore + 0.2);
  assert.equal(playable.accepted, true);
  assert.equal(frame.accepted, false);
});

test('bounded inset and corner refinement preserve deterministic playable-field geometry', () => {
  const fixture = createV02DevelopmentFixtures().find((item) => item.id === 'synthetic-thick-coordinate-frame');
  const first = run(fixture, 128);
  const second = run(fixture, 128);
  assert.equal(first.ok, true);
  assert.deepEqual(first.board.corners, second.board.corners);
  assert.ok(first.diagnostics.insetCandidateCount <= 4);
  assert.ok(first.diagnostics.cornerRefinedCount <= 2);
  assert.ok(localizer.cornerErrorMetrics(first.board.corners, fixture.corners, fixture.width, fixture.height).normalizedCornerRmse < 0.02);
  assertExactTileCoverage(first.board);
});

test('v0.2 synthetic print, perspective, hatching, highlights and small-board analogues localize', () => {
  for (const fixture of createV02DevelopmentFixtures().filter((item) => item.boardPresent)) {
    const result = run(fixture, 128);
    assert.equal(result.ok, true, `${fixture.id}: ${result.error?.code}`);
    const error = localizer.cornerErrorMetrics(result.board.corners, fixture.corners, fixture.width, fixture.height);
    assert.ok(error.normalizedCornerRmse <= 0.03, `${fixture.id}: ${error.normalizedCornerRmse}`);
    assertExactTileCoverage(result.board);
  }
});

test('v0.2 synthetic hard negatives safely abstain, including non-8x8 checker and panels', () => {
  for (const fixture of createV02DevelopmentFixtures().filter((item) => !item.boardPresent)) {
    const result = run(fixture, 128);
    assert.equal(result.ok, false, `${fixture.id} was falsely localized`);
    assert.ok(['board-not-found', 'multiple-board-candidates'].includes(result.error.code));
  }
});

test('multiple similarly scored boards return typed ambiguity with bounded summaries', () => {
  const result = run(fixtures.multipleBoards, 128);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'multiple-board-candidates');
  assert.ok(result.error.diagnostics.candidateCount >= 2);
  assert.ok(result.error.diagnostics.scoreSeparation < localizer.AMBIGUITY_MARGIN);
  assert.ok(result.error.diagnostics.candidateSummaries.length <= localizer.MAX_CANDIDATES);
});

test('partial cropped board returns board-not-found rather than fabricated corners or center crop', () => {
  const result = run(fixtures.partialBoard, 128);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'board-not-found');
  assert.equal(result.error.diagnostics.candidateSummaries.some((candidate) => candidate.accepted), false);
});

test('geometry failures are typed for invalid pixel payloads and board sizes', () => {
  const malformed = localizer.localizeAndRectify({ pixels: new ArrayBuffer(4), width: 64, height: 64, boardSize: 512 });
  assert.equal(malformed.error.code, 'geometry-contract-failed');
  assert.throws(
    () => geometry.rectifyBoard({ pixels: fixtures.axisAligned.pixels, width: 256, height: 256, corners: fixtures.axisAligned.corners, boardSize: 510 }),
    (error) => error.code === 'geometry-contract-failed'
  );
});

test('localization result and canonical pixels are deterministic for identical input', () => {
  const first = run(fixtures.perspective, 128);
  const second = run(fixtures.perspective, 128);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.board.corners, second.board.corners);
  assert.equal(first.board.candidateScore, second.board.candidateScore);
  assert.deepEqual(first.board.transformMetadata, second.board.transformMetadata);
  assert.equal(checksum(first.board.pixels), checksum(second.board.pixels));
});

test('timing and score fields remain measurable diagnostics rather than probability claims', () => {
  const result = run(fixtures.axisAligned, 128);
  for (const field of ['candidateScore', 'geometryScore', 'gridEvidenceScore']) {
    assert.ok(result.board[field] >= 0 && result.board[field] <= 1);
  }
  assert.equal(result.diagnostics.localizerVersion, 'caissa-scanner-board-localizer/3');
  assert.ok(result.diagnostics.candidateCount <= localizer.MAX_CANDIDATES);
  const selected = result.diagnostics.candidateSummaries.find((candidate) => candidate.accepted);
  assert.equal(selected.shapeMetrics.edgeLengths.length, 4);
  assert.equal(selected.shapeMetrics.angles.length, 4);
  assert.equal(selected.rejectionReasons.length, 0);
  for (const field of ['localizationMs', 'candidateScoringMs', 'homographyMs', 'geometryValidationMs', 'totalGeometryMs']) {
    assert.ok(Number.isFinite(result.timing[field]));
    assert.ok(result.timing[field] >= 0);
  }
});

test('benchmark adapter records detection, corners, geometry, scores, and timing without piece metrics', () => {
  const success = localizer.toBenchmarkOutput('perspective-fixture', run(fixtures.perspective, 128));
  assert.equal(success.boardDetected, true);
  assert.equal(success.status, 'candidate');
  assert.equal(success.predictedCorners.length, 4);
  assert.equal(validateHomographyOutput(success.geometry).ok, true);
  assert.equal(success.localization.localizerVersion, 'caissa-scanner-board-localizer/3');
  assert.equal('predictedClasses' in success, false);
  const failure = localizer.toBenchmarkOutput('plain-fixture', run(fixtures.nonBoard, 128));
  assert.deepEqual({ boardDetected: failure.boardDetected, status: failure.status, failureCode: failure.failureCode }, {
    boardDetected: false,
    status: 'no-board',
    failureCode: 'board-not-found'
  });
});
