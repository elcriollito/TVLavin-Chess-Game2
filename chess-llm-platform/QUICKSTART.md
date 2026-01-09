# ⚡ Quick Start Guide

Get up and running in 5 minutes!

## 🪟 Windows Users: ONE-CLICK SETUP!

**Just double-click:** `INSTALL_AND_RUN.bat`

That's it! Everything will be installed and the app will open automatically.

📖 See [WINDOWS_LAUNCHER.md](WINDOWS_LAUNCHER.md) for details.

---

## 💻 Manual Setup (All Platforms)

### Prerequisites

- **Node.js 18+** ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **API Key** (optional for testing):
  - [Claude (Anthropic)](https://console.anthropic.com/) - Recommended
  - [OpenAI](https://platform.openai.com/)

---

## Step 1: Install Dependencies

```bash
cd chess-llm-platform
npm install
```

This installs:
- React 18
- TypeScript
- Zustand (state management)
- chess.js (chess logic)
- react-chessboard (UI)

---

## Step 2: Stockfish ✅ Already Included!

**Good news:** Stockfish is already downloaded and ready to use!

- ✅ Location: `public/stockfish/stockfish.js` (1.6MB)
- ✅ Version: Stockfish 10.0.2
- ✅ Source: [CDNJS](https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js)

**If missing for any reason**, download it with:
```bash
cd public/stockfish
curl -L -o stockfish.js "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js"
```

---

## Step 3: Start Development Server

```bash
npm run dev
```

You should see:
```
VITE v5.0.8  ready in 500 ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

---

## Step 4: Open Browser

Navigate to **http://localhost:3000**

You should see:
- ✅ Chess board with pieces
- ✅ Engine panel (left sidebar)
- ✅ LLM panel (right sidebar)
- ✅ Controls in the center

---

## Step 5: Configure LLM (Optional)

### Without API Key (Mock Mode)
The app works out of the box with **mock responses** for testing.

LLM will make random opening moves like e2e4, d2d4, etc. with generic reasoning.

### With API Key (Real LLM)

1. Get API key from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/)
2. In the **LLM Panel** (right sidebar):
   - Select model (Claude Haiku recommended for speed)
   - Paste your API key
   - Choose playing style (Positional, Aggressive, etc.)
3. Click **"Request Move"** or select **"Human vs LLM"** mode

---

## Step 6: Play Your First Game

### Human vs Stockfish
1. Select **"Human vs Stockfish"** mode
2. Click **"New Game"**
3. Drag and drop pieces on the board
4. Watch Stockfish respond automatically

### Human vs LLM
1. Select **"Human vs LLM"** mode
2. Click **"New Game"**
3. Make a move
4. Click **"Request Move"** (or LLM auto-plays if enabled)
5. Watch LLM reasoning appear in right panel

### LLM vs LLM Arena
1. Select **"LLM vs LLM (Arena)"** mode
2. Click **"Start Auto-Play"**
3. Watch two AIs play each other!

---

## Common Issues & Fixes

### ❌ "Stockfish worker error"

**Cause**: `stockfish.js` not found

**Fix**:
```bash
# Check file exists
ls public/stockfish/stockfish.js

# If not, download from:
# https://github.com/nmrugg/stockfish.js/releases
```

### ❌ "Module not found: chess.js"

**Cause**: Dependencies not installed

**Fix**:
```bash
npm install
```

### ❌ Board pieces not rendering

**Cause**: react-chessboard version mismatch

**Fix**:
```bash
npm install react-chessboard@latest
```

### ❌ LLM returns "Error: Invalid API key"

**Cause**: Wrong API key or quota exceeded

**Fix**:
1. Check API key in [console.anthropic.com](https://console.anthropic.com/)
2. Verify billing is set up
3. Try mock mode first (no API key)

### ❌ TypeScript errors

**Cause**: Type definitions missing

**Fix**:
```bash
npm install --save-dev @types/react @types/react-dom
```

---

## Testing Without API Costs

The app includes **mock mode** that simulates LLM responses:

1. Leave API key field empty
2. Select any LLM model
3. Click "Request Move"
4. LLM will make random opening moves with generic reasoning

Perfect for testing UI/UX without spending money!

---

## Next Steps

✅ **Customize Settings**:
- Engine skill level (0-20)
- LLM temperature (0.0-2.0)
- Playing styles (5 options)
- MultiPV (show top N moves)

✅ **Explore Game Modes**:
- Try all 7 modes
- Watch LLM vs Stockfish battles
- Experiment with different LLM styles

✅ **Read Full Docs**:
- See `README.md` for architecture details
- Check `src/adapters/LLMAdapter.ts` for prompt engineering
- Review `src/store/types.ts` for data structures

---

## Build for Production

```bash
npm run build
```

Output in `dist/` folder. Deploy to:
- [Vercel](https://vercel.com/) - `vercel deploy`
- [Netlify](https://netlify.com/) - Drag & drop `dist/`
- Any static host

---

## Getting Help

- 🐛 **Bug Reports**: Open GitHub issue
- 💬 **Questions**: Check README.md
- 📚 **Docs**: See code comments in `src/`

---

**Happy Chess Playing! ♟️**
