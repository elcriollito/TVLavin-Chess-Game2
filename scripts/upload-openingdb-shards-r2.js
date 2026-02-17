#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_DIR = path.resolve('data/openingdb/shards');
const DEFAULT_VERSION = 'v1';
const DEFAULT_BUCKET = 'caissa-openingdb';

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    version: DEFAULT_VERSION,
    bucket: DEFAULT_BUCKET
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
    }
  }

  if (!args.version || !/^[a-zA-Z0-9._-]+$/.test(args.version)) {
    throw new Error(`Invalid --version "${args.version}"`);
  }
  return args;
}

function getJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function getRunner() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function uploadOne(filePath, key, bucket) {
  const runner = getRunner();
  const args = [
    'wrangler',
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--file',
    filePath,
    '--content-type',
    'application/json',
    '--cache-control',
    'public, max-age=31536000, immutable'
  ];

  const result = spawnSync(runner, args, {
    stdio: 'pipe',
    encoding: 'utf8'
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = getJsonFiles(args.dir);
  if (files.length === 0) {
    throw new Error(`No JSON files found in ${args.dir}`);
  }

  console.log(`[openingdb-upload] bucket=${args.bucket} version=${args.version} dir=${args.dir}`);
  let uploaded = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const key = `openingdb/shards/${args.version}/${fileName}`;
    const size = fs.statSync(filePath).size;
    const res = uploadOne(filePath, key, args.bucket);
    if (!res.ok) {
      failed += 1;
      console.error(`[openingdb-upload] FAILED ${fileName} (${formatBytes(size)})`);
      if (res.stderr.trim()) console.error(res.stderr.trim());
      if (res.stdout.trim()) console.error(res.stdout.trim());
      continue;
    }
    uploaded += 1;
    totalBytes += size;
    console.log(`[openingdb-upload] uploaded ${fileName} (${formatBytes(size)}) -> ${key}`);
  }

  console.log(JSON.stringify({
    ok: failed === 0,
    bucket: args.bucket,
    version: args.version,
    uploaded,
    failed,
    files: files.length,
    totalBytes
  }, null, 2));

  if (failed > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error('[openingdb-upload] failed:', err.message);
  console.error('Hint: ensure Wrangler is installed and authenticated (`npx wrangler whoami`).');
  process.exit(1);
}
