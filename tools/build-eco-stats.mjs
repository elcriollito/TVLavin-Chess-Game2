#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Chess } from 'chess.js';

const DEFAULT_MAX_PLY = 60;
const DEFAULT_TOP_N = 20;

function parseArgs(argv) {
  const args = {
    pgnPath: '',
    maxPly: DEFAULT_MAX_PLY,
    topN: DEFAULT_TOP_N,
    outDir: path.resolve('public/data/eco')
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--max-ply') {
      args.maxPly = Math.max(4, Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_PLY}`, 10) || DEFAULT_MAX_PLY);
      i += 1;
    } else if (token === '--top') {
      args.topN = Math.max(1, Number.parseInt(argv[i + 1] || `${DEFAULT_TOP_N}`, 10) || DEFAULT_TOP_N);
      i += 1;
    } else if (token === '--out-dir') {
      args.outDir = path.resolve(argv[i + 1] || args.outDir);
      i += 1;
    } else {
      positional.push(token);
    }
  }

  if (positional[0]) {
    args.pgnPath = path.resolve(positional[0]);
  }

  if (!args.pgnPath) {
    throw new Error('Usage: node tools/build-eco-stats.mjs <path-to.pgn> [--max-ply 60] [--top 20] [--out-dir public/data/eco]');
  }

  return args;
}

function normalizeSanToken(token) {
  let t = String(token || '').trim();
  if (!t) return '';
  t = t.replace(/^\d+\.(\.\.)?/, '');
  t = t.replace(/^\.\.\./, '');
  t = t.replace(/[!?+#]+$/g, '');
  return t.trim();
}

function parseMovesFromText(moveText, maxPly) {
  let txt = String(moveText || '');
  txt = txt.replace(/\r/g, '\n');
  txt = txt.replace(/\{[^}]*\}/g, ' ');
  txt = txt.replace(/;[^\n]*/g, ' ');
  txt = txt.replace(/\$\d+/g, ' ');
  // Remove simple (...) variations repeatedly
  let prev = '';
  while (prev !== txt) {
    prev = txt;
    txt = txt.replace(/\([^()]*\)/g, ' ');
  }

  const raw = txt.split(/\s+/).filter(Boolean);
  const out = [];
  for (const token of raw) {
    if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') continue;
    if (/^\d+\.(\.\.)?$/.test(token)) continue;
    if (token === '...') continue;
    const san = normalizeSanToken(token);
    if (!san) continue;
    out.push(san);
    if (out.length >= maxPly) break;
  }
  return out;
}

function parseDate(raw) {
  const value = String(raw || '').trim();
  if (!value || value.includes('?')) return '';
  const m = value.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseHeaderLine(line) {
  const m = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!m) return null;
  return { key: m[1], value: m[2] };
}

function parseDefiningMoves(str, maxPly) {
  return parseMovesFromText(String(str || ''), maxPly);
}

function isPrefix(prefixMoves, gameMoves) {
  if (!prefixMoves || !gameMoves) return false;
  if (prefixMoves.length === 0 || prefixMoves.length > gameMoves.length) return false;
  for (let i = 0; i < prefixMoves.length; i += 1) {
    if (prefixMoves[i] !== gameMoves[i]) return false;
  }
  return true;
}

function classifyByPrefix(gameMoves, ecoDefinitions) {
  let best = null;
  for (const def of ecoDefinitions) {
    if (isPrefix(def.moves, gameMoves)) {
      if (!best || def.moves.length > best.moves.length) {
        best = def;
      }
    }
  }
  return best ? best.eco : '';
}

function initEcoStats(eco, name) {
  return {
    eco,
    name: name || eco,
    games: 0,
    whiteWins: 0,
    draws: 0,
    blackWins: 0,
    lastDate: ''
  };
}

function applyResult(stats, resultTag) {
  stats.games += 1;
  if (resultTag === '1-0') {
    stats.whiteWins += 1;
  } else if (resultTag === '0-1') {
    stats.blackWins += 1;
  } else if (resultTag === '1/2-1/2') {
    stats.draws += 1;
  }
}

function updateLastDate(stats, isoDate) {
  if (!isoDate) return;
  if (!stats.lastDate || isoDate > stats.lastDate) {
    stats.lastDate = isoDate;
  }
}

function ensureContinuationMap(obj, eco) {
  if (!obj[eco]) obj[eco] = new Map();
  return obj[eco];
}

function updateContinuation(contMap, move, resultTag) {
  let row = contMap.get(move);
  if (!row) {
    row = { move, count: 0, whiteWins: 0, draws: 0, blackWins: 0 };
    contMap.set(move, row);
  }
  row.count += 1;
  if (resultTag === '1-0') row.whiteWins += 1;
  else if (resultTag === '0-1') row.blackWins += 1;
  else if (resultTag === '1/2-1/2') row.draws += 1;
}

function buildEcoFenMap(ecoDefinitions, ecoDetails) {
  const out = {};
  for (const def of ecoDefinitions) {
    const detailFen = ecoDetails[def.eco]?.fen;
    if (detailFen) {
      out[def.eco] = detailFen;
      continue;
    }

    try {
      const chess = new Chess();
      let ok = true;
      for (const san of def.moves) {
        const r = chess.move(san, { sloppy: true });
        if (!r) {
          ok = false;
          break;
        }
      }
      if (ok) out[def.eco] = chess.fen();
    } catch {
      // ignore invalid definitions
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.pgnPath)) {
    throw new Error(`PGN file not found: ${args.pgnPath}`);
  }

  const ecoCodesPath = path.resolve('public/data/eco/eco_codes.json');
  const ecoDetailsPath = path.resolve('public/data/eco/eco_details.json');
  if (!fs.existsSync(ecoCodesPath)) {
    throw new Error(`Missing dataset: ${ecoCodesPath}`);
  }

  const ecoCodes = JSON.parse(fs.readFileSync(ecoCodesPath, 'utf8'));
  const ecoDetailsArr = fs.existsSync(ecoDetailsPath)
    ? JSON.parse(fs.readFileSync(ecoDetailsPath, 'utf8'))
    : [];
  const ecoDetails = {};
  for (const row of ecoDetailsArr) {
    if (row?.code) ecoDetails[row.code] = row;
  }

  const ecoNameByCode = {};
  const ecoDefinitions = [];
  for (const row of ecoCodes) {
    if (!row?.code || !/^[A-E]\d{2}$/.test(row.code)) continue;
    ecoNameByCode[row.code] = row.name || row.code;
    const rawMoves = row.moves || ecoDetails[row.code]?.moves || '';
    const moves = parseDefiningMoves(rawMoves, args.maxPly);
    if (moves.length > 0) {
      ecoDefinitions.push({ eco: row.code, name: row.name || row.code, moves });
    }
  }

  const ecoStats = {};
  const ecoContinuations = {};
  let gamesSeen = 0;
  let gamesParsed = 0;
  let skipped = 0;

  let headers = {};
  let moveLines = [];

  function flushGame() {
    if (Object.keys(headers).length === 0 && moveLines.length === 0) return;
    gamesSeen += 1;

    const resultTag = String(headers.Result || '').trim();
    const dateTag = parseDate(headers.Date || '');
    const moveText = moveLines.join(' ');
    const moves = parseMovesFromText(moveText, args.maxPly);
    if (moves.length === 0) {
      skipped += 1;
      headers = {};
      moveLines = [];
      return;
    }

    let eco = String(headers.ECO || '').trim().toUpperCase();
    if (!/^[A-E]\d{2}$/.test(eco)) {
      eco = classifyByPrefix(moves, ecoDefinitions);
    }
    if (!eco || !ecoNameByCode[eco]) {
      skipped += 1;
      headers = {};
      moveLines = [];
      return;
    }

    if (!ecoStats[eco]) ecoStats[eco] = initEcoStats(eco, ecoNameByCode[eco]);
    applyResult(ecoStats[eco], resultTag);
    updateLastDate(ecoStats[eco], dateTag);

    const def = ecoDefinitions.find((d) => d.eco === eco);
    if (def && moves.length > def.moves.length) {
      const idx = def.moves.length;
      const nextSan = moves[idx];
      if (nextSan) {
        const moveLabel = (idx % 2 === 1) ? `...${nextSan}` : nextSan;
        const map = ensureContinuationMap(ecoContinuations, eco);
        updateContinuation(map, moveLabel, resultTag);
      }
    }

    gamesParsed += 1;
    headers = {};
    moveLines = [];
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(args.pgnPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const header = parseHeaderLine(line);
    if (header) {
      // New game boundary on Event header while we already have a game buffered
      if (header.key === 'Event' && (Object.keys(headers).length > 0 || moveLines.length > 0)) {
        flushGame();
      }
      headers[header.key] = header.value;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    moveLines.push(line);
  }
  flushGame();

  // Materialize continuations map -> top N arrays
  const continuationJson = {};
  for (const [eco, map] of Object.entries(ecoContinuations)) {
    continuationJson[eco] = Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, args.topN);
  }

  const ecoFen = buildEcoFenMap(ecoDefinitions, ecoDetails);

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(path.join(args.outDir, 'eco_stats.json'), JSON.stringify(ecoStats, null, 2));
  fs.writeFileSync(path.join(args.outDir, 'eco_continuations.json'), JSON.stringify(continuationJson, null, 2));
  fs.writeFileSync(path.join(args.outDir, 'eco_fen.json'), JSON.stringify(ecoFen, null, 2));

  console.log(JSON.stringify({
    ok: true,
    pgn: args.pgnPath,
    outDir: args.outDir,
    maxPly: args.maxPly,
    topN: args.topN,
    gamesSeen,
    gamesParsed,
    skipped,
    ecoCount: Object.keys(ecoStats).length
  }, null, 2));
}

main().catch((err) => {
  console.error('[build-eco-stats] failed:', err.message);
  process.exit(1);
});

