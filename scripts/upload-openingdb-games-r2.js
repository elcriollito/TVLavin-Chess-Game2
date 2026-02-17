#!/usr/bin/env node
/**
 * Upload OpeningDB games artifacts to R2.
 * Usage:
 *   node scripts/upload-openingdb-games-r2.js --dir data/openingdb_games --version v1 --manifest data/openingdb_games/manifest.json
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_DIR = path.resolve('data/openingdb_games');
const DEFAULT_VERSION = 'v1';
const DEFAULT_BUCKET = 'caissa-openingdb';

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    version: DEFAULT_VERSION,
    bucket: DEFAULT_BUCKET,
    manifest: path.resolve('data/openingdb_games/manifest.json')
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      args.dir = path.resolve(argv[i + 1] || args.dir);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim();
      i += 1;
    } else if (token === '--bucket') {
      args.bucket = String(argv[i + 1] || args.bucket).trim();
      i += 1;
    } else if (token === '--manifest') {
      args.manifest = path.resolve(argv[i + 1] || args.manifest);
      i += 1;
    }
  }

  if (!args.version || !/^[a-zA-Z0-9._-]+$/.test(args.version)) {
    throw new Error(`Invalid --version "${args.version}"`);
  }
  return args;
}

function getRunner() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function runWrangler(args) {
  const runner = getRunner();
  return spawnSync(runner, ['wrangler', ...args], { stdio: 'pipe', encoding: 'utf8' });
}

function ensureWranglerReady() {
  const versionRes = runWrangler(['--version']);
  if (versionRes.status !== 0) {
    throw new Error('Wrangler CLI is not available. Install it or run via npx with network access.');
  }
  const whoamiRes = runWrangler(['whoami']);
  if (whoamiRes.status !== 0) {
    throw new Error('Wrangler is not authenticated. Run: npx wrangler login');
  }
}

function uploadOne(filePath, key, bucket, contentType, cacheControl) {
  const args = [
    'r2', 'object', 'put',
    `${bucket}/${key}`,
    '--file', filePath,
    '--content-type', contentType,
    '--cache-control', cacheControl
  ];
  const result = runWrangler(args);
  return {
    ok: result.status === 0,
    stderr: result.stderr || '',
    stdout: result.stdout || ''
  };
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile()) out.push(f);
    }
  }
  walk(dir);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureWranglerReady();
  const root = path.join(args.dir, args.version);
  const shardsDir = path.join(root, 'shards');
  const catalogDir = path.join(root, 'catalog');
  const pgnDir = path.join(root, 'pgn');

  const shardFiles = walkFiles(shardsDir).filter((f) => /^[0-9a-f]{2}\.json$/i.test(path.basename(f)));
  const catalogFiles = walkFiles(catalogDir).filter((f) => /^[0-9a-f]{2}\.json$/i.test(path.basename(f)));
  const pgnFiles = walkFiles(pgnDir).filter((f) => /^g_[0-9a-f]+\.pgn$/i.test(path.basename(f)));

  console.log(`[games-upload] scan root=${root}`);
  console.log(`[games-upload] found shards=${shardFiles.length} catalog=${catalogFiles.length} pgn=${pgnFiles.length}`);

  if (!shardFiles.length) throw new Error(`No shard files in ${shardsDir}`);
  if (!catalogFiles.length) throw new Error(`No catalog files in ${catalogDir}`);

  let uploaded = 0;
  let failed = 0;
  const uploadList = [];
  shardFiles.forEach((f) => uploadList.push({ file: f, key: `openingdb/games/${args.version}/shards/${path.basename(f)}`, contentType: 'application/json' }));
  catalogFiles.forEach((f) => uploadList.push({ file: f, key: `openingdb/games/${args.version}/catalog/${path.basename(f)}`, contentType: 'application/json' }));
  pgnFiles.forEach((f) => uploadList.push({ file: f, key: `openingdb/games/${args.version}/pgn/${path.basename(f)}`, contentType: 'application/x-chess-pgn' }));

  for (const item of uploadList) {
    const res = uploadOne(item.file, item.key, args.bucket, item.contentType, 'public, max-age=31536000, immutable');
    if (!res.ok) {
      failed += 1;
      console.error(`[games-upload] FAILED ${item.key}`);
      if (res.stderr.trim()) console.error(res.stderr.trim());
      continue;
    }
    uploaded += 1;
    console.log(`[games-upload] uploaded ${item.key}`);
  }

  if (args.manifest && fs.existsSync(args.manifest)) {
    const res = uploadOne(args.manifest, 'openingdb/games/manifest.json', args.bucket, 'application/json', 'public, max-age=300');
    if (!res.ok) {
      failed += 1;
      console.error('[games-upload] FAILED openingdb/games/manifest.json');
      if (res.stderr.trim()) console.error(res.stderr.trim());
    } else {
      uploaded += 1;
      console.log('[games-upload] uploaded openingdb/games/manifest.json');
    }
  }

  console.log(JSON.stringify({
    ok: failed === 0,
    bucket: args.bucket,
    version: args.version,
    uploaded,
    failed,
    shards: shardFiles.length,
    catalog: catalogFiles.length,
    pgn: pgnFiles.length
  }, null, 2));

  if (failed > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error('[upload-openingdb-games-r2] failed:', err.message);
  console.error('Hint: ensure Wrangler auth (`npx wrangler whoami`).');
  process.exit(1);
}
