#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_DIR = path.resolve('data/gamesearch/shards_build/v1');
const DEFAULT_BUCKET = 'caissa-vault';
const DEFAULT_VERSION = 'v1';

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    bucket: DEFAULT_BUCKET,
    version: DEFAULT_VERSION,
    manifest: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      args.dir = path.resolve(argv[i + 1] || args.dir);
      i += 1;
    } else if (token === '--bucket') {
      args.bucket = String(argv[i + 1] || args.bucket).trim();
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || DEFAULT_VERSION;
      i += 1;
    } else if (token === '--manifest') {
      args.manifest = path.resolve(argv[i + 1] || '');
      i += 1;
    }
  }
  if (!args.manifest) {
    args.manifest = path.join(args.dir, 'manifest.json');
  }
  return args;
}

function getRunner() {
  return process.platform === 'win32' ? 'npx' : 'npx';
}

function uploadOne(bucket, key, filePath, cacheControl) {
  const runner = getRunner();
  const args = ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', filePath, '--content-type', 'application/json', '--cache-control', cacheControl, '--remote'];
  let res;
  if (process.platform === 'win32') {
    const q = (v) => `"${String(v).replace(/"/g, '\\"')}"`;
    const cmd = `${runner} ${args.map(q).join(' ')}`;
    res = spawnSync(cmd, { stdio: 'pipe', encoding: 'utf8', shell: true });
  } else {
    res = spawnSync(runner, args, { stdio: 'pipe', encoding: 'utf8' });
  }
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = fs.readdirSync(args.dir)
    .filter((n) => /^[0-9a-f]{2}\.json$/i.test(n))
    .sort((a, b) => a.localeCompare(b));
  if (files.length !== 256) {
    throw new Error(`Expected 256 shards in ${args.dir}, found ${files.length}`);
  }
  if (!fs.existsSync(args.manifest)) {
    throw new Error(`Manifest file not found: ${args.manifest}`);
  }

  let uploaded = 0;
  let failed = 0;
  for (const fileName of files) {
    const filePath = path.join(args.dir, fileName);
    const key = `gamesearch/${args.version}/shards/${fileName}`;
    const result = uploadOne(args.bucket, key, filePath, 'public, max-age=31536000, immutable');
    if (!result.ok) {
      failed += 1;
      console.error(`[gamesearch-upload] FAILED ${fileName}`);
      if (result.stderr.trim()) console.error(result.stderr.trim());
    } else {
      uploaded += 1;
      console.log(`[gamesearch-upload] uploaded ${fileName} -> ${key}`);
    }
  }

  const manifestRes = uploadOne(args.bucket, 'gamesearch/manifest.json', args.manifest, 'public, max-age=300');
  if (!manifestRes.ok) {
    failed += 1;
    console.error('[gamesearch-upload] FAILED manifest');
    if (manifestRes.stderr.trim()) console.error(manifestRes.stderr.trim());
  } else {
    uploaded += 1;
    console.log('[gamesearch-upload] uploaded manifest -> gamesearch/manifest.json');
  }

  console.log(JSON.stringify({
    ok: failed === 0,
    bucket: args.bucket,
    version: args.version,
    uploaded,
    failed
  }, null, 2));

  if (failed > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error('[gamesearch-upload] failed:', err?.message || err);
  process.exit(1);
}
