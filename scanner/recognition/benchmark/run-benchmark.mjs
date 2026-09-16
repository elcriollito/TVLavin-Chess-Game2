import { readFile } from 'node:fs/promises';

import { createBenchmarkReport, serializeBenchmarkReport } from './evaluator.js';
import { sha256Bytes } from './manifest.js';

const [manifestPath, recognizerOutputPath] = process.argv.slice(2);

if (!manifestPath || !recognizerOutputPath) {
  process.stderr.write('Usage: node scanner/recognition/benchmark/run-benchmark.mjs <manifest.json> <recognizer-output.json>\n');
  process.exitCode = 2;
} else {
  try {
    const [manifestBytes, recognizerOutputBytes] = await Promise.all([
      readFile(manifestPath),
      readFile(recognizerOutputPath)
    ]);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const run = JSON.parse(recognizerOutputBytes.toString('utf8'));
    const report = createBenchmarkReport({
      manifest,
      outputs: run.outputs,
      manifestChecksum: sha256Bytes(manifestBytes),
      recognizer: run.recognizer,
      confidenceThreshold: run.confidenceThreshold
    });
    process.stdout.write(serializeBenchmarkReport(report));
  } catch (error) {
    process.stderr.write(`${error.code || error.name || 'ERROR'}: ${error.message}\n`);
    if (error.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    process.exitCode = 1;
  }
}
