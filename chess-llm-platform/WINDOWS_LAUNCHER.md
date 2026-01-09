# 🪟 Windows One-Click Launcher Guide

## Two Simple Batch Files

### 🔧 INSTALL_AND_RUN.bat (First Time Setup)

**Use this the FIRST time you run the project.**

Double-click this file and it will:
1. ✅ Check if Node.js is installed
2. ✅ Check if npm is available
3. ✅ Install all dependencies (`npm install`)
4. ✅ Verify Stockfish is present
5. ✅ Download Stockfish if missing
6. ✅ Start the development server
7. ✅ Open your browser automatically

**First run takes 2-3 minutes** (downloads dependencies).

---

### ⚡ RUN.bat (Quick Launch)

**Use this for all subsequent launches.**

Double-click this file and it will:
1. ✅ Start the development server
2. ✅ Open your browser automatically

**Runs in ~5 seconds.**

---

## Step-by-Step Instructions

### First Time Setup

1. **Right-click** `INSTALL_AND_RUN.bat`
2. **Select** "Run as administrator" (optional, but recommended)
3. **Wait** 2-3 minutes while dependencies install
4. **Browser opens automatically** to http://localhost:3000
5. **Start playing chess!**

### Every Other Time

1. **Double-click** `RUN.bat`
2. **Browser opens automatically**
3. **Play chess!**

---

## What You'll See

### INSTALL_AND_RUN.bat Output:

```
========================================
  Chess-LLM Platform - One-Click Setup
========================================

This script will:
  1. Check for Node.js
  2. Install dependencies (npm install)
  3. Verify Stockfish is present
  4. Start the development server
  5. Open your browser

========================================

[1/5] Checking for Node.js...
   Found Node.js v20.11.0

[2/5] Checking for npm...
   Found npm 10.2.4

[3/5] Installing dependencies...
   node_modules not found, running npm install...
   This may take 2-3 minutes...

   [████████████████████████████] 100%

   Dependencies installed successfully!

[4/5] Verifying Stockfish engine...
   Stockfish found (1580032 bytes)

[5/5] Starting development server...

========================================
  Server Starting...
========================================

  Your browser will open automatically.
  If it doesn't, open: http://localhost:3000

  Press Ctrl+C to stop the server

========================================

VITE v5.0.8  ready in 500 ms

➜  Local:   http://localhost:3000/
```

---

## Troubleshooting

### ❌ "Node.js not found!"

**Solution:**
1. Download Node.js from: https://nodejs.org/
2. Install LTS version (Long Term Support)
3. ✅ **CHECK** "Add to PATH" during installation
4. Restart your computer
5. Run `INSTALL_AND_RUN.bat` again

---

### ❌ "npm install failed!"

**Solution:**
1. Check your internet connection
2. Close any antivirus temporarily
3. Run `INSTALL_AND_RUN.bat` as administrator
4. Or manually run: `npm install` in terminal

---

### ❌ "Port 3000 already in use"

**Solution:**
1. Close any other running dev servers
2. Or edit `vite.config.ts` and change port to 3001:
   ```typescript
   server: {
     port: 3001,  // Changed from 3000
   ```
3. Run again

---

### ❌ Browser doesn't open automatically

**Solution:**
1. Manually open your browser
2. Navigate to: http://localhost:3000
3. The server is still running

---

### ❌ "Stockfish download failed"

**Solution:**
1. Check internet connection
2. Or manually download:
   ```bash
   cd public\stockfish
   curl -L -o stockfish.js "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js"
   ```
3. Or download from browser and save to `public\stockfish\stockfish.js`

---

## Advanced Options

### Run Without Opening Browser

Edit `RUN.bat` or `INSTALL_AND_RUN.bat` and remove this line:
```batch
start /b timeout /t 2 /nobreak >nul && start http://localhost:3000
```

### Change Browser

Windows uses your default browser. To change:
1. Windows Settings → Apps → Default Apps
2. Set your preferred browser as default

### Run on Different Port

Edit `vite.config.ts`:
```typescript
export default defineConfig({
  server: {
    port: 8080,  // Change this number
  },
})
```

Then the URL will be `http://localhost:8080`

---

## What Each File Does

| File | Purpose | When to Use |
|------|---------|-------------|
| **INSTALL_AND_RUN.bat** | Full setup + run | First time only |
| **RUN.bat** | Quick launch | Every other time |
| **package.json** | Lists dependencies | Auto-used by npm |
| **vite.config.ts** | Server settings | Auto-used by Vite |

---

## Clean Install (If Something Breaks)

1. **Delete** `node_modules` folder
2. **Delete** `package-lock.json` file
3. **Run** `INSTALL_AND_RUN.bat` again

This forces a fresh install of all dependencies.

---

## Manual Commands (If Batch Files Don't Work)

Open Command Prompt in the project folder and run:

```bash
# First time only
npm install

# Every time
npm run dev
```

Then manually open: http://localhost:3000

---

## File Locations

```
chess-llm-platform/
├── INSTALL_AND_RUN.bat    ← Double-click for first time
├── RUN.bat                ← Double-click every other time
├── package.json
├── vite.config.ts
└── public/
    └── stockfish/
        └── stockfish.js   ← Auto-downloaded by INSTALL_AND_RUN.bat
```

---

## Tips

💡 **Pin to Taskbar:**
Right-click `RUN.bat` → Send to → Desktop (create shortcut)
Then drag shortcut to taskbar

💡 **Create Desktop Shortcut:**
Right-click `RUN.bat` → Send to → Desktop (create shortcut)

💡 **Run from Anywhere:**
Add the project folder to Windows PATH to run from any location

---

**Enjoy one-click chess! ♟️**
