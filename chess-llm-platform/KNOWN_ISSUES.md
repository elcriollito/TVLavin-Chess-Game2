# Known Issues & Fixes

This document tracks known bugs and their workarounds.

---

## Critical Issues

### 1. Stockfish Worker CSP Violations

**Status**: ✅ Fixed in Phase 1

**Issue**: Blob workers blocked by Content Security Policy in production

**Fix**: Use `importScripts()` in blob worker (see `StockfishAdapter.ts:28`)

**Alternative**: Download `stockfish.js` locally to `public/stockfish/`

---

### 2. LLM Suggests Illegal Moves

**Status**: ⚠️ Partial Fix

**Issue**: LLM sometimes returns invalid UCI notation (e.g., "Nf3" instead of "g1f3")

**Current Fix**:
- Retry up to 3 times with clarified prompt
- Validate UCI format with regex: `/^[a-h][1-8][a-h][1-8][qrbn]?$/`

**Remaining Issue**:
- If all 3 attempts fail, no fallback to Stockfish

**TODO**:
- Add Stockfish fallback in `LLMPanel.tsx`
- Log failed moves for debugging

---

### 3. PV Lines Not Updating

**Status**: ⚠️ Known Issue

**Issue**: `engine.pvLines` array stays empty despite Stockfish sending MultiPV data

**Cause**: `parseInfo()` in `StockfishAdapter.ts` only extracts first PV line

**Fix Needed**:
```typescript
// In StockfishAdapter.ts, track MultiPV index
const multipvMatch = message.match(/multipv (\d+)/);
if (multipvMatch) {
  result.multipv = parseInt(multipvMatch[1]);
}

// Then in EnginePanel, aggregate PV lines by index
```

**Workaround**: Set MultiPV to 1 for now

---

## Medium Priority Issues

### 4. Auto-Promotion to Queen Only

**Status**: ⚠️ TODO

**Issue**: All pawn promotions default to Queen (no dialog)

**Location**: `BoardPanel.tsx:16`

**Fix Needed**:
- Detect when pawn reaches 8th/1st rank
- Show modal with piece selection (Q/R/B/N)
- Pass selected piece to `makeMove()`

**Estimated Effort**: 1 hour

---

### 5. No Move History Display

**Status**: ⚠️ TODO

**Issue**: Moves are tracked in `game.history` but not displayed

**Fix Needed**:
- Create `MoveHistory.tsx` component
- Display moves in PGN format (1. e4 e5 2. Nf3)
- Click move to jump to that position

**Estimated Effort**: 2 hours

---

### 6. LLM Timeout Not Configurable

**Status**: ⚠️ Minor

**Issue**: Timeout hardcoded to 10s (normal) or 5s (turbo)

**Location**: `LLMAdapter.ts:18`

**Fix Needed**:
- Add `timeout` to settings state
- Expose slider in ControlsPanel

**Estimated Effort**: 30 minutes

---

## Low Priority / Enhancements

### 7. No Opening Book

**Status**: 📋 Feature Request

**Suggestion**: Integrate Lichess opening book API for first 10 moves

**Benefits**:
- Faster opening play
- Reduce LLM API costs
- More realistic games

---

### 8. No Game Persistence

**Status**: 📋 Feature Request (Phase 3)

**Current**: Games lost on page refresh

**Future**:
- LocalStorage for offline persistence
- Backend API for cloud sync

---

### 9. No Sound Effects

**Status**: 📋 Feature Request

**Suggestion**:
- Move sound
- Capture sound
- Check/checkmate sound

---

### 10. Board Not Responsive on Mobile

**Status**: ⚠️ TODO

**Issue**: Fixed 560px board doesn't scale on small screens

**Fix Needed**:
```css
@media (max-width: 768px) {
  .board-wrapper {
    max-width: 100%;
  }
}
```

---

## Performance Issues

### 11. Engine Analysis Lags UI

**Status**: ✅ Not a Bug (Expected)

**Explanation**: Stockfish runs in Web Worker (separate thread), so it shouldn't block UI

**Possible Cause**: React re-renders on every engine update

**Optimization**:
- Debounce `updateEngineState()` calls
- Use `React.memo()` on EnginePanel
- Throttle updates to max 10 per second

---

### 12. LLM Streaming Not Implemented

**Status**: 📋 Feature Request

**Current**: Wait for full response (1-5s)

**Future**: Stream tokens as they arrive

**Benefits**:
- Better UX (see thinking in real-time)
- Can cancel mid-stream

**Estimated Effort**: 4 hours

---

## TypeScript Issues

### 13. Missing Type for react-chessboard

**Status**: ⚠️ Workaround

**Issue**: `Square` type imported from internal path

**Current**:
```typescript
import type { Square } from 'react-chessboard/dist/chessboard/types';
```

**Better**:
- Create local type: `type Square = string;`
- Or use `string` directly

---

### 14. chess.js Beta Version

**Status**: ✅ Working but...

**Note**: Using `chess.js@1.0.0-beta.6` (not stable)

**Consideration**: Pin to exact version in package.json

**Alternative**: Migrate to `chess.js@0.13.4` (stable) if issues arise

---

## How to Report New Issues

1. Check this document first
2. Search existing GitHub issues
3. Create new issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Browser/OS
   - Console errors (if any)

---

## Fix Priority

🔴 **Critical** (Breaks core functionality)
🟡 **Medium** (Degraded UX but workaround exists)
🟢 **Low** (Nice-to-have)
📋 **Feature Request** (Not a bug)

---

Last Updated: 2026-01-06
