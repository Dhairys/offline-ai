@echo off
title Offline AI
cd /d "%~dp0"

rem Start Ollama if it is not already running
tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul || start "" /min ollama serve

rem Install dependencies on first run
if not exist node_modules call npm install

rem Open the browser after a short delay, then start the server
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
npm start
