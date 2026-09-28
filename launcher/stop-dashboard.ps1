# Stops the dashboard server that runs from this folder (and nothing else).
# Used by Install.cmd and Uninstall.cmd so files aren't locked while they're replaced or deleted.

$Project = Split-Path -Parent $PSScriptRoot

$servers = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Project) }

foreach ($p in $servers) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
if ($servers) {
    Write-Host "  Stopped the running dashboard."
    Start-Sleep -Seconds 1
}
