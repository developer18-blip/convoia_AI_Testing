@echo off
title Convoia - Open WebUI
echo ============================================
echo   Convoia AI - Open WebUI Launcher
echo ============================================
echo.

:: Fix Unicode encoding for Windows console
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
chcp 65001 >nul 2>&1

:: Set environment variables
set PORT=3001
set WEBUI_SECRET_KEY=convoia-openwebui-secret-%RANDOM%%RANDOM%
set OPENAI_API_BASE_URL=http://localhost:5000/api/ai/openwebui
set ENABLE_SIGNUP=true
set DEFAULT_MODELS=*
set WEBUI_NAME=Convoia AI Gateway

echo [INFO] Starting Open WebUI on port %PORT%...
echo [INFO] API Backend: http://localhost:5000/api/ai/openwebui
echo.
echo ============================================
echo   Open WebUI:  http://localhost:3001
echo   Backend:     http://localhost:5000
echo   Frontend:    http://localhost:5173
echo ============================================
echo.
echo Press Ctrl+C to stop Open WebUI
echo.

"C:\Users\convo\AppData\Local\Programs\Python\Python311\Scripts\open-webui.exe" serve --port 3001
