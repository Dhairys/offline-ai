$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut("$desktop\Offline AI.lnk")
$lnk.TargetPath = "$PSScriptRoot\start-offline-ai.bat"
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Description = "Launch Offline AI"
$lnk.WindowStyle = 1
$lnk.Save()
Write-Host "Shortcut created on your Desktop: Offline AI"
