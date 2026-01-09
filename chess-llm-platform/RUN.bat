@echo off
title Chess-LLM Platform
color 0A

echo.
echo ========================================
echo   Chess-LLM Platform - Quick Launch
echo ========================================
echo.
echo   Starting development server...
echo.
echo   Browser will open at: http://localhost:3000
echo   Press Ctrl+C to stop
echo.
echo ========================================
echo.

REM Open browser after 2 seconds
start /b timeout /t 2 /nobreak >nul && start http://localhost:3000

REM Start dev server
npm run dev

REM If server stops
echo.
echo ========================================
echo   Server stopped
echo ========================================
echo.
pause
