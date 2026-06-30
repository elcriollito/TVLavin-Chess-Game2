#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DEFAULT_IN = path.resolve('data/openingdb/shards_build/v3_p60');
const DEFAULT_OUT_ROOT = path.resolve('data/openingdb/subshards_build');
const DEFAULT_VERSION = 'v4_sub';
const SUB_PREFIX_HEX = 3;

function parseArgs(argv) {
  const args = {
    inDir: DEFAULT_IN,
    outRoot: DEFAULT_OUT_ROOT,
    version: DEFAULT_VERSION
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--in') {
      args.inDir = path.resolve(argv[i + 1] || args.inDir);
      i += 1;
    } else if (token === '--out') {
      args.outRoot = path.resolve(argv[i + 1] || args.outRoot);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || DEFAULT_VERSION;
      i += 1;
    }
  }

  if (!args.version || !/^[a-zA-Z0-9._-]+$/.test(args.version)) {
    throw new Error(`Invalid --version "${args.version}"`);
  }
  return args;
}

function listShardFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile() && /^[0-9a-f]{2}\.json$/i.test(d.name))
    .map((d) => path.join(dirPath, d.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sampleSubPrefixDistribution(parsedShard) {
  const buckets = new Map();
  for (const fenHash of Object.keys(parsedShard || {})) {
    const sub = String(fenHash || '').slice(0, SUB_PREFIX_HEX).toLowerCase();
    if (!/^[0-9a-f]{3}$/.test(sub)) continue;
    buckets.set(sub, (buckets.get(sub) || 0) + 1);
  }
  return buckets;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = listShardFiles(args.inDir);
  if (files.length !== 256) {
    throw new Error(`Expected 256 shard files in ${args.inDir}, found ${files.length}`);
  }

  const outDir = path.join(args.outRoot, args.version);
  fs.mkdirSync(outDir, { recursive: true });

  const stats = files.map((fullPath) => {
    const st = fs.statSync(fullPath);
    return {
      shard: path.basename(fullPath, '.json').toLowerCase(),
      bytes: st.size
    };
  });

  // Exact distribution sample using a few shards to validate assumptions.
  const sampleShardIds = ['00', '71', 'c7', 'ff'];
  const sampled = [];
  for (const shardId of sampleShardIds) {
    const fullPath = path.join(args.inDir, `${shardId}.json`);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = readJson(fullPath);
    const dist = sampleSubPrefixDistribution(parsed);
    const counts = Array.from(dist.values());
    const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    const max = counts.length ? Math.max(...counts) : 0;
    const min = counts.length ? Math.min(...counts) : 0;
    sampled.push({
      shard: shardId,
      totalFenHashes: Object.keys(parsed).length,
      subBuckets: dist.size,
      avgPerSubBucket: Math.round(avg),
      minPerSubBucket: min,
      maxPerSubBucket: max
    });
  }

  const totalBytes = stats.reduce((sum, s) => sum + s.bytes, 0);
  const avgShardBytes = totalBytes / stats.length;
  const projectedSubShardBytes = Math.round(avgShardBytes / 16); // 2->3 hex split

  const plan = {
    generatedAt: new Date().toISOString(),
    inputDir: path.relative(process.cwd(), args.inDir).replace(/\\/g, '/'),
    version: args.version,
    sourceFormat: 'openingdb/shards/{version}/{hh}.json',
    targetFormat: 'openingdb/subshards/{version}/{hhh}.json',
    subPrefixHex: SUB_PREFIX_HEX,
    sourceShardCount: stats.length,
    projectedSubShardCount: 4096,
    bytes: {
      total: totalBytes,
      avgShard: Math.round(avgShardBytes),
      projectedAvgSubShard: projectedSubShardBytes
    },
    sampleDistribution: sampled,
    manifestDraft: {
      activeVersion: args.version,
      baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards/v4_sub',
      format: 'subshard-3hex',
      nodeApi: {
        enabled: true,
        path: '/openingdb/node',
        version: args.version
      }
    },
    nextStepCommand: `node experimental/openingdb-v4/build-openingdb-v4-sub.js --in ${path.relative(process.cwd(), args.inDir).replace(/\\/g, '/')} --out data/openingdb/subshards_build --version ${args.version}`
  };

  const outPath = path.join(outDir, 'plan.json');
  fs.writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    plan: outPath,
    sourceShardCount: plan.sourceShardCount,
    projectedSubShardCount: plan.projectedSubShardCount,
    projectedAvgSubShardBytes: plan.bytes.projectedAvgSubShard
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[plan-openingdb-v4-sub] failed:', err.message);
  process.exit(1);
}
