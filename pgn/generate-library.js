/**
 * Generate library.json from existing PGN files
 *
 * This script scans the /pgn/ directory and generates a library.json
 * file with all available games organized by category.
 *
 * Usage:
 *   node generate-library.js
 *
 * Use this script when:
 * - You've added new PGN files manually
 * - You want to update game metadata
 * - You need to rebuild the library index
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = __dirname;
const LIBRARY_JSON = path.join(OUTPUT_DIR, 'library.json');

function parsePGNHeader(pgnContent) {
    const lines = pgnContent.split('\n');
    const headers = {};

    for (const line of lines) {
        const match = line.match(/\[(\w+)\s+"([^"]+)"\]/);
        if (match) {
            headers[match[1]] = match[2];
        }
        // Stop at first move (non-header line)
        if (line.match(/^1\./)) break;
    }

    return headers;
}

function extractGamesFromDirectory(dir, basePath = OUTPUT_DIR) {
    const games = [];

    if (!fs.existsSync(dir)) {
        console.log(`⚠️  Directory not found: ${dir}`);
        return games;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            // Recursively process subdirectories
            games.push(...extractGamesFromDirectory(filePath, basePath));
        } else if (file.endsWith('.pgn')) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');

                // Skip empty or very small files
                if (content.trim().length < 100) {
                    console.log(`⚠️  Skipping empty/small file: ${file}`);
                    continue;
                }

                const headers = parsePGNHeader(content);

                // Create game entry
                const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');

                const gameName = headers.White && headers.Black && headers.Date
                    ? `${headers.White} vs ${headers.Black} (${headers.Date.split('.')[0]})`
                    : path.basename(file, '.pgn').replace(/_/g, ' ');

                games.push({
                    name: gameName,
                    file: 'pgn/' + relativePath,
                    white: headers.White || '?',
                    black: headers.Black || '?',
                    year: headers.Date ? headers.Date.split('.')[0] : '?',
                    event: headers.Event || '?',
                    result: headers.Result || '?'
                });
            } catch (err) {
                console.error(`✗ Failed to parse ${file}:`, err.message);
            }
        }
    }

    return games;
}

function generateLibrary() {
    console.log('📚 Generating library.json from existing PGN files...\n');

    const library = {
        'World Champions': [],
        'Grandmasters': [],
        'Demo / Mixed': []
    };

    // Extract games from each category
    const championsDir = path.join(OUTPUT_DIR, 'world-champions');
    const grandmastersDir = path.join(OUTPUT_DIR, 'grandmasters');
    const demoDir = path.join(OUTPUT_DIR, 'demo');

    console.log('📂 Scanning world-champions/...');
    library['World Champions'] = extractGamesFromDirectory(championsDir);
    console.log(`   Found ${library['World Champions'].length} games\n`);

    console.log('📂 Scanning grandmasters/...');
    library['Grandmasters'] = extractGamesFromDirectory(grandmastersDir);
    console.log(`   Found ${library['Grandmasters'].length} games\n`);

    console.log('📂 Scanning demo/...');
    library['Demo / Mixed'] = extractGamesFromDirectory(demoDir);
    console.log(`   Found ${library['Demo / Mixed'].length} games\n`);

    // Sort games by name within each category
    for (const category in library) {
        library[category].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Write JSON file (pretty-printed)
    fs.writeFileSync(LIBRARY_JSON, JSON.stringify(library, null, 2), 'utf-8');

    const totalGames =
        library['World Champions'].length +
        library['Grandmasters'].length +
        library['Demo / Mixed'].length;

    console.log(`✅ Generated library.json`);
    console.log(`\nSummary:`);
    console.log(`  World Champions: ${library['World Champions'].length} games`);
    console.log(`  Grandmasters: ${library['Grandmasters'].length} games`);
    console.log(`  Demo / Mixed: ${library['Demo / Mixed'].length} games`);
    console.log(`  Total: ${totalGames} games`);
    console.log(`\nFile saved to: ${LIBRARY_JSON}`);

    return library;
}

// Run if executed directly
if (require.main === module) {
    try {
        generateLibrary();
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

module.exports = { generateLibrary };
