#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DEFAULT_OUT = path.resolve('data/openingdb/manifest.json');

function parseArgs(argv) {
  const args = {
    version: 'v1',
    out: DEFAULT_OUT,
    baseUrl: 'https://downloads.caissa-chess.org/openingdb/shards',
    topN: 60,
    maxPlies: 20,
    shardCount: 256,
    hashAlgo: 'sha1',
    hashLen: 16
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim();
      i += 1;
    } else if (token === '--out') {
      args.out = path.resolve(argv[i + 1] || args.out);
      i += 1;
    } else if (token === '--baseUrl') {
      args.baseUrl = String(argv[i + 1] || args.baseUrl).trim();
      i += 1;
    } else if (token === '--topN') {
      args.topN = Number.parseInt(argv[i + 1] || `${args.topN}`, 10) || args.topN;
      i += 1;
    } else if (token === '--maxPlies') {
      args.maxPlies = Number.parseInt(argv[i + 1] || `${args.maxPlies}`, 10) || args.maxPlies;
      i += 1;
    }
  }

  if (!args.version || !/^[a-zA-Z0-9._-]+$/.test(args.version)) {
    throw new Error(`Invalid --version "${args.version}"`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = {
    activeVersion: args.version,
    baseUrl: args.baseUrl,
    generatedAt: new Date().toISOString(),
    shardCount: args.shardCount,
    hash: {
      algo: args.hashAlgo,
      len: args.hashLen
    },
    fenNormalization: 'board turn castling ep (ignore half/fullmove)',
    topN: args.topN,
    maxPlies: args.maxPlies,
    fields: ['uci', 'san', 'games', 'w', 'd', 'l', 'lastYear', 'avgElo'],
    cache: {
      cacheControl: 'public, max-age=300'
    }
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    out: args.out,
    activeVersion: manifest.activeVersion,
    generatedAt: manifest.generatedAt
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[write-openingdb-manifest] failed:', err.message);
  process.exit(1);
}
