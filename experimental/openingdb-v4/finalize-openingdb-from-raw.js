#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DEFAULT_DIR = path.resolve('data/openingdb/shards_build/v3_p60');
const DEFAULT_TOP_N = 60;
const DEFAULT_MAX_PLIES = 60;
const DEFAULT_HASH_LEN = 16;

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_DIR,
    version: '',
    topN: DEFAULT_TOP_N,
    maxPlies: DEFAULT_MAX_PLIES,
    hashLen: DEFAULT_HASH_LEN,
    gamesProcessed: null,
    movesParsed: null,
    flushCount: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      args.dir = path.resolve(argv[i + 1] || args.dir);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || '').trim();
      i += 1;
    } else if (token === '--topN') {
      const n = Number.parseInt(argv[i + 1] || `${args.topN}`, 10);
      if (Number.isFinite(n) && n > 0) args.topN = n;
      i += 1;
    } else if (token === '--maxPlies') {
      const n = Number.parseInt(argv[i + 1] || `${args.maxPlies}`, 10);
      if (Number.isFinite(n) && n > 0) args.maxPlies = n;
      i += 1;
    } else if (token === '--hashLen') {
      const n = Number.parseInt(argv[i + 1] || `${args.hashLen}`, 10);
      if (Number.isFinite(n) && n > 0) args.hashLen = n;
      i += 1;
    } else if (token === '--gamesProcessed') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(n) && n >= 0) args.gamesProcessed = n;
      i += 1;
    } else if (token === '--movesParsed') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(n) && n >= 0) args.movesParsed = n;
      i += 1;
    } else if (token === '--flushCount') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isFinite(n) && n >= 0) args.flushCount = n;
      i += 1;
    }
  }

  if (!args.version) args.version = path.basename(args.dir);
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonStrict(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected top-level object');
    }
    return parsed;
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, filePath);
}

function toPct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function shardIds() {
  const out = [];
  for (let i = 0; i < 256; i += 1) out.push(i.toString(16).padStart(2, '0'));
  return out;
}

function finalizeOneShard(rawShardObj, topN) {
  const finalRows = {};
  let positions = 0;
  let moveRows = 0;

  for (const fenHash of Object.keys(rawShardObj)) {
    const moveDict = rawShardObj[fenHash]?.moves || {};
    const moves = Object.values(moveDict)
      .map((m) => {
        const wCount = Number(m.w) || 0;
        const dCount = Number(m.d) || 0;
        const lCount = Number(m.l) || 0;
        const wdlTotal = wCount + dCount + lCount;
        return {
          uci: m.uci || '',
          san: m.san || m.uci || '',
          games: Number(m.games) || 0,
          w: toPct(wCount, wdlTotal),
          d: toPct(dCount, wdlTotal),
          l: toPct(lCount, wdlTotal),
          lastYear: Number.isFinite(Number(m.lastYear)) ? Number(m.lastYear) : null,
          avgElo: (Number(m.eloCount) || 0) > 0 ? Math.round((Number(m.eloSum) || 0) / Number(m.eloCount)) : null
        };
      })
      .filter((m) => m.uci && m.games > 0)
      .sort((a, b) => (b.games - a.games) || (b.w - a.w))
      .slice(0, topN);

    if (moves.length > 0) {
      finalRows[fenHash] = { moves };
      positions += 1;
      moveRows += moves.length;
    }
  }

  return { finalRows, positions, moveRows };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawCountsDir = path.join(args.dir, '_raw_counts');
  if (!fs.existsSync(rawCountsDir) || !fs.statSync(rawCountsDir).isDirectory()) {
    throw new Error(`Missing raw counts directory: ${rawCountsDir}`);
  }

  const startedAt = Date.now();
  let totalPositions = 0;
  let totalMoveRows = 0;
  let totalRawFiles = 0;

  for (const shard of shardIds()) {
    const rawPath = path.join(rawCountsDir, `${shard}.json`);
    if (!fs.existsSync(rawPath)) {
      throw new Error(`Missing raw shard file: ${rawPath}`);
    }
    const raw = readJsonStrict(rawPath);
    totalRawFiles += 1;
    const shardResult = finalizeOneShard(raw, args.topN);
    totalPositions += shardResult.positions;
    totalMoveRows += shardResult.moveRows;
    writeJsonAtomic(path.join(args.dir, `${shard}.json`), shardResult.finalRows);
  }

  const index = {
    generatedAt: new Date().toISOString(),
    version: args.version,
    hashing: `sha1(normalized-fen[board turn castling ep]).slice(0,${args.hashLen})`,
    shardFiles: 256,
    maxPlies: args.maxPlies,
    topN: args.topN,
    positions: totalPositions,
    moveRows: totalMoveRows,
    recoveredFromRawCounts: true,
    sourceRawCountsDir: path.relative(process.cwd(), rawCountsDir),
    rawShardFiles: totalRawFiles
  };

  if (Number.isFinite(args.gamesProcessed)) index.gamesProcessed = args.gamesProcessed;
  if (Number.isFinite(args.movesParsed)) index.movesParsed = args.movesParsed;
  if (Number.isFinite(args.flushCount)) index.flushCount = args.flushCount;

  writeJsonAtomic(path.join(args.dir, 'index.json'), index);

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({
    ok: true,
    dir: args.dir,
    rawCountsDir,
    elapsedMs,
    shardFilesWritten: 256,
    positions: totalPositions,
    moveRows: totalMoveRows,
    indexPath: path.join(args.dir, 'index.json')
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error('[finalize-openingdb-from-raw] failed:', err.message);
  process.exit(1);
}
