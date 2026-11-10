import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { PgnStreamSplitter, PolyglotBookBuilder } from '../js/polyglot-core.js';

const args = new Map(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));
const outputDir = resolve(args.get('output-dir') || '.polyglot-benchmarks');
const sizes = String(args.get('sizes') || '1,5,10,25')
  .split(',')
  .map(Number)
  .filter(value => Number.isFinite(value) && value > 0);
const generateOnly = args.get('generate-only') === 'true';
const game = '[Event "CAISSA Benchmark"]\n[Site "Local"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0\n\n';

await mkdir(outputDir, { recursive: true });
for (const sizeMiB of sizes) {
  const targetBytes = sizeMiB * 1024 * 1024;
  const path = resolve(outputDir, `polyglot-${sizeMiB}mib.pgn`);
  await generateCorpus(path, targetBytes);
  const details = await stat(path);
  if (generateOnly || sizeMiB > 25) {
    console.log(JSON.stringify({ mode: 'generated', sizeMiB, path, bytes: details.size }));
    continue;
  }
  console.log(JSON.stringify(await benchmarkBrowserCore(path, sizeMiB, details.size)));
}

async function generateCorpus(path, targetBytes) {
  try {
    const existing = await stat(path);
    if (existing.size >= targetBytes && existing.size < targetBytes + Buffer.byteLength(game)) return;
  } catch (_error) {
    // Generate below.
  }
  const stream = createWriteStream(path, { flags: 'w' });
  const chunk = game.repeat(2048);
  const chunkBytes = Buffer.byteLength(chunk);
  let written = 0;
  while (written + chunkBytes <= targetBytes) {
    if (!stream.write(chunk)) await once(stream, 'drain');
    written += chunkBytes;
  }
  while (written < targetBytes) {
    if (!stream.write(game)) await once(stream, 'drain');
    written += Buffer.byteLength(game);
  }
  stream.end();
  await once(stream, 'close');
}

async function benchmarkBrowserCore(path, sizeMiB, bytes) {
  const start = performance.now();
  const decoder = new TextDecoder();
  const builder = new PolyglotBookBuilder({ maxPly: 12, minCount: 1, side: 'both' });
  const splitter = new PgnStreamSplitter(pgn => builder.addGame(pgn));
  let peakRss = process.memoryUsage().rss;
  for await (const chunk of createReadStream(path, { highWaterMark: 256 * 1024 })) {
    splitter.push(decoder.decode(chunk, { stream: true }));
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }
  splitter.push(decoder.decode());
  splitter.finish();
  const result = builder.finish();
  return {
    mode: 'browser-core-stream',
    sizeMiB,
    bytes,
    elapsedMs: Math.round(performance.now() - start),
    peakRssBytes: peakRss,
    outputBytes: result.buffer.byteLength,
    ...result.summary
  };
}
