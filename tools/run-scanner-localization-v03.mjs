import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { classifyV03Sample, verifyV03Split, V03_CORPUS_SHA256, V03_GROUPS } from '../scanner/recognition/benchmark/localization-v03-split.js';
import { summarizeV03 } from '../scanner/recognition/benchmark/localization-v03-report.js';

await import('../scanner/recognition/scanner-board-geometry.js');
await import('../scanner/recognition/scanner-board-localizer.js');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const corpus = resolve(process.env.CAISSA_SCANNER_V03_CORPUS || join(root, '..', 'caissa_scanner_real_localization_corpus_v0_3'));
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const split = arg('split', 'development');
const label = arg('label', 'baseline');
const analysisEdge = Number(arg('analysis-edge', '256'));
const preprocessing = arg('preprocess', 'none');
const output = resolve(arg('output', join(root, 'artifacts/scanner-localization-hard-v0.3', `development-${label}.json`)));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
if (!['development', 'evaluation', 'legacy-overlap'].includes(split)) throw new Error(`Invalid split: ${split}`);
if (![256, 320, 384].includes(analysisEdge)) throw new Error(`Invalid analysis edge: ${analysisEdge}`);
if (!['none', 'global-contrast-stretch'].includes(preprocessing)) throw new Error(`Invalid preprocessing: ${preprocessing}`);
const localizerPath = join(root, 'scanner/recognition/scanner-board-localizer.js');
const localizerSha = sha(await readFile(localizerPath));
if (split !== 'development' && arg('frozen-localizer-sha', '') !== localizerSha) {
  throw new Error('Evaluation/legacy split is sealed: provide the frozen localizer SHA before running it');
}

const starterBytes = await readFile(join(corpus, 'manifest-starter-v0.3.json'));
const annotationBytes = await readFile(join(corpus, 'localization-hard-v0.3.annotated.json'));
if (sha(starterBytes) !== V03_CORPUS_SHA256.starter || sha(annotationBytes) !== V03_CORPUS_SHA256.annotated) {
  throw new Error('Immutable v0.3 manifest checksum mismatch');
}
const starter = JSON.parse(starterBytes);
const annotated = JSON.parse(annotationBytes);
if (starter.schemaVersion !== 'caissa-scanner-localization-starter/3'
    || annotated.schemaVersion !== 'caissa-scanner-localization-annotations/1'
    || annotated.status !== 'annotation-complete'
    || annotated.sourceManifest.sha256 !== V03_CORPUS_SHA256.starter
    || annotated.progress.completed !== 46 || annotated.progress.total !== 46) {
  throw new Error('v0.3 manifest certification failed');
}
const counts = verifyV03Split(annotated.samples);
const prior = JSON.parse(await readFile(join(root, 'scanner/recognition/benchmark/manifests/scanner-localization-hard-v0.1.json')));
const priorHashes = new Map(prior.samples.map((entry) => [entry.sha256, entry.sampleId]));
const starterById = new Map(starter.samples.map((entry) => [entry.sampleId, entry]));
const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
for (const sample of annotated.samples) {
  const source = starterById.get(sample.sampleId);
  if (!source || sample.originalSha256 !== source.originalSha256 || sample.sourceWidth !== source.sourceWidth
      || sample.sourceHeight !== source.sourceHeight || sample.originalFile !== source.originalFile
      || sample.referenceSha256 !== source.referenceSha256 || sample.annotationStatus !== 'verified'
      || sample.annotation?.humanVerifiedBy !== 'Alexander') throw new Error(`${sample.sampleId}: annotation/source mismatch`);
  const priorId = priorHashes.get(sample.originalSha256) || null;
  if (priorId !== (sample.priorCorpusSampleId || null)) throw new Error(`${sample.sampleId}: v0.1 overlap mismatch`);
  const bytes = await readFile(join(corpus, ...sample.originalFile.split('/')));
  if (sha(bytes) !== sample.originalSha256) throw new Error(`${sample.sampleId}: source bytes changed`);
  if (sample.boardPresent) {
    const points = keys.map((key) => sample.groundTruth?.playableBoardCorners?.[key]);
    if (points.some((point) => !point)) throw new Error(`${sample.sampleId}: missing corners`);
    for (const point of points) {
      for (const axis of ['x', 'y']) {
        const coordinate = point.pixels[axis];
        const dimension = axis === 'x' ? sample.sourceWidth : sample.sourceHeight;
        if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > dimension
            || !Number.isFinite(point.normalized[axis]) || point.normalized[axis] < 0
            || point.normalized[axis] > 1 || Math.abs(point.normalized[axis] - coordinate / dimension) > 0.000002) {
          throw new Error(`${sample.sampleId}: invalid ${axis} corner`);
        }
      }
    }
    const corners = points.map((point) => [point.pixels.x, point.pixels.y]);
    const crosses = corners.map((point, index) => {
      const next = corners[(index + 1) % 4];
      const after = corners[(index + 2) % 4];
      return (next[0] - point[0]) * (after[1] - next[1]) - (next[1] - point[1]) * (after[0] - next[0]);
    });
    if (crosses.some((value) => value <= 1)) throw new Error(`${sample.sampleId}: non-convex quadrilateral`);
    const reference = await readFile(join(corpus, ...sample.referenceScreenshot.split('/')));
    if (sha(reference) !== sample.referenceSha256) throw new Error(`${sample.sampleId}: reference bytes changed`);
  } else if (sample.groundTruth?.expectedLocalizationResult !== 'board-not-found'
      || sample.groundTruth?.playableBoardCorners) throw new Error(`${sample.sampleId}: invalid negative`);
}

const round = (value, places = 6) => Number.isFinite(value) ? Number(value.toFixed(places)) : null;
const polygonArea = (corners) => Math.abs(corners.reduce((sum, point, index) => {
  const next = corners[(index + 1) % 4];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0)) / 2;
const localizer = globalThis.CaissaScannerBoardLocalizer;
const records = [];
for (const sample of annotated.samples.filter((entry) => classifyV03Sample(entry.sampleId).split === split)) {
  const sourcePath = join(corpus, ...sample.originalFile.split('/'));
  const metadata = await sharp(sourcePath, { failOn: 'error' }).metadata();
  const scale = Math.min(1, 2048 / Math.max(metadata.width, metadata.height), Math.sqrt(4_000_000 / (metadata.width * metadata.height)));
  let pipeline = sharp(sourcePath, { failOn: 'error' }).rotate();
  if (scale < 1) pipeline = pipeline.resize(Math.round(metadata.width * scale), Math.round(metadata.height * scale), { fit: 'fill' });
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (preprocessing === 'global-contrast-stretch') {
    const histogram = new Uint32Array(256);
    for (let offset = 0; offset < data.length; offset += 4) {
      histogram[Math.round(0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2])] += 1;
    }
    const percentile = (fraction) => {
      const target = info.width * info.height * fraction;
      let seen = 0;
      for (let value = 0; value < 256; value += 1) {
        seen += histogram[value];
        if (seen >= target) return value;
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
  const scaleX = info.width / sample.sourceWidth;
  const scaleY = info.height / sample.sourceHeight;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0
      || Math.abs(scaleX - scaleY) > 0.003) throw new Error(`${sample.sampleId}: invalid decode scale`);
  const pixels = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const result = localizer.localizeAndRectify({ pixels, width: info.width, height: info.height, boardSize: 512, analysisEdge });
  const classification = classifyV03Sample(sample.sampleId);
  const corners = sample.boardPresent ? keys.map((key) => {
    const point = sample.groundTruth.playableBoardCorners[key].pixels;
    return [point.x * scaleX, point.y * scaleY];
  }) : null;
  const errors = result.ok && corners ? localizer.cornerErrorMetrics(result.board.corners, corners, info.width, info.height) : null;
  const rmse = round(errors?.normalizedCornerRmse);
  const worst = round(errors?.normalizedWorstCornerError);
  const predictedArea = result.ok ? polygonArea(result.board.corners) : null;
  const truthArea = corners ? polygonArea(corners) : null;
  const wrong = Boolean(result.ok && sample.boardPresent && (rmse > 0.03 || worst > 0.05));
  const outerFrame = wrong && predictedArea / truthArea >= 1.18;
  const decision = result.ok ? result.supportBoundary.decision
    : result.error.code === 'multiple-board-candidates' ? 'multiple-board-candidates'
      : result.error.code === 'deferred-unsupported' ? 'deferred-unsupported'
        : result.error.code === 'review-needed' ? 'review-needed' : 'board-not-found';
  const selected = result.diagnostics?.candidateSummaries?.[0] || result.error?.diagnostics?.candidateSummaries?.[0] || null;
  const record = {
    sampleId: sample.sampleId, split, group: classification.group, category: classification.category,
    boardPresent: sample.boardPresent, negativeCategory: sample.negativeCategory || null,
    decision, decisionReasons: result.supportBoundary?.reasons || [], boardFound: result.ok,
    wrongBoard: wrong, outerFrame, cornerRmse: rmse,
    worstCornerError: worst, homographySuccess: Boolean(result.ok && result.board.transformMetadata),
    geometryPass: Boolean(result.ok && result.board.geometry.tiles.length === 64
      && result.board.width === result.board.height && result.board.boardSize % 8 === 0),
    failureCode: result.ok ? null : result.error.code,
    candidate: selected ? {
      candidateScore: round(selected.candidateScore), gridScore: round(selected.gridEvidenceScore),
      checkerScore: round(selected.checkerEvidenceScore), gridPhaseScore: round(selected.gridPhaseEvidenceScore),
      geometryScore: round(selected.geometryScore), outerFrameRisk: round(selected.outerFrameRisk),
      perspectiveRisk: round(selected.perspectiveRisk), playableFieldEvidence: round(selected.playableFieldEvidence),
      rejectionReasons: selected.rejectionReasons
    } : null,
    timingMs: Object.fromEntries(Object.entries(result.timing).map(([key, value]) => [key, round(value, 3)]))
  };
  records.push(record);
  process.stderr.write(`${sample.sampleId}: ${decision}${wrong ? ' WRONG' : ''}${outerFrame ? ' OUTER' : ''}\n`);
}

const categories = [...new Set(records.map((record) => record.category))].sort();
const report = {
  schemaVersion: 'caissa-scanner-localization-support-report/1',
  corpusVersion: 'scanner-localization-hard-v0.3',
  corpusSha256: V03_CORPUS_SHA256,
  splitCounts: counts,
  leakageGroups: V03_GROUPS,
  detector: { label, split, localizerVersion: localizer.LOCALIZER_VERSION, localizerSha256: localizerSha,
    analysisEdge, boardSize: 512, preprocessing, runtime: 'node-sharp-rgba-plus-shared-js-localizer' },
  metrics: { all: summarizeV03(records), positives: summarizeV03(records.filter((record) => record.boardPresent)),
    negatives: summarizeV03(records.filter((record) => !record.boardPresent)),
    byCategory: Object.fromEntries(categories.map((category) => [category, summarizeV03(records.filter((record) => record.category === category))])) },
  samples: records
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${output}\n${JSON.stringify(report.metrics, null, 2)}\n`);
