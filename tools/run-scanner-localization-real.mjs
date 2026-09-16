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

async function decodeRgba(filePath, preprocessing) {
  const source = sharp(filePath, { failOn: 'error' }).rotate();
  const metadata = await source.metadata();
  const scale = Math.min(1, 2048 / Math.max(metadata.width, metadata.height), Math.sqrt(4_000_000 / (metadata.width * metadata.height)));
  const pipeline = scale < 1
    ? source.resize(Math.max(1, Math.round(metadata.width * scale)), Math.max(1, Math.round(metadata.height * scale)), { fit: 'fill' })
    : source;
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (preprocessing === 'global-contrast-stretch') {
    const histogram = new Uint32Array(256);
    for (let offset = 0; offset < data.length; offset += 4) {
      histogram[Math.round(0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2])] += 1;
    }
    const percentile = (fraction) => {
      const target = info.width * info.height * fraction;
      let count = 0;
      for (let value = 0; value < 256; value += 1) {
        count += histogram[value];
        if (count >= target) return value;
      }
      return 255;
    };
    const low = percentile(0.05);
    const high = percentile(0.95);
    if (high > low + 8) {
      const multiplier = 255 / (high - low);
      for (let offset = 0; offset < data.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          data[offset + channel] = Math.max(0, Math.min(255, Math.round((data[offset + channel] - low) * multiplier)));
        }
      }
    }
  }
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
const preprocessing = argument('preprocess', 'none');
if (!['none', 'global-contrast-stretch'].includes(preprocessing)) throw new Error(`Unsupported preprocessing: ${preprocessing}`);
const analysisEdge = Number(argument('analysis-edge', '256'));
if (![256, 320, 384].includes(analysisEdge)) throw new Error(`Unsupported analysis edge: ${analysisEdge}`);
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
  const decoded = await decodeRgba(imagePath, preprocessing);
  if (decoded.width !== sample.sourceWidth || decoded.height !== sample.sourceHeight) {
    throw new Error(`${sample.sampleId}: decoded dimensions ${decoded.width}x${decoded.height} do not match annotation ${sample.sourceWidth}x${sample.sourceHeight}`);
  }
  const result = localizer.localizeAndRectify({ pixels: decoded.pixels, width: decoded.width, height: decoded.height, boardSize: 512, analysisEdge });
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
    analysisEdge,
    preprocessing,
    runtimeNote: 'Timing is measured wall time and environment-specific; scores and ordering are deterministic.'
  },
  samples
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);
process.stdout.write(`${JSON.stringify(report.metrics, null, 2)}\n`);
