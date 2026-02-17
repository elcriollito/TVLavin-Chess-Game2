#!/usr/bin/env node
/**
 * Build OpeningDB position index shards (365/Shredder-style continuations):
 *   fenHash(normalized FEN) -> { moves: [{ uci, san, games, w, d, l, lastYear, avgElo }] }
 *
 * Usage:
 *   node scripts/build-openingdb-index.js --in data/pgn_samples --out data/openingdb/shards --version v1
 *   node scripts/build-openingdb-index.js --in pgn --out data/openingdb/shards --version v1 --maxPlies 20 --topN 60
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { Chess } from 'chess.js';

const DEFAULT_IN = path.resolve('data/pgn_samples');
const DEFAULT_OUT = path.resolve('data/openingdb/shards');
const DEFAULT_VERSION = 'v1';
const DEFAULT_HASH_LEN = 16;
const DEFAULT_FLUSH_EVERY = 100000;
const DEFAULT_MAX_PLIES = 20;
const DEFAULT_TOP_N = 60;

function parseArgs(argv) {
  const args = {
    inPaths: [],
    outRoot: DEFAULT_OUT,
    version: DEFAULT_VERSION,
    hashLen: DEFAULT_HASH_LEN,
    flushEvery: DEFAULT_FLUSH_EVERY,
    maxPlies: DEFAULT_MAX_PLIES,
    topN: DEFAULT_TOP_N
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--in') {
      args.inPaths.push(path.resolve(argv[i + 1] || ''));
      i += 1;
    } else if (token === '--out') {
      args.outRoot = path.resolve(argv[i + 1] || args.outRoot);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || DEFAULT_VERSION;
      i += 1;
    } else if (token === '--hashLen') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_HASH_LEN}`, 10);
      args.hashLen = Number.isFinite(parsed) && parsed >= 8 && parsed <= 40 ? parsed : DEFAULT_HASH_LEN;
      i += 1;
    } else if (token === '--flushEvery') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_FLUSH_EVERY}`, 10);
      args.flushEvery = Number.isFinite(parsed) && parsed > 5000 ? parsed : DEFAULT_FLUSH_EVERY;
      i += 1;
    } else if (token === '--maxPlies') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_PLIES}`, 10);
      args.maxPlies = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PLIES;
      i += 1;
    } else if (token === '--topN') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_TOP_N}`, 10);
      args.topN = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOP_N;
      i += 1;
    }
  }

  if (args.inPaths.length === 0) args.inPaths = [DEFAULT_IN, path.resolve('pgn')];
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectPgnFiles(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const stat = fs.statSync(inputPath);
  if (stat.isFile() && inputPath.toLowerCase().endsWith('.pgn')) return [inputPath];
  if (!stat.isDirectory()) return [];

  const out = [];
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pgn')) out.push(fullPath);
    }
  }
  walk(inputPath);
  return out;
}

function normalizeFEN(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return String(fen || '').trim();
  return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
}

function hashFenSha1(normalizedFen, hashLen) {
  return crypto.createHash('sha1').update(String(normalizedFen || ''), 'utf8').digest('hex').slice(0, hashLen).toLowerCase();
}

function parseHeaderLine(line) {
  const match = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function parseResultFlag(resultTag) {
  const value = String(resultTag || '').trim();
  if (value === '1-0') return 'w';
  if (value === '0-1') return 'l';
  if (value === '1/2-1/2') return 'd';
  return null;
}

function parseYear(headers) {
  const raw = String(headers.Date || headers.UTCDate || '').trim();
  if (!raw || raw.includes('?')) return null;
  const match = raw.match(/^(\d{4})[.\-]/) || raw.match(/^(\d{4})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1000 || year > 3000) return null;
  return year;
}

function parseAvgElo(headers) {
  const wElo = Number.parseInt(String(headers.WhiteElo || '').replace(/[^\d]/g, ''), 10);
  const bElo = Number.parseInt(String(headers.BlackElo || '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(wElo) || !Number.isFinite(bElo) || wElo <= 0 || bElo <= 0) return null;
  return Math.round((wElo + bElo) / 2);
}

function moveToUci(move) {
  return `${move.from || ''}${move.to || ''}${move.promotion || ''}`.toLowerCase();
}

function extractSanTokensFallback(gamePgn) {
  let text = String(gamePgn || '').replace(/\r/g, '\n');
  text = text.replace(/^\[[^\]]*\]\s*$/gm, ' ');
  text = text.replace(/\{[^}]*\}/g, ' ');
  text = text.replace(/;[^\n]*/g, ' ');
  text = text.replace(/\$\d+/g, ' ');
  for (let i = 0; i < 8; i += 1) {
    const next = text.replace(/\([^()]*\)/g, ' ');
    if (next === text) break;
    text = next;
  }
  const rawTokens = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let token of rawTokens) {
    if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') break;
    token = token.replace(/^\d+\.(\.\.)?/, '').replace(/^\.{3}/, '').trim();
    if (!token) continue;
    token = token.replace(/[!?]+/g, '').replace(/^\.+/, '').trim();
    if (!token) continue;
    out.push(token);
  }
  return out;
}

function extractGameMoves(gamePgn) {
  const parser = new Chess();
  try {
    parser.loadPgn(gamePgn, { strict: false });
    const verbose = parser.history({ verbose: true });
    if (Array.isArray(verbose) && verbose.length > 0) {
      return verbose.map((m) => String(m.san || '').trim()).filter(Boolean);
    }
  } catch {
    // Fallback handles imperfect PGNs.
  }
  return extractSanTokensFallback(gamePgn);
}

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const temp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(payload), 'utf8');
  fs.renameSync(temp, filePath);
}

function updatePending(pendingShards, fenHash, payload) {
  const shard = fenHash.slice(0, 2);
  let shardMap = pendingShards.get(shard);
  if (!shardMap) {
    shardMap = new Map();
    pendingShards.set(shard, shardMap);
  }

  let fenEntry = shardMap.get(fenHash);
  if (!fenEntry) {
    fenEntry = { moves: new Map() };
    shardMap.set(fenHash, fenEntry);
  }

  let moveEntry = fenEntry.moves.get(payload.uci);
  if (!moveEntry) {
    moveEntry = {
      uci: payload.uci,
      san: payload.san || payload.uci,
      games: 0,
      w: 0,
      d: 0,
      l: 0,
      lastYear: null,
      eloSum: 0,
      eloCount: 0
    };
    fenEntry.moves.set(payload.uci, moveEntry);
  }

  moveEntry.games += 1;
  if (payload.resultFlag === 'w') moveEntry.w += 1;
  else if (payload.resultFlag === 'd') moveEntry.d += 1;
  else if (payload.resultFlag === 'l') moveEntry.l += 1;

  if (Number.isFinite(payload.year) && (!moveEntry.lastYear || payload.year > moveEntry.lastYear)) {
    moveEntry.lastYear = payload.year;
  }
  if (Number.isFinite(payload.avgElo)) {
    moveEntry.eloSum += payload.avgElo;
    moveEntry.eloCount += 1;
  }
}

function mergePendingIntoRaw(raw, pendingShardMap) {
  for (const [fenHash, pendingFenEntry] of pendingShardMap.entries()) {
    if (!raw[fenHash]) raw[fenHash] = { moves: {} };
    if (!raw[fenHash].moves) raw[fenHash].moves = {};

    for (const [uci, pendingMove] of pendingFenEntry.moves.entries()) {
      if (!raw[fenHash].moves[uci]) {
        raw[fenHash].moves[uci] = {
          uci,
          san: pendingMove.san || uci,
          games: 0,
          w: 0,
          d: 0,
          l: 0,
          lastYear: null,
          eloSum: 0,
          eloCount: 0
        };
      }
      const target = raw[fenHash].moves[uci];
      target.san = target.san || pendingMove.san || uci;
      target.games += pendingMove.games || 0;
      target.w += pendingMove.w || 0;
      target.d += pendingMove.d || 0;
      target.l += pendingMove.l || 0;
      if (Number.isFinite(pendingMove.lastYear) && (!target.lastYear || pendingMove.lastYear > target.lastYear)) {
        target.lastYear = pendingMove.lastYear;
      }
      target.eloSum += pendingMove.eloSum || 0;
      target.eloCount += pendingMove.eloCount || 0;
    }
  }
}

function flushPendingRaw(rawCountsDir, pendingShards) {
  for (const [shard, shardMap] of pendingShards.entries()) {
    const rawPath = path.join(rawCountsDir, `${shard}.json`);
    const raw = readJsonSafe(rawPath, {});
    mergePendingIntoRaw(raw, shardMap);
    writeJsonAtomic(rawPath, raw);
  }
}

function toPct(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function finalizeShards(rawCountsDir, finalShardsDir, topN) {
  ensureDir(finalShardsDir);
  let totalPositions = 0;
  for (let i = 0; i < 256; i += 1) {
    const shard = i.toString(16).padStart(2, '0');
    const raw = readJsonSafe(path.join(rawCountsDir, `${shard}.json`), {});
    const finalRows = {};

    for (const fenHash of Object.keys(raw)) {
      const moveDict = raw[fenHash]?.moves || {};
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

      if (moves.length > 0) finalRows[fenHash] = { moves };
    }

    totalPositions += Object.keys(finalRows).length;
    writeJsonAtomic(path.join(finalShardsDir, `${shard}.json`), finalRows);
  }
  return totalPositions;
}

async function streamGamesFromFile(filePath, onGame) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let current = [];
  let seenTag = false;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[Event ')) {
      if (seenTag && current.length > 0) {
        onGame(current.join('\n'));
        current = [];
      }
      seenTag = true;
    }
    if (seenTag || trimmed.length > 0) current.push(line);
  }
  if (current.length > 0) onGame(current.join('\n'));
}

function processGame(gamePgn, args, pendingShards, counters) {
  counters.gamesProcessed += 1;
  const lines = String(gamePgn || '').split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const h = parseHeaderLine(line);
    if (h) headers[h.key] = h.value;
  }

  const resultFlag = parseResultFlag(headers.Result || '');
  if (!resultFlag) counters.unknownResults += 1;
  const year = parseYear(headers);
  const avgElo = parseAvgElo(headers);

  const moves = extractGameMoves(gamePgn);
  if (!Array.isArray(moves) || moves.length === 0) {
    counters.parseFails += 1;
    counters.skippedGames += 1;
    return;
  }

  const replay = new Chess();
  let appliedMoves = 0;

  for (let ply = 0; ply < moves.length && ply < args.maxPlies; ply += 1) {
    const sanMove = moves[ply];
    const fenBefore = normalizeFEN(replay.fen());
    const fenHash = hashFenSha1(fenBefore, args.hashLen);

    let legal = null;
    try {
      legal = replay.move(sanMove, { sloppy: true });
    } catch {
      legal = null;
    }
    if (!legal) {
      counters.illegalMoves += 1;
      break;
    }

    const uci = moveToUci(legal);
    if (!uci) continue;

    updatePending(pendingShards, fenHash, {
      uci,
      san: legal.san || uci,
      resultFlag,
      year,
      avgElo
    });
    counters.movesParsed += 1;
    counters.pendingUpdates += 1;
    appliedMoves += 1;
  }

  if (appliedMoves === 0) counters.skippedGames += 1;
}

function removeDirSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFiles = Array.from(new Set(args.inPaths.flatMap((p) => collectPgnFiles(p))));
  if (inputFiles.length === 0) {
    throw new Error(`No PGN files found in: ${args.inPaths.join(', ')}`);
  }

  const versionDir = path.join(args.outRoot, args.version);
  const rawCountsDir = path.join(versionDir, '_raw_counts');
  const startedAt = Date.now();
  ensureDir(rawCountsDir);

  const pendingShards = new Map();
  const counters = {
    gamesProcessed: 0,
    movesParsed: 0,
    parseFails: 0,
    illegalMoves: 0,
    skippedGames: 0,
    unknownResults: 0,
    pendingUpdates: 0,
    flushCount: 0
  };

  for (const filePath of inputFiles) {
    await streamGamesFromFile(filePath, (gamePgn) => {
      processGame(gamePgn, args, pendingShards, counters);

      if (counters.pendingUpdates >= args.flushEvery) {
        flushPendingRaw(rawCountsDir, pendingShards);
        pendingShards.clear();
        counters.pendingUpdates = 0;
        counters.flushCount += 1;
      }
    });

    if (pendingShards.size > 0) {
      flushPendingRaw(rawCountsDir, pendingShards);
      pendingShards.clear();
      counters.pendingUpdates = 0;
      counters.flushCount += 1;
    }
  }

  const totalPositions = finalizeShards(rawCountsDir, versionDir, args.topN);
  removeDirSafe(rawCountsDir);

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: args.version,
    hashing: `sha1(normalized-fen[board turn castling ep]).slice(0,${args.hashLen})`,
    shardFiles: 256,
    maxPlies: args.maxPlies,
    topN: args.topN,
    inputRoots: args.inPaths.map((p) => path.relative(process.cwd(), p)),
    inputs: inputFiles.map((f) => path.relative(process.cwd(), f)),
    gamesProcessed: counters.gamesProcessed,
    movesParsed: counters.movesParsed,
    parseFails: counters.parseFails,
    illegalMoves: counters.illegalMoves,
    skippedGames: counters.skippedGames,
    unknownResults: counters.unknownResults,
    flushCount: counters.flushCount,
    positions: totalPositions
  };
  writeJsonAtomic(path.join(versionDir, 'index.json'), manifest);

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({ ok: true, outDir: versionDir, elapsedMs, ...manifest }, null, 2));
}

main().catch((err) => {
  console.error('[build-openingdb-index] failed:', err.message);
  process.exit(1);
});
