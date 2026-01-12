@echo off
echo ========================================
echo  TVLavin Chess - Starting Web Server
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting Python HTTP server on port 8000...
    echo.
    echo Open your browser to: http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server
    echo ========================================
    python -m http.server 8000
    goto :end
)

REM If Python not found, check for Node.js
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Python not found, using Node.js instead...
    echo Starting Node.js HTTP server on port 8000...
    echo.
    echo Open your browser to: http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server
    echo ========================================
    node server.js
    goto :end
)

REM Neither Python nor Node.js found
echo ERROR: Neither Python nor Node.js found!
echo.
echo Please install one of the following:
echo.
echo  Option 1 - Python (Recommended):
echo    Download from: https://www.python.org/downloads/
echo    Make sure to check "Add Python to PATH" during installation
echo.
echo  Option 2 - Node.js:
echo    Download from: https://nodejs.org/
echo.
echo  Option 3 - Use VS Code Live Server extension
echo    See HOW_TO_RUN.md for details
echo.
pause

:end
