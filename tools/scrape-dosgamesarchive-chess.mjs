#!/usr/bin/env node

/**
 * DOS Games Archive Chess Metadata Scraper
 * Generates/updates public/dos/dos_chess_games.json with metadata from dosgamesarchive.com
 *
 * Phase 1 Safe: Metadata + outbound links only (no game binaries)
 *
 * Usage:
 *   node tools/scrape-dosgamesarchive-chess.mjs           # Normal run with caching
 *   node tools/scrape-dosgamesarchive-chess.mjs --force   # Bypass cache, re-fetch all
 *   node tools/scrape-dosgamesarchive-chess.mjs --dry-run # Show diff without writing
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { load as cheerioLoad } from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache', 'dosgamesarchive');
const OUTPUT_FILE = path.join(ROOT_DIR, 'public', 'dos', 'dos_chess_games.json');

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');

// Config
const BASE_URL = 'https://www.dosgamesarchive.com';
const CHESS_LISTING_URL = `${BASE_URL}/related-games/chess`;
const USER_AGENT = 'CAISSA-DOS-Metadata-Bot/1.0 (https://github.com/your-repo; contact@example.com)';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 2500;

// Stats
let stats = {
    fetched: 0,
    cached: 0,
    games: 0,
    errors: 0
};

/**
 * Sleep for random delay (rate limiting)
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
    return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

/**
 * Create cache directory if needed
 */
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log(`Created cache directory: ${CACHE_DIR}`);
    }
}

/**
 * Get cache file path for URL
 */
function getCachePath(url) {
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    return path.join(CACHE_DIR, `${hash}.html`);
}

/**
 * Check if cache is valid
 */
function isCacheValid(cachePath) {
    if (!fs.existsSync(cachePath)) return false;
    if (FORCE) return false;

    const stats = fs.statSync(cachePath);
    const age = Date.now() - stats.mtimeMs;
    return age < CACHE_MAX_AGE_MS;
}

/**
 * Fetch URL with caching
 */
async function fetchURL(url) {
    const cachePath = getCachePath(url);

    if (isCacheValid(cachePath)) {
        console.log(`  [CACHE] ${url}`);
        stats.cached++;
        return fs.readFileSync(cachePath, 'utf8');
    }

    console.log(`  [FETCH] ${url}`);

    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }

                // Save to cache
                fs.writeFileSync(cachePath, data, 'utf8');
                stats.fetched++;
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Parse game listing page and extract game URLs
 */
function parseListingPage(html) {
    const $ = cheerioLoad(html);
    const games = [];

    // Find game entries (adjust selector based on actual HTML structure)
    $('.game-item, .game-entry, article, .chess-game').each((i, elem) => {
        try {
            const $elem = $(elem);

            // Extract game URL (look for links to game pages)
            const link = $elem.find('a').first();
            const href = link.attr('href');

            if (href && (href.includes('/game/') || href.includes('/play/') || href.includes('/download/'))) {
                const gameUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                games.push(gameUrl);
            }
        } catch (err) {
            console.error(`    [ERROR] Parsing game entry:`, err.message);
        }
    });

    // Check for next page link
    const nextLink = $('a.next, a[rel="next"], .pagination a').filter((i, el) => {
        return $(el).text().toLowerCase().includes('next');
    }).attr('href');

    return {
        games,
        nextPageUrl: nextLink ? (nextLink.startsWith('http') ? nextLink : `${BASE_URL}${nextLink}`) : null
    };
}

/**
 * Parse individual game page
 */
function parseGamePage(html, gameUrl) {
    const $ = cheerioLoad(html);

    const game = {
        id: null, // Will be generated from name
        name: 'Unknown Game',
        year: null,
        view: 'Unknown',
        popularity: 50, // Default placeholder
        publisher: null,
        developer: null,
        description: '',
        features: [],
        playUrl: null,
        downloadUrl: null,
        sourceUrl: gameUrl,
        selfHosted: false,
        zipPath: null,
        license: {
            type: 'unknown',
            url: null,
            notes: 'External link only (Phase 1)'
        }
    };

    try {
        // Extract title
        const title = $('h1, .game-title, .title').first().text().trim();
        if (title) game.name = title;

        // Extract year (look for patterns like "1992", "(1995)", etc.)
        const yearMatch = html.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) game.year = parseInt(yearMatch[1]);

        // Extract publisher/developer
        const publisherText = $('td:contains("Publisher"), dt:contains("Publisher")').next().text().trim();
        if (publisherText) game.publisher = publisherText;

        const developerText = $('td:contains("Developer"), dt:contains("Developer")').next().text().trim();
        if (developerText) game.developer = developerText;

        // Extract description
        const desc = $('.description, .game-description, p').first().text().trim();
        if (desc && desc.length > 20 && desc.length < 500) {
            game.description = desc;
        }

        // Extract play URL
        const playLink = $('a[href*="/play"]').first();
        if (playLink.length) {
            const href = playLink.attr('href');
            game.playUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        }

        // Extract download URL
        const downloadLink = $('a[href*="/download"], a:contains("Download")').first();
        if (downloadLink.length) {
            const href = downloadLink.attr('href');
            game.downloadUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        }

        // Infer view type (2D/3D)
        const textContent = $.text().toLowerCase();
        if (textContent.includes('3d') || textContent.includes('three-dimensional')) {
            game.view = '3D';
        } else if (textContent.includes('2d') || textContent.includes('board') || textContent.includes('chess')) {
            game.view = '2D';
        }

        // Extract features/tags
        $('.tag, .feature, .category').each((i, elem) => {
            const feature = $(elem).text().trim();
            if (feature && feature.length < 50) {
                game.features.push(feature);
            }
        });

        // Generate ID from name
        game.id = game.name.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/^-+|-+$/g, '');

    } catch (err) {
        console.error(`    [ERROR] Parsing game page ${gameUrl}:`, err.message);
        stats.errors++;
    }

    return game;
}

/**
 * Merge new data with existing JSON (preserve manual overrides)
 */
function mergeWithExisting(newGames) {
    if (!fs.existsSync(OUTPUT_FILE)) {
        return newGames;
    }

    const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    const existingMap = new Map();

    // Index existing games by multiple keys for matching
    existingData.forEach(game => {
        existingMap.set(game.id, game);
        if (game.playUrl) existingMap.set(game.playUrl, game);
        if (game.downloadUrl) existingMap.set(game.downloadUrl, game);
    });

    const merged = [];

    newGames.forEach(newGame => {
        // Try to find existing entry
        let existing = existingMap.get(newGame.id) ||
                      existingMap.get(newGame.playUrl) ||
                      existingMap.get(newGame.downloadUrl);

        if (existing) {
            // Preserve manual fields (selfHosted, zipPath, license if customized, popularity)
            merged.push({
                ...newGame,
                id: existing.id, // Keep stable ID
                popularity: existing.popularity || newGame.popularity,
                selfHosted: existing.selfHosted || newGame.selfHosted,
                zipPath: existing.zipPath || newGame.zipPath,
                license: existing.license.type !== 'unknown' ? existing.license : newGame.license
            });
        } else {
            merged.push(newGame);
        }
    });

    return merged;
}

/**
 * Validate game data
 */
function validateGames(games) {
    const errors = [];
    const seenIds = new Set();

    games.forEach((game, index) => {
        // Check for duplicate IDs
        if (seenIds.has(game.id)) {
            errors.push(`Duplicate ID: ${game.id}`);
        }
        seenIds.add(game.id);

        // Validate URLs
        if (game.playUrl && !game.playUrl.startsWith('http')) {
            errors.push(`Invalid playUrl for ${game.id}: ${game.playUrl}`);
        }
        if (game.downloadUrl && !game.downloadUrl.startsWith('http')) {
            errors.push(`Invalid downloadUrl for ${game.id}: ${game.downloadUrl}`);
        }

        // Check required fields
        if (!game.name || game.name === 'Unknown Game') {
            errors.push(`Missing name for game at index ${index}`);
        }
    });

    return errors;
}

/**
 * Main scraper function
 */
async function scrapeChessGames() {
    console.log('=== DOS Games Archive Chess Metadata Scraper ===\n');

    ensureCacheDir();

    let allGames = [];
    let currentUrl = CHESS_LISTING_URL;
    let pageNum = 1;

    // Fetch listing pages
    console.log('Step 1: Fetching chess game listings...\n');

    while (currentUrl && pageNum <= 5) { // Safety limit: max 5 pages
        console.log(`Page ${pageNum}: ${currentUrl}`);

        try {
            const html = await fetchURL(currentUrl);
            const { games, nextPageUrl } = parseListingPage(html);

            console.log(`  Found ${games.length} games on page ${pageNum}`);

            allGames.push(...games);
            currentUrl = nextPageUrl;
            pageNum++;

            if (nextPageUrl) {
                await sleep(randomDelay());
            }

        } catch (err) {
            console.error(`  [ERROR] Fetching page ${pageNum}:`, err.message);
            stats.errors++;
            break;
        }
    }

    console.log(`\nTotal game URLs found: ${allGames.length}`);
    console.log(`\nStep 2: Fetching individual game pages...\n`);

    // Fetch individual game pages
    const parsedGames = [];

    for (let i = 0; i < allGames.length; i++) {
        const gameUrl = allGames[i];
        console.log(`[${i + 1}/${allGames.length}] ${gameUrl}`);

        try {
            const html = await fetchURL(gameUrl);
            const game = parseGamePage(html, gameUrl);
            parsedGames.push(game);
            stats.games++;

            // Rate limiting between requests
            if (i < allGames.length - 1) {
                await sleep(randomDelay());
            }

        } catch (err) {
            console.error(`  [ERROR] Fetching game ${gameUrl}:`, err.message);
            stats.errors++;
        }
    }

    console.log(`\nStep 3: Merging with existing data...\n`);

    const mergedGames = mergeWithExisting(parsedGames);

    // Sort by popularity (descending)
    mergedGames.sort((a, b) => b.popularity - a.popularity);

    console.log(`\nStep 4: Validating data...\n`);

    const validationErrors = validateGames(mergedGames);

    if (validationErrors.length > 0) {
        console.error('Validation errors:');
        validationErrors.forEach(err => console.error(`  - ${err}`));
    }

    // Write output
    if (DRY_RUN) {
        console.log('\n[DRY RUN] Would write to:', OUTPUT_FILE);
        console.log(`Games count: ${mergedGames.length}`);
        console.log('\nSample (first 3 games):');
        mergedGames.slice(0, 3).forEach(game => {
            console.log(`  - ${game.name} (${game.year || 'N/A'}) - ${game.view}`);
        });
    } else {
        console.log(`\nWriting ${mergedGames.length} games to ${OUTPUT_FILE}...`);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mergedGames, null, 2), 'utf8');
        console.log('✓ Done!');
    }

    // Print stats
    console.log(`\n=== Stats ===`);
    console.log(`Fetched: ${stats.fetched} requests`);
    console.log(`Cached: ${stats.cached} requests`);
    console.log(`Games: ${stats.games} parsed`);
    console.log(`Errors: ${stats.errors}`);

    if (validationErrors.length > 0) {
        console.log(`Validation errors: ${validationErrors.length}`);
        process.exit(1);
    }
}

// Run scraper
scrapeChessGames().catch(err => {
    console.error('\n[FATAL ERROR]', err);
    process.exit(1);
});
