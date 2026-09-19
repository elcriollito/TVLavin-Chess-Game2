import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { loadVerifiedRealEvaluation } from '../scanner/recognition/datasets/pieces/real-evaluation.js';
import { orderedAnnotationCorners } from '../scanner/recognition/benchmark/localization-real-corpus.js';
import '../scanner/recognition/scanner-board-geometry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!arg('model-dir') || !arg('output-dir')) throw new Error('provide frozen --model-dir and a new --output-dir');
const modelDir = resolve(arg('model-dir')), outputDir = resolve(arg('output-dir'));
const outside = (path) => { const rel = relative(root, path); return rel.startsWith('..') || isAbsolute(rel); };
if (!outside(modelDir) || !outside(outputDir)) throw new Error('model and real pixels must remain outside repository');
const configPath = resolve(arg('config') || join(root, 'scanner/recognition/classifier-baseline/config-v0.1.json'));
const configBytes = await readFile(configPath);
const config = JSON.parse(configBytes);
const freeze = JSON.parse(await readFile(join(modelDir, 'freeze-manifest.json')));
const syntheticTest = JSON.parse(await readFile(join(modelDir, 'synthetic-test-report.json')));
if (freeze.configSha256 !== sha256(configBytes)
  || freeze.stateSha256 !== sha256(await readFile(join(modelDir, 'frozen-state.pt')))
  || freeze.modelVersion !== config.modelVersion || syntheticTest.stateSha256 !== freeze.stateSha256
  || freeze.classOrder.join(',') !== config.classOrder.join(','))
  throw new Error('model not frozen before real benchmark');

const corpusV01 = resolve(root, '..', 'caissa_scanner_real_localization_corpus_v0_1');
const corpusV03 = resolve(root, '..', 'caissa_scanner_real_localization_corpus_v0_3');
const truthPath = resolve(root, '..', 'caissa_scanner_piece_labels_v0_1', 'piece-labels-v0.1.json');
const real = await loadVerifiedRealEvaluation({ truthPath, corpusV01, corpusV03, repoRoot: root });
if (real.sourceBoardCount !== 31 || real.tiles.length !== 1984
  || real.truthManifestSha256 !== 'AA471439A1EE78301591424A92FC9C425D3B7C3FCF12AC18A2CFE83B2A4EF855')
  throw new Error('certified 31-board cohort identity changed');
const annotationV01 = JSON.parse(await readFile(join(corpusV01, 'localization-hard-v0.1.annotated.json')));
const annotationV03 = JSON.parse(await readFile(join(corpusV03, 'localization-hard-v0.3.annotated.json')));
const sourceById = new Map([
  ...annotationV01.samples.map((sample) => [sample.sampleId, { sample, corpus: corpusV01 }]),
  ...annotationV03.samples.map((sample) => [sample.sampleId, { sample, corpus: corpusV03 }])
]);
const boardIds = [...new Set(real.tiles.map((tile) => tile.sourceImageId))];
if (boardIds.length !== 31 || boardIds.some((id) => real.tiles.filter((tile) => tile.sourceImageId === id).length !== 64))
  throw new Error('unexpected real board/tile partition');
const firstTile = new Map(boardIds.map((id) => [id, real.tiles.find((tile) => tile.sourceImageId === id)]));
const bytesPerTile = 64 * 64 * 3;
await mkdir(outputDir, { recursive: false });
const binary = await open(join(outputDir, 'real-rgb64.bin'), 'wx');
const digest = createHash('sha256');
const sources = [];
let tileIndex = 0;
try {
  for (const id of boardIds) {
    const mapped = sourceById.get(id);
    if (!mapped) throw new Error(`${id}: missing certified corner source`);
    const { sample, corpus } = mapped;
    if (sample.originalSha256 !== firstTile.get(id).sourceImageSha256)
      throw new Error(`${id}: source/truth SHA disagreement`);
    const imagePath = join(corpus, ...sample.originalFile.split('/'));
    if (sha256(await readFile(imagePath)) !== sample.originalSha256)
      throw new Error(`${id}: original image changed`);
    const metadata = await sharp(imagePath, { failOn: 'error' }).metadata();
    if (metadata.width !== sample.sourceWidth || metadata.height !== sample.sourceHeight)
      throw new Error(`${id}: source dimensions changed`);
    const scale = Math.min(1, 2048 / Math.max(sample.sourceWidth, sample.sourceHeight),
      Math.sqrt(4_000_000 / (sample.sourceWidth * sample.sourceHeight)));
    let pipeline = sharp(imagePath, { failOn: 'error' }).rotate();
    if (scale < 1) pipeline = pipeline.resize(Math.round(sample.sourceWidth * scale),
      Math.round(sample.sourceHeight * scale), { fit: 'fill' });
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corners = orderedAnnotationCorners(sample).map(([x, y]) => [
      x * info.width / sample.sourceWidth, y * info.height / sample.sourceHeight
    ]);
    const pixels = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const rectified = globalThis.CaissaScannerBoardGeometry.rectifyBoard({ pixels, width: info.width,
      height: info.height, corners, boardSize: 512 });
    const board = new Uint8Array(rectified.pixels);
    if (board.length !== 512 * 512 * 4) throw new Error(`${id}: invalid rectified board`);
    for (let boardRow = 0; boardRow < 8; boardRow++) for (let boardCol = 0; boardCol < 8; boardCol++) {
      const tile = Buffer.allocUnsafe(bytesPerTile);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const source = ((boardRow * 64 + y) * 512 + boardCol * 64 + x) * 4;
        const target = (y * 64 + x) * 3;
        tile[target] = board[source]; tile[target + 1] = board[source + 1]; tile[target + 2] = board[source + 2];
      }
      await binary.write(tile, 0, tile.length, tileIndex * bytesPerTile);
      digest.update(tile); tileIndex++;
    }
    sources.push({ sampleId: id, sourceSha256: sample.originalSha256,
      cornerManifestSha256: firstTile.get(id).cornerManifestSha256 });
    process.stderr.write(`${id}: human-corner RGB64 prepared (${sources.length}/31)\n`);
  }
} finally { await binary.close(); }
if (tileIndex !== 1984 || sha256(await readFile(truthPath)) !== real.truthManifestSha256)
  throw new Error('real cohort changed during extraction');
const metadata = { schemaVersion: 'caissa-scanner-classifier-real-rgb64/1',
  modelVersion: config.modelVersion, frozenStateSha256: freeze.stateSha256,
  truthManifestSha256: real.truthManifestSha256, boardCount: boardIds.length, tileCount: tileIndex,
  boardIds, sourceIdentities: sources, classOrder: config.classOrder,
  shape: [tileIndex, 64, 64, 3], pixelsSha256: digest.digest('hex').toUpperCase(),
  corners: 'Alexander human-verified; canonical 512x512 projective warp; exact 64 equal visual-order cells',
  labelsIncluded: false, trainingAllowed: false };
await writeFile(join(outputDir, 'real-rgb64.json'), stableJson(metadata), { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ boardCount: boardIds.length, tiles: tileIndex,
  pixelsSha256: metadata.pixelsSha256, frozenStateSha256: freeze.stateSha256 }, null, 2)}\n`);
