import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { orderedAnnotationCorners, validateLocalizationCorpus } from '../../scanner/recognition/benchmark/localization-real-corpus.js';
import { classifyV03Sample, verifyV03Split, V03_CORPUS_SHA256 } from '../../scanner/recognition/benchmark/localization-v03-split.js';
import '../../scanner/recognition/scanner-board-geometry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_V01_CORPUS = resolve(ROOT, '..', 'caissa_scanner_real_localization_corpus_v0_1');
export const DEFAULT_V03_CORPUS = resolve(ROOT, '..', 'caissa_scanner_real_localization_corpus_v0_3');
export const DEFAULT_OUTPUT = resolve(ROOT, '..', 'caissa_scanner_piece_labels_v0_1', 'piece-labels-v0.1.json');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };

function imagePath(corpus, originalFile) {
  assert(typeof originalFile === 'string' && /^originals\/[a-zA-Z0-9._-]+$/.test(originalFile), 'unsafe-source-path');
  const path = resolve(corpus, ...originalFile.split('/'));
  const relativePath = relative(corpus, path);
  assert(relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath), 'source-path-outside-corpus');
  return path;
}

function canonicalSample(sample, corpus, cornerManifestSha256, sourceCategory, cohort) {
  const corners = orderedAnnotationCorners(sample, 'pixels');
  const geometry = globalThis.CaissaScannerBoardGeometry;
  assert(sample.boardPresent === true && Array.isArray(corners) && corners.length === 4
    && geometry.validateQuadrilateral(corners, { imageWidth: sample.sourceWidth, imageHeight: sample.sourceHeight }).ok,
  `${sample.sampleId}: verified-corners-required`);
  return {
    sampleId: sample.sampleId,
    sourceFilename: sample.originalFile.split('/').at(-1),
    sourceSha256: sample.originalSha256,
    cornerManifestSha256,
    sourceWidth: sample.sourceWidth,
    sourceHeight: sample.sourceHeight,
    sourcePath: imagePath(corpus, sample.originalFile),
    corners,
    cohort,
    sourceCategory,
    pieceSetFamily: sample.pieceSetFamily ?? null,
    pieceSetStyle: sample.pieceSetStyle ?? 'unknown',
    boardThemeFamily: sample.boardThemeFamily ?? null,
    difficultyTags: [...(sample.difficultyTags || [])],
    sourcePlatform: sample.sourcePlatform ?? null,
    referenceOutcome: sample.referenceOutcome ?? null,
    referencePredictedFen: sample.referencePredictedFen ?? null,
    knownWrongSquares: [...(sample.knownWrongSquares || [])],
    classifierFailureTypes: [...(sample.classifierFailureTypes || [])],
    trustedFenPlacement: sample.groundTruth?.pieceTruthVerifiedBy && sample.groundTruth?.fenPlacement
      ? sample.groundTruth.fenPlacement : null
  };
}

export async function verifySourceImage(sample) {
  const actual = sha(await readFile(sample.sourcePath));
  if (actual !== sample.sourceSha256) throw new Error(`${sample.sampleId}: source-checksum-mismatch`);
  return actual;
}

export async function loadPieceCatalog({ corpusV01 = DEFAULT_V01_CORPUS, corpusV03 = DEFAULT_V03_CORPUS } = {}) {
  const v01Manifest = JSON.parse(await readFile(join(ROOT, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json'), 'utf8'));
  const v01AnnotationBytes = await readFile(join(corpusV01, v01Manifest.annotationManifest.file));
  const v01SourceBytes = await readFile(join(corpusV01, v01Manifest.sourceManifest.file));
  const v01Annotation = JSON.parse(v01AnnotationBytes);
  validateLocalizationCorpus({ manifest: v01Manifest, annotation: v01Annotation, source: JSON.parse(v01SourceBytes),
    annotationSha256: sha(v01AnnotationBytes), sourceSha256: sha(v01SourceBytes) });

  const v03StarterBytes = await readFile(join(corpusV03, 'manifest-starter-v0.3.json'));
  const v03AnnotationBytes = await readFile(join(corpusV03, 'localization-hard-v0.3.annotated.json'));
  assert(sha(v03StarterBytes) === V03_CORPUS_SHA256.starter && sha(v03AnnotationBytes) === V03_CORPUS_SHA256.annotated,
    'v03-corpus-manifest-checksum-mismatch');
  const v03Starter = JSON.parse(v03StarterBytes);
  const v03Annotation = JSON.parse(v03AnnotationBytes);
  assert(v03Annotation.status === 'annotation-complete' && v03Annotation.progress?.completed === 46,
    'v03-corners-not-certified');
  verifyV03Split(v03Annotation.samples);
  const v03Sources = new Map(v03Starter.samples.map((sample) => [sample.sampleId, sample]));

  const samples = [];
  const outOfScope = [];
  const duplicateAliases = [];
  for (const source of v01Annotation.samples) {
    const split = v01Manifest.samples.find((sample) => sample.sampleId === source.sampleId);
    assert(split && split.sha256 === source.originalSha256, `${source.sampleId}: v01-source-identity-mismatch`);
    if (split.categoryGroup === '3d-board') {
      outOfScope.push(source.sampleId);
      continue;
    }
    samples.push(canonicalSample(source, corpusV01, sha(v01AnnotationBytes), split.categoryGroup, 'v0.1'));
  }
  for (const source of v03Annotation.samples) {
    const starter = v03Sources.get(source.sampleId);
    assert(starter && starter.originalSha256 === source.originalSha256 && starter.originalFile === source.originalFile,
      `${source.sampleId}: v03-source-identity-mismatch`);
    if (!source.boardPresent) continue;
    if (source.priorCorpusSampleId) {
      const prior = v01Annotation.samples.find((sample) => sample.sampleId === source.priorCorpusSampleId);
      assert(prior?.originalSha256 === source.originalSha256, `${source.sampleId}: overlap-checksum-mismatch`);
      duplicateAliases.push({ sampleId: source.sampleId, canonicalSampleId: prior.sampleId,
        sourceSha256: source.originalSha256 });
      continue;
    }
    assert(source.annotationStatus === 'verified' && source.annotation?.humanVerifiedBy === 'Alexander',
      `${source.sampleId}: v03-corners-not-human-verified`);
    const split = classifyV03Sample(source.sampleId);
    samples.push(canonicalSample(source, corpusV03, sha(v03AnnotationBytes), split.category, 'v0.3-fresh'));
  }
  const hashes = new Set();
  for (const sample of samples) {
    assert(!hashes.has(sample.sourceSha256), `${sample.sampleId}: duplicate-source-in-primary-catalog`);
    hashes.add(sample.sourceSha256);
    await verifySourceImage(sample);
  }
  assert(duplicateAliases.length === 14 && outOfScope.length === 1, 'unexpected-corpus-boundary');
  return {
    v01CornerManifestSha256: sha(v01AnnotationBytes),
    v03CornerManifestSha256: sha(v03AnnotationBytes),
    protectedCorpusRoots: [resolve(corpusV01), resolve(corpusV03)],
    samples,
    duplicateAliases,
    outOfScope
  };
}

export async function rectifiedBoardPng(sample) {
  await verifySourceImage(sample);
  const metadata = await sharp(sample.sourcePath, { failOn: 'error' }).metadata();
  assert(metadata.width === sample.sourceWidth && metadata.height === sample.sourceHeight,
    `${sample.sampleId}: source-dimensions-mismatch`);
  const scale = Math.min(1, 2048 / Math.max(metadata.width, metadata.height),
    Math.sqrt(4_000_000 / (metadata.width * metadata.height)));
  let pipeline = sharp(sample.sourcePath, { failOn: 'error' }).rotate();
  if (scale < 1) pipeline = pipeline.resize(Math.round(metadata.width * scale),
    Math.round(metadata.height * scale), { fit: 'fill' });
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const corners = sample.corners.map(([x, y]) => [x * info.width / sample.sourceWidth, y * info.height / sample.sourceHeight]);
  const board = globalThis.CaissaScannerBoardGeometry.rectifyBoard({
    pixels, width: info.width, height: info.height, corners, boardSize: 512
  });
  assert(board.geometry.width === 512 && board.geometry.height === 512 && board.geometry.tileSize === 64
    && board.geometry.tiles.length === 64, 'recognition-geometry-contract-failed');
  return sharp(Buffer.from(board.pixels), { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
}
