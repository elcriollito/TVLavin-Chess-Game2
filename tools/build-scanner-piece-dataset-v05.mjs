import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import '../scanner/recognition/scanner-board-geometry.js';
import { canonicalIndexForImageIndex } from './scanner-piece-label-annotator/piece-label-core.js';
import { hash } from './scanner-real-development/core.mjs';

const root = resolve(import.meta.dirname, '..');
const sourceRoot = resolve(root, '..', 'caissa_scanner_real_development_cohort_v0_1');
const certifiedPath = join(root,
  'scanner/recognition/datasets/real-development/real-development-v0.2-certified.json');
const V04_METADATA_SHA = '50DB29018B2B48AA34D940DC1FC4E2121EE690F2B6E2DD495C06A556367F860F';
const V04_PIXELS_SHA = '36AC185585907C03CA705B35D6530F3918840A0194B396E8D12A414359920AFB';
const CLASSES = ['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
const TILE_BYTES = 64 * 64 * 3;
const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };

export function extractCanonicalTiles(rgba, orientation) {
  const sourcePixels = rgba instanceof ArrayBuffer ? new Uint8ClampedArray(rgba) : rgba;
  assert(sourcePixels?.length === 512 * 512 * 4, 'rectified-rgba-buffer-invalid');
  const tiles = Array(64);
  for (let imageIndex = 0; imageIndex < 64; imageIndex++) {
    const canonical = canonicalIndexForImageIndex(imageIndex, orientation);
    const tile = Buffer.allocUnsafe(TILE_BYTES);
    const imageRow = Math.floor(imageIndex / 8), imageCol = imageIndex % 8;
    let target = 0;
    for (let y = 0; y < 64; y++) {
      const sourceY = imageRow * 64 + y;
      for (let x = 0; x < 64; x++) {
        const source = (sourceY * 512 + imageCol * 64 + x) * 4;
        tile[target++] = sourcePixels[source]; tile[target++] = sourcePixels[source + 1];
        tile[target++] = sourcePixels[source + 2];
      }
    }
    tiles[canonical] = tile;
  }
  assert(tiles.every((tile) => tile?.length === TILE_BYTES), 'canonical-tile-extraction-failed');
  return tiles;
}

export async function build({ sourceV04Dir, outputDir } = {}) {
  assert(sourceV04Dir && outputDir, 'source-v04-dir-and-output-dir-required');
  sourceV04Dir = resolve(sourceV04Dir); outputDir = resolve(outputDir);
  const relativeOutput = relative(root, outputDir);
  assert(relativeOutput.startsWith('..') || isAbsolute(relativeOutput), 'v05-output-must-be-external');
  const v04MetaPath = join(sourceV04Dir, 'synthetic-rgb64-v04.json');
  const v04BinaryPath = join(sourceV04Dir, 'synthetic-rgb64-v04.bin');
  const v04MetaBytes = await readFile(v04MetaPath); const v04 = JSON.parse(v04MetaBytes);
  assert(hash(v04MetaBytes) === V04_METADATA_SHA && v04.pixelsSha256 === V04_PIXELS_SHA
    && v04.datasetVersion === 'scanner-piece-dataset-v0.4' && v04.records.length === 7920,
  'uncertified-v04-metadata');
  const certifiedBytes = await readFile(certifiedPath); const certified = JSON.parse(certifiedBytes);
  assert(certified.corpusVersion === 'caissa-scanner-real-development-v0.2-certified'
    && certified.samples.length === 41 && certified.finalBenchmarkUseAllowed === false
    && certified.heldCount === 0 && certified.excludedCount === 0, 'uncertified-real-development-cohort');
  await mkdir(outputDir, { recursive: false });
  const binaryPath = join(outputDir, 'piece-rgb64-v05.bin');
  const binary = await open(binaryPath, 'wx');
  const digest = createHash('sha256');
  let offset = 0;
  try {
    for await (const chunk of createReadStream(v04BinaryPath)) {
      await binary.write(chunk, 0, chunk.length, offset); offset += chunk.length; digest.update(chunk);
    }
    assert(offset === 7920 * TILE_BYTES, 'v04-pixel-length-mismatch');
    const records = v04.records.map((item) => ({ ...item, dataRole: `synthetic-${item.split}`,
      sourceDatasetVersion: item.sourceDatasetVersion || 'v0.3', protectedFinalBenchmark: false }));
    let index = records.length;
    for (const sample of certified.samples) {
      assert(sample.humanVerified && sample.developmentUseAllowed && sample.finalBenchmarkUseAllowed === false
        && ['train-development', 'validation'].includes(sample.split), `real-role-invalid:${sample.sampleId}`);
      const sourceBytes = await readFile(join(sourceRoot, sample.sourceFilename));
      assert(hash(sourceBytes) === sample.sourceSha256, `real-source-changed:${sample.sampleId}`);
      const { data, info } = await sharp(sourceBytes, { failOn: 'error' }).rotate().ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      assert(info.width === sample.sourceWidth && info.height === sample.sourceHeight,
        `real-source-dimensions-changed:${sample.sampleId}`);
      const pixels = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const board = globalThis.CaissaScannerBoardGeometry.rectifyBoard({ pixels, width: info.width,
        height: info.height, corners: sample.corners, boardSize: 512 });
      const tiles = extractCanonicalTiles(board.pixels, sample.orientation);
      for (let canonical = 0; canonical < 64; canonical++) {
        const tile = tiles[canonical]; await binary.write(tile, 0, tile.length, offset);
        offset += tile.length; digest.update(tile);
        const classLabel = sample.labels[canonical];
        records.push({ index, sampleId: `${sample.sampleId}/${canonical}`,
          boardSampleId: sample.sampleId, canonicalSquareIndex: canonical,
          classIndex: CLASSES.indexOf(classLabel), classLabel,
          split: sample.split === 'validation' ? 'validation' : 'train',
          dataRole: sample.split === 'validation' ? 'real-development-validation' : 'real-development-train',
          sourceDatasetVersion: certified.corpusVersion, sourceImageSha256: sample.sourceSha256,
          platform: sample.platform, captureType: sample.captureType, sourceCategory: sample.sourceCategory,
          subtypeTags: sample.subtypeTags, sourceGroup: sample.sourceGroup,
          sessionGroup: sample.sessionGroup, cornerRevision: sample.cornerRevision,
          orientation: sample.orientation, hardNegative: classLabel === 'empty', protectedFinalBenchmark: false });
        index++;
      }
    }
    assert(index === 10544 && offset === index * TILE_BYTES, 'v05-count-or-length-mismatch');
    const pixelSha = digest.digest('hex').toUpperCase();
    const splitCounts = Object.fromEntries(['train', 'validation', 'test'].map((split) =>
      [split, records.filter((item) => item.split === split).length]));
    const realRoleCounts = Object.fromEntries(['real-development-train', 'real-development-validation'].map((role) =>
      [role, records.filter((item) => item.dataRole === role).length]));
    const metadata = { schemaVersion: 'caissa-scanner-piece-dataset-rgb64/5',
      datasetVersion: 'scanner-piece-dataset-v0.5', sourceSyntheticDatasetVersion: v04.datasetVersion,
      sourceSyntheticMetadataSha256: V04_METADATA_SHA, sourceSyntheticPixelsSha256: V04_PIXELS_SHA,
      certifiedRealCorpusVersion: certified.corpusVersion,
      certifiedRealManifestSha256: hash(certifiedBytes), humanTruthSha256: certified.annotationTruthSha256,
      classOrder: CLASSES, shape: [index, 64, 64, 3], bytesPerTile: TILE_BYTES,
      pixelsSha256: pixelSha, splitCounts, realRoleCounts, realBoardCount: 41,
      protectedFinalBenchmarkTilesIncluded: 0, sourcePixelsCommitted: false,
      policy: 'v0.4 synthetic families plus human-verified v0.2 development-only tiles; protected final benchmark excluded',
      records };
    const metadataPath = join(outputDir, 'piece-rgb64-v05.json');
    await writeFile(metadataPath, stable(metadata), { flag: 'wx' });
    return { metadataPath, binaryPath, metadataSha256: hash(await readFile(metadataPath)),
      pixelsSha256: pixelSha, splitCounts, realRoleCounts };
  } finally { await binary.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build({ sourceV04Dir: arg('source-v04-dir'), outputDir: arg('output-dir') }).then((result) => {
    process.stdout.write(stable(result));
  }).catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
}
