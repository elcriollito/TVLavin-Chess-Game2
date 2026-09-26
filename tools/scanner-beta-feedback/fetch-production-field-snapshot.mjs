import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const url = String(process.env.SUPABASE_URL || args.url || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SECRET_KEY || '';
const cutoff = args.cutoff;
const scopeHash = String(args['scope-hash'] || '').toUpperCase();
const output = args.write;

if (!url || !key || !cutoff || !scopeHash || !output) {
  throw new Error('Usage: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node fetch-production-field-snapshot.mjs --cutoff=<ISO> --scope-hash=<12 hex> --write=<path>');
}

function hashScope(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12).toUpperCase();
}

const TABLE_ORDER = Object.freeze({
  scanner_beta_scans: 'scan_id.asc',
  scanner_beta_feedback: 'feedback_id.asc',
  scanner_beta_scan_failures: 'feedback_id.asc',
  scanner_beta_square_predictions: 'scan_id.asc,square.asc',
  scanner_beta_square_corrections: 'feedback_id.asc,square.asc'
});

async function fetchPage(table, offset) {
  const endpoint = new URL(`${url}/rest/v1/${table}`);
  endpoint.searchParams.set('select', '*');
  endpoint.searchParams.set('limit', '1000');
  endpoint.searchParams.set('offset', String(offset));
  endpoint.searchParams.set('order', TABLE_ORDER[table]);
  const response = await fetch(endpoint, {
    headers: { apikey: key, 'User-Agent': 'caissa-scanner-certifier/1.0' }
  });
  if (!response.ok) throw new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchAll(table) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await fetchPage(table, offset);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const [allScans, allFeedback, allFailures, allPredictions, allCorrections] = await Promise.all([
  fetchAll('scanner_beta_scans'),
  fetchAll('scanner_beta_feedback'),
  fetchAll('scanner_beta_scan_failures'),
  fetchAll('scanner_beta_square_predictions'),
  fetchAll('scanner_beta_square_corrections')
]);

const beforeCutoff = (row) => Date.parse(row.submitted_at) <= Date.parse(cutoff);
const scopedOwnerIds = new Set([...allScans, ...allFeedback, ...allFailures]
  .filter(beforeCutoff)
  .map((row) => row.user_id)
  .filter((userId) => userId && hashScope(userId) === scopeHash));
if (scopedOwnerIds.size !== 1) throw new Error(`ACCOUNT_SCOPE_MATCH_COUNT_${scopedOwnerIds.size}`);
const [ownerId] = scopedOwnerIds;
const owned = (row) => row.user_id === ownerId && beforeCutoff(row);

const scans = allScans.filter(owned);
const feedback = allFeedback.filter(owned);
const failures = allFailures.filter(owned);
const scanIds = new Set(scans.map((row) => row.scan_id));
const feedbackIds = new Set(feedback.map((row) => row.feedback_id));

function sanitizeRow(row) {
  const { user_id: _userId, image_storage_reference: _imageStorageReference, ...safe } = row;
  return safe;
}

const snapshot = {
  schemaVersion: 'caissa-scanner-beta-field-source-snapshot/1',
  cutoff,
  accountScope: {
    rule: 'single production account whose canonical activity totals match the Alexander-owned beta milestone; QA, test, automated, anonymous, and unowned rows excluded',
    scopeHash
  },
  scans: scans.map(sanitizeRow),
  feedback: feedback.map(sanitizeRow),
  failures: failures.map(sanitizeRow),
  squarePredictions: allPredictions.filter((row) => scanIds.has(row.scan_id)),
  squareCorrections: allCorrections.filter((row) => feedbackIds.has(row.feedback_id))
};

await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
console.log(JSON.stringify({
  cutoff,
  scopeHash,
  scans: snapshot.scans.length,
  feedback: snapshot.feedback.length,
  failures: snapshot.failures.length,
  squarePredictions: snapshot.squarePredictions.length,
  squareCorrections: snapshot.squareCorrections.length,
  sourceImagesWritten: false
}));
