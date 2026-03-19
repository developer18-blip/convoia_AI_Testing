@echo off
title Convoia - Service Launcher
echo ============================================
echo   Convoia AI - Starting All Services
echo ============================================
echo.

:: Get the project root directory (parent of scripts/)
set PROJECT_ROOT=%~dp0..

:: Start Backend (new terminal window)
echo [1/3] Starting Backend...
start "Convoia Backend" cmd /k "cd /d %PROJECT_ROOT%\backend && npm start"

:: Small delay to let backend initialize first
timeout /t 3 /nobreak >nul

:: Start Frontend (new terminal window)
echo [2/3] Starting Frontend...
start "Convoia Frontend" cmd /k "cd /d %PROJECT_ROOT%\convoia_frontend && npm run dev"

:: Start Open WebUI (new terminal window)
echo [3/3] Starting Open WebUI...
start "Convoia Open WebUI" cmd /k "chcp 65001 >nul && set PYTHONUTF8=1 && set PYTHONIOENCODING=utf-8 && set PORT=3001 && set WEBUI_NAME=Convoia AI Gateway && "C:\Users\convo\AppData\Local\Programs\Python\Python311\Scripts\open-webui.exe" serve --port 3001"

echo.
echo ============================================
echo   All services starting...
echo.
echo   Backend:     http://localhost:5000
echo   Frontend:    http://localhost:5173
echo   Open WebUI:  http://localhost:3001
echo ============================================
echo.
echo Close this window or press any key to exit.
echo (Services will keep running in their own windows)
pause >nul
