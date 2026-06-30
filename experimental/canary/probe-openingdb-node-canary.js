#!/usr/bin/env node
import { Chess } from 'chess.js';

const DEFAULT_ENDPOINT = 'https://caissa-vault-downloads-canary.tvlavingames.workers.dev/openingdb/node';
const DEFAULT_VERSION = 'v4_sub';

const TEST_LINES = [
  { name: 'Ruy Lopez', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3' },
  { name: 'QGD', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6' },
  { name: 'Najdorf', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O' },
  { name: 'Deep QGD > ply20', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4' }
];

function parseArgs(argv) {
  const args = {
    endpoint: DEFAULT_ENDPOINT,
    version: DEFAULT_VERSION,
    rounds: 3
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--endpoint') {
      args.endpoint = String(argv[i + 1] || args.endpoint);
      i += 1;
    } else if (t === '--version') {
      args.version = String(argv[i + 1] || args.version);
      i += 1;
    } else if (t === '--rounds') {
      const n = Number.parseInt(String(argv[i + 1] || ''), 10);
      if (Number.isFinite(n) && n >= 1) args.rounds = n;
      i += 1;
    }
  }
  return args;
}

function positionsFromLine(line) {
  const c = new Chess();
  const sans = String(line || '').trim().split(/\s+/).filter(Boolean);
  const out = [{ ply: 0, fen: c.fen() }];
  for (const san of sans) {
    const mv = c.move(san, { sloppy: true });
    if (!mv) break;
    out.push({ ply: c.history().length, fen: c.fen() });
  }
  return out;
}

function mutateFenEp(fen) {
  const p = String(fen).split(/\s+/);
  if (p.length < 4) return fen;
  p[3] = 'a3';
  return `${p[0]} ${p[1]} ${p[2]} ${p[3]}${p.length > 4 ? ` ${p.slice(4).join(' ')}` : ''}`;
}

function mutateFenCastling(fen) {
  const p = String(fen).split(/\s+/);
  if (p.length < 4) return fen;
  if (p[2] && p[2] !== '-') {
    p[2] = p[2] === 'KQkq' ? 'KQ' : 'KQkq';
  } else {
    p[2] = 'KQkq';
  }
  return `${p[0]} ${p[1]} ${p[2]} ${p[3]}${p.length > 4 ? ` ${p.slice(4).join(' ')}` : ''}`;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function callNode(endpoint, fen, version) {
  const u = new URL(endpoint);
  u.searchParams.set('fen', fen);
  u.searchParams.set('version', version);
  const t0 = Date.now();
  const res = await fetch(u.toString(), { method: 'GET' });
  const elapsedMs = Date.now() - t0;
  const text = await res.text();
  const bytes = Buffer.byteLength(text, 'utf8');
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  return {
    status: res.status,
    elapsedMs,
    bytes,
    cache: (res.headers.get('x-caissa-node-cache') || '').toLowerCase() || 'unknown',
    matchLevel: json?.matchLevel || null,
    moveCount: Array.isArray(json?.moves) ? json.moves.length : 0,
    error: json?.error || null,
    body: json
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const probes = [];
  for (const tc of TEST_LINES) {
    const fens = positionsFromLine(tc.line);
    const sample = fens.filter((p) => p.ply >= 8 && p.ply % 4 === 0).slice(-3);
    for (const s of sample) {
      probes.push({ type: 'exact', test: tc.name, ply: s.ply, fen: s.fen });
    }
  }

  const deepNajdorf = positionsFromLine(TEST_LINES[2].line).slice(-1)[0];
  probes.push({ type: 'fallback_no_ep', test: 'Fallback no_ep', ply: deepNajdorf.ply, fen: mutateFenEp(deepNajdorf.fen) });
  probes.push({
    type: 'fallback_no_castling',
    test: 'Fallback no_castling',
    ply: 2,
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w Qq - 0 2'
  });
  probes.push({ type: 'not_found', test: 'node_not_found', ply: 0, fen: '8/8/8/8/8/8/8/8 w - - 0 1' });

  const all = [];
  for (let round = 1; round <= args.rounds; round += 1) {
    for (const probe of probes) {
      const r = await callNode(args.endpoint, probe.fen, args.version);
      all.push({ round, ...probe, ...r });
    }
  }

  const ok200 = all.filter((x) => x.status === 200);
  const sortedAll = all.map((x) => x.elapsedMs).sort((a, b) => a - b);
  const sorted200 = ok200.map((x) => x.elapsedMs).sort((a, b) => a - b);

  const warm = all.filter((x) => x.round >= 2);
  const warmHits = warm.filter((x) => x.cache === 'hit').length;

  const report = {
    endpoint: args.endpoint,
    version: args.version,
    probesPerRound: probes.length,
    rounds: args.rounds,
    totals: {
      requests: all.length,
      status200: all.filter((x) => x.status === 200).length,
      status404: all.filter((x) => x.status === 404).length
    },
    latencyMs: {
      avgAll: Number(avg(all.map((x) => x.elapsedMs)).toFixed(2)),
      avg200: Number(avg(ok200.map((x) => x.elapsedMs)).toFixed(2)),
      p95All: percentile(sortedAll, 95),
      p99All: percentile(sortedAll, 99),
      p95_200: percentile(sorted200, 95),
      p99_200: percentile(sorted200, 99)
    },
    responseBytes: {
      avgAll: Number(avg(all.map((x) => x.bytes)).toFixed(2)),
      avg200: Number(avg(ok200.map((x) => x.bytes)).toFixed(2)),
      p95: percentile(all.map((x) => x.bytes).sort((a, b) => a - b), 95)
    },
    cache: {
      headerCounts: all.reduce((acc, x) => {
        acc[x.cache] = (acc[x.cache] || 0) + 1;
        return acc;
      }, {}),
      warmHitRate: warm.length ? Number((warmHits / warm.length).toFixed(4)) : 0
    },
    matchLevels: ok200.reduce((acc, x) => {
      const k = x.matchLevel || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    validations: {
      hasExact: ok200.some((x) => x.matchLevel === 'exact'),
      hasNoEp: ok200.some((x) => x.matchLevel === 'no_ep'),
      hasNoCastling: ok200.some((x) => x.matchLevel === 'no_castling'),
      has404NodeNotFound: all.some((x) => x.status === 404 && x.error === 'node_not_found')
    },
    sample: all.slice(0, 12)
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.validations.hasExact || !report.validations.has404NodeNotFound) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[probe-openingdb-node-canary] failed:', err.message);
  process.exit(1);
});
