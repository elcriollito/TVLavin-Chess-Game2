/**
 * Stockfish Web Worker Interface
 * This worker loads the Stockfish engine and forwards UCI commands
 */

let engine = null;

function initEngine() {
  try {
    // Load Stockfish from CDN - try WASM first, fallback to JS
    engine = new Worker('/engine/stockfish-working.js');

    engine.onmessage = function(e) {
      postMessage(e.data);
    };

    engine.onerror = function(err) {
      console.error('Stockfish engine error:', err);
    };

    // Initialize UCI
    engine.postMessage('uci');

  } catch (err) {
    console.error('Failed to initialize Stockfish:', err);
  }
}

onmessage = function(e) {
  const cmd = e.data;

  if (!engine) {
    initEngine();
  }

  // Forward command to engine
  if (engine) {
    engine.postMessage(cmd);
  }
};

// Auto-initialize on worker load
initEngine();
