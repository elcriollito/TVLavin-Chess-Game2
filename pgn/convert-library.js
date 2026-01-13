#!/usr/bin/env node

/**
 * Convert flat library.json to nested format (Category → Player → Files)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARY_JSON = path.join(__dirname, 'library.json');

function convertLibrary() {
    console.log('📚 Converting library.json to nested format...\n');

    // Read current library
    const library = JSON.parse(fs.readFileSync(LIBRARY_JSON, 'utf-8'));

    const nested = {};

    for (const [category, games] of Object.entries(library)) {
        nested[category] = {};

        // Group games by player
        for (const game of games) {
            // Extract player name from file path
            // e.g., "pgn/world-champions/Fischer_Bobby/file.pgn" → "Fischer, Bobby"
            const pathParts = game.file.split('/');
            let playerFolder = '';

            if (pathParts.length >= 3) {
                playerFolder = pathParts[2]; // e.g., "Fischer_Bobby"

                // Convert folder name to display name
                // "Fischer_Bobby" → "Fischer, Bobby"
                const playerName = playerFolder.replace(/_/g, ', ');

                if (!nested[category][playerName]) {
                    nested[category][playerName] = [];
                }

                // Add game to player's collection
                nested[category][playerName].push({
                    label: game.name,
                    file: game.file,
                    white: game.white,
                    black: game.black,
                    year: game.year,
                    event: game.event,
                    result: game.result
                });
            } else {
                // Demo files without player folders
                const playerName = 'Classic Games';

                if (!nested[category][playerName]) {
                    nested[category][playerName] = [];
                }

                nested[category][playerName].push({
                    label: game.name,
                    file: game.file,
                    white: game.white,
                    black: game.black,
                    year: game.year,
                    event: game.event,
                    result: game.result
                });
            }
        }
    }

    // Write new format
    fs.writeFileSync(LIBRARY_JSON, JSON.stringify(nested, null, 2), 'utf-8');

    console.log('✅ Library converted to nested format\n');

    // Print summary
    for (const [category, players] of Object.entries(nested)) {
        console.log(`${category}:`);
        for (const [player, files] of Object.entries(players)) {
            console.log(`  - ${player}: ${files.length} game(s)`);
        }
        console.log('');
    }
}

convertLibrary();
