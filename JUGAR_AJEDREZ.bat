@echo off
chcp 65001 > nul
title 🎮 TVLavin Chess Game - Launcher

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║          ♟️  TVLavin Chess Game - Launcher  ♟️             ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 🚀 Iniciando juego de ajedrez...
echo.

REM Abrir el archivo HTML de lanzamiento
start "" "LAUNCH_CHESS_GAME.html"

echo ✅ Juego abierto en tu navegador!
echo.
echo 💡 Si no ves el juego, verifica que tu navegador permita archivos locales.
echo.
echo 📝 Instrucciones:
echo    1. Haz DOBLE CLIC en el botón grande para abrir el juego
echo    2. Disfruta jugando contra la IA Stockfish
echo.
echo Cerrando en 5 segundos...
timeout /t 5 /nobreak > nul
exit
