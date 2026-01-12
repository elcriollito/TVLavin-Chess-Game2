/**
 * Stockfish Web Worker Proxy
 * This worker loads Stockfish from CDN and routes messages between main thread and engine
 */

// Load Stockfish engine
importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');

// stockfish.js creates a Stockfish function in global scope
// We need to instantiate it and route messages
var stockfish = new Stockfish();

// Forward messages from main thread to Stockfish engine
self.onmessage = function(event) {
    // console.log('[Worker] Received from main thread:', event.data);
    stockfish.postMessage(event.data);
};

// Forward messages from Stockfish engine to main thread
stockfish.onmessage = function(event) {
    // console.log('[Worker] Received from Stockfish:', event.data);
    self.postMessage(event.data);
};
