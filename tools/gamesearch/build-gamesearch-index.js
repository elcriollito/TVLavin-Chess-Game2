#!/usr/bin/env node
/**
 * Build GameSearch lineKey index:
 *   lineKey (UCI sequence up to N plies) -> { games, top[] }
 *
 * Usage:
 *   node tools/gamesearch/build-gamesearch-index.js --in pgn --out data/gamesearch/shards_build --version v1
 *   node tools/gamesearch/build-gamesearch-index.js --in "https://example.com/database.pgn" --maxPlies 10 --topK 100
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { Readable } from 'stream';
import { Chess } from 'chess.js';

const DEFAULT_IN = path.resolve('pgn');
const DEFAULT_OUT = path.resolve('data/gamesearch/shards_build');
const DEFAULT_VERSION = 'v1';
const DEFAULT_MAX_PLIES = 10;
const DEFAULT_TOP_K = 100;
const DEFAULT_PROGRESS_EVERY = 10000;

function parseArgs(argv) {
  const args = {
    in: [],
    outRoot: DEFAULT_OUT,
    version: DEFAULT_VERSION,
    maxPlies: DEFAULT_MAX_PLIES,
    topK: DEFAULT_TOP_K,
    progressEvery: DEFAULT_PROGRESS_EVERY,
    maxGames: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--in') {
      args.in.push(String(argv[i + 1] || '').trim());
      i += 1;
    } else if (token === '--out') {
      args.outRoot = path.resolve(argv[i + 1] || args.outRoot);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim() || DEFAULT_VERSION;
      i += 1;
    } else if (token === '--maxPlies') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      args.maxPlies = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_PLIES;
      i += 1;
    } else if (token === '--topK') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      args.topK = Number.isFinite(n) && n > 0 ? n : DEFAULT_TOP_K;
      i += 1;
    } else if (token === '--progressEvery') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      args.progressEvery = Number.isFinite(n) && n > 0 ? n : DEFAULT_PROGRESS_EVERY;
      i += 1;
    } else if (token === '--maxGames') {
      const n = Number.parseInt(argv[i + 1] || '', 10);
      args.maxGames = Number.isFinite(n) && n > 0 ? n : null;
      i += 1;
    }
  }
  if (args.in.length === 0) args.in = [DEFAULT_IN];
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isHttpUrl(input) {
  return /^https?:\/\//i.test(String(input || ''));
}

function collectPgnFiles(inputPathRaw) {
  const inputPath = path.resolve(inputPathRaw);
  if (!fs.existsSync(inputPath)) return [];
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    return inputPath.toLowerCase().endsWith('.pgn') ? [inputPath] : [];
  }
  if (!stat.isDirectory()) return [];
  const out = [];
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pgn')) out.push(full);
    }
  }
  walk(inputPath);
  return out;
}

function parseHeaderLine(line) {
  const m = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!m) return null;
  return { key: m[1], value: m[2] };
}

function parseYear(headers) {
  const raw = String(headers.Date || headers.UTCDate || '').trim();
  const m = raw.match(/^(\d{4})/);
  if (!m) return null;
  const y = Number.parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

function parseAvgElo(headers) {
  const w = Number.parseInt(String(headers.WhiteElo || '').replace(/[^\d]/g, ''), 10);
  const b = Number.parseInt(String(headers.BlackElo || '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(w) || !Number.isFinite(b) || w <= 0 || b <= 0) return null;
  return Math.round((w + b) / 2);
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
  const raw = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let token of raw) {
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
    // fallback below
  }
  return extractSanTokensFallback(gamePgn);
}

function scoreMeta(meta) {
  const year = Number(meta.year) || 0;
  const avgElo = Number(meta.avgElo) || 0;
  const plyCount = Number(meta.plyCount) || 0;
  return year * 100000 + avgElo * 100 + plyCount;
}

function insertTop(entry, meta, topK) {
  const score = scoreMeta(meta);
  const row = { ...meta, score };
  const top = entry.top;
  const existingIdx = top.findIndex((x) => x.gameId === row.gameId);
  if (existingIdx >= 0) {
    if (score > top[existingIdx].score) top[existingIdx] = row;
  } else if (top.length < topK) {
    top.push(row);
  } else if (score > top[top.length - 1].score) {
    top[top.length - 1] = row;
  } else {
    return;
  }
  top.sort((a, b) => b.score - a.score);
  if (top.length > topK) top.length = topK;
}

function lineKeyShard(lineKey) {
  const digest = crypto.createHash('sha1').update(String(lineKey || ''), 'utf8').digest('hex');
  return digest.slice(0, 2).toLowerCase();
}

function gameIdFromMeta(headers, uciSeq) {
  const raw = [
    headers.Event || '',
    headers.Site || '',
    headers.Date || '',
    headers.White || '',
    headers.Black || '',
    headers.Result || '',
    uciSeq.join(' ')
  ].join('|');
  return `g_${crypto.createHash('sha1').update(raw, 'utf8').digest('hex').slice(0, 16)}`;
}

async function streamGamesFromLines(readable, onGame) {
  const rl = readline.createInterface({ input: readable, crlfDelay: Infinity });
  let current = [];
  let seenTag = false;
  let stop = false;
  for await (const line of rl) {
    if (stop) break;
    const trimmed = line.trim();
    if (trimmed.startsWith('[Event ')) {
      if (seenTag && current.length > 0) {
        const keep = onGame(current.join('\n'));
        if (keep === false) {
          stop = true;
          break;
        }
        current = [];
      }
      seenTag = true;
    }
    if (seenTag || trimmed.length > 0) current.push(line);
  }
  if (!stop && current.length > 0) onGame(current.join('\n'));
}

async function streamGamesFromFile(filePath, onGame) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  await streamGamesFromLines(stream, onGame);
}

async function streamGamesFromUrl(url, onGame) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const stream = Readable.fromWeb(res.body);
  stream.setEncoding('utf8');
  await streamGamesFromLines(stream, onGame);
}

function processGame(gamePgn, args, index, counters) {
  counters.gamesProcessed += 1;
  const headers = {};
  for (const line of String(gamePgn || '').split(/\r?\n/)) {
    const h = parseHeaderLine(line);
    if (h) headers[h.key] = h.value;
  }
  const sanMoves = extractGameMoves(gamePgn);
  if (!Array.isArray(sanMoves) || sanMoves.length === 0) {
    counters.parseFails += 1;
    return;
  }

  const replay = new Chess();
  const uciSeq = [];
  for (let i = 0; i < sanMoves.length && i < args.maxPlies; i += 1) {
    let mv = null;
    try {
      mv = replay.move(sanMoves[i], { sloppy: true });
    } catch {
      mv = null;
    }
    if (!mv) {
      counters.illegalMoves += 1;
      break;
    }
    const uci = moveToUci(mv);
    if (uci) uciSeq.push(uci);
  }

  if (uciSeq.length === 0) {
    counters.skippedGames += 1;
    return;
  }

  const avgElo = parseAvgElo(headers);
  const year = parseYear(headers);
  const gameId = gameIdFromMeta(headers, uciSeq);
  const baseMeta = {
    gameId,
    event: headers.Event || '',
    site: headers.Site || '',
    date: headers.Date || headers.UTCDate || '',
    year: Number.isFinite(year) ? year : null,
    white: headers.White || '',
    black: headers.Black || '',
    result: headers.Result || '',
    whiteElo: headers.WhiteElo || null,
    blackElo: headers.BlackElo || null,
    eco: headers.ECO || '',
    avgElo: Number.isFinite(avgElo) ? avgElo : null,
    plyCount: uciSeq.length
  };

  // Index each prefix up to maxPlies so search can work at any ply <= maxPlies.
  for (let ply = 1; ply <= uciSeq.length; ply += 1) {
    const lineKey = uciSeq.slice(0, ply).join(' ');
    let entry = index.get(lineKey);
    if (!entry) {
      entry = { games: 0, top: [] };
      index.set(lineKey, entry);
    }
    entry.games += 1;
    insertTop(entry, baseMeta, args.topK);
    counters.indexUpdates += 1;
  }
}

function writeShards(index, outDir) {
  const shards = new Map();
  for (const [lineKey, entry] of index.entries()) {
    const shard = lineKeyShard(lineKey);
    let bucket = shards.get(shard);
    if (!bucket) {
      bucket = { v: 1, entries: {} };
      shards.set(shard, bucket);
    }
    bucket.entries[lineKey] = {
      games: entry.games,
      top: (entry.top || []).map(({ score, ...rest }) => rest)
    };
  }

  ensureDir(outDir);
  for (let i = 0; i < 256; i += 1) {
    const shard = i.toString(16).padStart(2, '0');
    const payload = shards.get(shard) || { v: 1, entries: {} };
    fs.writeFileSync(path.join(outDir, `${shard}.json`), JSON.stringify(payload), 'utf8');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(args.outRoot, args.version);
  const index = new Map();
  const counters = {
    gamesProcessed: 0,
    parseFails: 0,
    illegalMoves: 0,
    skippedGames: 0,
    indexUpdates: 0
  };
  const started = Date.now();

  const sources = [];
  for (const raw of args.in) {
    if (!raw) continue;
    if (isHttpUrl(raw)) {
      sources.push({ type: 'url', value: raw });
    } else {
      const files = collectPgnFiles(raw);
      for (const file of files) sources.push({ type: 'file', value: file });
    }
  }
  if (sources.length === 0) {
    throw new Error(`No PGN sources found for --in ${args.in.join(', ')}`);
  }

  for (const source of sources) {
    if (source.type === 'file') {
      await streamGamesFromFile(source.value, (gamePgn) => {
        processGame(gamePgn, args, index, counters);
        if (args.progressEvery && counters.gamesProcessed % args.progressEvery === 0) {
          console.log(JSON.stringify({
            progress: true,
            gamesProcessed: counters.gamesProcessed,
            uniqueLineKeys: index.size,
            indexUpdates: counters.indexUpdates
          }));
        }
        if (args.maxGames && counters.gamesProcessed >= args.maxGames) return false;
        return true;
      });
    } else {
      await streamGamesFromUrl(source.value, (gamePgn) => {
        processGame(gamePgn, args, index, counters);
        if (args.progressEvery && counters.gamesProcessed % args.progressEvery === 0) {
          console.log(JSON.stringify({
            progress: true,
            gamesProcessed: counters.gamesProcessed,
            uniqueLineKeys: index.size,
            indexUpdates: counters.indexUpdates
          }));
        }
        if (args.maxGames && counters.gamesProcessed >= args.maxGames) return false;
        return true;
      });
    }
    if (args.maxGames && counters.gamesProcessed >= args.maxGames) break;
  }

  writeShards(index, outDir);
  const manifest = {
    activeVersion: args.version,
    shardCount: 256,
    maxPlies: args.maxPlies,
    topK: args.topK,
    baseUrl: '',
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(JSON.stringify({
    ok: true,
    outDir: path.relative(process.cwd(), outDir),
    sources: sources.length,
    gamesProcessed: counters.gamesProcessed,
    uniqueLineKeys: index.size,
    parseFails: counters.parseFails,
    illegalMoves: counters.illegalMoves,
    skippedGames: counters.skippedGames,
    indexUpdates: counters.indexUpdates,
    elapsedMs: Date.now() - started
  }, null, 2));
}

main().catch((err) => {
  console.error('[build-gamesearch-index] failed:', err?.message || err);
  process.exit(1);
});
