#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_DIR = path.resolve('data/openingdb/subshards_build/v4_sub');
const DEFAULT_VERSION = 'v4_sub';
const DEFAULT_BUCKET = 'caissa-vault';

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    version: DEFAULT_VERSION,
    bucket: DEFAULT_BUCKET,
    retries: 2
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      args.dir = path.resolve(argv[i + 1] || args.dir);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || args.version;
      i += 1;
    } else if (token === '--bucket') {
      args.bucket = String(argv[i + 1] || args.bucket).trim() || args.bucket;
      i += 1;
    } else if (token === '--retries') {
      const n = Number.parseInt(String(argv[i + 1] || ''), 10);
      if (Number.isFinite(n) && n >= 0) args.retries = n;
      i += 1;
    }
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(args.version)) {
    throw new Error(`Invalid --version: ${args.version}`);
  }
  return args;
}

function getRunners() {
  if (process.platform === 'win32') {
    return [
      'C:\\Users\\ALEXANDER\\AppData\\Roaming\\npm\\wrangler.cmd',
      'wrangler.cmd',
      'wrangler',
      'npx'
    ];
  }
  return ['wrangler', 'npx'];
}

function quoteArg(arg) {
  const s = String(arg ?? '');
  if (!/[ \t"]/g.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function runCommand(runner, args) {
  if (runner === 'npx') {
    return spawnSync('C:\\Program Files\\nodejs\\npx.cmd', ['wrangler', ...args], { stdio: 'pipe', encoding: 'utf8', shell: true });
  }
  if (process.platform === 'win32' && /\.cmd$/i.test(runner)) {
    return spawnSync(runner, args, { stdio: 'pipe', encoding: 'utf8', shell: true });
  }
  return spawnSync(runner, args, { stdio: 'pipe', encoding: 'utf8' });
}

function wrangler(args) {
  let last = null;
  for (const runner of getRunners()) {
    const res = runCommand(runner, args);
    last = res;
    if (res.status === 0) {
      return { ok: true, stdout: res.stdout || '', stderr: res.stderr || '' };
    }
  }
  return {
    ok: false,
    stdout: last?.stdout || '',
    stderr: (last?.stderr || '') + (last?.error ? `\n${String(last.error.message || last.error)}` : '')
  };
}

function putObject(bucket, key, filePath, cacheControl) {
  return wrangler([
    'r2', 'object', 'put', `${bucket}/${key}`,
    '--file', filePath,
    '--remote',
    '--content-type', 'application/json',
    '--cache-control', cacheControl
  ]);
}

function collectFiles(root) {
  if (!fs.existsSync(root)) throw new Error(`Input dir not found: ${root}`);
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const subshards = entries
    .filter((e) => e.isFile() && /^[0-9a-f]{3}\.json$/i.test(e.name))
    .map((e) => path.join(root, e.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  const indexPath = path.join(root, 'index.json');
  const metaPath = path.join(root, 'meta.json');
  if (!fs.existsSync(indexPath)) throw new Error(`Missing ${indexPath}`);
  if (!fs.existsSync(metaPath)) throw new Error(`Missing ${metaPath}`);

  return {
    subshards,
    indexPath,
    metaPath
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
  const startedAt = Date.now();
  const { subshards, indexPath, metaPath } = collectFiles(args.dir);

  console.log(`[openingdb-subshards-upload] bucket=${args.bucket} version=${args.version} dir=${args.dir}`);
  console.log(`[openingdb-subshards-upload] files=${subshards.length} + index.json + meta.json`);

  let uploaded = 0;
  let failed = 0;
  let bytesUploaded = 0;
  const failures = [];

  const uploadTargets = [
    ...subshards.map((filePath) => ({
      filePath,
      key: `openingdb/subshards/${args.version}/${path.basename(filePath)}`,
      cacheControl: 'public, max-age=31536000, immutable'
    })),
    {
      filePath: indexPath,
      key: `openingdb/subshards/${args.version}/index.json`,
      cacheControl: 'public, max-age=300'
    },
    {
      filePath: metaPath,
      key: `openingdb/subshards/${args.version}/meta.json`,
      cacheControl: 'public, max-age=300'
    }
  ];

  for (let i = 0; i < uploadTargets.length; i += 1) {
    const item = uploadTargets[i];
    const size = fs.statSync(item.filePath).size;
    let ok = false;
    let errText = '';

    for (let attempt = 0; attempt <= args.retries; attempt += 1) {
      const res = putObject(args.bucket, item.key, item.filePath, item.cacheControl);
      if (res.ok) {
        ok = true;
        break;
      }
      errText = (res.stderr || res.stdout || '').trim();
    }

    if (!ok) {
      failed += 1;
      failures.push({ key: item.key, filePath: item.filePath, size, error: errText.slice(0, 500) });
      console.error(`[openingdb-subshards-upload] FAILED ${item.key} (${formatBytes(size)})`);
      continue;
    }

    uploaded += 1;
    bytesUploaded += size;
    if ((i + 1) % 128 === 0 || i + 1 === uploadTargets.length) {
      console.log(`[openingdb-subshards-upload] progress ${i + 1}/${uploadTargets.length}`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const report = {
    ok: failed === 0,
    bucket: args.bucket,
    version: args.version,
    localDir: args.dir,
    expectedObjects: uploadTargets.length,
    uploaded,
    failed,
    bytesUploaded,
    elapsedMs,
    avgPerObjectMs: uploadTargets.length ? Number((elapsedMs / uploadTargets.length).toFixed(2)) : 0,
    failures
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error('[openingdb-subshards-upload] failed:', err.message);
  process.exit(1);
}
