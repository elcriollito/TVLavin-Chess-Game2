import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const FROZEN_V05 = Object.freeze({
  modelVersion: 'caissa-piece-classifier-v0.5-occupancy-recovery',
  modelChecksum: '90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E',
  sourceTorchScriptChecksum: '8025AA0F8455BE582AB718A70BC75C1CE4A583852DA4A3A8E540FEF035EE9801',
  artifactChecksum: 'FFF4C633613997C7C29ACD31FB233CF9A2150D173AAB4E38E0BF650644485211',
  occupancyThreshold: 0.99,
  preprocessingVersion: 'caissa-rgb64-uint8-div255/1',
  preprocessing: 'RGB64 uint8 / 255',
  classOrder: Object.freeze(['empty', 'P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'])
});

export const RECOGNITION_PROTOCOL = Object.freeze({
  request: 'caissa-scanner-beta-recognition-request/1',
  response: 'caissa-scanner-beta-recognition-response/1',
  boardEncoding: 'rgba8',
  width: 512,
  height: 512,
  supportedSourceTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
});

const DEFAULT_MODEL_PATH = fileURLToPath(new URL('../_private/scanner-beta-model/frozen-v05.onnx', import.meta.url));
const DEFAULT_MANIFEST_PATH = fileURLToPath(new URL('../_private/scanner-beta-model/manifest.json', import.meta.url));
const TILE_SIZE = 64;
const BOARD_SIZE = 512;
const TILE_VALUES = 3 * TILE_SIZE * TILE_SIZE;
const BOARD_RGBA_BYTES = BOARD_SIZE * BOARD_SIZE * 4;

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function decodeBoard(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_450_000
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw codedError('INVALID_IMAGE');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== BOARD_RGBA_BYTES) throw codedError('INVALID_IMAGE');
  return bytes;
}

export function validateRecognitionRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw codedError('INVALID_PAYLOAD');
  if (input.schemaVersion !== RECOGNITION_PROTOCOL.request
    || input.boardEncoding !== RECOGNITION_PROTOCOL.boardEncoding
    || input.boardWidth !== RECOGNITION_PROTOCOL.width
    || input.boardHeight !== RECOGNITION_PROTOCOL.height
    || !['white-at-bottom', 'black-at-bottom'].includes(input.orientation)) {
    throw codedError('INVALID_PAYLOAD');
  }
  if (!RECOGNITION_PROTOCOL.supportedSourceTypes.includes(input.sourceImageType)) {
    throw codedError('INVALID_IMAGE');
  }
  return Object.freeze({
    orientation: input.orientation,
    sourceImageType: input.sourceImageType,
    boardRgba: decodeBoard(input.boardRgbaBase64)
  });
}

export function preprocessCanonicalTiles(validated) {
  const result = new Float32Array(64 * TILE_VALUES);
  for (let visualIndex = 0; visualIndex < 64; visualIndex += 1) {
    const canonicalIndex = validated.orientation === 'black-at-bottom' ? 63 - visualIndex : visualIndex;
    const tileRow = Math.floor(visualIndex / 8);
    const tileColumn = visualIndex % 8;
    const targetTile = canonicalIndex * TILE_VALUES;
    for (let y = 0; y < TILE_SIZE; y += 1) {
      const sourceRow = (tileRow * TILE_SIZE + y) * BOARD_SIZE * 4 + tileColumn * TILE_SIZE * 4;
      for (let x = 0; x < TILE_SIZE; x += 1) {
        const source = sourceRow + x * 4;
        const pixel = y * TILE_SIZE + x;
        result[targetTile + pixel] = validated.boardRgba[source] / 255;
        result[targetTile + TILE_SIZE * TILE_SIZE + pixel] = validated.boardRgba[source + 1] / 255;
        result[targetTile + 2 * TILE_SIZE * TILE_SIZE + pixel] = validated.boardRgba[source + 2] / 255;
      }
    }
  }
  return result;
}

function softmax(values, offset, width) {
  let maximum = -Infinity;
  for (let index = 0; index < width; index += 1) maximum = Math.max(maximum, values[offset + index]);
  const output = new Array(width);
  let total = 0;
  for (let index = 0; index < width; index += 1) {
    output[index] = Math.exp(values[offset + index] - maximum);
    total += output[index];
  }
  for (let index = 0; index < width; index += 1) output[index] /= total;
  return output;
}

function placementFen(labels) {
  const ranks = [];
  for (let start = 0; start < 64; start += 8) {
    let rank = '';
    let empty = 0;
    for (const label of labels.slice(start, start + 8)) {
      if (label === 'empty') empty += 1;
      else {
        if (empty) rank += String(empty);
        rank += label;
        empty = 0;
      }
    }
    if (empty) rank += String(empty);
    ranks.push(rank);
  }
  return `${ranks.join('/')} w - - 0 1`;
}

function canonicalResponse(outputs) {
  const occupancyLogits = outputs.occupancy_logits?.data;
  const colorLogits = outputs.color_logits?.data;
  const typeLogits = outputs.piece_type_logits?.data;
  const kingLogits = outputs.king_logits?.data;
  if (occupancyLogits?.length !== 128 || colorLogits?.length !== 128
    || typeLogits?.length !== 384 || kingLogits?.length !== 128) {
    throw codedError('INFERENCE_FAILURE');
  }
  const labels = [];
  const squarePredictions = [];
  for (let index = 0; index < 64; index += 1) {
    const occupancy = softmax(occupancyLogits, index * 2, 2);
    const color = softmax(colorLogits, index * 2, 2);
    const pieceType = softmax(typeLogits, index * 6, 6);
    const king = softmax(kingLogits, index * 2, 2)[1];
    let bestClass = 1;
    let bestProbability = -1;
    for (let colorIndex = 0; colorIndex < 2; colorIndex += 1) {
      for (let typeIndex = 0; typeIndex < 6; typeIndex += 1) {
        const classIndex = 1 + colorIndex * 6 + typeIndex;
        const probability = occupancy[1] * color[colorIndex] * pieceType[typeIndex];
        if (probability > bestProbability) {
          bestProbability = probability;
          bestClass = classIndex;
        }
      }
    }
    const classIndex = occupancy[1] >= FROZEN_V05.occupancyThreshold ? bestClass : 0;
    const predictedClass = FROZEN_V05.classOrder[classIndex];
    labels.push(predictedClass);
    squarePredictions.push({
      square: String.fromCharCode(97 + index % 8) + String(8 - Math.floor(index / 8)),
      predictedClass,
      confidence: classIndex === 0 ? occupancy[0] : bestProbability,
      occupancyProbability: occupancy[1],
      colorProbabilities: color,
      pieceTypeProbabilities: pieceType,
      kingAuxiliaryProbability: king
    });
  }
  return {
    schemaVersion: RECOGNITION_PROTOCOL.response,
    modelVersion: FROZEN_V05.modelVersion,
    modelChecksum: FROZEN_V05.modelChecksum,
    modelArtifactChecksum: FROZEN_V05.artifactChecksum,
    threshold: FROZEN_V05.occupancyThreshold,
    occupancyThreshold: FROZEN_V05.occupancyThreshold,
    preprocessingVersion: FROZEN_V05.preprocessingVersion,
    preprocessing: FROZEN_V05.preprocessing,
    classOrder: [...FROZEN_V05.classOrder],
    predictedFEN: placementFen(labels),
    squarePredictions
  };
}

function assertManifest(manifest, artifact) {
  if (manifest?.schemaVersion !== 'caissa-scanner-production-model/1'
    || manifest.modelVersion !== FROZEN_V05.modelVersion
    || manifest.sourceStateSha256 !== FROZEN_V05.modelChecksum
    || manifest.sourceTorchScriptSha256 !== FROZEN_V05.sourceTorchScriptChecksum
    || manifest.artifactSha256 !== FROZEN_V05.artifactChecksum
    || manifest.occupancyThreshold !== FROZEN_V05.occupancyThreshold
    || JSON.stringify(manifest.classOrder) !== JSON.stringify(FROZEN_V05.classOrder)
    || sha256(artifact) !== FROZEN_V05.artifactChecksum) {
    throw codedError('MODEL_INTEGRITY_FAILURE');
  }
}

export function createFrozenV05Runtime({
  modelPath = DEFAULT_MODEL_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
  read = readFile,
  loadOrt = () => import('onnxruntime-node'),
  clock = () => performance.now()
} = {}) {
  let sessionPromise = null;
  let modelLoadMs = null;

  async function loadSession() {
    const started = clock();
    try {
      const [manifestBytes, artifact, ort] = await Promise.all([read(manifestPath), read(modelPath), loadOrt()]);
      let manifest;
      try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
      catch (_) { throw codedError('MODEL_INTEGRITY_FAILURE'); }
      assertManifest(manifest, artifact);
      const session = await ort.InferenceSession.create(artifact, {
        executionProviders: ['cpu'], graphOptimizationLevel: 'all', intraOpNumThreads: 1, interOpNumThreads: 1
      });
      modelLoadMs = clock() - started;
      return { session, ort };
    } catch (error) {
      if (error?.code === 'MODEL_INTEGRITY_FAILURE') throw error;
      throw codedError('INFERENCE_FAILURE');
    }
  }

  return Object.freeze({
    async infer(input) {
      const validated = validateRecognitionRequest(input);
      const warm = sessionPromise !== null;
      if (!sessionPromise) sessionPromise = loadSession();
      const { session, ort } = await sessionPromise;
      const values = preprocessCanonicalTiles(validated);
      const started = clock();
      let outputs;
      try { outputs = await session.run({ tiles: new ort.Tensor('float32', values, [64, 3, 64, 64]) }); }
      catch (_) { throw codedError('INFERENCE_FAILURE'); }
      const response = canonicalResponse(outputs);
      return { response, metrics: { warm, modelLoadMs: warm ? 0 : modelLoadMs, inferenceMs: clock() - started } };
    }
  });
}

const productionRuntime = createFrozenV05Runtime();

export async function inferFrozenV05Onnx(input) {
  return productionRuntime.infer(input);
}
