#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Chess } from 'chess.js';

const DEFAULT_OUT = path.resolve('public/data/eco/eco_position_map.json');
const ECO_CODES_PATH = path.resolve('public/data/eco/eco_codes.json');
const ECO_DETAILS_PATH = path.resolve('public/data/eco/eco_details.json');
const KNOWN_LINES_PATH = path.resolve('data/eco/known-lines.json');

function normalizeFenForHash(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  if (parts.length < 4) return String(fen || '').trim();
  return `${parts[0]} ${parts[1] || 'w'} ${parts[2] || '-'} ${parts[3] || '-'}`;
}

function fnv1a64(input) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const data = Buffer.from(String(input || ''), 'utf8');
  for (let i = 0; i < data.length; i += 1) {
    hash ^= BigInt(data[i]);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function hashFen(fen) {
  return fnv1a64(normalizeFenForHash(fen));
}

function parseMoves(moveText) {
  let txt = String(moveText || '');
  txt = txt.replace(/\r/g, '\n');
  txt = txt.replace(/\{[^}]*\}/g, ' ');
  txt = txt.replace(/;[^\n]*/g, ' ');
  txt = txt.replace(/\$\d+/g, ' ');

  let prev = '';
  while (prev !== txt) {
    prev = txt;
    txt = txt.replace(/\([^()]*\)/g, ' ');
  }

  const tokens = txt.split(/\s+/).filter(Boolean);
  const out = [];
  for (const token of tokens) {
    if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') continue;
    if (/^\d+\.(\.\.)?$/.test(token) || token === '...') continue;

    const san = token
      .replace(/^\d+\.(\.\.)?/, '')
      .replace(/^\.\.\./, '')
      .replace(/[!?+#]+$/g, '')
      .trim();
    if (!san) continue;
    out.push(san);
  }

  return out;
}

function shouldReplace(current, next) {
  if (!current) return true;
  if ((next.depth || 0) > (current.depth || 0)) return true;
  if ((next.depth || 0) < (current.depth || 0)) return false;

  const curName = String(current.name || '');
  const nxtName = String(next.name || '');
  const curGeneric = /Queen's Pawn Game|King's Pawn Game|Opening$/i.test(curName);
  const nxtGeneric = /Queen's Pawn Game|King's Pawn Game|Opening$/i.test(nxtName);

  if (curGeneric && !nxtGeneric) return true;
  if (!curGeneric && nxtGeneric) return false;

  return nxtName.length > curName.length;
}

function addLine(map, line, source) {
  const eco = String(line?.eco || '').trim().toUpperCase();
  const name = String(line?.name || '').trim();
  const moves = parseMoves(line?.moves || '');

  if (!moves.length || !name) return 0;

  const chess = new Chess();
  let count = 0;

  for (let i = 0; i < moves.length; i += 1) {
    const san = moves[i];
    let r = null;
    try {
      r = chess.move(san, { sloppy: true });
    } catch {
      break;
    }
    if (!r) break;

    const hash = hashFen(chess.fen());
    const payload = {
      eco,
      name,
      depth: i + 1,
      source
    };

    const current = map.get(hash);
    if (shouldReplace(current, payload)) {
      map.set(hash, payload);
    }
    count += 1;
  }

  return count;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, filePath);
}

function main() {
  const outPath = process.argv.includes('--out')
    ? path.resolve(process.argv[process.argv.indexOf('--out') + 1] || DEFAULT_OUT)
    : DEFAULT_OUT;

  const ecoCodes = fs.existsSync(ECO_CODES_PATH)
    ? JSON.parse(fs.readFileSync(ECO_CODES_PATH, 'utf8'))
    : [];
  const ecoDetails = fs.existsSync(ECO_DETAILS_PATH)
    ? JSON.parse(fs.readFileSync(ECO_DETAILS_PATH, 'utf8'))
    : [];
  const knownLines = fs.existsSync(KNOWN_LINES_PATH)
    ? JSON.parse(fs.readFileSync(KNOWN_LINES_PATH, 'utf8'))
    : [];

  const map = new Map();
  let mappedPositions = 0;

  for (const row of ecoCodes) {
    mappedPositions += addLine(map, { eco: row?.code, name: row?.name, moves: row?.moves }, 'eco_codes');
  }

  for (const row of ecoDetails) {
    mappedPositions += addLine(map, { eco: row?.code, name: row?.name, moves: row?.moves }, 'eco_details');
  }

  for (const row of knownLines) {
    mappedPositions += addLine(map, row, 'known_lines');
  }

  const entries = {};
  for (const [hash, row] of map.entries()) {
    entries[hash] = {
      eco: row.eco || '',
      name: row.name || '',
      depth: row.depth || 0,
      source: row.source || ''
    };
  }

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      hashing: 'fnv1a64(normalized-fen[placement turn castling ep])',
      totalEntries: Object.keys(entries).length,
      mappedPositions,
      sources: {
        ecoCodes: ecoCodes.length,
        ecoDetails: ecoDetails.length,
        knownLines: knownLines.length
      }
    },
    entries
  };

  writeJsonAtomic(outPath, payload);

  console.log(JSON.stringify({
    ok: true,
    outPath,
    totalEntries: payload.meta.totalEntries,
    mappedPositions: payload.meta.mappedPositions,
    sources: payload.meta.sources
  }, null, 2));
}

main();
