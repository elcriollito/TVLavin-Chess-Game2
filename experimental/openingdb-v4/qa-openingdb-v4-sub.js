#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Chess } from 'chess.js';

const DEFAULT_V3_DIR = path.resolve('data/openingdb/shards_build/v3_p60');
const DEFAULT_V4_DIR = path.resolve('data/openingdb/subshards_build/v4_sub');

const TEST_LINES = [
  { name: 'Ruy Lopez', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3' },
  { name: 'QGD', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6' },
  { name: 'Najdorf', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O' },
  { name: 'Deep QGD > ply20', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4' }
];

function parseArgs(argv) {
  const args = {
    v3Dir: DEFAULT_V3_DIR,
    v4Dir: DEFAULT_V4_DIR
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--v3') {
      args.v3Dir = path.resolve(argv[i + 1] || args.v3Dir);
      i += 1;
    } else if (t === '--v4') {
      args.v4Dir = path.resolve(argv[i + 1] || args.v4Dir);
      i += 1;
    }
  }
  return args;
}

function normalizeFenForHash(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return String(fen || '').trim();
  return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
}

function hashFen(fen) {
  return crypto.createHash('sha1').update(normalizeFenForHash(fen), 'utf8').digest('hex').slice(0, 16).toLowerCase();
}

function splitFenParts(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  return {
    board: parts[0] || '',
    turn: parts[1] || 'w',
    castling: parts[2] || '-',
    ep: parts[3] || '-'
  };
}

function buildVariants(fen) {
  const p = splitFenParts(fen);
  if (!p.board) return [];
  const variants = [
    { level: 'exact', key: `${p.board} ${p.turn} ${p.castling} ${p.ep}` },
    { level: 'no_ep', key: `${p.board} ${p.turn} ${p.castling} -` },
    { level: 'no_castling', key: `${p.board} ${p.turn} - -` },
    { level: 'board_only', key: `${p.board}` }
  ];
  const seen = new Set();
  return variants.filter((v) => {
    if (seen.has(v.key)) return false;
    seen.add(v.key);
    return true;
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadNodeFromV3(v3Dir, fenHash) {
  const shard = fenHash.slice(0, 2);
  const p = path.join(v3Dir, `${shard}.json`);
  if (!fs.existsSync(p)) return null;
  const j = readJson(p);
  return j[fenHash] || null;
}

function loadNodeFromV4(v4Dir, fenHash) {
  const sub = fenHash.slice(0, 3);
  const p = path.join(v4Dir, `${sub}.json`);
  if (!fs.existsSync(p)) return null;
  const j = readJson(p);
  return j[fenHash] || null;
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null;
  const moves = Array.isArray(node.moves) ? node.moves : [];
  return {
    moves: moves.map((m) => ({
      uci: String(m.uci || ''),
      san: String(m.san || ''),
      games: Number(m.games) || 0,
      w: Number(m.w) || 0,
      d: Number(m.d) || 0,
      l: Number(m.l) || 0,
      lastYear: Number.isFinite(Number(m.lastYear)) ? Number(m.lastYear) : null,
      avgElo: Number.isFinite(Number(m.avgElo)) ? Number(m.avgElo) : null
    }))
  };
}

function sameNode(a, b) {
  const na = normalizeNode(a);
  const nb = normalizeNode(b);
  return JSON.stringify(na) === JSON.stringify(nb);
}

function resolveByVariants(dir, loader, fen) {
  const variants = buildVariants(fen);
  for (const v of variants) {
    const h = hashFen(v.key);
    const node = loader(dir, h);
    if (node) return { found: true, matchLevel: v.level, fenHash: h, node };
  }
  return { found: false, matchLevel: 'none', fenHash: '', node: null };
}

function positionsFromLine(line) {
  const c = new Chess();
  const sans = String(line || '').trim().split(/\s+/).filter(Boolean);
  const out = [c.fen()];
  for (const san of sans) {
    const mv = c.move(san, { sloppy: true });
    if (!mv) break;
    out.push(c.fen());
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.v3Dir)) throw new Error(`Missing v3 dir: ${args.v3Dir}`);
  if (!fs.existsSync(args.v4Dir)) throw new Error(`Missing v4 dir: ${args.v4Dir}`);

  const mismatches = [];
  let checked = 0;

  for (const tc of TEST_LINES) {
    const fens = positionsFromLine(tc.line);
    for (const fen of fens) {
      const a = resolveByVariants(args.v3Dir, loadNodeFromV3, fen);
      const b = resolveByVariants(args.v4Dir, loadNodeFromV4, fen);
      checked += 1;

      if (!!a.found !== !!b.found) {
        mismatches.push({
          test: tc.name,
          type: 'found_mismatch',
          fen,
          v3: a.matchLevel,
          v4: b.matchLevel
        });
        continue;
      }
      if (!a.found && !b.found) continue;
      if (!sameNode(a.node, b.node)) {
        mismatches.push({
          test: tc.name,
          type: 'node_mismatch',
          fen,
          fenHashV3: a.fenHash,
          fenHashV4: b.fenHash
        });
      }
    }
  }

  const report = {
    ok: mismatches.length === 0,
    v3Dir: args.v3Dir,
    v4Dir: args.v4Dir,
    checkedPositions: checked,
    tests: TEST_LINES.map((t) => t.name),
    mismatches
  };

  console.log(JSON.stringify(report, null, 2));
  if (mismatches.length > 0) process.exit(1);
}

try {
  main();
} catch (err) {
  console.error('[qa-openingdb-v4-sub] failed:', err.message);
  process.exit(1);
}
