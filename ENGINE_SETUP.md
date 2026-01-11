# Stockfish Engine Setup

## Architecture

### Files Structure
```
/engine/
  stockfish.worker.js    - Web Worker that loads Stockfish from CDN
/stockfish-worker.js     - StockfishEngine wrapper class
/app.js                  - Main app logic
/index.html              - Main HTML
```

### How It Works

1. **StockfishEngine Class** (`stockfish-worker.js`)
   - Wrapper class that manages communication with Stockfish
   - Calculates base path for GitHub Pages compatibility
   - Creates Worker from `engine/stockfish.worker.js`
   - Implements UCI protocol communication
   - Provides callbacks: onReady, onBestMove, onInfo, onError

2. **Web Worker** (`engine/stockfish.worker.js`)
   - Loads Stockfish from CDN (no blob URLs)
   - Tries WASM version first, falls back to JS version
   - Acts as message bridge between main thread and Stockfish
   - Forwards UCI commands to Stockfish
   - Sends Stockfish responses to main thread

3. **UCI Protocol Flow**
   ```
   Main Thread → StockfishEngine → Worker → Stockfish
                                              ↓
   Main Thread ← StockfishEngine ← Worker ← Stockfish
   ```

### UCI Handshake

On initialization:
```
1. Send: "uci"
2. Receive: "uciok" → Engine is ready
3. Configure engine (skill level, threads, hash)
4. Send: "isready"
5. Receive: "readyok" → Ready for commands
```

### Key Features

#### 1. Play vs Engine
```javascript
// After human move
engine.getBestMove(fen, (bestMove) => {
  // Parse UCI move (e.g., "e2e4", "e7e8q")
  // Make move on board
}, { movetime: 1000 });
```

#### 2. Position Analysis
```javascript
// Start continuous analysis
engine.startAnalysis(fen, (info) => {
  // info.depth, info.nodes, info.score, info.pv
  updateAnalysisPanel(info);
}, depth);

// Stop analysis
engine.stopAnalysis();
```

### Configuration

**Skill Levels** (0-20):
- 0-3: Beginner (depth 8)
- 4-8: Easy (depth 12)
- 9-15: Medium (depth 16)
- 16-20: Expert (depth 20)

**UCI Options Set**:
- Skill Level
- UCI_LimitStrength (for levels < 20)
- UCI_Elo (calculated from skill level)
- MultiPV (for analysis)
- Hash (128 MB)
- Threads (1 for web worker)

### GitHub Pages Compatibility

The `getBasePath()` function calculates the correct path:
```javascript
// Local: "./engine/stockfish.worker.js"
// GitHub Pages: "/TVLavin-Chess-Game2/engine/stockfish.worker.js"
```

### CSP Requirements

Content Security Policy must allow:
```
worker-src 'self' blob:;
script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;
```

### Testing

Use `TEST_ENGINE.html` to verify:
1. Engine initialization (logs "uciok" and "readyok")
2. Get best move (returns UCI move like "e2e4")
3. Analysis (continuous info with depth, score, PV)

### Debugging

Enable debug mode: `?debug=1`
- Logs all engine messages to console
- Shows UCI communication

### Common Issues

**Worker fails to load:**
- Check browser console for CSP errors
- Verify `engine/stockfish.worker.js` exists
- Check network tab for 404 errors

**No engine responses:**
- Check if "uciok" was received
- Verify UCI commands are being sent
- Check worker error handler

**Analysis not updating:**
- Verify `App.analyzing` is true
- Check `engine.onInfo` callback is set
- Ensure `startAnalysis()` was called
