/**
 * Stockfish Web Worker
 * This worker loads and communicates with the Stockfish chess engine
 * No blob URLs - direct importScripts from CDN
 */

let stockfish = null;

// Load Stockfish from CDN
try {
    // Try modern WASM version first
    if (typeof WebAssembly === 'object') {
        importScripts('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/stockfish-16.0-lite.js');
    } else {
        // Fallback to JS-only version for older browsers
        importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
    }
} catch (error) {
    // If WASM fails, fallback to JS version
    try {
        importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
    } catch (fallbackError) {
        postMessage('error: Failed to load Stockfish');
        throw fallbackError;
    }
}

// Initialize Stockfish engine
// The imported script should provide either Stockfish() or STOCKFISH global
if (typeof Stockfish === 'function') {
    stockfish = Stockfish();
} else if (typeof STOCKFISH === 'object') {
    stockfish = STOCKFISH;
} else {
    postMessage('error: Stockfish not available after import');
}

// Forward messages from Stockfish to main thread
if (stockfish && stockfish.addMessageListener) {
    stockfish.addMessageListener(function(message) {
        postMessage(message);
    });
} else if (stockfish && stockfish.onmessage) {
    stockfish.onmessage = function(message) {
        postMessage(message);
    };
}

// Receive commands from main thread and send to Stockfish
onmessage = function(event) {
    if (stockfish) {
        const command = event.data;
        if (stockfish.postMessage) {
            stockfish.postMessage(command);
        } else if (typeof stockfish === 'function') {
            // Some versions accept commands as function calls
            stockfish(command);
        }
    }
};

// Signal that worker is ready
postMessage('Stockfish worker initialized');
