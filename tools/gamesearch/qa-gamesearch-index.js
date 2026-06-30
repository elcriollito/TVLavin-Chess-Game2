#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DEFAULT_DIR = path.resolve('data/gamesearch/shards_build/v1');

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, sample: ['00', '6b', 'aa', 'f0', 'ff'] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      args.dir = path.resolve(argv[i + 1] || args.dir);
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.dir)) {
    throw new Error(`Directory not found: ${args.dir}`);
  }
  const files = fs.readdirSync(args.dir).filter((n) => /^[0-9a-f]{2}\.json$/i.test(n));
  if (files.length !== 256) {
    throw new Error(`Expected 256 shard files, found ${files.length}`);
  }

  let totalEntries = 0;
  for (const shard of args.sample) {
    const filePath = path.join(args.dir, `${shard}.json`);
    if (!fs.existsSync(filePath)) throw new Error(`Missing shard ${shard}.json`);
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = payload && typeof payload === 'object' && payload.entries && typeof payload.entries === 'object'
      ? Object.keys(payload.entries).length
      : 0;
    totalEntries += entries;
  }

  const manifestPath = path.join(args.dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Missing manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  console.log(JSON.stringify({
    ok: true,
    dir: path.relative(process.cwd(), args.dir),
    shardCount: files.length,
    sampledShards: args.sample,
    sampledEntriesTotal: totalEntries,
    activeVersion: manifest.activeVersion || null,
    maxPlies: manifest.maxPlies || null,
    topK: manifest.topK || null
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[qa-gamesearch-index] failed:', err?.message || err);
  process.exit(1);
}

