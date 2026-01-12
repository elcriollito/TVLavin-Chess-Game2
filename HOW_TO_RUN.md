# How to Run TVLavin Chess Game

## ⚠️ IMPORTANT: Must Use Local Web Server

This chess application **CANNOT** be run by simply double-clicking `index.html` because:
- Stockfish chess engine uses Web Workers (requires `http://` or `https://`)
- Modern browsers block Web Workers when using `file://` protocol
- Local piece images work best with a web server

## 🚀 Quick Start Methods

### Method 1: Double-Click Batch File (Windows - Easiest!)

**Simply double-click `START_SERVER.bat`**

The batch file will automatically:
- Check for Python first (uses `python -m http.server 8000`)
- If Python not found, check for Node.js (uses `node server.js`)
- If neither found, show installation instructions

Then open: **http://localhost:8000**

---

### Method 2: Python (Works on Windows/Mac/Linux)

**If you have Python 3:**
```bash
cd "c:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2"
python -m http.server 8000
```

**If you have Python 2:**
```bash
cd "c:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2"
python -m SimpleHTTPServer 8000
```

Then open: **http://localhost:8000**

---

### Method 3: Node.js (Built-in server.js)

**Run the included server:**
```bash
cd "c:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2"
node server.js
```

Then open: **http://localhost:8000**

---

### Method 4: Node.js (http-server)

**Install http-server globally:**
```bash
npm install -g http-server
```

**Run:**
```bash
cd "c:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2"
http-server -p 8000
```

Then open: **http://localhost:8000**

---

### Method 5: PHP

**If you have PHP installed:**
```bash
cd "c:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2"
php -S localhost:8000
```

Then open: **http://localhost:8000**

---

### Method 6: Live Server (VS Code Extension)

1. Install "Live Server" extension in VS Code
2. Right-click on `index.html`
3. Select "Open with Live Server"
4. Browser will automatically open

---

### Method 7: Serve (Node.js - Simple)

**Install:**
```bash
npm install -g serve
```

**Run:**
```bash
cd "c:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2"
serve -p 8000
```

Then open: **http://localhost:8000**

---

## ✅ Verify It's Working

Once the server is running and you open http://localhost:8000, you should see:

1. ✅ Chess board with light/dark squares
2. ✅ All 32 chess pieces visible (16 white, 16 black)
3. ✅ No broken image icons
4. ✅ "Engine Ready" status in the right sidebar
5. ✅ Pieces can be dragged and dropped

## 🐛 Troubleshooting

### Pieces Not Showing
- Make sure you're using `http://localhost:8000` NOT `file:///`
- Check that `img/chesspieces/wikipedia/` folder exists with all 12 PNG files

### Engine Not Working
- Web Workers require HTTP server (not file://)
- Check browser console for errors
- Try refreshing the page

### Port Already in Use
If port 8000 is taken, use a different port:
```bash
python -m http.server 8080
```
Then open: http://localhost:8080

## 🎮 Using the Application

- **New Game**: Click "New Game" button
- **Play vs Engine**: Select difficulty (1-20), choose color, start
- **Analysis Mode**: Toggle analysis for engine evaluation
- **Debug Mode**: Add `?debug=1` to URL for verbose logging
- **Embed Mode**: Add `?embed=1` to URL for minimal interface

## 📝 Features

✅ Play vs Stockfish (20 difficulty levels)
✅ Piece promotion dialog (Queen/Rook/Bishop/Knight)
✅ Move history with navigation
✅ Time controls (3/5/10 min or unlimited)
✅ Analysis mode with evaluation
✅ Edit board mode
✅ FEN import/export
✅ PGN export
✅ Full accessibility (ARIA)

---

**Enjoy your chess game! ♟️**
