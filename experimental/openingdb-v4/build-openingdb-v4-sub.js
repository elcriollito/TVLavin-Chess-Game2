#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DEFAULT_IN = path.resolve('data/openingdb/shards_build/v3_p60');
const DEFAULT_OUT_ROOT = path.resolve('data/openingdb/subshards_build');
const DEFAULT_VERSION = 'v4_sub';
const SUB_HEX = 3;

function parseArgs(argv) {
  const args = {
    inDir: DEFAULT_IN,
    outRoot: DEFAULT_OUT_ROOT,
    version: DEFAULT_VERSION,
    progressEvery: 4
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--in') {
      args.inDir = path.resolve(argv[i + 1] || args.inDir);
      i += 1;
    } else if (t === '--out') {
      args.outRoot = path.resolve(argv[i + 1] || args.outRoot);
      i += 1;
    } else if (t === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || DEFAULT_VERSION;
      i += 1;
    } else if (t === '--progressEvery') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(n) && n > 0) args.progressEvery = n;
      i += 1;
    }
  }
  if (!args.version || !/^[a-zA-Z0-9._-]+$/.test(args.version)) {
    throw new Error(`Invalid --version "${args.version}"`);
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, filePath);
}

function sourceShardIds() {
  const out = [];
  for (let i = 0; i < 256; i += 1) out.push(i.toString(16).padStart(2, '0'));
  return out;
}

function subShardIds() {
  const out = [];
  for (let i = 0; i < 4096; i += 1) out.push(i.toString(16).padStart(3, '0'));
  return out;
}

function readJsonObjectStrict(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Expected object at ${filePath}`);
  }
  return parsed;
}

function countMoveRows(node) {
  const moves = Array.isArray(node?.moves) ? node.moves : [];
  return moves.length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  const sourceIds = sourceShardIds();
  for (const id of sourceIds) {
    const p = path.join(args.inDir, `${id}.json`);
    if (!fs.existsSync(p)) throw new Error(`Missing source shard: ${p}`);
  }

  const outDir = path.join(args.outRoot, args.version);
  ensureDir(outDir);

  const counters = {
    sourceShardsProcessed: 0,
    subShardsWritten: 0,
    totalPositions: 0,
    totalMoveRows: 0
  };

  for (const shardId of sourceIds) {
    const sourcePath = path.join(args.inDir, `${shardId}.json`);
    const source = readJsonObjectStrict(sourcePath);

    const groups = new Map();
    for (let i = 0; i < 16; i += 1) {
      groups.set(`${shardId}${i.toString(16)}`, {});
    }

    for (const fenHash of Object.keys(source)) {
      const key = String(fenHash || '').toLowerCase();
      if (!/^[0-9a-f]{16}$/.test(key)) continue;
      const subId = key.slice(0, SUB_HEX);
      const bucket = groups.get(subId);
      if (!bucket) continue;
      const node = source[fenHash];
      bucket[key] = node;
      counters.totalPositions += 1;
      counters.totalMoveRows += countMoveRows(node);
    }

    for (const [subId, payload] of groups.entries()) {
      const outPath = path.join(outDir, `${subId}.json`);
      writeJsonAtomic(outPath, payload);
      counters.subShardsWritten += 1;
    }

    counters.sourceShardsProcessed += 1;
    if (args.progressEvery && counters.sourceShardsProcessed % args.progressEvery === 0) {
      console.log(JSON.stringify({
        progress: true,
        sourceShardsProcessed: counters.sourceShardsProcessed,
        subShardsWritten: counters.subShardsWritten,
        totalPositions: counters.totalPositions
      }));
    }
  }

  const files = subShardIds().map((id) => path.join(outDir, `${id}.json`));
  const sizes = files.map((p) => fs.statSync(p).size);
  const totalBytes = sizes.reduce((sum, n) => sum + n, 0);
  const minBytes = sizes.length ? Math.min(...sizes) : 0;
  const maxBytes = sizes.length ? Math.max(...sizes) : 0;
  const avgBytes = sizes.length ? Math.round(totalBytes / sizes.length) : 0;

  const index = {
    generatedAt: new Date().toISOString(),
    version: args.version,
    format: 'subshard-3hex',
    sourceVersion: path.basename(args.inDir),
    sourceDir: path.relative(process.cwd(), args.inDir).replace(/\\/g, '/'),
    subShardCount: counters.subShardsWritten,
    totalPositions: counters.totalPositions,
    totalMoveRows: counters.totalMoveRows,
    bytes: {
      total: totalBytes,
      min: minBytes,
      avg: avgBytes,
      max: maxBytes
    }
  };

  const meta = {
    ...index,
    inputShardCount: 256,
    partitionRule: 'fenHash.slice(0,3)',
    filesPattern: 'openingdb/subshards/{version}/{hhh}.json'
  };

  writeJsonAtomic(path.join(outDir, 'index.json'), index);
  writeJsonAtomic(path.join(outDir, 'meta.json'), meta);

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    ok: true,
    outDir,
    elapsedMs,
    sourceShardsProcessed: counters.sourceShardsProcessed,
    subShardsWritten: counters.subShardsWritten,
    totalPositions: counters.totalPositions,
    totalMoveRows: counters.totalMoveRows,
    bytes: {
      total: totalBytes,
      min: minBytes,
      avg: avgBytes,
      max: maxBytes
    }
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[build-openingdb-v4-sub] failed:', err.message);
  process.exit(1);
}
