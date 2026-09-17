import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

export const HISTORICAL_CLASSES = Object.freeze(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
export const HISTORICAL_PREPROCESSING = 'historical-sharp-0.34.5-board256-gray-tile-minmax-v1';
export const HISTORICAL_HASHES = Object.freeze({
  'model.json': 'AA29183FBE73D8E6DB3B144BBC505558A04F64FC2C373C99009C9D6429F6CE8E',
  'weights.bin': '2FF117276E1D22BEAC35F2DBDBC4D8A29650917A9D657E81FFDFB026ADD2C458',
  'metadata.json': '9248660D4131FCAF219A7C7C7370B0EA2EAE58D046E7CA700DD54692FC0B31B2'
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export async function certifyHistoricalArtifacts(modelDir) {
  const bytes = {};
  for (const [name, expected] of Object.entries(HISTORICAL_HASHES)) {
    bytes[name] = await readFile(join(modelDir, name));
    assert(sha256(bytes[name]) === expected, `${name}: historical checksum mismatch`);
  }
  const model = JSON.parse(bytes['model.json']);
  const metadata = JSON.parse(bytes['metadata.json']);
  const layers = model.modelTopology?.config?.layers || [];
  const names = layers.map((layer) => layer.class_name);
  assert(JSON.stringify(names) === JSON.stringify(['InputLayer', 'Conv2D', 'MaxPooling2D', 'Conv2D', 'MaxPooling2D', 'Flatten', 'Dense', 'Dropout', 'Dense']), 'historical model topology mismatch');
  assert(JSON.stringify(layers[0].config.batch_input_shape) === JSON.stringify([null, 32, 32, 1]), 'historical input shape mismatch');
  assert(layers[1].config.filters === 32 && layers[3].config.filters === 64 && layers[6].config.units === 128 && layers[7].config.rate === 0.3 && layers[8].config.units === 13 && layers[8].config.activation === 'softmax', 'historical layer contract mismatch');
  const specs = model.weightsManifest?.[0]?.weights || [];
  const parameterCount = specs.reduce((sum, spec) => sum + spec.shape.reduce((product, dimension) => product * dimension, 1), 0);
  assert(parameterCount === 544909 && bytes['weights.bin'].length === parameterCount * 4, 'historical parameter count mismatch');
  assert(model.generatedBy === 'TensorFlow.js tfjs-layers v4.22.0', 'historical framework mismatch');
  assert(metadata.version === '4.0.0' && metadata.epochs === 1 && metadata.batchSize === 256 && metadata.syntheticTiles === 115200 && metadata.realTiles === 0, 'historical training metadata mismatch');
  return { model, metadata, weightSpecs: specs, weightData: bytes['weights.bin'], hashes: HISTORICAL_HASHES, parameterCount };
}

export function histogramNormalize(tile) {
  assert(tile?.length === 1024, 'expected one 32x32 grayscale tile');
  let min = 255;
  let max = 0;
  for (const value of tile) { min = Math.min(min, value); max = Math.max(max, value); }
  if (max - min < 10) return Uint8Array.from(tile);
  return Uint8Array.from(tile, (value) => Math.round((value - min) * 255 / (max - min)));
}

export async function preprocessCanonicalRgba(sharp, pixels, width = 512, height = 512) {
  assert(pixels?.byteLength === width * height * 4, 'expected canonical RGBA board');
  const started = performance.now();
  const { data, info } = await sharp(Buffer.from(pixels), { raw: { width, height, channels: 4 } })
    .resize(256, 256, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true });
  assert(info.width === 256 && info.height === 256 && info.channels === 1, 'historical grayscale conversion failed');
  const tiles = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const tile = new Uint8Array(1024);
      for (let y = 0; y < 32; y += 1) {
        tile.set(data.subarray((row * 32 + y) * 256 + col * 32, (row * 32 + y) * 256 + col * 32 + 32), y * 32);
      }
      tiles.push(histogramNormalize(tile));
    }
  }
  return { tiles, preprocessMs: performance.now() - started };
}

export class HistoricalTFJSBaseline {
  constructor({ tf, artifacts }) {
    this.tf = tf;
    this.artifacts = artifacts;
    this.model = null;
    this.modelLoadMs = null;
  }

  async load() {
    const started = performance.now();
    const { model, weightSpecs, weightData } = this.artifacts;
    this.model = await this.tf.loadLayersModel({ load: async () => ({
      modelTopology: model.modelTopology,
      weightSpecs,
      weightData: weightData.buffer.slice(weightData.byteOffset, weightData.byteOffset + weightData.byteLength)
    }) });
    assert(this.model.countParams() === 544909, 'loaded model parameter count mismatch');
    this.modelLoadMs = performance.now() - started;
    return this;
  }

  async predictTiles(tiles) {
    assert(this.model, 'load model before prediction');
    assert(Array.isArray(tiles) && tiles.length === 64 && tiles.every((tile) => tile?.length === 1024), 'expected 64 32x32 tiles');
    const started = performance.now();
    const values = new Float32Array(64 * 1024);
    for (let index = 0; index < 64; index += 1) {
      for (let pixel = 0; pixel < 1024; pixel += 1) values[index * 1024 + pixel] = tiles[index][pixel] / 255;
    }
    const input = this.tf.tensor4d(values, [64, 32, 32, 1]);
    let output;
    try {
      output = this.model.predict(input);
      const probabilities = await output.data();
      const predictions = Array.from({ length: 64 }, (_, square) => {
        const classProbabilities = Array.from(probabilities.subarray(square * 13, square * 13 + 13));
        const ranking = classProbabilities.map((value, index) => [value, index]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        return {
          predictedClass: HISTORICAL_CLASSES[ranking[0][1]],
          classProbabilities,
          confidence: ranking[0][0],
          topTwoMargin: ranking[0][0] - ranking[1][0],
          modelVersion: this.artifacts.metadata.version,
          preprocessingVersion: HISTORICAL_PREPROCESSING
        };
      });
      return { predictions, inferenceMs: performance.now() - started };
    } finally {
      input.dispose();
      output?.dispose();
    }
  }

  dispose() { this.model?.dispose(); this.model = null; }
}
