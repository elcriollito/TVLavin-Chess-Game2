/**
 * Stockfish Web Worker
 *
 * Loads stockfish.js from npm package stockfish.js v10
 * This version is known to work correctly with UCI protocol
 */

// Load the working stockfish.js from absolute same-origin path
importScripts('/engine/stockfish-working.js');

// The npm version auto-configures when loaded in a worker
// No additional setup needed - it handles onmessage automatically
