# Run this once. It puts a "School Dashboard" icon on your desktop.

$Launcher = Join-Path $PSScriptRoot "start-dashboard.ps1"
$Icon     = Join-Path $PSScriptRoot "dashboard.ico"
$Desktop  = [Environment]::GetFolderPath("Desktop")
$Path     = Join-Path $Desktop "School Dashboard.lnk"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($Path)
$Shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Launcher`""
$Shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$Shortcut.IconLocation = $Icon
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Start and open the School Dashboard"
$Shortcut.Save()

Write-Host "Created 'School Dashboard' on your desktop: $Path"
