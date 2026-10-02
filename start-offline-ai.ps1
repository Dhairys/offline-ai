$ErrorActionPreference = 'SilentlyContinue'
Set-Location $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'Offline AI'

# ===== EDIT THESE IF NEEDED =====
# ComfyUI is optional. It is found automatically in these places (or set the COMFY_DIR environment variable):
$ComfyDir = @($env:COMFY_DIR, 'G:\ComfyUI_windows_portable', "$PSScriptRoot\ComfyUI_windows_portable", "$PSScriptRoot\..\ComfyUI_windows_portable", "$env:USERPROFILE\ComfyUI_windows_portable") |
  Where-Object { $_ -and (Test-Path (Join-Path $_ 'python_embeded\python.exe')) } | Select-Object -First 1
$UseCpu   = $true
$EnableImages = $true                      # $false = chat only, skip ComfyUI                           # $false to try the Intel GPU
# ================================

function Test-Port($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }
function Wait-Port($p, $sec) { $t = 0; while (-not (Test-Port $p) -and $t -lt $sec) { Start-Sleep 1; $t++ }; Test-Port $p }
function Line($label) { Write-Host ("  {0,-12}" -f $label) -NoNewline }

Clear-Host
Write-Host ""
Write-Host "  OFFLINE AI" -ForegroundColor Green
Write-Host "  Starting your local services..." -ForegroundColor DarkGray
Write-Host ""

# 1. Ollama (chat)
Line 'Ollama'
if (-not (Test-Port 11434)) { Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden }
if (Wait-Port 11434 20) { Write-Host 'ready' -ForegroundColor Green }
else { Write-Host 'not found - is Ollama installed?' -ForegroundColor Yellow }

# 2. ComfyUI (images) - runs hidden, never opens its own browser tab
Line 'ComfyUI'
$py = if ($ComfyDir) { Join-Path $ComfyDir 'python_embeded\python.exe' } else { '' }
if (-not $EnableImages) { Write-Host 'off (chat only)' -ForegroundColor DarkGray }
elseif (Test-Port 8188) { Write-Host 'already running' -ForegroundColor Green }
elseif ($py -and (Test-Path $py)) {
  $a = @('-s', 'ComfyUI\main.py', '--windows-standalone-build', '--disable-auto-launch')
  if ($UseCpu) { $a += '--cpu' }
  Start-Process $py -ArgumentList $a -WorkingDirectory $ComfyDir -WindowStyle Hidden `
    -RedirectStandardOutput "$PSScriptRoot\comfyui.log" -RedirectStandardError "$PSScriptRoot\comfyui-error.log"
  Write-Host 'starting in background (image mode ready in about a minute)' -ForegroundColor Yellow
}
else { Write-Host 'not installed - skipped (image mode is optional)' -ForegroundColor DarkGray }

# 3. Offline AI website
Line 'Website'
if (-not (Test-Path 'node_modules')) { Write-Host 'installing (first run only)... ' -NoNewline; & npm.cmd install --silent | Out-Null }
if (-not (Test-Port 3000)) {
  Start-Process node -ArgumentList 'server.js' -WindowStyle Hidden `
    -RedirectStandardOutput "$PSScriptRoot\server.log" -RedirectStandardError "$PSScriptRoot\server-error.log"
}
if (Wait-Port 3000 25) {
  Write-Host 'ready' -ForegroundColor Green
  Start-Process 'http://localhost:3000'
} else {
  Write-Host 'failed - see server-error.log' -ForegroundColor Red
  Read-Host '  Press Enter to close'; exit
}

Write-Host ""
Write-Host "  Open in your browser: http://localhost:3000" -ForegroundColor White
Write-Host "  Press any key here to stop Offline AI and ComfyUI." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')

foreach ($p in 3000, 8188) {
  Get-NetTCPConnection -LocalPort $p -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}
Write-Host "  Stopped. (Ollama keeps running in the tray.)" -ForegroundColor DarkGray
Start-Sleep 2
