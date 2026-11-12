@echo off
echo ========================================
echo  TVLavin Chess - Starting Web Server
echo ========================================
echo.

REM Clean application routes require the route-aware Node.js server.
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Starting route-aware Node.js server on port 8000...
    echo.
    echo Open your browser to: http://localhost:8000
    echo.
    echo Press Ctrl+C to stop the server
    echo ========================================
    node server.js
    goto :end
)

REM Node.js is required because generic static servers do not resolve clean routes.
echo ERROR: Node.js was not found!
echo.
echo Please install Node.js:
echo    Download from: https://nodejs.org/
echo.
pause

:end
