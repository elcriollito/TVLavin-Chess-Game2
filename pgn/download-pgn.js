/**
 * PGN Library Download Script
 *
 * This script downloads PGN files from PGNMentor and organizes them
 * into a structured library for the chess web app.
 *
 * Usage:
 *   node download-pgn.js
 *
 * Requirements:
 *   npm install axios adm-zip
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Transform } = require('stream');

// Configuration
const BASE_URL = 'https://www.pgnmentor.com/players/';
const OUTPUT_DIR = path.join(__dirname);
const LIBRARY_JSON = path.join(OUTPUT_DIR, 'library.json');

// Player definitions
const WORLD_CHAMPIONS = [
    { name: 'Steinitz', folder: 'Steinitz', url: 'Steinitz.zip' },
    { name: 'Lasker', folder: 'Lasker', url: 'Lasker,Em.zip' },
    { name: 'Capablanca', folder: 'Capablanca', url: 'Capablanca.zip' },
    { name: 'Alekhine', folder: 'Alekhine', url: 'Alekhine.zip' },
    { name: 'Euwe', folder: 'Euwe', url: 'Euwe.zip' },
    { name: 'Botvinnik', folder: 'Botvinnik', url: 'Botvinnik.zip' },
    { name: 'Smyslov', folder: 'Smyslov', url: 'Smyslov.zip' },
    { name: 'Tal', folder: 'Tal', url: 'Tal.zip' },
    { name: 'Petrosian', folder: 'Petrosian', url: 'Petrosian.zip' },
    { name: 'Spassky', folder: 'Spassky', url: 'Spassky.zip' },
    { name: 'Fischer', folder: 'Fischer', url: 'Fischer.zip' },
    { name: 'Karpov', folder: 'Karpov', url: 'Karpov.zip' },
    { name: 'Kasparov', folder: 'Kasparov', url: 'Kasparov.zip' },
    { name: 'Kramnik', folder: 'Kramnik', url: 'Kramnik.zip' },
    { name: 'Anand', folder: 'Anand', url: 'Anand.zip' },
    { name: 'Carlsen', folder: 'Carlsen', url: 'Carlsen.zip' },
    { name: 'Ding', folder: 'Ding', url: 'Ding.zip' }
];

const GRANDMASTERS = [
    { name: 'Morphy', folder: 'Morphy', url: 'Morphy.zip' },
    { name: 'Anderssen', folder: 'Anderssen', url: 'Anderssen.zip' },
    { name: 'Rubinstein', folder: 'Rubinstein', url: 'Rubinstein.zip' },
    { name: 'Nimzowitsch', folder: 'Nimzowitsch', url: 'Nimzowitsch.zip' },
    { name: 'Tartakower', folder: 'Tartakower', url: 'Tartakower.zip' },
    { name: 'Reshevsky', folder: 'Reshevsky', url: 'Reshevsky.zip' },
    { name: 'Bronstein', folder: 'Bronstein', url: 'Bronstein.zip' },
    { name: 'Keres', folder: 'Keres', url: 'Keres.zip' },
    { name: 'Najdorf', folder: 'Najdorf', url: 'Najdorf.zip' },
    { name: 'Ivanchuk', folder: 'Ivanchuk', url: 'Ivanchuk.zip' },
    { name: 'Grischuk', folder: 'Grischuk', url: 'Grischuk.zip' },
    { name: 'Polgar', folder: 'Polgar', url: 'Polgar,Ju.zip' }
];

// Utility functions
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✓ Created directory: ${dir}`);
    }
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`⬇️  Downloading: ${url}`);

        const file = fs.createWriteStream(dest);

        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`✓ Downloaded: ${path.basename(dest)}`);
                    resolve();
                });
            } else if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirect
                file.close();
                fs.unlinkSync(dest);
                downloadFile(response.headers.location, dest)
                    .then(resolve)
                    .catch(reject);
            } else {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`Failed to download: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            file.close();
            fs.unlinkSync(dest);
            reject(err);
        });
    });
}

async function extractZip(zipPath, extractTo) {
    // Note: This requires adm-zip package
    // Install with: npm install adm-zip
    try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractTo, true);
        console.log(`✓ Extracted: ${path.basename(zipPath)}`);

        // Delete zip file after extraction
        fs.unlinkSync(zipPath);
    } catch (err) {
        console.error(`✗ Failed to extract ${zipPath}:`, err.message);
    }
}

async function processPlayer(player, category) {
    const categoryDir = path.join(OUTPUT_DIR, category);
    const playerDir = path.join(categoryDir, player.folder);
    const zipFile = path.join(categoryDir, `${player.name}.zip`);
    const url = BASE_URL + player.url;

    ensureDir(playerDir);

    try {
        await downloadFile(url, zipFile);
        await extractZip(zipFile, playerDir);
        return true;
    } catch (err) {
        console.error(`✗ Failed to process ${player.name}:`, err.message);
        return false;
    }
}

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

function extractGamesFromDirectory(dir, category) {
    const games = [];

    if (!fs.existsSync(dir)) return games;

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            // Recursively process subdirectories
            games.push(...extractGamesFromDirectory(filePath, category));
        } else if (file.endsWith('.pgn')) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');

                // Skip empty files
                if (content.trim().length < 100) continue;

                const headers = parsePGNHeader(content);

                // Create game entry
                const relativePath = path.relative(OUTPUT_DIR, filePath).replace(/\\/g, '/');
                const gameName = headers.White && headers.Black && headers.Date
                    ? `${headers.White} vs ${headers.Black} (${headers.Date.split('.')[0]})`
                    : path.basename(file, '.pgn');

                games.push({
                    name: gameName,
                    file: 'pgn/' + relativePath,
                    white: headers.White || '?',
                    black: headers.Black || '?',
                    year: headers.Date ? headers.Date.split('.')[0] : '?',
                    event: headers.Event || '?'
                });
            } catch (err) {
                console.error(`✗ Failed to parse ${file}:`, err.message);
            }
        }
    }

    return games;
}

function generateLibraryJSON() {
    console.log('\n📚 Generating library.json...');

    const library = {
        'World Champions': [],
        'Grandmasters': [],
        'Demo / Mixed': []
    };

    // Extract games from each category
    const championsDir = path.join(OUTPUT_DIR, 'world-champions');
    const grandmastersDir = path.join(OUTPUT_DIR, 'grandmasters');
    const demoDir = path.join(OUTPUT_DIR, 'demo');

    library['World Champions'] = extractGamesFromDirectory(championsDir, 'world-champions');
    library['Grandmasters'] = extractGamesFromDirectory(grandmastersDir, 'grandmasters');
    library['Demo / Mixed'] = extractGamesFromDirectory(demoDir, 'demo');

    // Sort games by name
    for (const category in library) {
        library[category].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Write JSON file
    fs.writeFileSync(LIBRARY_JSON, JSON.stringify(library, null, 2), 'utf-8');

    console.log(`✓ Generated library.json with ${
        library['World Champions'].length +
        library['Grandmasters'].length +
        library['Demo / Mixed'].length
    } games`);

    return library;
}

async function main() {
    console.log('🚀 Starting PGN Library Download\n');

    // Create base directories
    ensureDir(path.join(OUTPUT_DIR, 'world-champions'));
    ensureDir(path.join(OUTPUT_DIR, 'grandmasters'));
    ensureDir(path.join(OUTPUT_DIR, 'demo'));

    console.log('\n📥 Downloading World Champions...\n');
    for (const player of WORLD_CHAMPIONS) {
        await processPlayer(player, 'world-champions');
    }

    console.log('\n📥 Downloading Grandmasters...\n');
    for (const player of GRANDMASTERS) {
        await processPlayer(player, 'grandmasters');
    }

    console.log('\n📚 Processing complete!');

    // Generate library.json
    const library = generateLibraryJSON();

    console.log('\n✅ PGN Library setup complete!');
    console.log(`\nSummary:`);
    console.log(`  - World Champions: ${library['World Champions'].length} games`);
    console.log(`  - Grandmasters: ${library['Grandmasters'].length} games`);
    console.log(`  - Demo / Mixed: ${library['Demo / Mixed'].length} games`);
    console.log(`\nNext steps:`);
    console.log(`  1. Review the generated library.json`);
    console.log(`  2. Add any custom games to /pgn/demo/`);
    console.log(`  3. Re-run "node generate-library.js" to update library.json`);
    console.log(`  4. Commit and push to GitHub`);
}

// Run the script
if (require.main === module) {
    main().catch(err => {
        console.error('❌ Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { generateLibraryJSON };
