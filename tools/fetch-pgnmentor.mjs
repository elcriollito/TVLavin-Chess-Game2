#!/usr/bin/env node

/**
 * PGNMentor Downloader
 * Downloads chess games from PGNMentor.com and organizes them into categories
 *
 * Usage:
 *   node tools/fetch-pgnmentor.mjs           # Download all configured players
 *   node tools/fetch-pgnmentor.mjs --force   # Force re-download existing files
 *   node tools/fetch-pgnmentor.mjs --test    # Only download first 3 players for testing
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PGN_DIR = path.join(ROOT_DIR, 'pgn');

// Parse command line arguments
const args = process.argv.slice(2);
const FORCE_DOWNLOAD = args.includes('--force');
const TEST_MODE = args.includes('--test');

// PGNMentor base URL
const PGNMENTOR_BASE = 'https://www.pgnmentor.com/players/';

// World Champions (18 official champions)
const WORLD_CHAMPIONS = [
    { name: 'Steinitz, Wilhelm', folder: 'Steinitz_Wilhelm', url: 'Steinitz.zip' },
    { name: 'Lasker, Emanuel', folder: 'Lasker_Emanuel', url: 'Lasker,Em.zip' },
    { name: 'Capablanca, Jose Raul', folder: 'Capablanca_JoseRaul', url: 'Capablanca.zip' },
    { name: 'Alekhine, Alexander', folder: 'Alekhine_Alexander', url: 'Alekhine.zip' },
    { name: 'Euwe, Max', folder: 'Euwe_Max', url: 'Euwe.zip' },
    { name: 'Botvinnik, Mikhail', folder: 'Botvinnik_Mikhail', url: 'Botvinnik.zip' },
    { name: 'Smyslov, Vasily', folder: 'Smyslov_Vasily', url: 'Smyslov.zip' },
    { name: 'Tal, Mikhail', folder: 'Tal_Mikhail', url: 'Tal.zip' },
    { name: 'Petrosian, Tigran', folder: 'Petrosian_Tigran', url: 'Petrosian.zip' },
    { name: 'Spassky, Boris', folder: 'Spassky_Boris', url: 'Spassky.zip' },
    { name: 'Fischer, Bobby', folder: 'Fischer_Bobby', url: 'Fischer.zip' },
    { name: 'Karpov, Anatoly', folder: 'Karpov_Anatoly', url: 'Karpov.zip' },
    { name: 'Kasparov, Garry', folder: 'Kasparov_Garry', url: 'Kasparov.zip' },
    { name: 'Kramnik, Vladimir', folder: 'Kramnik_Vladimir', url: 'Kramnik.zip' },
    { name: 'Anand, Viswanathan', folder: 'Anand_Viswanathan', url: 'Anand.zip' },
    { name: 'Carlsen, Magnus', folder: 'Carlsen_Magnus', url: 'Carlsen.zip' },
    { name: 'Ding, Liren', folder: 'Ding_Liren', url: 'Ding,L.zip' },
    { name: 'Gukesh, Dommaraju', folder: 'Gukesh_Dommaraju', url: 'Gukesh.zip' }
];

// Great GMs (non-champions, historically significant)
const GREAT_GMS = [
    { name: 'Morphy, Paul', folder: 'Morphy_Paul', url: 'Morphy.zip' },
    { name: 'Anderssen, Adolf', folder: 'Anderssen_Adolf', url: 'Anderssen.zip' },
    { name: 'Rubinstein, Akiba', folder: 'Rubinstein_Akiba', url: 'Rubinstein.zip' },
    { name: 'Nimzowitsch, Aron', folder: 'Nimzowitsch_Aron', url: 'Nimzowitsch.zip' },
    { name: 'Tarrasch, Siegbert', folder: 'Tarrasch_Siegbert', url: 'Tarrasch.zip' },
    { name: 'Bronstein, David', folder: 'Bronstein_David', url: 'Bronstein.zip' },
    { name: 'Korchnoi, Viktor', folder: 'Korchnoi_Viktor', url: 'Korchnoi.zip' },
    { name: 'Larsen, Bent', folder: 'Larsen_Bent', url: 'Larsen.zip' },
    { name: 'Najdorf, Miguel', folder: 'Najdorf_Miguel', url: 'Najdorf.zip' },
    { name: 'Reshevsky, Samuel', folder: 'Reshevsky_Samuel', url: 'Reshevsky.zip' },
    { name: 'Shirov, Alexei', folder: 'Shirov_Alexei', url: 'Shirov.zip' },
    { name: 'Ivanchuk, Vasyl', folder: 'Ivanchuk_Vasyl', url: 'Ivanchuk.zip' },
    { name: 'Kamsky, Gata', folder: 'Kamsky_Gata', url: 'Kamsky.zip' },
    { name: 'Polgar, Judit', folder: 'Polgar_Judit', url: 'Polgar,Ju.zip' },
    { name: 'Aronian, Levon', folder: 'Aronian_Levon', url: 'Aronian.zip' },
    { name: 'Nakamura, Hikaru', folder: 'Nakamura_Hikaru', url: 'Nakamura,H.zip' },
    { name: 'Caruana, Fabiano', folder: 'Caruana_Fabiano', url: 'Caruana.zip' },
    { name: 'Nepomniachtchi, Ian', folder: 'Nepomniachtchi_Ian', url: 'Nepomniachtchi.zip' }
];

/**
 * Download file from URL with redirect following
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        const request = (currentUrl) => {
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': '*/*'
                }
            };

            https.get(currentUrl, options, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    request(response.headers.location);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Unknown error'}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    file.close();
                    if (fs.existsSync(destPath)) {
                        fs.unlinkSync(destPath);
                    }
                    reject(err);
                });
            }).on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                }
                reject(err);
            });
        };

        request(url);
    });
}

/**
 * Extract ZIP file and organize PGN files
 */
function extractZip(zipPath, destFolder) {
    try {
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        let extractedCount = 0;

        zipEntries.forEach(entry => {
            if (entry.entryName.endsWith('.pgn')) {
                // Extract directly to destination folder
                zip.extractEntryTo(entry, destFolder, false, true);
                extractedCount++;
            }
        });

        // Clean up ZIP file
        fs.unlinkSync(zipPath);

        return extractedCount;
    } catch (error) {
        console.error(`   ❌ Failed to extract ZIP: ${error.message}`);
        return 0;
    }
}

/**
 * Parse PGN file to extract game metadata
 */
function parsePGNFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const games = [];

        // Split by double newline (game separator)
        const gameBlocks = content.split(/\n\s*\n\s*\[/);

        for (let block of gameBlocks.slice(0, 50)) { // Limit to first 50 games per file
            if (!block.includes('[Event')) {
                block = '[' + block;
            }

            const eventMatch = block.match(/\[Event\s+"([^"]+)"\]/);
            const whiteMatch = block.match(/\[White\s+"([^"]+)"\]/);
            const blackMatch = block.match(/\[Black\s+"([^"]+)"\]/);
            const dateMatch = block.match(/\[Date\s+"([^"]+)"\]/);
            const resultMatch = block.match(/\[Result\s+"([^"]+)"\]/);

            if (eventMatch && whiteMatch && blackMatch) {
                const year = dateMatch ? dateMatch[1].split('.')[0] : 'Unknown';

                games.push({
                    event: eventMatch[1],
                    white: whiteMatch[1],
                    black: blackMatch[1],
                    date: dateMatch ? dateMatch[1] : '????.??.??',
                    year: year !== '????' ? year : 'Unknown',
                    result: resultMatch ? resultMatch[1] : '*'
                });
            }
        }

        return games;
    } catch (error) {
        console.error(`   ⚠️  Failed to parse ${path.basename(filePath)}: ${error.message}`);
        return [];
    }
}

/**
 * Download and process a single player
 */
async function downloadPlayer(player, category, categoryPath) {
    const playerFolder = path.join(categoryPath, player.folder);
    const url = PGNMENTOR_BASE + player.url;

    console.log(`\n📥 ${player.name}`);
    console.log(`   URL: ${url}`);

    // Check if folder exists and has files
    if (fs.existsSync(playerFolder) && !FORCE_DOWNLOAD) {
        const files = fs.readdirSync(playerFolder).filter(f => f.endsWith('.pgn'));
        if (files.length > 0) {
            console.log(`   ✓ Already downloaded (${files.length} files, use --force to re-download)`);
            return { success: true, cached: true, player, category };
        }
    }

    // Create player folder
    if (!fs.existsSync(playerFolder)) {
        fs.mkdirSync(playerFolder, { recursive: true });
    }

    try {
        // Download ZIP
        const zipPath = path.join(playerFolder, player.url);
        console.log(`   ⬇️  Downloading...`);
        await downloadFile(url, zipPath);

        // Extract PGN files
        console.log(`   📦 Extracting...`);
        const fileCount = extractZip(zipPath, playerFolder);

        if (fileCount > 0) {
            console.log(`   ✅ Success! Extracted ${fileCount} PGN file(s)`);
            return { success: true, cached: false, player, category, fileCount };
        } else {
            console.log(`   ⚠️  No PGN files found in archive`);
            return { success: false, player, category };
        }

    } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);
        return { success: false, player, category, error: error.message };
    }
}

/**
 * Generate library.json manifest
 */
function generateLibraryManifest() {
    console.log('\n\n📚 Generating library.json...\n');

    const library = {
        'World Champions': [],
        'Great GMs': [],
        'Misc / Demo': []
    };

    // Process World Champions
    const championsPath = path.join(PGN_DIR, 'world-champions');
    if (fs.existsSync(championsPath)) {
        const players = fs.readdirSync(championsPath);

        for (const playerFolder of players) {
            const playerPath = path.join(championsPath, playerFolder);
            if (!fs.statSync(playerPath).isDirectory()) continue;

            const pgnFiles = fs.readdirSync(playerPath).filter(f => f.endsWith('.pgn'));

            for (const pgnFile of pgnFiles.slice(0, 10)) { // Limit to 10 games per player
                const filePath = path.join(playerPath, pgnFile);
                const games = parsePGNFile(filePath);

                // Add first game from each file
                if (games.length > 0) {
                    const game = games[0];
                    const displayName = `${game.white} vs ${game.black} (${game.year})`;

                    library['World Champions'].push({
                        name: displayName,
                        file: `pgn/world-champions/${playerFolder}/${pgnFile}`,
                        white: game.white,
                        black: game.black,
                        year: game.year,
                        event: game.event,
                        result: game.result
                    });
                }
            }
        }
    }

    // Process Great GMs
    const gmsPath = path.join(PGN_DIR, 'great-gms');
    if (fs.existsSync(gmsPath)) {
        const players = fs.readdirSync(gmsPath);

        for (const playerFolder of players) {
            const playerPath = path.join(gmsPath, playerFolder);
            if (!fs.statSync(playerPath).isDirectory()) continue;

            const pgnFiles = fs.readdirSync(playerPath).filter(f => f.endsWith('.pgn'));

            for (const pgnFile of pgnFiles.slice(0, 10)) {
                const filePath = path.join(playerPath, pgnFile);
                const games = parsePGNFile(filePath);

                if (games.length > 0) {
                    const game = games[0];
                    const displayName = `${game.white} vs ${game.black} (${game.year})`;

                    library['Great GMs'].push({
                        name: displayName,
                        file: `pgn/great-gms/${playerFolder}/${pgnFile}`,
                        white: game.white,
                        black: game.black,
                        year: game.year,
                        event: game.event,
                        result: game.result
                    });
                }
            }
        }
    }

    // Keep existing demo games
    const demoPath = path.join(PGN_DIR, 'demo');
    if (fs.existsSync(demoPath)) {
        const demoFiles = fs.readdirSync(demoPath).filter(f => f.endsWith('.pgn'));

        for (const pgnFile of demoFiles) {
            const filePath = path.join(demoPath, pgnFile);
            const games = parsePGNFile(filePath);

            if (games.length > 0) {
                const game = games[0];
                const displayName = `${game.white} vs ${game.black} (${game.year})`;

                library['Misc / Demo'].push({
                    name: displayName,
                    file: `pgn/demo/${pgnFile}`,
                    white: game.white,
                    black: game.black,
                    year: game.year,
                    event: game.event,
                    result: game.result
                });
            }
        }
    }

    // Sort entries
    library['World Champions'].sort((a, b) => a.name.localeCompare(b.name));
    library['Great GMs'].sort((a, b) => a.name.localeCompare(b.name));
    library['Misc / Demo'].sort((a, b) => a.name.localeCompare(b.name));

    // Write to file
    const libraryPath = path.join(PGN_DIR, 'library.json');
    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));

    console.log(`✅ Generated library.json`);
    console.log(`   World Champions: ${library['World Champions'].length} games`);
    console.log(`   Great GMs: ${library['Great GMs'].length} games`);
    console.log(`   Misc / Demo: ${library['Misc / Demo'].length} games`);
    console.log(`   Total: ${library['World Champions'].length + library['Great GMs'].length + library['Misc / Demo'].length} games`);
}

/**
 * Main execution
 */
async function main() {
    console.log('========================================');
    console.log('  PGNMentor Downloader');
    console.log('========================================\n');

    if (TEST_MODE) {
        console.log('🧪 TEST MODE: Downloading only first 3 players\n');
    }

    if (FORCE_DOWNLOAD) {
        console.log('🔄 FORCE MODE: Re-downloading existing files\n');
    }

    // Create base directories
    const championsPath = path.join(PGN_DIR, 'world-champions');
    const gmsPath = path.join(PGN_DIR, 'great-gms');

    if (!fs.existsSync(championsPath)) {
        fs.mkdirSync(championsPath, { recursive: true });
    }
    if (!fs.existsSync(gmsPath)) {
        fs.mkdirSync(gmsPath, { recursive: true });
    }

    const results = {
        success: 0,
        cached: 0,
        failed: 0
    };

    // Download World Champions
    console.log('📥 Downloading World Champions...\n');
    const championsToDownload = TEST_MODE ? WORLD_CHAMPIONS.slice(0, 2) : WORLD_CHAMPIONS;

    for (const player of championsToDownload) {
        const result = await downloadPlayer(player, 'World Champions', championsPath);
        if (result.success) {
            if (result.cached) {
                results.cached++;
            } else {
                results.success++;
            }
        } else {
            results.failed++;
        }
    }

    // Download Great GMs
    console.log('\n\n📥 Downloading Great GMs...\n');
    const gmsToDownload = TEST_MODE ? GREAT_GMS.slice(0, 1) : GREAT_GMS;

    for (const player of gmsToDownload) {
        const result = await downloadPlayer(player, 'Great GMs', gmsPath);
        if (result.success) {
            if (result.cached) {
                results.cached++;
            } else {
                results.success++;
            }
        } else {
            results.failed++;
        }
    }

    // Generate library manifest
    generateLibraryManifest();

    // Summary
    console.log('\n\n========================================');
    console.log('  Download Summary');
    console.log('========================================');
    console.log(`✅ Downloaded: ${results.success}`);
    console.log(`💾 Cached: ${results.cached}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('========================================\n');
}

main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
