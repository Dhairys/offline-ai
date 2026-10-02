@echo off
powershell -NoProfile -Command "foreach($p in 3000,8188){Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }}"
echo Offline AI and ComfyUI stopped.
timeout /t 2 >nul
