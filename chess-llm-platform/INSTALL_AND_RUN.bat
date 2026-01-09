@echo off
title Chess-LLM Platform - Setup and Launch
color 0A

echo.
echo ========================================
echo   Chess-LLM Platform - One-Click Setup
echo ========================================
echo.
echo This script will:
echo   1. Check for Node.js
echo   2. Install dependencies (npm install)
echo   3. Verify Stockfish is present
echo   4. Start the development server
echo   5. Open your browser
echo.
echo ========================================
echo.

REM Check if Node.js is installed
echo [1/5] Checking for Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js not found!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Make sure to check "Add to PATH" during installation
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    Found Node.js %NODE_VERSION%
echo.

REM Check if npm is installed
echo [2/5] Checking for npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: npm not found!
    echo npm should come with Node.js. Try reinstalling Node.js.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo    Found npm %NPM_VERSION%
echo.

REM Check if node_modules exists, if not run npm install
echo [3/5] Installing dependencies...
if not exist "node_modules\" (
    echo    node_modules not found, running npm install...
    echo    This may take 2-3 minutes...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: npm install failed!
        echo Check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo    Dependencies installed successfully!
) else (
    echo    Dependencies already installed (skipping)
)
echo.

REM Verify Stockfish exists
echo [4/5] Verifying Stockfish engine...
if exist "public\stockfish\stockfish.js" (
    for %%A in ("public\stockfish\stockfish.js") do set STOCKFISH_SIZE=%%~zA
    echo    Stockfish found (%%~zA bytes)
) else (
    echo.
    echo WARNING: Stockfish not found!
    echo Expected location: public\stockfish\stockfish.js
    echo.
    echo Attempting to download Stockfish...

    REM Try to download with curl
    curl --version >nul 2>&1
    if %errorlevel% equ 0 (
        mkdir public\stockfish 2>nul
        curl -L -o public\stockfish\stockfish.js "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js"
        if %errorlevel% equ 0 (
            echo    Stockfish downloaded successfully!
        ) else (
            echo    Download failed. You may need to download manually.
            echo    See QUICKSTART.md for instructions.
        )
    ) else (
        echo    curl not available. Please download Stockfish manually.
        echo    See QUICKSTART.md for instructions.
    )
)
echo.

REM Start the development server
echo [5/5] Starting development server...
echo.
echo ========================================
echo   Server Starting...
echo ========================================
echo.
echo   Your browser will open automatically.
echo   If it doesn't, open: http://localhost:3000
echo.
echo   Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

REM Wait 2 seconds then open browser
start /b timeout /t 2 /nobreak >nul && start http://localhost:3000

REM Start the dev server
npm run dev

REM If server stops
echo.
echo ========================================
echo   Server stopped
echo ========================================
echo.
pause
