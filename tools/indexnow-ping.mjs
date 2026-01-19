#!/usr/bin/env node

/**
 * IndexNow Ping Script
 *
 * Pings IndexNow (Bing) to notify about URL updates.
 * Run this after deployments to speed up indexing.
 *
 * Usage:
 *   node tools/indexnow-ping.mjs
 *   npm run indexnow-ping
 */

const INDEXNOW_CONFIG = {
  key: 'caissa-indexnow-2026',
  keyLocation: 'https://www.caissa-chess.org/caissa-indexnow-2026.txt',
  host: 'www.caissa-chess.org',
  endpoint: 'https://api.indexnow.org/indexnow',
  urls: [
    'https://www.caissa-chess.org/'
  ]
};

async function pingIndexNow() {
  console.log('🔔 IndexNow Ping Starting...');
  console.log(`   Host: ${INDEXNOW_CONFIG.host}`);
  console.log(`   URLs: ${INDEXNOW_CONFIG.urls.length}`);
  console.log('');

  const payload = {
    host: INDEXNOW_CONFIG.host,
    key: INDEXNOW_CONFIG.key,
    keyLocation: INDEXNOW_CONFIG.keyLocation,
    urlList: INDEXNOW_CONFIG.urls
  };

  try {
    const response = await fetch(INDEXNOW_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log('✅ IndexNow ping successful!');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log('');
      console.log('📝 Note: IndexNow accepts the request but does not guarantee immediate indexing.');
      console.log('   Bing and other search engines will process it on their schedule.');
      return true;
    } else {
      const text = await response.text();
      console.error('❌ IndexNow ping failed');
      console.error(`   Status: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${text}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error pinging IndexNow:');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('💡 This is optional and does not affect your deployment.');
    console.error('   Search engines will still discover changes naturally.');
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  pingIndexNow()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { pingIndexNow };
