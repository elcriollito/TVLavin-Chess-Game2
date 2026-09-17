import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, stableJson } from '../scanner/recognition/datasets/pieces/dataset-core.js';
import { verifyAssetCatalog } from '../scanner/recognition/datasets/pieces/asset-integrity.js';
import { certifySyntheticInputs, RGB_BYTES_PER_TILE, syntheticRgb64 } from '../scanner/recognition/classifier-baseline/data-contract.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const datasetDir = resolve(arg('dataset-dir') || '');
const outputDir = resolve(arg('output-dir') || '');
if (!arg('dataset-dir') || !arg('output-dir')) throw new Error('provide --dataset-dir and a new --output-dir');
const outside = (path) => { const rel = relative(root, path); return rel.startsWith('..') || isAbsolute(rel); };
if (!outside(datasetDir) || !outside(outputDir) || outputDir === datasetDir)
  throw new Error('training inputs and outputs must be isolated outside the repository');
const config = JSON.parse(await readFile(join(root, 'scanner/recognition/classifier-baseline/config-v0.1.json')));
const manifestBytes = await readFile(join(datasetDir, 'dataset-manifest.json'));
const catalogBytes = await readFile(join(root, 'scanner/recognition/datasets/piece-sets/catalog-v1.json'));
const manifest = JSON.parse(manifestBytes), catalog = JSON.parse(catalogBytes);
const samples = certifySyntheticInputs({ manifest, manifestBytes, catalog, catalogBytes, config });
const audit = await verifyAssetCatalog(catalog, root);
if (audit.exactDuplicates.length || audit.nearDuplicates.length || audit.acquiredFamilies !== 10)
  throw new Error('asset integrity/duplicate audit failed');
await mkdir(outputDir, { recursive: false });
const binary = await open(join(outputDir, 'synthetic-rgb64.bin'), 'wx');
const digest = createHash('sha256');
const records = [];
try {
  for (const [index, sample] of samples.entries()) {
    const bytes = await readFile(join(datasetDir, sample.imageFile));
    if (sha256(bytes) !== sample.imageSha256) throw new Error(`${sample.sampleId}: generated source changed`);
    const rgb = await syntheticRgb64(bytes);
    await binary.write(rgb, 0, rgb.length, index * RGB_BYTES_PER_TILE);
    digest.update(rgb);
    records.push({ index, sampleId: sample.sampleId, classIndex: config.classOrder.indexOf(sample.classLabel),
      classLabel: sample.classLabel, split: sample.split, pieceSetId: sample.pieceSetId,
      boardThemeId: sample.boardThemeId, squareTone: sample.squareTone,
      augmentationId: sample.augmentationId, hardCaseTags: sample.hardCaseTags,
      sourceImageSha256: sample.imageSha256 });
    if ((index + 1) % 1000 === 0) process.stderr.write(`prepared ${index + 1}/${samples.length} synthetic tiles\n`);
  }
} finally { await binary.close(); }
const metadata = { schemaVersion: 'caissa-scanner-classifier-synthetic-rgb64/1',
  datasetVersion: config.datasetVersion, sourceManifestSha256: sha256(manifestBytes),
  catalogSha256: sha256(catalogBytes), classOrder: config.classOrder,
  shape: [samples.length, 64, 64, 3], bytesPerTile: RGB_BYTES_PER_TILE,
  pixelsSha256: digest.digest('hex').toUpperCase(), sourcePixelsCommitted: false,
  realEvaluationTilesIncluded: 0, records };
await writeFile(join(outputDir, 'synthetic-rgb64.json'), stableJson(metadata), { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ outputDir, samples: samples.length, pixelsSha256: metadata.pixelsSha256,
  metadataSha256: sha256(stableJson(metadata)), realEvaluationTilesIncluded: 0 }, null, 2)}\n`);
