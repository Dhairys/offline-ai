@echo off
title Offline AI
cd /d "%~dp0"

rem ===== EDIT THIS: folder that contains your ComfyUI run_cpu.bat =====
set "COMFY_DIR=G:\ComfyUI_windows_portable"
set "COMFY_BAT=run_cpu.bat"
rem ====================================================================

rem Start Ollama if it is not already running
tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul || start "" /min ollama serve

rem Start ComfyUI if it is not already running
netstat -ano | findstr ":8188" | findstr "LISTENING" >nul
if errorlevel 1 (
  if exist "%COMFY_DIR%\%COMFY_BAT%" (
    start "ComfyUI" /min /d "%COMFY_DIR%" cmd /c %COMFY_BAT%
  ) else (
    echo ComfyUI not found at %COMFY_DIR%\%COMFY_BAT% - image mode will be offline.
    echo Edit COMFY_DIR in this file to fix it.
  )
)

rem Install dependencies on first run
if not exist node_modules call npm install

rem Open the browser after a short delay, then start the server
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
npm start
