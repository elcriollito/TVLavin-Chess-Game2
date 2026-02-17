#!/usr/bin/env node
/**
 * Build OpeningDB games index.
 * Usage:
 *   node scripts/build-openingdb-games-index.js --in data/pgn_db --out data/openingdb_games --version v1 --maxPerPos 500
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { Chess } from 'chess.js';

const DEFAULT_IN = path.resolve('data/pgn_db');
const DEFAULT_OUT = path.resolve('data/openingdb_games');
const DEFAULT_VERSION = 'v1';
const DEFAULT_MAX_GAMES_PER_POSITION = 500;

function parseArgs(argv) {
  const args = {
    inPaths: [],
    outDir: DEFAULT_OUT,
    version: DEFAULT_VERSION,
    maxGamesPerPosition: DEFAULT_MAX_GAMES_PER_POSITION
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--in') {
      args.inPaths.push(path.resolve(argv[i + 1] || ''));
      i += 1;
    } else if (token === '--out') {
      args.outDir = path.resolve(argv[i + 1] || args.outDir);
      i += 1;
    } else if (token === '--version') {
      args.version = String(argv[i + 1] || args.version).trim();
      i += 1;
    } else if (token === '--maxPerPos') {
      const n = Number.parseInt(argv[i + 1] || `${DEFAULT_MAX_GAMES_PER_POSITION}`, 10);
      args.maxGamesPerPosition = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_GAMES_PER_POSITION;
      i += 1;
    }
  }
  if (!args.inPaths.length) args.inPaths = [DEFAULT_IN, path.resolve('pgn')];
  return args;
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

function fenHash(fen) {
  return crypto.createHash('sha1').update(normalizeFEN(fen), 'utf8').digest('hex').slice(0, 16);
}

function parseHeaderLine(line) {
  const match = String(line || '').match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$/);
  if (!match) return null;
  return { key: match[1], value: match[2] };
}

function parseYear(headers) {
  const raw = String(headers.Date || headers.UTCDate || '').trim();
  if (!raw || raw.includes('?')) return null;
  const match = raw.match(/^(\d{4})/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  return Number.isFinite(year) ? year : null;
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
  const out = [];
  for (let token of text.split(/\s+/).filter(Boolean)) {
    if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') break;
    token = token.replace(/^\d+\.(\.\.)?/, '').replace(/^\.{3}/, '').replace(/[!?]+/g, '').trim();
    if (token) out.push(token);
  }
  return out;
}

function extractMoves(gamePgn) {
  const parser = new Chess();
  try {
    parser.loadPgn(gamePgn, { strict: false });
    const verbose = parser.history({ verbose: true });
    if (Array.isArray(verbose) && verbose.length > 0) {
      return verbose.map((m) => String(m.san || '').trim()).filter(Boolean);
    }
  } catch (_err) {
    // fallback
  }
  return extractSanTokensFallback(gamePgn);
}

async function streamGamesFromFile(filePath, onGame) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let current = [];
  let seenTag = false;
  for await (const line of rl) {
    const t = line.trim();
    if (t.startsWith('[Event ')) {
      if (seenTag && current.length > 0) {
        onGame(current.join('\n'));
        current = [];
      }
      seenTag = true;
    }
    if (seenTag || t.length > 0) current.push(line);
  }
  if (current.length > 0) onGame(current.join('\n'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
}

function mainGameId(headers, gamePgn) {
  const signature = `${headers.Event || ''}|${headers.Site || ''}|${headers.Date || ''}|${headers.White || ''}|${headers.Black || ''}|${headers.Result || ''}|${String(gamePgn || '').trim()}`;
  return `g_${crypto.createHash('sha1').update(signature, 'utf8').digest('hex').slice(0, 16)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputs = Array.from(new Set(args.inPaths.flatMap((p) => collectPgnFiles(p))));
  if (!inputs.length) throw new Error(`No PGN files found in: ${args.inPaths.join(', ')}`);

  const versionRoot = path.join(args.outDir, args.version);
  const shardsDir = path.join(versionRoot, 'shards');
  const catalogDir = path.join(versionRoot, 'catalog');
  const pgnDir = path.join(versionRoot, 'pgn');
  fs.mkdirSync(shardsDir, { recursive: true });
  fs.mkdirSync(catalogDir, { recursive: true });
  fs.mkdirSync(pgnDir, { recursive: true });

  const fenMap = new Map(); // fenHash -> Set<gameId>
  const catalog = new Map(); // gameId -> metadata

  const counters = { games: 0, gamesFailed: 0, positionsLinked: 0 };

  for (const filePath of inputs) {
    await streamGamesFromFile(filePath, (gamePgn) => {
      const lines = String(gamePgn || '').split(/\r?\n/);
      const headers = {};
      for (const line of lines) {
        const h = parseHeaderLine(line);
        if (h) headers[h.key] = h.value;
      }

      const moves = extractMoves(gamePgn);
      if (!moves.length) {
        counters.gamesFailed += 1;
        return;
      }

      const gameId = mainGameId(headers, gamePgn);
      if (!catalog.has(gameId)) {
        const meta = {
          white: String(headers.White || 'Unknown'),
          black: String(headers.Black || 'Unknown'),
          result: String(headers.Result || '*'),
          event: String(headers.Event || ''),
          site: String(headers.Site || ''),
          year: parseYear(headers),
          whiteElo: Number.parseInt(String(headers.WhiteElo || '').replace(/[^\d]/g, ''), 10) || null,
          blackElo: Number.parseInt(String(headers.BlackElo || '').replace(/[^\d]/g, ''), 10) || null,
          pgnKey: `openingdb/games/${args.version}/pgn/${gameId}.pgn`
        };
        catalog.set(gameId, meta);
        fs.writeFileSync(path.join(pgnDir, `${gameId}.pgn`), `${String(gamePgn || '').trim()}\n`, 'utf8');
      }

      const replay = new Chess();
      for (const san of moves) {
        const h = fenHash(replay.fen());
        let ids = fenMap.get(h);
        if (!ids) {
          ids = new Set();
          fenMap.set(h, ids);
        }
        if (ids.size < args.maxGamesPerPosition || ids.has(gameId)) {
          ids.add(gameId);
        }

        let ok = null;
        try {
          ok = replay.move(san, { sloppy: true });
        } catch (_err) {
          ok = null;
        }
        if (!ok) break;
      }
      counters.games += 1;
    });
  }

  // Write fen shards 00..ff
  for (let i = 0; i < 256; i += 1) {
    const shard = i.toString(16).padStart(2, '0');
    const out = {};
    for (const [h, ids] of fenMap.entries()) {
      if (h.slice(0, 2) !== shard) continue;
      out[h] = Array.from(ids);
      counters.positionsLinked += 1;
    }
    writeJson(path.join(shardsDir, `${shard}.json`), out);
  }

  // Write catalog shards by gameId prefix (after g_)
  const catalogBuckets = new Map();
  for (const [gameId, meta] of catalog.entries()) {
    const prefix = gameId.slice(2, 4).toLowerCase();
    if (!catalogBuckets.has(prefix)) catalogBuckets.set(prefix, {});
    catalogBuckets.get(prefix)[gameId] = meta;
  }
  for (let i = 0; i < 256; i += 1) {
    const prefix = i.toString(16).padStart(2, '0');
    writeJson(path.join(catalogDir, `${prefix}.json`), catalogBuckets.get(prefix) || {});
  }

  const manifest = {
    activeVersion: args.version,
    baseUrl: 'https://downloads.caissa-chess.org/openingdb/games',
    generatedAt: new Date().toISOString(),
    shardCount: 256,
    hash: { algo: 'sha1', len: 16 },
    fields: ['white', 'black', 'result', 'event', 'site', 'year', 'whiteElo', 'blackElo', 'pgnKey'],
    maxGamesPerPosition: args.maxGamesPerPosition
  };
  writeJson(path.join(args.outDir, 'manifest.json'), manifest);

  console.log(JSON.stringify({
    ok: true,
    version: args.version,
    outDir: args.outDir,
    inputs: inputs.map((f) => path.relative(process.cwd(), f)),
    gamesParsed: counters.games,
    gamesFailed: counters.gamesFailed,
    positions: fenMap.size,
    catalogGames: catalog.size
  }, null, 2));
}

main().catch((err) => {
  console.error('[build-openingdb-games-index] failed:', err.message);
  process.exit(1);
});
