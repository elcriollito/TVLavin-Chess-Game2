#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const DEFAULT_TOP_N = 10;
const DEFAULT_MAX_PLY = 24;
const RESULT_WIN_WHITE = '1-0';
const RESULT_WIN_BLACK = '0-1';
const RESULT_DRAW = '1/2-1/2';
const RESULT_IGNORE = '*';

function parseArgs(argv) {
  const args = {
    input: '',
    outDir: path.resolve('public/data/eco'),
    topN: DEFAULT_TOP_N,
    maxPly: DEFAULT_MAX_PLY
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      args.input = path.resolve(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (token === '--out') {
      args.outDir = path.resolve(argv[i + 1] || args.outDir);
      i += 1;
      continue;
    }
    if (token === '--top') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_TOP_N}`, 10);
      args.topN = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOP_N;
      i += 1;
      continue;
    }
    if (token === '--max-ply') {
      const parsed = Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_PLY}`, 10);
      args.maxPly = Number.isFinite(parsed) && parsed >= 8 ? parsed : DEFAULT_MAX_PLY;
      i += 1;
    }
  }

  if (!args.input) {
    throw new Error('Usage: node tools/eco-pgn-stats.js --input <local_pgn_path> [--out public/data/eco] [--top 10] [--max-ply 24]');
  }

  return args;
}

function parseHeaderLine(line) {
  const match = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function normalizeSanToken(token) {
  let value = String(token || '').trim();
  if (!value) return '';

  value = value.replace(/^\d+\.(\.\.)?/, '');
  value = value.replace(/^\.\.\./, '');
  value = value.replace(/[!?+#]+$/g, '');
  value = value.replace(/^\.+/, '');
  return value.trim();
}

function parseMovesFromText(moveText, maxPly) {
  let text = String(moveText || '');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/\{[^}]*\}/g, ' ');
  text = text.replace(/;[^\n]*/g, ' ');
  text = text.replace(/\$\d+/g, ' ');

  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  }

  const rawTokens = text.split(/\s+/).filter(Boolean);
  const moves = [];
  for (const token of rawTokens) {
    if (token === RESULT_WIN_WHITE || token === RESULT_WIN_BLACK || token === RESULT_DRAW || token === RESULT_IGNORE) continue;
    if (/^\d+\.(\.\.)?$/.test(token) || token === '...') continue;

    const san = normalizeSanToken(token);
    if (!san) continue;

    moves.push(san);
    if (moves.length >= maxPly) break;
  }

  return moves;
}

function parseEco(value) {
  const eco = String(value || '').trim().toUpperCase();
  return /^[A-E]\d{2}$/.test(eco) ? eco : '';
}

function parseResult(value) {
  const result = String(value || '').trim();
  if (result === RESULT_WIN_WHITE || result === RESULT_WIN_BLACK || result === RESULT_DRAW || result === RESULT_IGNORE) {
    return result;
  }
  return '';
}

function parseYear(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('?')) return null;
  const m = raw.match(/^(\d{4})\./);
  if (!m) return null;
  const year = Number.parseInt(m[1], 10);
  if (!Number.isFinite(year) || year < 1000 || year > 3000) return null;
  return year;
}

function parseElo(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '?') return null;
  const num = Number.parseInt(raw, 10);
  if (!Number.isFinite(num) || num < 600 || num > 4000) return null;
  return num;
}

function parseDefiningMoves(rawMoves) {
  return parseMovesFromText(String(rawMoves || ''), 24);
}

function isPrefix(prefixMoves, gameMoves) {
  if (!Array.isArray(prefixMoves) || !Array.isArray(gameMoves)) return false;
  if (prefixMoves.length === 0 || prefixMoves.length > gameMoves.length) return false;

  for (let i = 0; i < prefixMoves.length; i += 1) {
    if (prefixMoves[i] !== gameMoves[i]) return false;
  }
  return true;
}

function initStatRow(eco) {
  return {
    games: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    avgElo: null,
    lastYearSeen: null,
    _eloSum: 0,
    _eloCount: 0
  };
}

function labelMoveByPly(nextSan, plyIndex) {
  if (!nextSan) return '';
  return (plyIndex % 2 === 1) ? `...${nextSan}` : nextSan;
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function finalizeStats(statsByEco) {
  const out = {};
  for (const [eco, row] of Object.entries(statsByEco)) {
    out[eco] = {
      games: row.games,
      whiteWins: row.whiteWins,
      blackWins: row.blackWins,
      draws: row.draws,
      avgElo: row._eloCount > 0 ? Number((row._eloSum / row._eloCount).toFixed(1)) : null,
      lastYearSeen: row.lastYearSeen
    };
  }
  return out;
}

function finalizePopular(continuationsByEco, topN) {
  const out = {};
  for (const [eco, map] of Object.entries(continuationsByEco)) {
    out[eco] = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, topN)
      .map((row) => ({
        move: row.move,
        count: row.count,
        whiteWins: row.whiteWins,
        blackWins: row.blackWins,
        draws: row.draws
      }));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.input)) {
    throw new Error(`Input PGN not found: ${args.input}`);
  }

  const ecoCodesPath = path.resolve('public/data/eco/eco_codes.json');
  const ecoDetailsPath = path.resolve('public/data/eco/eco_details.json');

  if (!fs.existsSync(ecoCodesPath)) {
    throw new Error(`Missing required ECO catalog: ${ecoCodesPath}`);
  }

  const ecoCodes = JSON.parse(fs.readFileSync(ecoCodesPath, 'utf8'));
  const ecoDetails = fs.existsSync(ecoDetailsPath)
    ? JSON.parse(fs.readFileSync(ecoDetailsPath, 'utf8'))
    : [];

  const nameByEco = {};
  const definingByEco = {};

  for (const row of ecoCodes) {
    const eco = parseEco(row?.code || '');
    if (!eco) continue;
    nameByEco[eco] = String(row?.name || eco);
    const moves = parseDefiningMoves(row?.moves || '');
    if (moves.length > 0) definingByEco[eco] = moves;
  }

  for (const row of ecoDetails) {
    const eco = parseEco(row?.code || '');
    if (!eco || definingByEco[eco]) continue;
    const moves = parseDefiningMoves(row?.moves || '');
    if (moves.length > 0) definingByEco[eco] = moves;
  }

  const statsByEco = {};
  const continuationsByEco = {};
  for (const eco of Object.keys(nameByEco)) {
    statsByEco[eco] = initStatRow(eco);
    continuationsByEco[eco] = new Map();
  }

  let gamesSeen = 0;
  let gamesCounted = 0;
  let gamesIgnoredNoEco = 0;
  let gamesIgnoredResult = 0;

  let headers = {};
  let moveLines = [];

  const flushGame = () => {
    if (Object.keys(headers).length === 0 && moveLines.length === 0) return;

    gamesSeen += 1;

    const eco = parseEco(headers.ECO || '');
    const result = parseResult(headers.Result || '');
    const year = parseYear(headers.Date || '');
    const whiteElo = parseElo(headers.WhiteElo || '');
    const blackElo = parseElo(headers.BlackElo || '');

    if (!eco || !statsByEco[eco]) {
      gamesIgnoredNoEco += 1;
      headers = {};
      moveLines = [];
      return;
    }

    if (!result || result === RESULT_IGNORE) {
      gamesIgnoredResult += 1;
      headers = {};
      moveLines = [];
      return;
    }

    const row = statsByEco[eco];
    row.games += 1;
    if (result === RESULT_WIN_WHITE) row.whiteWins += 1;
    else if (result === RESULT_WIN_BLACK) row.blackWins += 1;
    else if (result === RESULT_DRAW) row.draws += 1;

    if (Number.isFinite(year) && (row.lastYearSeen === null || year > row.lastYearSeen)) {
      row.lastYearSeen = year;
    }

    const eloValues = [whiteElo, blackElo].filter((v) => Number.isFinite(v));
    if (eloValues.length > 0) {
      row._eloSum += eloValues.reduce((sum, v) => sum + v, 0) / eloValues.length;
      row._eloCount += 1;
    }

    const moves = parseMovesFromText(moveLines.join(' '), args.maxPly);
    if (moves.length > 0) {
      const defMoves = definingByEco[eco] || [];
      const contMap = continuationsByEco[eco];

      let continuationKey = '';
      if (defMoves.length > 0 && isPrefix(defMoves, moves) && moves.length > defMoves.length) {
        continuationKey = labelMoveByPly(moves[defMoves.length], defMoves.length);
      } else {
        const fallbackLen = Math.min(12, moves.length);
        continuationKey = moves.slice(0, fallbackLen).join(' ');
      }

      if (continuationKey) {
        let contRow = contMap.get(continuationKey);
        if (!contRow) {
          contRow = { move: continuationKey, count: 0, whiteWins: 0, blackWins: 0, draws: 0 };
          contMap.set(continuationKey, contRow);
        }
        contRow.count += 1;
        if (result === RESULT_WIN_WHITE) contRow.whiteWins += 1;
        else if (result === RESULT_WIN_BLACK) contRow.blackWins += 1;
        else if (result === RESULT_DRAW) contRow.draws += 1;
      }
    }

    gamesCounted += 1;
    headers = {};
    moveLines = [];
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(args.input, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const header = parseHeaderLine(line);
    if (header) {
      if (header.key === 'Event' && (Object.keys(headers).length > 0 || moveLines.length > 0)) {
        flushGame();
      }
      headers[header.key] = header.value;
      continue;
    }

    if (line.trim().length === 0) continue;
    moveLines.push(line);
  }
  flushGame();

  const ecoStats = finalizeStats(statsByEco);
  const ecoPopularContinuations = finalizePopular(continuationsByEco, args.topN);

  const statsPath = path.join(args.outDir, 'eco_stats.json');
  const continuationsPath = path.join(args.outDir, 'eco_popular_continuations.json');

  writeJsonAtomic(statsPath, ecoStats);
  writeJsonAtomic(continuationsPath, ecoPopularContinuations);

  console.log(JSON.stringify({
    ok: true,
    input: args.input,
    output: {
      ecoStats: statsPath,
      ecoPopularContinuations: continuationsPath
    },
    topN: args.topN,
    maxPly: args.maxPly,
    gamesSeen,
    gamesCounted,
    gamesIgnoredNoEco,
    gamesIgnoredResult,
    ecoCodes: Object.keys(nameByEco).length
  }, null, 2));
}

main().catch((err) => {
  console.error('[eco-pgn-stats] failed:', err.message);
  process.exit(1);
});
