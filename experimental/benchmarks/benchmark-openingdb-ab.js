#!/usr/bin/env node
import { Chess } from 'chess.js';

const SHARD_BASE = 'https://downloads.caissa-chess.org/openingdb/shards/v3_p60';
const NODE_API_BASE = 'https://caissa-vault-downloads-canary.tvlavingames.workers.dev';
const NODE_API_VERSION = 'v4_sub';
const LRU_MAX = 2;

const TEST_LINES = [
  { name: 'Ruy Lopez', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 a5 Bc2 b4 d4' },
  { name: 'QGD', line: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4' },
  { name: 'Najdorf', line: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5 g5 b4' },
  { name: 'Spanish deep', line: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7 c4 c6 cxb5 axb5 Nc3 Bb7' }
];

function normalizeFenForHash(fen) {
  const p = String(fen || '').trim().split(/\s+/);
  if (p.length < 4) return String(fen || '').trim();
  return `${p[0]} ${p[1] || 'w'} ${p[2] || '-'} ${p[3] || '-'}`;
}

function splitFenParts(fen) {
  const p = String(fen || '').trim().split(/\s+/);
  return { board: p[0] || '', turn: p[1] || 'w', castling: p[2] || '-', ep: p[3] || '-' };
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

function sha1Hex(input) {
  function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
  function toHex(i) { return (`00000000${(i >>> 0).toString(16)}`).slice(-8); }
  const msg = unescape(encodeURIComponent(String(input || '')));
  const words = [];
  for (let i = 0; i < msg.length; i += 1) words[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
  words[msg.length >> 2] |= 0x80 << (24 - (msg.length % 4) * 8);
  words[(((msg.length + 8) >> 6) + 1) * 16 - 1] = msg.length * 8;
  let h0 = 0x67452301; let h1 = 0xefcdab89; let h2 = 0x98badcfe; let h3 = 0x10325476; let h4 = 0xc3d2e1f0;
  for (let i = 0; i < words.length; i += 16) {
    const w = [];
    for (let j = 0; j < 16; j += 1) w[j] = words[i + j] | 0;
    for (let j = 16; j < 80; j += 1) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
    for (let j = 0; j < 80; j += 1) {
      let f = 0; let k = 0;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + (w[j] | 0)) | 0;
      e = d; d = c; c = rotl(b, 30) | 0; b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return (toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4)).toLowerCase();
}

function hashFen(key) {
  return sha1Hex(normalizeFenForHash(key)).slice(0, 16).toLowerCase();
}

function positionsFromLine(line) {
  const c = new Chess();
  const sans = String(line || '').trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const san of sans) {
    const mv = c.move(san, { sloppy: true });
    if (!mv) break;
    const ply = c.history().length;
    if (ply >= 8 && ply <= 40 && ply % 2 === 0) out.push({ ply, fen: c.fen() });
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

class LruCache {
  constructor(limit) { this.limit = limit; this.map = new Map(); }
  get(k) {
    if (!this.map.has(k)) return null;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
}

async function lookupViaShardFlow(fen, cache) {
  const t0 = Date.now();
  let bytes = 0;
  let fetchMs = 0;
  let parseMs = 0;
  let shardMisses = 0;

  const variants = buildVariants(fen);
  for (const variant of variants) {
    const fenHash = hashFen(variant.key);
    const shard = fenHash.slice(0, 2);
    let shardJson = cache.get(shard);

    if (!shardJson) {
      shardMisses += 1;
      const url = `${SHARD_BASE}/${shard}.json`;
      const f0 = Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      fetchMs += Date.now() - f0;
      bytes += Buffer.byteLength(text, 'utf8');
      const p0 = Date.now();
      shardJson = JSON.parse(text);
      parseMs += Date.now() - p0;
      cache.set(shard, shardJson);
    }

    const entry = shardJson?.[fenHash] || null;
    if (entry && typeof entry === 'object') {
      return { ok: true, matchLevel: variant.level, totalMs: Date.now() - t0, fetchMs, parseMs, bytes, shardMisses };
    }
  }
  return { ok: false, matchLevel: 'none', totalMs: Date.now() - t0, fetchMs, parseMs, bytes, shardMisses };
}

async function lookupViaNodeApi(fen) {
  const u = new URL(`${NODE_API_BASE}/openingdb/node`);
  u.searchParams.set('fen', fen);
  u.searchParams.set('version', NODE_API_VERSION);
  const t0 = Date.now();
  const res = await fetch(u.toString(), { cache: 'no-store' });
  const text = await res.text();
  const totalMs = Date.now() - t0;
  const bytes = Buffer.byteLength(text, 'utf8');
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  return {
    ok: res.status === 200,
    status: res.status,
    matchLevel: payload?.matchLevel || (res.status === 404 ? 'none' : 'unknown'),
    totalMs,
    bytes,
    cache: (res.headers.get('x-caissa-node-cache') || '').toLowerCase() || 'unknown'
  };
}

async function run() {
  const probes = [];
  for (const tc of TEST_LINES) {
    for (const p of positionsFromLine(tc.line).slice(0, 8)) {
      probes.push({ test: tc.name, ply: p.ply, fen: p.fen });
    }
  }

  const shardCache = new LruCache(LRU_MAX);
  const a = [];
  const b = [];

  for (const probe of probes) {
    const ra = await lookupViaShardFlow(probe.fen, shardCache);
    const rb = await lookupViaNodeApi(probe.fen);
    a.push({ ...probe, ...ra });
    b.push({ ...probe, ...rb });
  }

  const aMs = a.map((x) => x.totalMs);
  const bMs = b.map((x) => x.totalMs);

  const report = {
    probes: probes.length,
    flowA_clientShards_v3p60: {
      avgMs: Number((aMs.reduce((s, v) => s + v, 0) / aMs.length).toFixed(2)),
      p95Ms: percentile(aMs, 95),
      p99Ms: percentile(aMs, 99),
      bytesTotal: a.reduce((s, x) => s + (x.bytes || 0), 0),
      avgBytesPerLookup: Math.round(a.reduce((s, x) => s + (x.bytes || 0), 0) / a.length),
      avgFetchMs: Number((a.reduce((s, x) => s + (x.fetchMs || 0), 0) / a.length).toFixed(2)),
      avgParseMs: Number((a.reduce((s, x) => s + (x.parseMs || 0), 0) / a.length).toFixed(2)),
      matchLevels: a.reduce((acc, x) => { acc[x.matchLevel] = (acc[x.matchLevel] || 0) + 1; return acc; }, {}),
      shardMisses: a.reduce((s, x) => s + (x.shardMisses || 0), 0)
    },
    flowB_nodeApi_v4sub: {
      avgMs: Number((bMs.reduce((s, v) => s + v, 0) / bMs.length).toFixed(2)),
      p95Ms: percentile(bMs, 95),
      p99Ms: percentile(bMs, 99),
      bytesTotal: b.reduce((s, x) => s + (x.bytes || 0), 0),
      avgBytesPerLookup: Math.round(b.reduce((s, x) => s + (x.bytes || 0), 0) / b.length),
      statusCounts: b.reduce((acc, x) => { const k = String(x.status); acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
      matchLevels: b.reduce((acc, x) => { acc[x.matchLevel] = (acc[x.matchLevel] || 0) + 1; return acc; }, {}),
      cacheCounts: b.reduce((acc, x) => { acc[x.cache] = (acc[x.cache] || 0) + 1; return acc; }, {})
    },
    improvement: {
      avgMsReductionPct: Number((((1 - ((bMs.reduce((s, v) => s + v, 0) / bMs.length) / (aMs.reduce((s, v) => s + v, 0) / aMs.length))) * 100)).toFixed(2)),
      avgBytesReductionPct: Number((((1 - ((b.reduce((s, x) => s + (x.bytes || 0), 0) / b.length) / (a.reduce((s, x) => s + (x.bytes || 0), 0) / a.length))) * 100)).toFixed(2))
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error('[benchmark-openingdb-ab] failed:', err.message);
  process.exit(1);
});
