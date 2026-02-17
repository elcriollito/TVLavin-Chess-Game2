#!/usr/bin/env node
/**
 * Build OpeningDB position index shards:
 * normalized FEN (first 4 fields) -> next-move continuations with stats.
 *
 * Usage:
 *   node scripts/build-openingdb-index.js --in data/pgn_db --out data/openingdb/shards
 *   node scripts/build-openingdb-index.js --in pgn --out data/openingdb/shards --hashLen 16 --flushEvery 200000
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { Chess } from 'chess.js';

const DEFAULT_IN = path.resolve('data/pgn_db');
const DEFAULT_OUT = path.resolve('data/openingdb/shards');
const DEFAULT_HASH_LEN = 16;
const DEFAULT_FLUSH_EVERY = 200000;

function parseArgs(argv) {
  const args = {
    inPaths: [],
    outDir: DEFAULT_OUT,
    hashLen: DEFAULT_HASH_LEN,
    flushEvery: DEFAULT_FLUSH_EVERY
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--in') {
      args.inPaths.push(path.resolve(argv[i + 1] || ''));
      i += 1;
    } else if (token === '--out') {
      args.outDir = path.resolve(argv[i + 1] || args.outDir);
      i += 1;
    } else if (token === '--hashLen') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_HASH_LEN}`, 10);
      args.hashLen = Number.isFinite(parsed) && parsed >= 8 && parsed <= 40 ? parsed : DEFAULT_HASH_LEN;
      i += 1;
    } else if (token === '--flushEvery') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_FLUSH_EVERY}`, 10);
      args.flushEvery = Number.isFinite(parsed) && parsed > 1000 ? parsed : DEFAULT_FLUSH_EVERY;
      i += 1;
    }
  }

  if (args.inPaths.length === 0) {
    args.inPaths = [DEFAULT_IN];
  }

  return args;
}

function collectPgnFiles(inputPath) {
  if (!inputPath || !fs.existsSync(inputPath)) return [];
  const stat = fs.statSync(inputPath);
  if (stat.isFile() && inputPath.toLowerCase().endsWith('.pgn')) {
    return [inputPath];
  }
  if (!stat.isDirectory()) return [];

  const out = [];
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pgn')) {
        out.push(fullPath);
      }
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
  return crypto
    .createHash('sha1')
    .update(String(normalizedFen || ''), 'utf8')
    .digest('hex')
    .slice(0, hashLen)
    .toLowerCase();
}

function parseHeaderLine(line) {
  const match = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function parseResult(resultTag) {
  const value = String(resultTag || '').trim();
  if (value === '1-0') return 'w';
  if (value === '0-1') return 'l';
  if (value === '1/2-1/2') return 'd';
  return null;
}

function parseYear(headers) {
  const candidate = String(headers.Date || headers.UTCDate || '').trim();
  if (!candidate || candidate.includes('?')) return null;
  const match = candidate.match(/^(\d{4})[.\-]/) || candidate.match(/^(\d{4})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1000 || year > 3000) return null;
  return year;
}

function parseAvgElo(headers) {
  const wElo = Number.parseInt(String(headers.WhiteElo || '').replace(/[^\d]/g, ''), 10);
  const bElo = Number.parseInt(String(headers.BlackElo || '').replace(/[^\d]/g, ''), 10);
  const hasW = Number.isFinite(wElo) && wElo > 0;
  const hasB = Number.isFinite(bElo) && bElo > 0;
  if (!hasW || !hasB) return null;
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

  // Strip nested variations conservatively.
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

    token = token.replace(/[!?]+/g, '');
    token = token.replace(/^\.+/, '');
    token = token.trim();
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
    // Fallback below.
  }
  return extractSanTokensFallback(gamePgn);
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
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
      target.games += pendingMove.games;
      target.w += pendingMove.w;
      target.d += pendingMove.d;
      target.l += pendingMove.l;
      if (Number.isFinite(pendingMove.lastYear) && (!target.lastYear || pendingMove.lastYear > target.lastYear)) {
        target.lastYear = pendingMove.lastYear;
      }
      target.eloSum += pendingMove.eloSum || 0;
      target.eloCount += pendingMove.eloCount || 0;
    }
  }
}

function flushPendingRaw(outRawDir, pendingShards) {
  for (const [shard, shardMap] of pendingShards.entries()) {
    const rawPath = path.join(outRawDir, `${shard}.json`);
    const raw = readJsonSafe(rawPath, {});
    mergePendingIntoRaw(raw, shardMap);
    writeJsonAtomic(rawPath, raw);
  }
}

function toPct(n, d) {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function finalizeShards(outRawDir, outDir, hashLen) {
  ensureDir(outDir);
  let totalPositions = 0;

  for (let i = 0; i < 256; i += 1) {
    const shard = i.toString(16).padStart(2, '0');
    const rawPath = path.join(outRawDir, `${shard}.json`);
    const raw = readJsonSafe(rawPath, {});
    const finalEntries = {};

    for (const fenHash of Object.keys(raw)) {
      const row = raw[fenHash];
      const moveDict = row && row.moves ? row.moves : {};
      const moves = Object.values(moveDict).map((m) => {
        const total = (Number(m.w) || 0) + (Number(m.d) || 0) + (Number(m.l) || 0);
        return {
          uci: m.uci || '',
          san: m.san || m.uci || '',
          games: Number(m.games) || 0,
          w: toPct(Number(m.w) || 0, total),
          d: toPct(Number(m.d) || 0, total),
          l: toPct(Number(m.l) || 0, total),
          lastYear: Number.isFinite(Number(m.lastYear)) ? Number(m.lastYear) : null,
          avgElo: (Number(m.eloCount) || 0) > 0
            ? Math.round((Number(m.eloSum) || 0) / (Number(m.eloCount) || 1))
            : null
        };
      })
        .filter((m) => m.uci && m.games > 0)
        .sort((a, b) => b.games - a.games || b.w - a.w);

      if (moves.length > 0) {
        finalEntries[fenHash] = { moves };
      }
    }

    totalPositions += Object.keys(finalEntries).length;
    writeJsonAtomic(path.join(outDir, `${shard}.json`), finalEntries);
  }

  return { totalPositions, hashLen };
}

async function streamGamesFromFile(filePath, onGame) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let currentLines = [];
  let seenTag = false;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[Event ')) {
      if (seenTag && currentLines.length > 0) {
        onGame(currentLines.join('\n'));
        currentLines = [];
      }
      seenTag = true;
    }
    if (seenTag || trimmed.length > 0) {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    onGame(currentLines.join('\n'));
  }
}

function processGame(gamePgn, config, pendingShards, counters) {
  const lines = String(gamePgn || '').split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const h = parseHeaderLine(line);
    if (!h) continue;
    headers[h.key] = h.value;
  }

  const resultFlag = parseResult(headers.Result || '');
  if (!resultFlag) {
    counters.gamesSkippedNoResult += 1;
    return;
  }

  const year = parseYear(headers);
  const avgElo = parseAvgElo(headers);

  const moves = extractGameMoves(gamePgn);
  if (!Array.isArray(moves) || moves.length === 0) {
    counters.gamesFailed += 1;
    return;
  }

  const replay = new Chess();
  let applied = 0;
  for (const sanMove of moves) {
    const fenBefore = normalizeFEN(replay.fen());
    const fenHash = hashFenSha1(fenBefore, config.hashLen);

    let legal = null;
    try {
      legal = replay.move(sanMove, { sloppy: true });
    } catch {
      legal = null;
    }
    if (!legal) {
      counters.movesFailed += 1;
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
    applied += 1;
  }

  if (applied > 0) counters.gamesParsed += 1;
  else counters.gamesFailed += 1;
}

function removeDirSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.rmSync(dirPath, { recursive: true, force: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allInputFiles = [];
  for (const p of args.inPaths) {
    allInputFiles.push(...collectPgnFiles(p));
  }
  const uniqueInputs = Array.from(new Set(allInputFiles));

  if (uniqueInputs.length === 0) {
    throw new Error(`No PGN files found in inputs: ${args.inPaths.join(', ')}`);
  }

  const startedAt = Date.now();
  const outRawDir = path.join(args.outDir, '_raw_counts');
  ensureDir(outRawDir);

  const pendingShards = new Map();
  const counters = {
    gamesParsed: 0,
    gamesFailed: 0,
    gamesSkippedNoResult: 0,
    movesParsed: 0,
    movesFailed: 0,
    pendingUpdates: 0,
    flushCount: 0
  };

  for (const filePath of uniqueInputs) {
    await streamGamesFromFile(filePath, (gamePgn) => {
      processGame(gamePgn, args, pendingShards, counters);

      if (counters.pendingUpdates >= args.flushEvery) {
        flushPendingRaw(outRawDir, pendingShards);
        pendingShards.clear();
        counters.pendingUpdates = 0;
        counters.flushCount += 1;
      }
    });

    if (pendingShards.size > 0) {
      flushPendingRaw(outRawDir, pendingShards);
      pendingShards.clear();
      counters.pendingUpdates = 0;
      counters.flushCount += 1;
    }
  }

  const finalizeInfo = finalizeShards(outRawDir, args.outDir, args.hashLen);
  removeDirSafe(outRawDir);

  const manifest = {
    generatedAt: new Date().toISOString(),
    hashing: `sha1(normalized-fen[placement turn castling ep]).slice(0,${args.hashLen})`,
    shardFiles: 256,
    inputRoots: args.inPaths.map((p) => path.relative(process.cwd(), p)),
    inputs: uniqueInputs.map((f) => path.relative(process.cwd(), f)),
    gamesParsed: counters.gamesParsed,
    gamesFailed: counters.gamesFailed,
    gamesSkippedNoResult: counters.gamesSkippedNoResult,
    movesParsed: counters.movesParsed,
    movesFailed: counters.movesFailed,
    flushCount: counters.flushCount,
    positions: finalizeInfo.totalPositions
  };
  writeJsonAtomic(path.join(args.outDir, 'index.json'), manifest);

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({ ok: true, outDir: args.outDir, elapsedMs, ...manifest }, null, 2));
}

main().catch((err) => {
  console.error('[build-openingdb-index] failed:', err.message);
  process.exit(1);
});
