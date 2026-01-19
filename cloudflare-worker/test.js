#!/usr/bin/env node

/**
 * Simple test script for Worker API
 * Run after deployment to verify endpoints
 */

const WORKER_URL = process.env.WORKER_URL || 'https://caissa-game-fetcher.YOUR-SUBDOMAIN.workers.dev';

async function test(name, fn) {
  process.stdout.write(`${name}... `);
  try {
    await fn();
    console.log('✅ PASS');
    return true;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
    return false;
  }
}

async function testHealthCheck() {
  const response = await fetch(`${WORKER_URL}/api/health`);
  if (!response.ok) throw new Error(`Status ${response.status}`);

  const data = await response.json();
  if (!data.ok) throw new Error('Health check returned ok: false');
}

async function testChessComFetch() {
  const url = `${WORKER_URL}/api/games?platform=chesscom&username=Hikaru&max=5&tc=blitz`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Status ${response.status}`);
  }

  const data = await response.json();
  if (!data.pgn) throw new Error('No PGN returned');
  if (data.count < 1) throw new Error('No games returned');
  if (data.source !== 'chess.com') throw new Error('Wrong source');
}

async function testLichessFetch() {
  const url = `${WORKER_URL}/api/games?platform=lichess&username=DrNykterstein&max=5&tc=rapid`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Status ${response.status}`);
  }

  const data = await response.json();
  if (!data.pgn) throw new Error('No PGN returned');
  if (data.count < 1) throw new Error('No games returned');
  if (data.source !== 'lichess.org') throw new Error('Wrong source');
}

async function testInvalidUsername() {
  const url = `${WORKER_URL}/api/games?platform=chesscom&username=InvalidUser12345XYZ`;
  const response = await fetch(url);

  if (response.ok) throw new Error('Should return error for invalid user');
  if (response.status !== 500) throw new Error(`Expected 500, got ${response.status}`);
}

async function testMissingUsername() {
  const url = `${WORKER_URL}/api/games?platform=chesscom`;
  const response = await fetch(url);

  if (response.ok) throw new Error('Should return error for missing username');
  if (response.status !== 400) throw new Error(`Expected 400, got ${response.status}`);
}

async function testCORS() {
  const response = await fetch(`${WORKER_URL}/api/health`, {
    headers: {
      'Origin': 'https://caissa-chess.org'
    }
  });

  const corsHeader = response.headers.get('Access-Control-Allow-Origin');
  if (!corsHeader) throw new Error('Missing CORS header');
  if (!corsHeader.includes('caissa-chess.org')) throw new Error('Wrong CORS origin');
}

async function runTests() {
  console.log('\n🧪 CAISSA Worker API Tests\n');
  console.log(`Testing: ${WORKER_URL}\n`);

  const results = [];

  results.push(await test('Health Check', testHealthCheck));
  results.push(await test('Chess.com Fetch', testChessComFetch));
  results.push(await test('Lichess Fetch', testLichessFetch));
  results.push(await test('Invalid Username', testInvalidUsername));
  results.push(await test('Missing Username', testMissingUsername));
  results.push(await test('CORS Headers', testCORS));

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} passed\n`);

  if (passed === total) {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  }
}

// Check if WORKER_URL is set
if (WORKER_URL.includes('YOUR-SUBDOMAIN')) {
  console.error('\n❌ Error: Please set WORKER_URL environment variable\n');
  console.error('Example:');
  console.error('  export WORKER_URL="https://caissa-game-fetcher.your-subdomain.workers.dev"');
  console.error('  node test.js\n');
  process.exit(1);
}

runTests().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
