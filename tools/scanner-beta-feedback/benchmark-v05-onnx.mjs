import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inferFrozenV05Onnx, RECOGNITION_PROTOCOL } from '../../api/_lib/scanner-beta-inference.js';

const artifact = fileURLToPath(new URL('../../api/_private/scanner-beta-model/frozen-v05.onnx', import.meta.url));
const repetitions = Math.max(5, Number(process.argv[2] || 25));
const rgba = Buffer.alloc(512 * 512 * 4, 255);
const request = {
  schemaVersion: RECOGNITION_PROTOCOL.request,
  boardEncoding: RECOGNITION_PROTOCOL.boardEncoding,
  boardWidth: 512,
  boardHeight: 512,
  sourceImageType: 'image/png',
  orientation: 'white-at-bottom',
  boardRgbaBase64: rgba.toString('base64')
};

function percentile(values, value) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(value * sorted.length) - 1)];
}

const rssBefore = process.memoryUsage().rss;
const coldStarted = performance.now();
const cold = await inferFrozenV05Onnx(request);
const coldRequestMs = performance.now() - coldStarted;
const samples = [];
for (let index = 0; index < repetitions; index += 1) {
  const started = performance.now();
  await inferFrozenV05Onnx(request);
  samples.push(performance.now() - started);
}
const rssAfter = process.memoryUsage().rss;
console.log(JSON.stringify({
  schemaVersion: 'caissa-scanner-v05-onnx-performance/1',
  repetitions,
  artifactBytes: (await stat(artifact)).size,
  coldRequestMs,
  coldModelLoadMs: cold.metrics.modelLoadMs,
  coldInferenceMs: cold.metrics.inferenceMs,
  warmRequestP50Ms: percentile(samples, 0.50),
  warmRequestP95Ms: percentile(samples, 0.95),
  warmRequestMinMs: Math.min(...samples),
  warmRequestMaxMs: Math.max(...samples),
  rssBeforeBytes: rssBefore,
  rssAfterBytes: rssAfter,
  rssDeltaBytes: rssAfter - rssBefore
}, null, 2));
