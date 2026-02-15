#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Chess } from 'chess.js';
import { Polyglot } from 'chess-openings';

const DEFAULT_MAX_PLY = 30;
const DEFAULT_TOP_MOVES = 24;

const polyglotHasher = new Polyglot('[caissa-pos-stats-hasher]');

function parseArgs(argv) {
  const args = {
    input: [],
    outDir: path.resolve('data/pos-stats/shards'),
    maxPly: DEFAULT_MAX_PLY,
    topMoves: DEFAULT_TOP_MOVES
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input' || token === '-i') {
      args.input.push(path.resolve(argv[i + 1] || ''));
      i += 1;
    } else if (token === '--out-dir' || token === '-o') {
      args.outDir = path.resolve(argv[i + 1] || args.outDir);
      i += 1;
    } else if (token === '--max-ply') {
      args.maxPly = Math.max(1, Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_PLY}`, 10) || DEFAULT_MAX_PLY);
      i += 1;
    } else if (token === '--top-moves') {
      args.topMoves = Math.max(1, Number.parseInt(argv[i + 1] || `${DEFAULT_TOP_MOVES}`, 10) || DEFAULT_TOP_MOVES);
      i += 1;
    }
  }

  if (args.input.length === 0) {
    throw new Error('Usage: node scripts/build-pos-stats.js --input <file.pgn> [--input <file2.pgn>] [--out-dir data/pos-stats/shards] [--max-ply 30] [--top-moves 24]');
  }

  return args;
}

function keyFromFen(fen) {
  const key = polyglotHasher.getKey(fen);
  if (!key) {
    throw new Error(`Failed to hash FEN: ${fen}`);
  }
  const buffer = key.toBuffer();
  return buffer.toString('hex');
}

function parseResult(gamePgn) {
  const match = gamePgn.match(/\[Result\s+"([^"]+)"\]/i);
  const value = match ? match[1] : '*';
  if (value === '1-0') return { w: 1, d: 0, l: 0 };
  if (value === '0-1') return { w: 0, d: 0, l: 1 };
  if (value === '1/2-1/2') return { w: 0, d: 1, l: 0 };
  return { w: 0, d: 0, l: 0 };
}

function parseDate(gamePgn) {
  const match = gamePgn.match(/\[Date\s+"([^"]+)"\]/i);
  if (!match) return '';
  const raw = String(match[1]).replace(/\?/g, '0');
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : '';
}

function outcomeForTurn(turn, resultCounts) {
  if (resultCounts.d) return { w: 0, d: 1, l: 0 };
  if (turn === 'w') return { w: resultCounts.w, d: 0, l: resultCounts.l };
  return { w: resultCounts.l, d: 0, l: resultCounts.w };
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function ensurePosition(positionMap, keyHex) {
  let record = positionMap.get(keyHex);
  if (!record) {
    record = {
      games: 0,
      w: 0,
      d: 0,
      l: 0,
      lastPlayed: '',
      moves: new Map()
    };
    positionMap.set(keyHex, record);
  }
  return record;
}

function updateLastPlayed(record, dateValue) {
  if (!dateValue) return;
  if (!record.lastPlayed || dateValue > record.lastPlayed) {
    record.lastPlayed = dateValue;
  }
}

function updateMoveRecord(record, uci, sideOutcome) {
  let move = record.moves.get(uci);
  if (!move) {
    move = { count: 0, w: 0, d: 0, l: 0 };
    record.moves.set(uci, move);
  }
  move.count += 1;
  move.w += sideOutcome.w;
  move.d += sideOutcome.d;
  move.l += sideOutcome.l;
}

function processGame(gamePgn, positionMap, maxPly, counters) {
  const resultCounts = parseResult(gamePgn);
  const gameDate = parseDate(gamePgn);

  const chess = new Chess();
  try {
    chess.loadPgn(gamePgn, { strict: false });
  } catch {
    counters.failedGames += 1;
    return;
  }

  const moves = chess.history({ verbose: true });
  if (!moves || moves.length === 0) {
    counters.failedGames += 1;
    return;
  }

  counters.parsedGames += 1;
  counters.totalPly += moves.length;

  const replay = new Chess();
  const plyLimit = Math.min(maxPly, moves.length);

  for (let ply = 0; ply < plyLimit; ply += 1) {
    const move = moves[ply];
    const fenBefore = replay.fen();
    const side = replay.turn();
    const sideOutcome = outcomeForTurn(side, resultCounts);
    const keyHex = keyFromFen(fenBefore);

    const record = ensurePosition(positionMap, keyHex);
    record.games += 1;
    record.w += sideOutcome.w;
    record.d += sideOutcome.d;
    record.l += sideOutcome.l;
    updateLastPlayed(record, gameDate);
    updateMoveRecord(record, moveToUci(move), sideOutcome);

    replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion
    });
  }
}

async function streamGamesFromFile(filePath, onGame) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

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

function writeShards(positionMap, outDir, topMoves, meta) {
  fs.mkdirSync(outDir, { recursive: true });

  const shardBuckets = new Map();
  for (const [keyHex, record] of positionMap.entries()) {
    const shardId = keyHex.slice(0, 2).toLowerCase();
    let bucket = shardBuckets.get(shardId);
    if (!bucket) {
      bucket = {};
      shardBuckets.set(shardId, bucket);
    }

    const top = Array.from(record.moves.entries())
      .map(([uci, m]) => ({ uci, count: m.count, w: m.w, d: m.d, l: m.l }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topMoves);

    bucket[keyHex] = {
      games: record.games,
      w: record.w,
      d: record.d,
      l: record.l,
      lastPlayed: record.lastPlayed || '',
      topMoves: top
    };
  }

  for (let i = 0; i < 256; i += 1) {
    const shardId = i.toString(16).padStart(2, '0');
    const filePath = path.join(outDir, `pos_stats_${shardId}.json`);
    const payload = {
      meta,
      shard: shardId,
      entries: shardBuckets.get(shardId) || {}
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const positionMap = new Map();
  const counters = {
    parsedGames: 0,
    failedGames: 0,
    totalPly: 0
  };

  for (const inputFile of args.input) {
    if (!fs.existsSync(inputFile)) {
      throw new Error(`Input file not found: ${inputFile}`);
    }
    await streamGamesFromFile(inputFile, (gamePgn) => {
      processGame(gamePgn, positionMap, args.maxPly, counters);
    });
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    inputs: args.input.map((p) => path.basename(p)),
    maxPly: args.maxPly,
    topMovesPerPosition: args.topMoves,
    positions: positionMap.size,
    parsedGames: counters.parsedGames,
    failedGames: counters.failedGames,
    totalPly: counters.totalPly
  };

  writeShards(positionMap, args.outDir, args.topMoves, meta);

  const elapsedMs = Date.now() - startedAt;
  console.log(JSON.stringify({ ok: true, outDir: args.outDir, elapsedMs, ...meta }, null, 2));
}

main().catch((err) => {
  console.error('[build-pos-stats] failed:', err.message);
  process.exit(1);
});

