import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  createLocalizationReport,
  evaluateLocalizationSample
} from '../scanner/recognition/benchmark/localization-real-evaluator.js';
import {
  orderedAnnotationCorners,
  validateLocalizationCorpus
} from '../scanner/recognition/benchmark/localization-real-corpus.js';

await import('../scanner/recognition/scanner-board-geometry.js');
await import('../scanner/recognition/scanner-board-localizer.js');

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(repoRoot, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json');
const defaultCorpus = resolve(repoRoot, '..', 'caissa_scanner_real_localization_corpus_v0_1');

function argument(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function orderedTruth(sample) {
  return orderedAnnotationCorners(sample, 'pixels');
}

async function decodeRgba(filePath) {
  const source = sharp(filePath, { failOn: 'error' }).rotate();
  const metadata = await source.metadata();
  const scale = Math.min(1, 2048 / Math.max(metadata.width, metadata.height), Math.sqrt(4_000_000 / (metadata.width * metadata.height)));
  const pipeline = scale < 1
    ? source.resize(Math.max(1, Math.round(metadata.width * scale)), Math.max(1, Math.round(metadata.height * scale)), { fit: 'fill' })
    : source;
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    pixels: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    width: info.width,
    height: info.height,
    scaleX: info.width / metadata.width,
    scaleY: info.height / metadata.height
  };
}

const corpusRoot = resolve(argument('corpus', process.env.CAISSA_SCANNER_REAL_CORPUS || defaultCorpus));
const label = argument('label', 'baseline');
const splitFilter = argument('split', 'all');
if (!['all', 'development', 'holdout'].includes(splitFilter)) throw new Error(`Unsupported split: ${splitFilter}`);
const outputPath = resolve(argument('output', join(repoRoot, 'artifacts/scanner-localization-hard-v0.1', `${label}-localization-v0.1.json`)));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const annotationBytes = await readFile(join(corpusRoot, manifest.annotationManifest.file));
const sourceBytes = await readFile(join(corpusRoot, manifest.sourceManifest.file));
const annotationSha = sha256(annotationBytes);
const sourceSha = sha256(sourceBytes);
const annotation = JSON.parse(annotationBytes);
const source = JSON.parse(sourceBytes);
validateLocalizationCorpus({ manifest, annotation, source, annotationSha256: annotationSha, sourceSha256: sourceSha });

for (const sample of annotation.samples) {
  const imagePath = join(corpusRoot, ...sample.originalFile.split('/'));
  const imageBytes = await readFile(imagePath);
  if (sha256(imageBytes) !== sample.originalSha256) throw new Error(`${sample.sampleId}: source checksum mismatch`);
}

const localizer = globalThis.CaissaScannerBoardLocalizer;
const selected = annotation.samples.filter((sample) => {
  const split = manifest.samples.find((entry) => entry.sampleId === sample.sampleId)?.split;
  return splitFilter === 'all' || split === splitFilter;
});
const samples = [];
for (const sample of selected) {
  const splitRecord = manifest.samples.find((entry) => entry.sampleId === sample.sampleId);
  const imagePath = join(corpusRoot, ...sample.originalFile.split('/'));
  const decoded = await decodeRgba(imagePath);
  if (decoded.width !== sample.sourceWidth || decoded.height !== sample.sourceHeight) {
    throw new Error(`${sample.sampleId}: decoded dimensions ${decoded.width}x${decoded.height} do not match annotation ${sample.sourceWidth}x${sample.sourceHeight}`);
  }
  const result = localizer.localizeAndRectify({ pixels: decoded.pixels, width: decoded.width, height: decoded.height, boardSize: 512 });
  const truth = orderedTruth(sample).map(([x, y]) => [x * decoded.scaleX, y * decoded.scaleY]);
  const metrics = result.ok ? localizer.cornerErrorMetrics(result.board.corners, truth, decoded.width, decoded.height) : null;
  const truthCandidateEvidence = localizer.scoreSourceCorners({
    pixels: decoded.pixels,
    width: decoded.width,
    height: decoded.height,
    corners: truth
  });
  samples.push(evaluateLocalizationSample({ sample, splitRecord, result, cornerMetrics: metrics, truthCandidateEvidence }));
  process.stderr.write(`${sample.sampleId}: ${result.ok ? samples.at(-1).qualityBucket : result.error.code}\n`);
}

const report = createLocalizationReport({
  manifest,
  annotationSha256: annotationSha,
  detector: {
    label,
    localizerVersion: localizer.LOCALIZER_VERSION,
    implementationCheckpoint: argument('checkpoint', 'd0d9a736c355d15cee09750d859dc3c147380124'),
    splitEvaluated: splitFilter,
    backend: 'node-sharp-rgba-plus-shared-js-localizer',
    boardSize: 512,
    runtimeNote: 'Timing is measured wall time and environment-specific; scores and ordering are deterministic.'
  },
  samples
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);
process.stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);
