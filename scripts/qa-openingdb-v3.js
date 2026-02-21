#!/usr/bin/env node
import crypto from 'crypto';
import { Chess } from 'chess.js';

const DEFAULT_BASE = 'https://www.caissa-chess.org';
const DEFAULT_MANIFEST_PATH = '/openingdb/manifest.json';
const DEFAULT_SHARDS_BASE_PATH = '/openingdb/shards/v3';

const TEST_CASES = [
  { name: 'Sicilian 1.e4 c5', line: 'e4 c5', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'French 1.e4 e6', line: 'e4 e6', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'Caro-Kann 1.e4 c6', line: 'e4 c6', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'Open Game 1.e4 e5', line: 'e4 e5', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'London 1.d4 d5 2.Bf4', line: 'd4 d5 Bf4', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'QGD 1.d4 d5 2.c4 e6', line: 'd4 d5 c4 e6', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'KID 1.d4 Nf6 2.c4 g6', line: 'd4 Nf6 c4 g6', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'English 1.c4', line: 'c4', expectFound: true, minGames: 1, minCandidates: 1 },
  { name: 'Nimzo-ish 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4', line: 'd4 Nf6 c4 e6 Nc3 Bb4', expectFound: true, minGames: 1, minCandidates: 1 }
];

function parseArgs(argv) {
  const args = {
    base: DEFAULT_BASE,
    manifestPath: DEFAULT_MANIFEST_PATH,
    shardsBasePath: DEFAULT_SHARDS_BASE_PATH,
    verbose: false,
    casesFilter: ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') {
      args.base = String(argv[i + 1] || args.base).trim();
      i += 1;
    } else if (token === '--manifest') {
      args.manifestPath = String(argv[i + 1] || args.manifestPath).trim();
      i += 1;
    } else if (token === '--shardsBase') {
      args.shardsBasePath = String(argv[i + 1] || args.shardsBasePath).trim();
      i += 1;
    } else if (token === '--verbose') {
      args.verbose = true;
    } else if (token === '--cases') {
      args.casesFilter = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }

  return args;
}

function absoluteUrl(base, pathOrUrl) {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedBase = String(base || '').replace(/\/+$/, '');
  const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
  return `${normalizedBase}${normalizedPath}`;
}

function normalizeFenForHash(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return String(fen || '').trim();
  return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
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

function hashFen(fenKey) {
  const normalized = normalizeFenForHash(fenKey);
  return crypto.createHash('sha1').update(normalized, 'utf8').digest('hex').slice(0, 16).toLowerCase();
}

function buildFenLookupVariants(fen) {
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
    const k = String(v.key || '').trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function shorten(text, max = 60) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

async function fetchJson(url) {
  const started = Date.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  const json = await res.json();
  return { json, ms: Date.now() - started };
}

function parseSanLine(line) {
  return String(line || '').trim().split(/\s+/).filter(Boolean);
}

function playLine(line) {
  const chess = new Chess();
  const moves = parseSanLine(line);
  for (const san of moves) {
    let move = null;
    try {
      move = chess.move(san, { sloppy: true });
    } catch (_err) {
      move = chess.move(san);
    }
    if (!move) throw new Error(`Illegal SAN "${san}" in line "${line}"`);
  }
  return chess;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestUrl = absoluteUrl(args.base, args.manifestPath);
  const shardCache = new Map();
  const timings = { manifestMs: 0, shardFetchMs: 0 };

  const manifestResponse = await fetchJson(manifestUrl);
  timings.manifestMs = manifestResponse.ms;
  const manifest = manifestResponse.json || {};

  const activeVersion = String(manifest.activeVersion || 'v3');
  const resolvedShardsBase = args.shardsBasePath
    ? absoluteUrl(args.base, args.shardsBasePath)
    : absoluteUrl(args.base, `/openingdb/shards/${activeVersion}`);
  const manifestBase = String(manifest.baseUrl || '');
  const manifestShardsBase = /^https?:\/\//i.test(manifestBase)
    ? manifestBase
    : absoluteUrl(args.base, manifestBase || `/openingdb/shards/${activeVersion}`);

  const effectiveShardsBase = resolvedShardsBase || manifestShardsBase;

  const filterTerms = args.casesFilter
    ? args.casesFilter.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const selectedCases = TEST_CASES.filter((testCase) => {
    if (filterTerms.length === 0) return true;
    const hay = `${testCase.name} ${testCase.line}`.toLowerCase();
    return filterTerms.some((term) => hay.includes(term));
  });

  if (selectedCases.length === 0) {
    console.error('[qa-openingdb-v3] No test cases selected.');
    process.exit(1);
  }

  const failures = [];
  for (const testCase of selectedCases) {
    const chess = playLine(testCase.line);
    const fen = chess.fen();
    const variants = buildFenLookupVariants(fen);
    const attempts = [];
    let matched = null;

    for (const variant of variants) {
      const fenHash = hashFen(variant.key);
      const shardId = fenHash.slice(0, 2);
      const shardUrl = `${effectiveShardsBase.replace(/\/+$/, '')}/${shardId}.json`;
      let shardData = shardCache.get(shardId);
      let shardFetchMs = 0;
      if (!shardData) {
        const shardResponse = await fetchJson(shardUrl);
        shardData = shardResponse.json || {};
        shardFetchMs = shardResponse.ms;
        timings.shardFetchMs += shardFetchMs;
        shardCache.set(shardId, shardData);
      }

      const node = shardData && typeof shardData === 'object' ? shardData[fenHash] : null;
      const candidates = Array.isArray(node?.moves) ? node.moves : [];
      const totalGames = candidates.reduce((sum, row) => sum + (Number(row?.games) || 0), 0);
      attempts.push({
        level: variant.level,
        fenHash,
        shardId,
        shardUrl,
        found: !!node,
        candidates: candidates.length,
        totalGames,
        shardEntries: shardData && typeof shardData === 'object' ? Object.keys(shardData).length : 0,
        shardFetchMs
      });

      if (node) {
        matched = attempts[attempts.length - 1];
        break;
      }
    }

    const expectFound = testCase.expectFound !== false;
    const minGames = Number(testCase.minGames || 0);
    const minCandidates = Number(testCase.minCandidates || 0);

    const found = !!matched;
    const totalGames = matched ? matched.totalGames : 0;
    const candidates = matched ? matched.candidates : 0;

    const pass = (expectFound ? found : !found)
      && (!expectFound || totalGames >= minGames)
      && (!expectFound || candidates >= minCandidates);

    if (pass) {
      console.log(`[PASS] ${testCase.name} | matchLevel=${matched?.level || 'none'} | totalGames=${totalGames} | candidates=${candidates}`);
      if (args.verbose && matched) {
        console.log(`       shard=${matched.shardId} entries=${matched.shardEntries} shardMs=${matched.shardFetchMs}`);
      }
      continue;
    }

    const failLine = `[FAIL] ${testCase.name} | found=${found} | totalGames=${totalGames} | candidates=${candidates}`;
    console.error(failLine);
    const attemptSummary = attempts.map((a) => `${a.level}:${a.found ? 'hit' : 'miss'}:${a.shardId}`).join(', ');
    console.error(`       attempts=${attemptSummary}`);
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt) {
      console.error(`       shardUrl=${lastAttempt.shardUrl}`);
      console.error(`       fenKey=${shorten(variants[attempts.length - 1]?.key || '')}`);
    }
    failures.push(failLine);
  }

  console.log(`[INFO] manifest=${manifestUrl} activeVersion=${activeVersion} shardsBase=${effectiveShardsBase}`);
  if (args.verbose) {
    console.log(`[INFO] timing manifestMs=${timings.manifestMs} shardFetchMsTotal=${timings.shardFetchMs} shardCacheSize=${shardCache.size}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('[qa-openingdb-v3] fatal', error?.message || error);
  process.exit(1);
});

