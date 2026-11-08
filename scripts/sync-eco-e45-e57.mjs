#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'data/eco/sources/lichess-e45-e57-3ba6b20d.json');
const RANGE = Array.from({ length: 13 }, (_, index) => `E${String(45 + index).padStart(2, '0')}`);
const RANGE_SET = new Set(RANGE);
const QUARANTINED_CODES = RANGE;
const CODES_WITHOUT_HISTORICAL_AGGREGATES = new Set(['E53', 'E55']);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function write(relativePath, contents) {
  const target = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
}

function parseRecord(record) {
  const chess = new Chess();
  chess.loadPgn(record.pgn);
  const moves = chess.history();
  if (moves.length === 0) throw new Error(`${record.eco} has no legal SAN moves`);
  return { ...record, moves, fen: chess.fen() };
}

function representativeByCode(records) {
  const result = new Map();
  for (const record of records) {
    if (!result.has(record.eco)) result.set(record.eco, record);
  }
  for (const code of RANGE) {
    if (!result.has(code)) throw new Error(`Missing verified source record for ${code}`);
  }
  return result;
}

function detectEol(raw) {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

function replaceCatalogRange(raw, block, startMarker, endMarker) {
  const start = raw.indexOf(startMarker);
  const end = raw.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Unable to find catalog range: ${startMarker} -> ${endMarker}`);
  }
  return `${raw.slice(0, start)}${block}${raw.slice(end)}`;
}

function jsonString(value) {
  return JSON.stringify(value).replace(/'/g, '\\u0027');
}

function formatCodeRows(records, eol) {
  return RANGE.map((code) => {
    const row = records.get(code);
    return [
      '    {',
      `        "code":  ${jsonString(code)},`,
      `        "name":  ${jsonString(row.name)},`,
      `        "moves":  ${jsonString(row.pgn)}`,
      '    },'
    ].join(eol);
  }).join(eol) + eol;
}

function formatDetailRows(records, eol) {
  return RANGE.map((code) => {
    const row = records.get(code);
    return [
      '  {',
      `    "code": ${JSON.stringify(code)},`,
      `    "name": ${JSON.stringify(row.name)},`,
      `    "moves": ${JSON.stringify(row.moves.join(' '))},`,
      `    "fen": ${JSON.stringify(row.fen)},`,
      '    "stats": null,',
      '    "continuations": []',
      '  },'
    ].join(eol);
  }).join(eol) + eol;
}

function formatOpeningRows(records, eol) {
  return records.map((row, index) => {
    const moveLines = row.moves.map((move, moveIndex) => (
      `      ${JSON.stringify(move)}${moveIndex === row.moves.length - 1 ? '' : ','}`
    ));
    const trailing = index === records.length - 1 ? '' : ',';
    return [
      '  {',
      `    "eco": ${JSON.stringify(row.eco)},`,
      `    "name": ${JSON.stringify(row.name)},`,
      '    "moves": [',
      ...moveLines,
      '    ]',
      `  }${trailing}`
    ].join(eol);
  }).join(eol);
}

function updateProjectionFiles(records, representatives) {
  const codesRaw = fs.readFileSync(path.join(ROOT, 'data/eco/eco_codes.json'), 'utf8');
  const codesEol = detectEol(codesRaw);
  const codesUpdated = replaceCatalogRange(
    codesRaw,
    formatCodeRows(representatives, codesEol),
    `    {${codesEol}        "code":  "E45"`,
    `    {${codesEol}        "code":  "E60"`
  );
  write('data/eco/eco_codes.json', codesUpdated);
  write('public/data/eco/eco_codes.json', codesUpdated);

  const detailsRaw = fs.readFileSync(path.join(ROOT, 'data/eco/eco_details.json'), 'utf8');
  const detailsEol = detectEol(detailsRaw);
  const detailsUpdated = replaceCatalogRange(
    detailsRaw,
    formatDetailRows(representatives, detailsEol),
    `  {${detailsEol}    "code": "E45"`,
    `  {${detailsEol}    "code": "E60"`
  );
  write('data/eco/eco_details.json', detailsUpdated);
  write('public/data/eco/eco_details.json', detailsUpdated);

  const openingsRaw = fs.readFileSync(path.join(ROOT, 'data/openings.json'), 'utf8');
  const openingsEol = detectEol(openingsRaw);
  const openingsStart = openingsRaw.indexOf(`  {${openingsEol}    "eco": "E45"`);
  const openingsEnd = openingsRaw.lastIndexOf(`${openingsEol}]`);
  if (openingsStart < 0 || openingsEnd < openingsStart) {
    throw new Error('Unable to find E45-E57 opening projection range');
  }
  const openingsUpdated = `${openingsRaw.slice(0, openingsStart)}${formatOpeningRows(records, openingsEol)}${openingsRaw.slice(openingsEnd)}`;
  write('data/openings.json', openingsUpdated);
  write('public/data/openings.json', openingsUpdated);
}

function quarantineContaminatedStats() {
  const stats = readJson('public/data/eco/eco_stats.json');
  const continuations = readJson('public/data/eco/eco_popular_continuations.json');
  const quarantinePath = path.join(ROOT, 'data/eco/audit/eco-e45-e57-quarantine-20261107.json');
  const legacyQuarantinePath = path.join(ROOT, 'data/eco/audit/eco-e54-e57-quarantine-20261107.json');
  const existingPath = fs.existsSync(quarantinePath) ? quarantinePath : legacyQuarantinePath;
  const existing = fs.existsSync(existingPath)
    ? JSON.parse(fs.readFileSync(existingPath, 'utf8'))
    : { codes: {} };
  const quarantine = {
    schemaVersion: 1,
    quarantinedAt: '2026-11-07',
    reason: 'Raw PGN provenance was not retained, so the aggregates cannot be independently verified against real games. E54 and E57 also contain demonstrably unrelated opening lines. Retained for audit only and not served to the ECO page.',
    codes: Object.fromEntries(QUARANTINED_CODES.map((code) => [code, {
      stats: stats[code] || existing.codes?.[code]?.stats || null,
      continuations: continuations[code] || existing.codes?.[code]?.continuations || []
    }]))
  };

  for (const code of QUARANTINED_CODES) {
    if (!CODES_WITHOUT_HISTORICAL_AGGREGATES.has(code)
      && (!quarantine.codes[code].stats || quarantine.codes[code].continuations.length === 0)) {
      throw new Error(`Missing quarantined audit evidence for ${code}`);
    }
  }

  for (const code of QUARANTINED_CODES) {
    delete stats[code];
    delete continuations[code];
  }

  write('data/eco/audit/eco-e45-e57-quarantine-20261107.json', `${JSON.stringify(quarantine, null, 2)}\n`);
  write('public/data/eco/eco_stats.json', `${JSON.stringify(stats, null, 2)}\n`);
  write('public/data/eco/eco_popular_continuations.json', `${JSON.stringify(continuations, null, 2)}\n`);
}

function writeMissingInventory() {
  const codes = readJson('data/eco/eco_codes.json');
  const present = new Set(codes.map((row) => row.code));
  const expected = [];
  for (const letter of 'ABCDE') {
    for (let number = 0; number < 100; number += 1) {
      expected.push(`${letter}${String(number).padStart(2, '0')}`);
    }
  }
  const missing = expected.filter((code) => !present.has(code));
  const outOfScope = missing.filter((code) => !RANGE_SET.has(code));
  const byVolume = Object.fromEntries('ABCDE'.split('').map((letter) => [
    letter,
    outOfScope.filter((code) => code.startsWith(letter))
  ]));
  const lines = [
    '# ECO Catalog Missing-Code Inventory — 2026-11-07',
    '',
    `The repaired catalog contains ${present.size} unique codes. ${outOfScope.length} codes outside E45-E57 remain absent and require separate source validation before addition.`,
    '',
    'This inventory is descriptive only. It does not assert that the current one-row-per-code catalog is otherwise complete or that a missing code can be filled by renaming an existing row.',
    ''
  ];
  for (const letter of 'ABCDE') {
    lines.push(`## ${letter} volume (${byVolume[letter].length})`, '', byVolume[letter].join(', ') || 'None.', '');
  }
  write('docs/eco/ECO_MISSING_CODES_INVENTORY_20261107.md', `${lines.join('\n').trimEnd()}\n`);
}

const source = readJson(path.relative(ROOT, SOURCE_PATH));
if (source.sourceCommit !== '3ba6b20d31b2e6125cb0e6a2e792f400717d9d39') {
  throw new Error('Unexpected Lichess source commit');
}
const records = source.records.map(parseRecord);
const representatives = representativeByCode(records);
updateProjectionFiles(records, representatives);
quarantineContaminatedStats();
writeMissingInventory();

console.log(JSON.stringify({
  ok: true,
  sourceCommit: source.sourceCommit,
  records: records.length,
  codes: RANGE,
  quarantinedCodes: QUARANTINED_CODES
}, null, 2));
