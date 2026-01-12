/**
 * Stockfish Web Worker
 *
 * stockfish.js automatically sets up UCI communication when loaded in a worker.
 * When importScripts loads stockfish.js in a worker context, it:
 * 1. Detects it's running in a worker (not main thread)
 * 2. Sets up onmessage handler to receive UCI commands
 * 3. Posts UCI responses back via postMessage
 *
 * We don't need to instantiate anything or route messages manually.
 * The script handles everything automatically.
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');

// That's it! stockfish.js handles all the UCI communication automatically.
