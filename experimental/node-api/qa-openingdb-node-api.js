#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Chess } from 'chess.js';
import workerModule from '../../downloads-worker/worker.js';

const DEFAULT_SUBSHARDS_DIR = path.resolve('data/openingdb/subshards_build/v4_sub');
const DEFAULT_VERSION = 'v4_sub';

const TEST_LINES = [
  { name: 'Ruy Lopez', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3' },
  { name: 'QGD', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6' },
  { name: 'Najdorf', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O' },
  { name: 'Deep QGD > ply20', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4' }
];

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_SUBSHARDS_DIR,
    version: DEFAULT_VERSION,
    debug: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--dir') {
      args.dir = path.resolve(argv[i + 1] || args.dir);
      i += 1;
    } else if (t === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || args.version;
      i += 1;
    } else if (t === '--debug') {
      args.debug = true;
    }
  }
  return args;
}

function createCache() {
  const map = new Map();
  return {
    async match(request) {
      const key = request.url;
      const value = map.get(key);
      return value ? value.clone() : undefined;
    },
    async put(request, response) {
      map.set(request.url, response.clone());
    },
    size() {
      return map.size;
    }
  };
}

class LocalR2Object {
  constructor(absPath) {
    this.absPath = absPath;
    this.size = fs.statSync(absPath).size;
    this.etag = `local-${path.basename(absPath)}-${this.size}`;
  }

  async json() {
    return JSON.parse(fs.readFileSync(this.absPath, 'utf8'));
  }
}

class LocalR2Bucket {
  constructor(subshardDir, version) {
    this.subshardDir = subshardDir;
    this.version = version;
  }

  async get(key) {
    const prefix = `openingdb/subshards/${this.version}/`;
    if (!String(key).startsWith(prefix)) return null;
    const file = String(key).slice(prefix.length);
    const absPath = path.join(this.subshardDir, file);
    if (!fs.existsSync(absPath)) return null;
    return new LocalR2Object(absPath);
  }
}

function positionsFromLine(line) {
  const c = new Chess();
  const sans = String(line || '').trim().split(/\s+/).filter(Boolean);
  const out = [{ ply: 0, fen: c.fen() }];
  for (const san of sans) {
    const mv = c.move(san, { sloppy: true });
    if (!mv) break;
    out.push({ ply: c.history().length, fen: c.fen() });
  }
  return out;
}

function fenWithForcedEp(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return fen;
  parts[3] = 'a3';
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}${parts.length > 4 ? ` ${parts.slice(4).join(' ')}` : ''}`;
}

async function callNodeApi(workerFetch, env, fen, version, debug = false) {
  const url = new URL('https://downloads.caissa-chess.org/openingdb/node');
  url.searchParams.set('fen', fen);
  url.searchParams.set('version', version);
  if (debug) url.searchParams.set('debug', '1');

  const req = new Request(url.toString(), { method: 'GET' });
  const t0 = Date.now();
  const res = await workerFetch(req, env, {});
  const elapsedMs = Date.now() - t0;
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  const bytes = Buffer.byteLength(text, 'utf8');

  return {
    status: res.status,
    elapsedMs,
    bytes,
    body
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.dir)) {
    throw new Error(`Missing v4_sub dir: ${args.dir}`);
  }

  const cache = createCache();
  globalThis.caches = { default: cache };

  const env = {
    OPENINGDB_BUCKET: new LocalR2Bucket(args.dir, args.version),
    WORKER_VERSION: 'local-node-api-qa'
  };

  const workerFetch = workerModule.fetch.bind(workerModule);
  const probes = [];

  for (const tc of TEST_LINES) {
    const fens = positionsFromLine(tc.line);
    const sample = fens.filter((p) => p.ply >= 8 && p.ply % 4 === 0).slice(-3);
    for (const p of sample) {
      probes.push({
        test: tc.name,
        mode: 'exact',
        ply: p.ply,
        fen: p.fen
      });
    }
  }

  const fallbackBase = positionsFromLine(TEST_LINES[2].line).slice(-1)[0];
  probes.push({
    test: 'Fallback probe (forced ep)',
    mode: 'fallback',
    ply: fallbackBase.ply,
    fen: fenWithForcedEp(fallbackBase.fen)
  });

  const results = [];
  for (const probe of probes) {
    const r = await callNodeApi(workerFetch, env, probe.fen, args.version, args.debug);
    results.push({
      test: probe.test,
      mode: probe.mode,
      ply: probe.ply,
      status: r.status,
      elapsedMs: r.elapsedMs,
      bytes: r.bytes,
      matchLevel: r.body?.matchLevel || null,
      moveCount: Array.isArray(r.body?.moves) ? r.body.moves.length : 0,
      error: r.body?.error || null
    });
  }

  const okStatuses = results.filter((r) => r.status === 200);
  const exactHits = okStatuses.filter((r) => r.matchLevel === 'exact').length;
  const fallbackHits = okStatuses.filter((r) => r.matchLevel && r.matchLevel !== 'exact').length;

  const report = {
    ok: results.every((r) => r.status === 200 || r.status === 404),
    version: args.version,
    subshardDir: args.dir,
    probes: results.length,
    cacheEntries: cache.size(),
    latencyMs: {
      avg: Number(average(results.map((r) => r.elapsedMs)).toFixed(2)),
      avg200: Number(average(okStatuses.map((r) => r.elapsedMs)).toFixed(2)),
      max: Math.max(...results.map((r) => r.elapsedMs), 0)
    },
    responseBytes: {
      avg: Number(average(results.map((r) => r.bytes)).toFixed(2)),
      avg200: Number(average(okStatuses.map((r) => r.bytes)).toFixed(2)),
      max: Math.max(...results.map((r) => r.bytes), 0)
    },
    statusCounts: results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {}),
    matchLevelCounts: okStatuses.reduce((acc, r) => {
      const key = r.matchLevel || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    validations: {
      exactHits,
      fallbackHits,
      hasAnyFallback: fallbackHits > 0,
      all200HaveMoves: okStatuses.every((r) => r.moveCount > 0)
    },
    samples: results
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok || report.validations.exactHits === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[qa-openingdb-node-api] failed:', err.message);
  process.exit(1);
});
