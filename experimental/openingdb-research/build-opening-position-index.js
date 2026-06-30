#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Chess } from 'chess.js';

const DEFAULT_PGN_DIR = path.resolve('data/pgn');
const DEFAULT_OUT_FILE = path.resolve('public/data/opening_position_index.json');
const DEFAULT_MAX_PLIES = 20;
const DEFAULT_TOP_N = 12;

function parseArgs(argv) {
  const args = {
    pgnDir: DEFAULT_PGN_DIR,
    outFile: DEFAULT_OUT_FILE,
    maxPlies: DEFAULT_MAX_PLIES,
    topN: DEFAULT_TOP_N,
    inputs: []
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--pgnDir') {
      args.pgnDir = path.resolve(argv[i + 1] || args.pgnDir);
      i += 1;
    } else if (token === '--out') {
      args.outFile = path.resolve(argv[i + 1] || args.outFile);
      i += 1;
    } else if (token === '--maxPlies') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_PLIES}`, 10);
      args.maxPlies = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PLIES;
      i += 1;
    } else if (token === '--topN') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_TOP_N}`, 10);
      args.topN = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOP_N;
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
    throw new Error('No PGN files found. Usage: node experimental/openingdb-research/build-opening-position-index.js --pgnDir data/pgn --out public/data/opening_position_index.json --maxPlies 20 --topN 12');
  }

  return args;
}

function collectPgnFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
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

function parseResult(raw) {
  const result = String(raw || '').trim();
  if (result === '1-0') return { w: 1, d: 0, l: 0 };
  if (result === '0-1') return { w: 0, d: 0, l: 1 };
  if (result === '1/2-1/2') return { w: 0, d: 1, l: 0 };
  return null;
}

function parseYear(raw) {
  const value = String(raw || '').trim();
  if (!value || value.includes('?')) return null;
  const match = value.match(/^(\d{4})\./);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  if (!Number.isFinite(year) || year < 1000 || year > 3000) return null;
  return year;
}

function normalizeFenKey(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return String(fen || '').trim();
  return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function toPct(numerator, denominator) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  if (d <= 0) return 0;
  return Number(((n / d) * 100).toFixed(1));
}

function ensurePosition(indexMap, fenKey) {
  let row = indexMap.get(fenKey);
  if (!row) {
    row = {
      games: 0,
      w: 0,
      d: 0,
      l: 0,
      year: null,
      eco: '',
      openingVotes: new Map(),
      moves: new Map()
    };
    indexMap.set(fenKey, row);
  }
  return row;
}

function ensureMove(positionRow, uci, san) {
  let row = positionRow.moves.get(uci);
  if (!row) {
    row = { uci, san: san || uci, games: 0, w: 0, d: 0, l: 0 };
    positionRow.moves.set(uci, row);
  }
  return row;
}

function voteOpening(positionRow, opening, eco) {
  const cleanOpening = String(opening || '').trim();
  const cleanEco = /^[A-E]\d{2}$/.test(String(eco || '').trim().toUpperCase())
    ? String(eco || '').trim().toUpperCase()
    : '';
  if (!cleanOpening && !cleanEco) return;
  if (!positionRow.eco && cleanEco) {
    positionRow.eco = cleanEco;
  }

  const label = cleanOpening && cleanEco ? `${cleanOpening} (${cleanEco})`
    : cleanOpening || (cleanEco ? `ECO ${cleanEco}` : '');
  if (!label) return;

  positionRow.openingVotes.set(label, (positionRow.openingVotes.get(label) || 0) + 1);
}

function processGame(gamePgn, indexMap, maxPlies, counters) {
  const headers = {};
  const lines = String(gamePgn || '').split(/\r?\n/);
  for (const line of lines) {
    const header = parseHeaderLine(line);
    if (!header) continue;
    headers[header.key] = header.value;
  }

  const result = parseResult(headers.Result || '');
  if (!result) {
    counters.skippedNoResult += 1;
    return;
  }

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

  const openingName = headers.Opening || headers.Event || '';
  const eco = headers.ECO || '';
  const year = parseYear(headers.Date || '');

  const replay = new Chess();
  const plyCap = Math.min(maxPlies, moves.length);
  for (let ply = 0; ply < plyCap; ply += 1) {
    const fenKey = normalizeFenKey(replay.fen());
    const positionRow = ensurePosition(indexMap, fenKey);
    positionRow.games += 1;
    positionRow.w += result.w;
    positionRow.d += result.d;
    positionRow.l += result.l;
    if (Number.isFinite(year) && (!positionRow.year || year > positionRow.year)) {
      positionRow.year = year;
    }
    voteOpening(positionRow, openingName, eco);

    const move = moves[ply];
    const uci = moveToUci(move);
    const moveRow = ensureMove(positionRow, uci, move.san || uci);
    moveRow.games += 1;
    moveRow.w += result.w;
    moveRow.d += result.d;
    moveRow.l += result.l;

    replay.move({ from: move.from, to: move.to, promotion: move.promotion });
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

function mostVotedOpening(votes) {
  let bestLabel = '';
  let bestCount = 0;
  for (const [label, count] of votes.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestLabel = label;
    }
  }
  return bestLabel;
}

function finalizeIndex(indexMap, topN) {
  const positions = {};

  for (const [fenKey, row] of indexMap.entries()) {
    const total = row.games || 0;
    const moves = Array.from(row.moves.values())
      .sort((a, b) => b.games - a.games)
      .slice(0, topN)
      .map((move) => {
        const sample = move.games || 0;
        const wPct = toPct(move.w, sample);
        const dPct = toPct(move.d, sample);
        const lPct = toPct(move.l, sample);
        const value = sample > 0 ? Number((((move.w + (0.5 * move.d)) / sample) * 100).toFixed(1)) : 0;
        return {
          san: move.san || move.uci,
          uci: move.uci,
          games: sample,
          wins: wPct,
          draws: dPct,
          losses: lPct,
          perc: toPct(sample, total),
          value
        };
      });

    positions[fenKey] = {
      opening: mostVotedOpening(row.openingVotes),
      year: row.year,
      games: total,
      moves
    };
  }

  return positions;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const counters = {
    parsedGames: 0,
    failedGames: 0,
    skippedNoResult: 0
  };
  const startedAt = Date.now();
  const indexMap = new Map();

  for (const inputFile of args.inputs) {
    if (!fs.existsSync(inputFile)) {
      console.warn(`[build-opening-position-index] missing input, skipped: ${inputFile}`);
      continue;
    }

    await streamGamesFromFile(inputFile, (gamePgn) => {
      processGame(gamePgn, indexMap, args.maxPlies, counters);
    });
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      maxPlies: args.maxPlies,
      topN: args.topN,
      inputs: args.inputs.map((filePath) => path.relative(process.cwd(), filePath)),
      gamesParsed: counters.parsedGames,
      gamesFailed: counters.failedGames,
      gamesSkippedNoResult: counters.skippedNoResult,
      positions: indexMap.size,
      fenKey: 'piece-placement side-to-move castling en-passant',
      perspective: 'white'
    },
    positions: finalizeIndex(indexMap, args.topN)
  };

  writeJsonAtomic(args.outFile, payload);

  console.log(JSON.stringify({
    ok: true,
    out: args.outFile,
    elapsedMs: Date.now() - startedAt,
    ...payload.meta
  }, null, 2));
}

main().catch((err) => {
  console.error('[build-opening-position-index] failed:', err.message);
  process.exit(1);
});
