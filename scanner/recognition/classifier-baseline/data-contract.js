import sharp from 'sharp';
import { CLASSES, sha256, validateCatalog, validateSampleManifest } from '../datasets/pieces/dataset-core.js';

export const INPUT_SIZE = 64;
export const RGB_BYTES_PER_TILE = INPUT_SIZE * INPUT_SIZE * 3;
export const CERTIFIED_MANIFEST_SHA256 = 'DCDF1799CC8D25F8D9CEEE6FFCE37FF7214958BA36C27331A48BA0D5EE9AB531';
export const CERTIFIED_CATALOG_SHA256 = '4D71DC062A494DBA8E030FFE31A5FA44522DBDE1C2F0280B1193E8D0B48865CC';

export function certifySyntheticInputs({ manifest, manifestBytes, catalog, catalogBytes, config }) {
  if (sha256(manifestBytes) !== CERTIFIED_MANIFEST_SHA256
    || sha256(catalogBytes) !== CERTIFIED_CATALOG_SHA256
    || config.datasetManifestSha256 !== CERTIFIED_MANIFEST_SHA256
    || config.catalogSha256 !== CERTIFIED_CATALOG_SHA256
    || manifest.datasetVersion !== 'scanner-piece-dataset-v0.3'
    || manifest.seed !== 306 || manifest.catalogSha256 !== CERTIFIED_CATALOG_SHA256
    || JSON.stringify(config.classOrder) !== JSON.stringify(CLASSES))
    throw new Error('uncertified classifier dataset/config identity');
  validateCatalog(catalog);
  validateSampleManifest(manifest.samples);
  const sets = catalog.pieceSets.filter((item) => item.trainingRole === 'TRAINING-ELIGIBLE');
  const byId = new Map(sets.map((item) => [item.pieceSetId, item]));
  const familySplits = Object.groupBy(sets, (item) => item.datasetSplit);
  if (sets.length !== 11 || familySplits.train?.length !== 7
    || familySplits.validation?.length !== 2 || familySplits.test?.length !== 2
    || JSON.stringify(familySplits.validation.map((item) => item.pieceSetId).sort()) !== JSON.stringify([...config.training.validationFamilies].sort())
    || JSON.stringify(familySplits.test.map((item) => item.pieceSetId).sort()) !== JSON.stringify([...config.training.testFamilies].sort()))
    throw new Error('uncertified whole-family split');
  const samples = manifest.samples.filter((sample) => sample.imageFile !== null);
  if (samples.length !== 5280 || manifest.samples.length - samples.length !== 1984
    || samples.some((sample) => sample.trainingRole !== 'TRAINING-ELIGIBLE'
      || !byId.has(sample.pieceSetId) || byId.get(sample.pieceSetId).datasetSplit !== sample.split))
    throw new Error('real or mis-split samples entered synthetic input');
  const counts = Object.groupBy(samples, (item) => item.split);
  if (counts.train?.length !== 3360 || counts.validation?.length !== 960 || counts.test?.length !== 960)
    throw new Error('unexpected synthetic sample counts');
  return samples;
}

export async function syntheticRgb64(sourceBytes) {
  const { data, info } = await sharp(sourceBytes, { failOn: 'error' })
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (info.width !== INPUT_SIZE || info.height !== INPUT_SIZE || info.channels !== 3
    || data.length !== RGB_BYTES_PER_TILE) throw new Error('classifier preprocessing failed RGB64 contract');
  return data;
}
