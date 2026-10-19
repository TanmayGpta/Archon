@echo off
echo ===================================================
echo   Starting Archon Guard (AGAI) - All 3 Services
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting CrewAI Healing A2A Service (Port 8101)...
start "AGAI - CrewAI Healing (8101)" cmd /k ".venv\Scripts\python.exe -m archon_agai.healing.a2a_server"

timeout /t 2 /nobreak >nul

echo [2/3] Starting ADK Gateway (Port 8100)...
start "AGAI - ADK Gateway (8100)" cmd /k ".venv\Scripts\python.exe -m uvicorn archon_agai.gateway:app --port 8100"

timeout /t 2 /nobreak >nul

echo [3/3] Starting Next.js Frontend (Port 3000)...
start "AGAI - Frontend (3000)" cmd /k "cd copilot_ide\frontend && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo ===================================================
echo   Opening browser to: http://localhost:3000/agai
echo ===================================================
start http://localhost:3000/agai

pause
