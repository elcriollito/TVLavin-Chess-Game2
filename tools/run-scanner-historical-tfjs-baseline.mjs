import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import nodeUtil from 'node:util';
import { certifyHistoricalArtifacts, HistoricalTFJSBaseline, HISTORICAL_CLASSES, HISTORICAL_PREPROCESSING, preprocessCanonicalRgba } from '../scanner/recognition/benchmark/historical-tfjs-baseline.js';
import { evaluateHistoricalBoards, knownHardCaseObservations, selectUniqueSources, truthLabels }
  from '../scanner/recognition/benchmark/historical-classifier-evaluation.js';
import { orderedAnnotationCorners, validateLocalizationCorpus } from '../scanner/recognition/benchmark/localization-real-corpus.js';
import { classifyV03Sample, verifyV03Split, V03_CORPUS_SHA256 } from '../scanner/recognition/benchmark/localization-v03-split.js';
import { toVisualBenchmarkTruth, validateManifest as validatePieceLabelManifest } from './scanner-piece-label-annotator/piece-label-core.js';
import { certifyVerifiedRealEligibility } from '../scanner/recognition/benchmark/historical-classifier-eligibility.js';
import '../scanner/recognition/scanner-board-geometry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const fileSha = async (path) => sha(await readFile(path));
const corpusV01 = resolve(argument('corpus-v01', join(root, '..', 'caissa_scanner_real_localization_corpus_v0_1')));
const corpusV03 = resolve(argument('corpus-v03', join(root, '..', 'caissa_scanner_real_localization_corpus_v0_3')));
const modelDir = argument('model-dir');
const runtimeDir = argument('runtime-dir');
const truthPath = argument('truth');
const scoringPolicy = argument('scoring-policy', 'legacy');
if (!['legacy', 'verified-real-31'].includes(scoringPolicy)) throw new Error('unsupported historical scoring policy');
if (scoringPolicy === 'verified-real-31' && !truthPath) throw new Error('verified-real-31 requires canonical --truth');
if (!modelDir || !runtimeDir) throw new Error('Provide isolated --model-dir and --runtime-dir (tfjs-node 4.22.0 + sharp 0.34.5); no model or runtime is bundled into Scanner.');
const output = resolve(argument('output', join(root, 'artifacts/scanner-classifier-baseline/historical-tfjs-real-benchmark.json')));
const timingOutput = resolve(argument('timing-output', join(dirname(output), 'historical-tfjs-performance.json')));
// tfjs-node 4.22.0 calls this removed Node util helper; restore its old semantics only in this benchmark process.
nodeUtil.isNullOrUndefined ||= (value) => value === null || value === undefined;
const requireFromRuntime = createRequire(join(resolve(runtimeDir), 'package.json'));
const tf = requireFromRuntime('@tensorflow/tfjs-node');
const sharp = requireFromRuntime('sharp');
if (requireFromRuntime('@tensorflow/tfjs-node/package.json').version !== '4.22.0'
    || requireFromRuntime('sharp/package.json').version !== '0.34.5'
    || tf.getBackend() !== 'tensorflow') throw new Error('Historical benchmark requires native tfjs-node 4.22.0 and sharp 0.34.5');
const artifacts = await certifyHistoricalArtifacts(resolve(modelDir));

const v01Manifest = JSON.parse(await readFile(join(root, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json')));
const v01AnnotatedBytes = await readFile(join(corpusV01, v01Manifest.annotationManifest.file));
const v01SourceBytes = await readFile(join(corpusV01, v01Manifest.sourceManifest.file));
const v01Annotated = JSON.parse(v01AnnotatedBytes);
validateLocalizationCorpus({ manifest: v01Manifest, annotation: v01Annotated, source: JSON.parse(v01SourceBytes), annotationSha256: sha(v01AnnotatedBytes), sourceSha256: sha(v01SourceBytes) });

const v03StarterBytes = await readFile(join(corpusV03, 'manifest-starter-v0.3.json'));
const v03AnnotatedBytes = await readFile(join(corpusV03, 'localization-hard-v0.3.annotated.json'));
if (sha(v03StarterBytes) !== V03_CORPUS_SHA256.starter || sha(v03AnnotatedBytes) !== V03_CORPUS_SHA256.annotated) throw new Error('v0.3 immutable manifest checksum mismatch');
const v03Starter = JSON.parse(v03StarterBytes);
const v03Annotated = JSON.parse(v03AnnotatedBytes);
verifyV03Split(v03Annotated.samples);
const v03SourceById = new Map(v03Starter.samples.map((sample) => [sample.sampleId, sample]));
const entries = [];
for (const sample of v01Annotated.samples) {
  const splitRecord = v01Manifest.samples.find((entry) => entry.sampleId === sample.sampleId);
  if (splitRecord.categoryGroup === '3d-board') continue; // Outside the user-defined 2D MVP domain.
  entries.push({ sampleId: sample.sampleId, sourceSha256: sample.originalSha256, path: join(corpusV01, ...sample.originalFile.split('/')),
    sourceFilename: sample.originalFile.split('/').at(-1), cornerManifestSha256: sha(v01AnnotatedBytes),
    width: sample.sourceWidth, height: sample.sourceHeight, corners: orderedAnnotationCorners(sample),
    sourceCategory: splitRecord.categoryGroup, pieceSetFamily: sample.pieceSetFamily || 'unknown',
    pieceSetStyle: sample.pieceSetStyle || 'unknown', sourcePlatform: sample.sourcePlatform || null,
    difficultyTags: sample.difficultyTags || [], cohort: 'v0.1' });
}
for (const sample of v03Annotated.samples) {
  if (!sample.boardPresent) continue;
  const source = v03SourceById.get(sample.sampleId);
  if (!source || source.originalSha256 !== sample.originalSha256 || source.originalFile !== sample.originalFile
      || sample.annotationStatus !== 'verified' || sample.annotation?.humanVerifiedBy !== 'Alexander') throw new Error(`${sample.sampleId}: uncertified source or corners`);
  const split = classifyV03Sample(sample.sampleId);
  if (split.split === 'legacy-overlap') continue;
  entries.push({ sampleId: sample.sampleId, sourceSha256: sample.originalSha256, path: join(corpusV03, ...sample.originalFile.split('/')),
    sourceFilename: sample.originalFile.split('/').at(-1), cornerManifestSha256: sha(v03AnnotatedBytes),
    width: sample.sourceWidth, height: sample.sourceHeight, corners: orderedAnnotationCorners(sample),
    sourceCategory: split.category, pieceSetFamily: sample.pieceSetFamily || 'unknown',
    pieceSetStyle: sample.pieceSetStyle || 'unknown', sourcePlatform: sample.sourcePlatform || null,
    difficultyTags: sample.difficultyTags || [], cohort: 'v0.3-fresh' });
}
const { selected, duplicates } = selectUniqueSources(entries);
if (selected.length !== 32 || duplicates.length) throw new Error(`unexpected 2D source count: ${selected.length} unique, ${duplicates.length} duplicate`);
for (const entry of selected) if (await fileSha(entry.path) !== entry.sourceSha256) throw new Error(`${entry.sampleId}: original image checksum mismatch`);

let truthById = new Map();
let truthManifestSha256 = null;
let eligibility = null;
if (truthPath) {
  const truthBytes = await readFile(resolve(truthPath));
  truthManifestSha256 = sha(truthBytes);
  const manifest = JSON.parse(truthBytes);
  truthById = new Map();
  if (manifest.schemaVersion === 'caissa-scanner-piece-labels/1') {
    validatePieceLabelManifest(manifest, { v01CornerManifestSha256: sha(v01AnnotatedBytes),
      v03CornerManifestSha256: sha(v03AnnotatedBytes), samples: selected });
    if (scoringPolicy === 'verified-real-31') eligibility = certifyVerifiedRealEligibility(selected, manifest);
    for (const item of manifest.samples.filter((entry) => entry.annotation.status === 'verified')) {
      const truth = toVisualBenchmarkTruth(item);
      truthLabels(truth);
      truthById.set(item.sampleId, truth);
    }
  } else if (manifest.schemaVersion === 'caissa-scanner-piece-truth/1' && Array.isArray(manifest.samples)) {
    if (scoringPolicy === 'verified-real-31') throw new Error('verified-real-31 requires canonical human-reviewed piece-label manifest');
    for (const item of manifest.samples) {
      if (truthById.has(item.sampleId)) throw new Error(`${item.sampleId}: duplicate truth record`);
      truthLabels(item);
      const source = selected.find((entry) => entry.sampleId === item.sampleId);
      if (!source || source.sourceSha256 !== item.sourceSha256) throw new Error(`${item.sampleId}: truth source is ineligible or checksum differs`);
      truthById.set(item.sampleId, item);
    }
  } else {
    throw new Error('unsupported piece-truth manifest');
  }
}

const baseline = await new HistoricalTFJSBaseline({ tf, artifacts }).load();
const scored = [];
const timing = [];
const geometry = globalThis.CaissaScannerBoardGeometry;
let peakRssBytes = process.memoryUsage().rss;
const scoringIds = new Set(eligibility?.scoringSampleIds || selected.map((entry) => entry.sampleId));
for (const entry of selected.filter((sample) => scoringIds.has(sample.sampleId))) {
  const started = performance.now();
  const metadata = await sharp(entry.path, { failOn: 'error' }).metadata();
  if (metadata.width !== entry.width || metadata.height !== entry.height) throw new Error(`${entry.sampleId}: source dimensions differ`);
  const scale = Math.min(1, 2048 / Math.max(entry.width, entry.height), Math.sqrt(4_000_000 / (entry.width * entry.height)));
  let pipeline = sharp(entry.path, { failOn: 'error' }).rotate();
  if (scale < 1) pipeline = pipeline.resize(Math.round(entry.width * scale), Math.round(entry.height * scale), { fit: 'fill' });
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const actualCorners = entry.corners.map(([x, y]) => [x * info.width / entry.width, y * info.height / entry.height]);
  const pixels = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const rectified = geometry.rectifyBoard({ pixels, width: info.width, height: info.height, corners: actualCorners, boardSize: 512 });
  const preprocessed = await preprocessCanonicalRgba(sharp, rectified.pixels);
  const inference = await baseline.predictTiles(preprocessed.tiles);
  const totalMs = performance.now() - started;
  timing.push({ sampleId: entry.sampleId, preprocessMs: preprocessed.preprocessMs, inferenceMs: inference.inferenceMs, totalMs, effectiveTileMs: inference.inferenceMs / 64 });
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  const truth = truthById.get(entry.sampleId);
  if (scoringPolicy === 'verified-real-31' && !truth) throw new Error(`${entry.sampleId}: unreviewed sample reached headline scoring`);
  if (truth) scored.push({ ...entry, truth, predictions: inference.predictions });
  process.stderr.write(`${entry.sampleId}: ${truth ? 'scored' : 'unscored'}\n`);
}
baseline.dispose();
if (scoringPolicy === 'verified-real-31' && (scored.length !== 31 || scored.length * 64 !== 1984)) {
  throw new Error('verified-real-31 scoring count mismatch');
}
if (truthPath && await fileSha(resolve(truthPath)) !== truthManifestSha256) throw new Error('truth manifest changed during benchmark');
for (const entry of selected) if (await fileSha(entry.path) !== entry.sourceSha256) {
  throw new Error(`${entry.sampleId}: source changed during benchmark`);
}
const metrics = evaluateHistoricalBoards(scored);
const average = (field) => timing.reduce((sum, item) => sum + item[field], 0) / timing.length;
const report = {
  schemaVersion: 'caissa-scanner-historical-tfjs-baseline/1',
  evaluationStatus: scoringPolicy === 'verified-real-31' ? 'SCORED_VERIFIED_REAL_31'
    : scored.length ? 'PARTIALLY_SCORED' : 'HOLD_NO_VERIFIED_PIECE_TRUTH',
  benchmarkVersion: scoringPolicy === 'verified-real-31' ? 'phase3-005b/1' : 'phase3-005/1',
  scoringPolicy, truthManifestSha256, modelVersion: artifacts.metadata.version,
  preprocessingVersion: HISTORICAL_PREPROCESSING,
  model: { hashes: artifacts.hashes, framework: 'tfjs-node 4.22.0', sharpVersion: '0.34.5', parameterCount: artifacts.parameterCount,
    inputShape: [null, 32, 32, 1], classOrder: HISTORICAL_CLASSES, syntheticTrainingTiles: artifacts.metadata.syntheticTiles,
    verifiedRealTrainingTiles: artifacts.metadata.realTiles, historicalSyntheticValidationAccuracy: artifacts.metadata.syntheticValAccuracy },
  corpus: { v01PositiveBoards: 14, v03PositiveBoards: 33, v03LegacyExactByteOverlaps: 14, excludedOutOfMvp3d: 1,
    unique2dSources: selected.length, duplicateSourceIdsExcluded: v03Annotated.samples.filter((item) => item.priorCorpusSampleId).map((item) => item.sampleId),
    additionalDuplicateIds: duplicates, humanCornerBoards: selected.length, inferenceBoards: timing.length,
    eligibleTruthBoards: scored.length, eligibleTruthSquares: scored.length * 64,
    sourceFamilyCount: new Set(scored.map((entry) => entry.sourceCategory)).size,
    missingTruthSampleIds: selected.filter((entry) => !truthById.has(entry.sampleId)).map((entry) => entry.sampleId),
    excludedEdgeCase: eligibility?.excluded || null },
  realMetrics: scored.length ? metrics : null,
  knownHardCaseObservations: scored.length ? knownHardCaseObservations(metrics.perBoard) : null,
  historicalModelDecision: scoringPolicy === 'verified-real-31'
    ? { class: 'B', label: 'USEFUL ONLY AS BOOTSTRAP / REFERENCE',
      reason: 'Measured 13-class and exact-board real performance is insufficient for product recognition; weights remain a reproducible historical comparator.' }
    : null,
  realAccuracyUnavailableReason: scored.length ? null : 'No human-verified 64-square labels or FEN plus orientation in either real corpus; reference recognizer output is not ground truth.',
  performance: { measurementsFile: basename(timingOutput), note: 'Separate environment-dependent wall-time measurements; no iPhone claim.' },
  specialCasesAwaitingVerifiedMapping: [
    { id: 'A', knownPartialTruth: 'White Re1 Bc1 Bf1 Qe3; Black Ke8 Qd8 Bd6 Ba6' },
    { id: 'B', knownPartialTruth: 'Black Be7 Bc8 Na5' },
    { id: 'C', knownPartialTruth: 'e1 White King; reference recognizer said Black King' }
  ],
  productDomain: '2D chessboards and diagrams; physical/volumetric 3D out of MVP; abstain on 3D-like inputs'
};
await mkdir(dirname(output), { recursive: true });
await mkdir(dirname(timingOutput), { recursive: true });
await writeFile(timingOutput, `${JSON.stringify({ schemaVersion: 'caissa-scanner-historical-tfjs-performance/1',
  environment: `Node ${process.version}; ${process.platform}/${process.arch}; native tensorflow backend; no iPhone claim`,
  modelLoadMs: baseline.modelLoadMs, meanPreprocessMs: average('preprocessMs'), meanInferenceMs: average('inferenceMs'),
  meanPerBoardTotalMs: average('totalMs'), meanEffectivePerTileInferenceMs: average('effectiveTileMs'), peakProcessRssBytes: peakRssBytes,
  perBoard: timing }, null, 2)}\n`);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${output}\nstatus=${report.evaluationStatus} unique2d=${selected.length} eligibleTruth=${scored.length}\n`);
