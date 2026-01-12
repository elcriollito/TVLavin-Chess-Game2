/**
 * Stockfish Web Worker
 *
 * This is a MINIMAL worker that just loads stockfish.js from CDN.
 * stockfish.js is designed to work standalone as a worker.
 *
 * When stockfish.js loads in a worker context, it automatically:
 * - Sets up onmessage to receive UCI commands
 * - Sends responses via postMessage
 */

// Load stockfish.js from nmrugg's repository (known working version)
// The cdnjs version had issues responding to commands after uciok
importScripts('stockfish-nmrugg.js');

// stockfish.js automatically configures itself when loaded in a worker context.
// It sets up onmessage to receive UCI commands and uses postMessage to send responses.
