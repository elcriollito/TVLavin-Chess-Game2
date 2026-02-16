#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { Chess } from 'chess.js';

const KNOWN_LINES = path.resolve('data/eco/known-lines.json');
const ECO_POS_MAP = path.resolve('public/data/eco/eco_position_map.json');

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
  const txt = String(moveText || '')
    .replace(/\r/g, '\n')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ');

  return txt
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !(t === '1-0' || t === '0-1' || t === '1/2-1/2' || t === '*' || /^\d+\.(\.\.)?$/.test(t) || t === '...'))
    .map((t) => t.replace(/^\d+\.(\.\.)?/, '').replace(/^\.\.\./, '').replace(/[!?+#]+$/g, '').trim())
    .filter(Boolean);
}

function main() {
  if (!fs.existsSync(KNOWN_LINES)) throw new Error(`Missing ${KNOWN_LINES}`);
  if (!fs.existsSync(ECO_POS_MAP)) throw new Error(`Missing ${ECO_POS_MAP}`);

  const knownLines = JSON.parse(fs.readFileSync(KNOWN_LINES, 'utf8'));
  const map = JSON.parse(fs.readFileSync(ECO_POS_MAP, 'utf8'));
  const entries = map.entries || {};

  const failures = [];

  for (const line of knownLines) {
    const chess = new Chess();
    const moves = parseMoves(line.moves);
    let ok = true;
    for (const san of moves) {
      const r = chess.move(san, { sloppy: true });
      if (!r) {
        failures.push(`Illegal move in known line ${line.name}: ${san}`);
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const hash = hashFen(chess.fen());
    const hit = entries[hash];
    if (!hit) {
      failures.push(`Missing map entry for ${line.name} (${line.eco}) hash=${hash}`);
      continue;
    }

    const expectedName = String(line.name || '').toLowerCase();
    const actualName = String(hit.name || '').toLowerCase();
    if (expectedName && !actualName.includes(expectedName.split(' ')[0])) {
      failures.push(`Name mismatch for ${line.name}: got ${hit.name} (eco ${hit.eco || 'n/a'})`);
    }
  }

  if (failures.length > 0) {
    console.error('[verify-known-lines] FAIL');
    for (const f of failures) console.error('-', f);
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, checked: knownLines.length, mapEntries: Object.keys(entries).length }, null, 2));
}

main();
