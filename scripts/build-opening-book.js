#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Chess } from 'chess.js';

const DEFAULT_MAX_PLIES = 16;
const DEFAULT_TOP_MOVES = 10;
const DEFAULT_OUT_DIR = path.resolve('public/data/book_chunks');
const DEFAULT_PGN_DIR = path.resolve('data/pgn');

function parseArgs(argv) {
  const args = {
    pgnDir: DEFAULT_PGN_DIR,
    outDir: DEFAULT_OUT_DIR,
    maxPlies: DEFAULT_MAX_PLIES,
    topMoves: DEFAULT_TOP_MOVES,
    inputs: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--pgnDir') {
      args.pgnDir = path.resolve(argv[i + 1] || args.pgnDir);
      i += 1;
    } else if (token === '--outDir') {
      args.outDir = path.resolve(argv[i + 1] || args.outDir);
      i += 1;
    } else if (token === '--maxPlies') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_PLIES}`, 10);
      args.maxPlies = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PLIES;
      i += 1;
    } else if (token === '--topMoves') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_TOP_MOVES}`, 10);
      args.topMoves = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOP_MOVES;
      i += 1;
    } else if (token === '--input') {
      args.inputs.push(path.resolve(argv[i + 1] || ''));
      i += 1;
    }
  }

  if (args.inputs.length === 0) {
    args.inputs = collectPgnFiles(args.pgnDir);
  }

  if (args.inputs.length === 0) {
    throw new Error(`No PGN files found. Use --input <file> or provide --pgnDir (current: ${args.pgnDir}).`);
  }

  return args;
}

function collectPgnFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
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

  walk(rootDir);
  return out;
}

function parseHeaderLine(line) {
  const match = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function parseYear(rawDate) {
  const value = String(rawDate || '').trim();
  if (!value || value.includes('?')) return null;
  const match = value.match(/^(\d{4})\./);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1000 || year > 3000) return null;
  return year;
}

function normalizeFenForHash(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return String(fen || '').trim();
  const placement = parts[0];
  const turn = parts[1] || 'w';
  const castling = parts[2] || '-';
  const ep = parts[3] || '-';
  return `${placement} ${turn} ${castling} ${ep}`;
}

function fnv1a64(input) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const data = Buffer.from(String(input || ''), 'utf8');

  for (let i = 0; i < data.length; i += 1) {
    hash ^= BigInt(data[i]);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }

  return hash.toString(16).padStart(16, '0');
}

function hashFen(fen) {
  return fnv1a64(normalizeFenForHash(fen));
}

function parseResult(resultTag) {
  const value = String(resultTag || '').trim();
  if (value === '1-0') return { w: 1, d: 0, l: 0 };
  if (value === '0-1') return { w: 0, d: 0, l: 1 };
  if (value === '1/2-1/2') return { w: 0, d: 1, l: 0 };
  return null;
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function ensurePosition(positionMap, key) {
  let row = positionMap.get(key);
  if (!row) {
    row = {
      eco: '',
      name: '',
      games: 0,
      w: 0,
      d: 0,
      l: 0,
      lastYearSeen: null,
      moves: new Map()
    };
    positionMap.set(key, row);
  }
  return row;
}

function ensureMove(row, uci, san) {
  let m = row.moves.get(uci);
  if (!m) {
    m = { uci, san: san || uci, n: 0, w: 0, d: 0, l: 0 };
    row.moves.set(uci, m);
  }
  return m;
}

function mergeEco(row, eco, name) {
  if (!row.eco && eco) row.eco = eco;
  if (!row.name && name) row.name = name;
}

function processGame(gamePgn, positionMap, maxPlies, counters) {
  const lines = String(gamePgn || '').split(/\r?\n/);
  const headers = {};
  for (const line of lines) {
    const h = parseHeaderLine(line);
    if (!h) continue;
    headers[h.key] = h.value;
  }

  const result = parseResult(headers.Result || '');
  if (!result) {
    counters.skippedNoResult += 1;
    return;
  }

  const eco = /^[A-E]\d{2}$/.test(String(headers.ECO || '').trim())
    ? String(headers.ECO || '').trim().toUpperCase()
    : '';
  const openingName = String(headers.Opening || headers.Event || '').trim();
  const year = parseYear(headers.Date || '');

  const parser = new Chess();
  try {
    parser.loadPgn(gamePgn, { strict: false });
  } catch {
    counters.failedGames += 1;
    return;
  }

  const moves = parser.history({ verbose: true });
  if (!Array.isArray(moves) || moves.length === 0) {
    counters.failedGames += 1;
    return;
  }

  const replay = new Chess();
  const plyCap = Math.min(maxPlies, moves.length);

  for (let ply = 0; ply < plyCap; ply += 1) {
    const fen = replay.fen();
    const key = hashFen(fen);
    const row = ensurePosition(positionMap, key);

    row.games += 1;
    row.w += result.w;
    row.d += result.d;
    row.l += result.l;
    if (Number.isFinite(year) && (!row.lastYearSeen || year > row.lastYearSeen)) {
      row.lastYearSeen = year;
    }
    mergeEco(row, eco, openingName);

    const mv = moves[ply];
    const uci = moveToUci(mv);
    const m = ensureMove(row, uci, mv.san || uci);
    m.n += 1;
    m.w += result.w;
    m.d += result.d;
    m.l += result.l;

    replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
  }

  counters.parsedGames += 1;
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

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeShards(positionMap, outDir, topMoves, meta) {
  const buckets = new Map();

  for (const [hash, row] of positionMap.entries()) {
    const shard = hash.slice(0, 2).toLowerCase();
    if (!buckets.has(shard)) buckets.set(shard, {});

    const moves = Array.from(row.moves.values())
      .sort((a, b) => b.n - a.n)
      .slice(0, topMoves)
      .map((m) => ({
        uci: m.uci,
        san: m.san,
        n: m.n,
        w: m.w,
        d: m.d,
        l: m.l
      }));

    buckets.get(shard)[hash] = {
      eco: row.eco || '',
      name: row.name || '',
      games: row.games,
      w: row.w,
      d: row.d,
      l: row.l,
      lastYearSeen: row.lastYearSeen || null,
      moves
    };
  }

  for (let i = 0; i < 256; i += 1) {
    const shard = i.toString(16).padStart(2, '0');
    const filePath = path.join(outDir, `book_chunk_${shard}.json`);
    writeJsonAtomic(filePath, {
      meta,
      shard,
      perspective: 'white',
      entries: buckets.get(shard) || {}
    });
  }

  writeJsonAtomic(path.join(outDir, 'index.json'), {
    generatedAt: meta.generatedAt,
    perspective: 'white',
    hashing: 'fnv1a64(normalized-fen[placement turn castling ep])',
    maxPlies: meta.maxPlies,
    topMovesPerPosition: meta.topMovesPerPosition,
    shards: 256,
    inputs: meta.inputs,
    gamesParsed: meta.gamesParsed,
    gamesFailed: meta.gamesFailed,
    gamesSkippedNoResult: meta.gamesSkippedNoResult,
    positions: meta.positions
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const counters = {
    parsedGames: 0,
    failedGames: 0,
    skippedNoResult: 0
  };
  const positionMap = new Map();

  for (const inputFile of args.inputs) {
    if (!fs.existsSync(inputFile)) {
      console.warn(`[build-opening-book] missing input, skipped: ${inputFile}`);
      continue;
    }

    await streamGamesFromFile(inputFile, (gamePgn) => {
      processGame(gamePgn, positionMap, args.maxPlies, counters);
    });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    inputs: args.inputs.map((f) => path.relative(process.cwd(), f)),
    maxPlies: args.maxPlies,
    topMovesPerPosition: args.topMoves,
    gamesParsed: counters.parsedGames,
    gamesFailed: counters.failedGames,
    gamesSkippedNoResult: counters.skippedNoResult,
    positions: positionMap.size
  };

  writeShards(positionMap, args.outDir, args.topMoves, meta);

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({ ok: true, outDir: args.outDir, elapsedMs, ...meta }, null, 2));
}

main().catch((err) => {
  console.error('[build-opening-book] failed:', err.message);
  process.exit(1);
});
