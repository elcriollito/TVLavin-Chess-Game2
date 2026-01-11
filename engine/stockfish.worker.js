/**
 * Stockfish Web Worker Proxy
 * This worker acts as a simple proxy to load Stockfish from CDN
 * For simplicity, we just load the Stockfish worker directly from CDN
 */

// This approach: We ARE the actual Stockfish engine
// Just load stockfish.js which will handle all the UCI communication internally
importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
