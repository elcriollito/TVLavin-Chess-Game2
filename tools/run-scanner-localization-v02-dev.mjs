import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../scanner/recognition/scanner-board-geometry.js';
import '../scanner/recognition/scanner-board-localizer.js';
import { createV02DevelopmentFixtures } from '../tests/fixtures/scanner-localization-hard-v02-fixtures.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.2-dev.json');
const generatorPath = join(root, 'tests/fixtures/scanner-localization-hard-v02-fixtures.js');
const outputPath = join(root, 'artifacts/scanner-localization-hard-v0.2-dev/synthetic-development.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const fixtures = createV02DevelopmentFixtures();
if (fixtures.filter((fixture) => fixture.boardPresent).length !== manifest.syntheticPositiveCount
  || fixtures.filter((fixture) => !fixture.boardPresent).length !== manifest.syntheticNegativeCount) {
  throw new Error('v0.2 development manifest count drift');
}
const localizer = globalThis.CaissaScannerBoardLocalizer;
const scales = [256, 320, 384];
const results = [];
for (const analysisEdge of scales) {
  for (const fixture of fixtures) {
    const result = localizer.localizeAndRectify({ pixels: fixture.pixels.slice(0), width: fixture.width,
      height: fixture.height, analysisEdge, boardSize: 128 });
    const error = result.ok && fixture.boardPresent
      ? localizer.cornerErrorMetrics(result.board.corners, fixture.corners, fixture.width, fixture.height) : null;
    results.push({
      id: fixture.id,
      category: fixture.category,
      provenance: 'deterministic-developer-created-synthetic',
      boardPresent: fixture.boardPresent,
      sourceSha256: sha256(new Uint8Array(fixture.pixels)),
      width: fixture.width,
      height: fixture.height,
      analysisEdge,
      detected: result.ok,
      failureCode: result.ok ? null : result.error.code,
      cornerRmse: error?.normalizedCornerRmse ?? null,
      worstCornerError: error?.normalizedWorstCornerError ?? null,
      accepted: Boolean(error && error.normalizedCornerRmse <= 0.03 && error.normalizedWorstCornerError <= 0.05),
      wrongBoard: Boolean(error && error.normalizedCornerRmse > 0.06),
      candidateScore: result.ok ? result.board.candidateScore : null,
      phaseScore: result.ok ? result.board.gridPhaseEvidenceScore : null,
      timing: result.timing
    });
  }
}
const summary = Object.fromEntries(scales.map((analysisEdge) => {
  const batch = results.filter((item) => item.analysisEdge === analysisEdge);
  const positives = batch.filter((item) => item.boardPresent);
  const negatives = batch.filter((item) => !item.boardPresent);
  const average = (key) => batch.reduce((sum, item) => sum + (item.timing[key] || 0), 0) / batch.length;
  return [analysisEdge, {
    positiveCount: positives.length,
    negativeCount: negatives.length,
    positiveDetected: positives.filter((item) => item.detected).length,
    positiveAccepted: positives.filter((item) => item.accepted).length,
    positiveWrongBoard: positives.filter((item) => item.wrongBoard).length,
    falsePositives: negatives.filter((item) => item.detected).length,
    falsePositiveRateSynthetic: negatives.filter((item) => item.detected).length / negatives.length,
    trueNegativeRateSynthetic: negatives.filter((item) => !item.detected).length / negatives.length,
    meanTimingMs: Object.fromEntries(['candidateGenerationMs', 'periodicityScoringMs', 'insetRefinementMs',
      'cornerRefinementMs', 'homographyMs', 'totalGeometryMs'].map((key) => [key, average(key)]))
  }];
}));
const report = {
  corpusVersion: manifest.corpusVersion,
  manifestSha256: sha256(await readFile(manifestPath)),
  generatorSha256: sha256(await readFile(generatorPath)),
  detectorVersion: localizer.LOCALIZER_VERSION,
  caveat: 'All negatives in this run are synthetic. This is not a real-world false-positive-rate estimate.',
  summary,
  results
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n${JSON.stringify(summary, null, 2)}\n`);
